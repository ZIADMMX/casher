const customersRepo = require('../repositories/customers.repository');
const salesRepo = require('../repositories/sales.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const { requireAdmin, requireAuth, getCurrentSession } = require('./auth.service');
const crmAdvancedRepo = require('../repositories/crmAdvanced.repository');

function addCustomer({
  name, phone, email, initialDebt, debtNotes, dueDate, company_id, lead_source,
  email_consent, sms_consent
}) {
  const session = requireAuth();
  if (!name || !name.trim()) throw new Error('اسم العميل مطلوب');
  const companyId = company_id == null || company_id === '' ? null : Number(company_id);
  if (companyId != null && (!Number.isInteger(companyId) || companyId < 1)) {
    throw new Error('الشركة المرتبطة غير صحيحة');
  }
  const id = customersRepo.create({
    name: name.trim(),
    phone,
    email,
    companyId,
    leadSource: lead_source,
    emailConsent: email_consent === true,
    smsConsent: sms_consent === true,
  });
  crmAdvancedRepo.recordAudit('customer', id, 'created', {
    company_id: companyId,
    lead_source: lead_source || null,
  }, session?.id);
  
  const debtAmount = Number(initialDebt);
  if (debtAmount && debtAmount > 0) {
    try {
      addManualDebt({
        customerId: id,
        amount: debtAmount,
        notes: debtNotes || 'رصيد افتتاحي / مديونية سابقة',
        dueDate: dueDate || null,
      });
    } catch (err) {
      console.error('Failed to add initial debt for customer:', err);
    }
  }

  return { id };
}

function addManualDebt({ customerId, amount, notes, dueDate }) {
  requireAdmin();
  if (!customerId) throw new Error('العميل مطلوب');
  if (!amount || amount <= 0) throw new Error('مبلغ المديونية غير صحيح');

  const session = getCurrentSession();
  const activeShift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();

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

  const activeShift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
  if (paymentMethod === 'cash' && !activeShift) {
    throw new Error('لا يمكن تسجيل سداد نقدي لعدم وجود وردية مفتوحة. يرجى فتح وردية أولاً');
  }

  const customer = customersRepo.getById(customerId);
  if (!customer) throw new Error('العميل غير موجود');

  const paymentAmount = Number(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
  }
  const balance = customersRepo.getBalance(customerId) || 0;
  if (paymentAmount > balance) {
    throw new Error('مبلغ السداد لا يمكن أن يتجاوز مديونية العميل');
  }

  const paymentId = customersRepo.createPayment({
    customerId,
    amount: Math.round(paymentAmount * 100) / 100,
    paymentMethod,
    notes,
    userId: session.id,
    shiftId: activeShift ? activeShift.id : null,
  });
  return { paymentId, remainingBalance: Math.round((balance - paymentAmount) * 100) / 100 };
}

function getCustomerLedger(customerId) {
  requireAuth();
  const customer = customersRepo.getById(customerId);
  if (!customer) throw new Error('العميل غير موجود');
  const balance = customersRepo.getBalance(customerId) || 0;
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