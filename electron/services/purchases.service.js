const purchasesRepo = require('../repositories/purchases.repository');
const suppliersRepo = require('../repositories/suppliers.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const NotificationsService = require('./notifications.service');
const { requireAdmin } = require('./auth.service');
const inventoryRepo = require('../repositories/inventory.repository');

function createPurchase(data) {
  const session = requireAdmin();
  if (!data.supplierId) {
    throw new Error('يجب اختيار المورد أو المصنع');
  }

  const supplier = suppliersRepo.getById(data.supplierId);
  if (!supplier) {
    throw new Error('المورد المحدد غير مسجل في النظام');
  }

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('يجب إضافة صنف واحد على الأقل في فاتورة الشراء');
  }

  // Validate items
  for (const item of data.items) {
    if (!item.product_name || !item.product_name.trim()) {
      throw new Error('اسم الصنف مطلوب لجميع بنود الفاتورة');
    }
    if (Number(item.quantity) <= 0) {
      throw new Error(`الكمية غير صحيحة للصنف: ${item.product_name}`);
    }
    if (Number(item.purchase_price) < 0) {
      throw new Error(`سعر الشراء غير صحيح للصنف: ${item.product_name}`);
    }
  }

  const calculatedTotal = data.items.reduce(
    (sum, item) => sum + Number(item.quantity || 1) * Number(item.purchase_price || 0),
    0
  );

  const totalAmount = data.totalAmount != null ? Number(data.totalAmount) : calculatedTotal;
  const paidAmount = Number(data.paidAmount || 0);
  const paymentMethod = data.paymentMethod || 'cash';

  if (paidAmount < 0 || paidAmount > totalAmount) {
    throw new Error('المبلغ المدفوع يجب أن يكون بين 0 وإجمالي الفاتورة');
  }

  const activeShift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
  if (paidAmount > 0 && paymentMethod === 'cash' && !activeShift) {
    throw new Error('لا يمكن دفع مبلغ نقدي للمورد لعدم وجود وردية مفتوحة. يرجى فتح وردية أولاً أو استخدام وسيلة دفع غير نقدية');
  }

  const result = purchasesRepo.createPurchase({
    supplierId: data.supplierId,
    invoiceNumber: data.invoiceNumber ? data.invoiceNumber.trim() : null,
    items: data.items,
    totalAmount,
    paidAmount,
    paymentMethod,
    dueDate: data.dueDate || null,
    notes: data.notes ? data.notes.trim() : null,
    userId: session ? session.id : null,
    shiftId: activeShift ? activeShift.id : null,
    warehouseId: session?.centralRequest && session.warehouseId
      ? session.warehouseId
      : inventoryRepo.getDefaultWarehouseId(),
  });

  // خصم الدفعة النقدية المقدمة من نقدية الوردية ودرج الكاشير
  if (paidAmount > 0 && paymentMethod === 'cash' && activeShift) {
    shiftsRepo.addShiftExpense({
      shiftId: activeShift.id,
      userId: session ? session.id : null,
      amount: paidAmount,
      category: 'سداد مورد',
      notes: data.invoiceNumber
        ? `دفعة مقدمة مع فاتورة توريد #${data.invoiceNumber} (المورد: ${supplier.name})`
        : `دفعة مقدمة لمورد: ${supplier.name}`,
    });
  }

  try {
    const remaining = totalAmount - paidAmount;
    NotificationsService.notify({
      type: 'purchase_created',
      title: '🚚 فاتورة توريد وشراء بضاعة جديدة',
      message: `تم تسجيل فاتورة توريد بقيمة ${totalAmount.toFixed(2)} ج.م من المورد "${supplier.name}" ${remaining > 0 ? `(متبقي آجل: ${remaining.toFixed(2)} ج.م)` : '(مسددة بالكامل)'}`,
      linkPage: 'suppliers',
    });
  } catch {}

  return result;
}

function getAllPurchases(filters) {
  requireAdmin();
  return purchasesRepo.getAllPurchases(filters);
}

function getPurchaseById(id) {
  requireAdmin();
  if (!id) throw new Error('معرف الفاتورة مطلوب');
  return purchasesRepo.getPurchaseById(id);
}

function recordSupplierPayment(data) {
  const session = requireAdmin();
  if (!data.supplierId) {
    throw new Error('يجب تحديد المورد لسداد الدفعة');
  }
  const amount = Number(data.amount || 0);
  if (amount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
  }

  const paymentMethod = data.paymentMethod || 'cash';
  const activeShift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();

  if (paymentMethod === 'cash' && !activeShift) {
    throw new Error('لا يمكن تسجيل سداد نقدي للمورد لعدم وجود وردية مفتوحة. يرجى فتح وردية أولاً');
  }

  const supplier = suppliersRepo.getById(data.supplierId);
  if (!supplier) {
    throw new Error('المورد المحدد غير مسجل في النظام');
  }

  const result = purchasesRepo.addPayment({
    supplierId: data.supplierId,
    purchaseId: data.purchaseId || null,
    amount,
    paymentMethod,
    notes: data.notes ? data.notes.trim() : null,
    userId: session ? session.id : null,
    shiftId: activeShift ? activeShift.id : null,
  });

  // خصم السداد النقدي من نقدية الوردية ودرج الكاشير
  if (paymentMethod === 'cash' && activeShift) {
    shiftsRepo.addShiftExpense({
      shiftId: activeShift.id,
      userId: session ? session.id : null,
      amount,
      category: 'سداد مورد',
      notes: data.notes ? data.notes.trim() : `سداد دفعة نقدية للمورد: ${supplier.name}`,
    });
  }

  try {
    const methodStr = paymentMethod === 'cash' ? 'نقداً (كاش)' : paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'شيك';
    NotificationsService.notify({
      type: 'supplier_payment',
      title: '💵 سداد دفعة لمورد',
      message: `تم تسجيل سداد دفعة بقيمة ${amount.toFixed(2)} ج.م للمورد "${supplier ? supplier.name : 'مورد'}" عبر ${methodStr}`,
      linkPage: 'suppliers',
    });
  } catch {}

  return result;
}

function getAllPayments(limit) {
  requireAdmin();
  return purchasesRepo.getAllPayments(limit);
}

function getPurchasesSummaryKPIs() {
  requireAdmin();
  return purchasesRepo.getPurchasesSummaryKPIs();
}

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  recordSupplierPayment,
  getAllPayments,
  getPurchasesSummaryKPIs,
};
