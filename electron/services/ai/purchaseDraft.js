// Turns reorder suggestions into an unpaid purchase draft.
const { db } = require('../../database/db');
const aiRepo = require('../../repositories/ai.repository');

// -------------------------------------------------------------
// 8. إنشاء مسودة أمر شراء فوري من الاقتراحات (1-Click PO Creation)
// -------------------------------------------------------------
function createPurchaseDraftFromSuggestions(suggestedItems = [], supplierId = null, notes = 'تم التوليد تلقائياً بناءً على اقتراحات الذكاء الاصطناعي') {
  if (!suggestedItems || suggestedItems.length === 0) {
    throw new Error('يرجى تحديد الأصناف المطلوبة لإنشاء أمر الشراء');
  }

  const runTx = db.transaction(() => {
    // تحديد مورد
    let targetSupplierId = supplierId;
    if (!targetSupplierId) {
      const sup = aiRepo.getFirstSupplier();
      if (!sup) throw new Error('لا يوجد موردين مسجلين في النظام. يرجى إضافة مورد أولاً.');
      targetSupplierId = sup.id;
    }

    const totalAmount = suggestedItems.reduce((sum, item) => sum + (Number(item.suggestedQuantity || 1) * Number(item.unitPurchasePrice || item.purchasePrice || 0)), 0);
    const invoiceNumber = `PO-AI-${Date.now().toString().slice(-6)}`;

    const res = aiRepo.insertPurchaseDraft(targetSupplierId, invoiceNumber, totalAmount, notes);

    const purchaseId = res.lastInsertRowid;
    const insertItem = aiRepo.preparePurchaseDraftItemInsert();

    for (const item of suggestedItems) {
      insertItem(
        purchaseId,
        item.variantId || null,
        item.productName || 'صنف',
        item.size || null,
        item.color || null,
        Number(item.suggestedQuantity || 1),
        Number(item.unitPurchasePrice || item.purchasePrice || 0),
        Number(item.sellingPrice || 0)
      );
    }

    return { success: true, purchaseId, invoiceNumber, totalAmount, itemsCount: suggestedItems.length };
  });

  return runTx();
}

module.exports = {
  createPurchaseDraftFromSuggestions,
};
