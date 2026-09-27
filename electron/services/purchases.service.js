const purchasesRepo = require('../repositories/purchases.repository');
const suppliersRepo = require('../repositories/suppliers.repository');
const NotificationsService = require('./notifications.service');
const { requireAdmin } = require('./auth.service');

function createPurchase(data) {
  requireAdmin();
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

  if (paidAmount < 0 || paidAmount > totalAmount) {
    throw new Error('المبلغ المدفوع يجب أن يكون بين 0 وإجمالي الفاتورة');
  }

  const result = purchasesRepo.createPurchase({
    supplierId: data.supplierId,
    invoiceNumber: data.invoiceNumber ? data.invoiceNumber.trim() : null,
    items: data.items,
    totalAmount,
    paidAmount,
    dueDate: data.dueDate || null,
    notes: data.notes ? data.notes.trim() : null,
  });

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
  requireAdmin();
  if (!data.supplierId) {
    throw new Error('يجب تحديد المورد لسداد الدفعة');
  }
  const amount = Number(data.amount || 0);
  if (amount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
  }

  const result = purchasesRepo.addPayment({
    supplierId: data.supplierId,
    purchaseId: data.purchaseId || null,
    amount,
    paymentMethod: data.paymentMethod || 'cash',
    notes: data.notes ? data.notes.trim() : null,
  });

  try {
    const supplier = suppliersRepo.getById(data.supplierId);
    const methodStr = data.paymentMethod === 'cash' ? 'نقداً (كاش)' : data.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'شيك';
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
