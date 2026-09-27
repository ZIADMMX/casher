const customersRepo = require('../repositories/customers.repository');
const salesRepo = require('../repositories/sales.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const { requireAdmin, requireAuth, getCurrentSession } = require('./auth.service');

function addCustomer({ name, phone, email }) {
  requireAuth();
  if (!name || !name.trim()) throw new Error('اسم العميل مطلوب');
  const id = customersRepo.create({ name: name.trim(), phone, email });
  return { id };
}

function addManualDebt({ customerId, amount, notes, dueDate }) {
  requireAdmin();
  if (!customerId) throw new Error('العميل مطلوب');
  if (!amount || amount <= 0) throw new Error('مبلغ المديونية غير صحيح');

  const activeShift = shiftsRepo.getCurrentOpenShift();
  const session = getCurrentSession();

  const saleId = salesRepo.createSale({
    shiftId: activeShift ? activeShift.id : null,
    customerId,
    customerName: notes || 'مديونية سابقة / يدوية', 
    customerPhone: null,
    userId: session ? session.id : null,
    totalAmount: amount,
    discount: 0,
    paymentMethod: 'credit',
    dueDate: dueDate || null
  });

  return { success: true, saleId };
}

function recordCustomerPayment({ customerId, amount, paymentMethod = 'cash', notes }) {
  const session = requireAuth();
  const customer = customersRepo.getById(customerId);
  if (!customer) throw new Error('العميل غير موجود');

  const paymentAmount = Number(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
  }
  const balance = customersRepo.getBalances().find((row) => row.id === customerId)?.balance || 0;
  if (paymentAmount > balance) {
    throw new Error('مبلغ السداد لا يمكن أن يتجاوز مديونية العميل');
  }

  const paymentId = customersRepo.createPayment({
    customerId,
    amount: Math.round(paymentAmount * 100) / 100,
    paymentMethod,
    notes,
    userId: session.id,
  });
  return { paymentId, remainingBalance: Math.round((balance - paymentAmount) * 100) / 100 };
}

function getCustomerLedger(customerId) {
  requireAuth();
  const customer = customersRepo.getById(customerId);
  if (!customer) throw new Error('العميل غير موجود');
  const balance = customersRepo.getBalances().find((row) => row.id === customerId)?.balance || 0;
  return {
    customer,
    balance,
    payments: customersRepo.getPayments(customerId),
    sales: customersRepo.getCreditSales(customerId),
  };
}

function getAllCustomersWithStats() {
  requireAuth();
  const customers = customersRepo.getAll();
  const statsRows = salesRepo.getStatsByCustomer();
  const statsMap = Object.fromEntries(statsRows.map((r) => [r.customer_id, r]));
  const balanceRows = typeof customersRepo.getBalances === 'function' ? customersRepo.getBalances() : [];
  const balancesMap = Object.fromEntries(balanceRows.map((r) => [r.id, r.balance]));

  return customers.map((c) => ({
    ...c,
    totalSpent: statsMap[c.id]?.totalSpent || 0,
    invoiceCount: statsMap[c.id]?.invoiceCount || 0,
    debt: balancesMap[c.id] || 0,
  }));
}

module.exports = { addCustomer, addManualDebt, recordCustomerPayment, getCustomerLedger, getAllCustomersWithStats };