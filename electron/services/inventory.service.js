const inventoryRepo = require('../repositories/inventory.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const { requireAdmin } = require('./auth.service');
const productsCache = require('./products.cache');

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} يجب أن يكون رقمًا صحيحًا موجبًا`);
  }
  return number;
}

function requireActiveWarehouse(warehouseId) {
  const id = positiveInteger(warehouseId, 'معرف المخزن');
  const warehouse = inventoryRepo.getWarehouses().find((item) => item.id === id);
  if (!warehouse || !warehouse.is_active || !warehouse.branch_active) {
    throw new Error('المخزن غير موجود أو غير نشط');
  }
  return warehouse;
}

function getBranches() {
  requireAdmin();
  return inventoryRepo.getBranches();
}

function createBranch(data) {
  requireAdmin();
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('اسم الفرع مطلوب');
  return inventoryRepo.createBranch({
    name,
    address: String(data.address || '').trim(),
    phone: String(data.phone || '').trim(),
  });
}

function updateBranch(id, data) {
  requireAdmin();
  const branchId = positiveInteger(id, 'معرف الفرع');
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('اسم الفرع مطلوب');
  if (data.isActive === false) {
    const warehouses = inventoryRepo.getWarehouses(branchId);
    if (warehouses.some((warehouse) => warehouse.is_active && warehouse.total_quantity > 0)) {
      throw new Error('لا يمكن إيقاف فرع يحتوي على مخزون. انقل المخزون أولاً');
    }
  }
  return inventoryRepo.updateBranch(branchId, {
    name,
    address: String(data.address || '').trim(),
    phone: String(data.phone || '').trim(),
    isActive: data.isActive !== false,
  });
}

function getWarehouses(branchId) {
  requireAdmin();
  return inventoryRepo.getWarehouses(
    branchId == null ? null : positiveInteger(branchId, 'معرف الفرع')
  );
}

function createWarehouse(data) {
  requireAdmin();
  const branchId = positiveInteger(data?.branchId, 'معرف الفرع');
  const branch = inventoryRepo.getBranches().find((item) => item.id === branchId && item.is_active);
  if (!branch) throw new Error('الفرع غير موجود أو غير نشط');
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('اسم المخزن مطلوب');
  return inventoryRepo.createWarehouse({
    branchId,
    name,
    isDefault: Boolean(data.isDefault),
  });
}

function updateWarehouse(id, data) {
  requireAdmin();
  const warehouseId = positiveInteger(id, 'معرف المخزن');
  const current = inventoryRepo.getWarehouses().find((item) => item.id === warehouseId);
  if (!current) throw new Error('المخزن غير موجود');
  if (data.isActive === false && (current.is_default || current.total_quantity > 0)) {
    throw new Error('لا يمكن إيقاف مخزن افتراضي أو يحتوي على مخزون');
  }
  if (current.is_default && data.isDefault === false) {
    throw new Error('عيّن مخزنًا افتراضيًا آخر قبل تغيير المخزن الافتراضي الحالي');
  }
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('اسم المخزن مطلوب');
  return inventoryRepo.updateWarehouse(warehouseId, {
    name,
    isActive: data.isActive !== false,
    isDefault: data.isDefault == null ? undefined : Boolean(data.isDefault),
  });
}

function getStock(filters = {}) {
  requireAdmin();
  const warehouseId = filters.warehouseId == null
    ? null
    : positiveInteger(filters.warehouseId, 'معرف المخزن');
  if (warehouseId) requireActiveWarehouse(warehouseId);
  return inventoryRepo.listStock({
    warehouseId,
    lowStockOnly: Boolean(filters.lowStockOnly),
    search: String(filters.search || '').trim(),
  });
}

function getMovementHistory(filters = {}) {
  requireAdmin();
  const warehouseId = filters.warehouseId == null
    ? null
    : positiveInteger(filters.warehouseId, 'معرف المخزن');
  const variantId = filters.variantId == null
    ? null
    : positiveInteger(filters.variantId, 'معرف الصنف');
  const limit = filters.limit == null ? 100 : Number(filters.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('عدد حركات المخزون يجب أن يكون بين 1 و500');
  }
  return inventoryRepo.getMovementHistory({ warehouseId, variantId, limit });
}

function getTransfers() {
  requireAdmin();
  return inventoryRepo.getTransfers();
}

function normalizeTransferItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('أضف صنفًا واحدًا على الأقل للتحويل');
  }
  const combined = new Map();
  for (const item of items) {
    const variantId = positiveInteger(item?.variantId, 'معرف الصنف');
    const quantity = positiveInteger(item?.quantity, 'كمية التحويل');
    combined.set(variantId, (combined.get(variantId) || 0) + quantity);
    if (!variantsRepo.getById(variantId)) throw new Error('أحد الأصناف المحددة غير موجود');
  }
  return [...combined].map(([variantId, quantity]) => ({ variantId, quantity }));
}

function transferStock(data) {
  const session = requireAdmin();
  const sourceWarehouseId = positiveInteger(data?.sourceWarehouseId, 'المخزن المصدر');
  const destinationWarehouseId = positiveInteger(data?.destinationWarehouseId, 'المخزن المستلم');
  if (sourceWarehouseId === destinationWarehouseId) {
    throw new Error('يجب اختيار مخزنين مختلفين للتحويل');
  }
  requireActiveWarehouse(sourceWarehouseId);
  requireActiveWarehouse(destinationWarehouseId);
  const items = normalizeTransferItems(data.items);
  const transferId = inventoryRepo.createTransfer({
    sourceWarehouseId,
    destinationWarehouseId,
    items,
    userId: session.id,
    notes: String(data.notes || '').trim(),
  });
  productsCache.invalidate();
  return { transferId };
}

function adjustStock(data) {
  const session = requireAdmin();
  const warehouseId = positiveInteger(data?.warehouseId, 'معرف المخزن');
  const variantId = positiveInteger(data?.variantId, 'معرف الصنف');
  const delta = Number(data?.delta);
  const notes = String(data?.notes || '').trim();
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new Error('قيمة التسوية يجب أن تكون عددًا صحيحًا غير صفر');
  }
  if (!notes) throw new Error('سبب تسوية المخزون مطلوب');
  requireActiveWarehouse(warehouseId);
  if (!variantsRepo.getById(variantId)) throw new Error('الصنف غير موجود');
  const quantityAfter = inventoryRepo.adjustStock({
    warehouseId,
    variantId,
    delta,
    userId: session.id,
    notes,
  });
  productsCache.invalidate();
  return { quantityAfter };
}

function setReorderLevel(data) {
  requireAdmin();
  const warehouseId = positiveInteger(data?.warehouseId, 'معرف المخزن');
  const variantId = positiveInteger(data?.variantId, 'معرف الصنف');
  const reorderLevel = Number(data?.reorderLevel);
  if (!Number.isSafeInteger(reorderLevel) || reorderLevel < 0) {
    throw new Error('حد إعادة الطلب يجب أن يكون عددًا صحيحًا غير سالب');
  }
  requireActiveWarehouse(warehouseId);
  if (!variantsRepo.getById(variantId)) throw new Error('الصنف غير موجود');
  return inventoryRepo.setReorderLevel({ warehouseId, variantId, reorderLevel });
}

function countStock(data) {
  const session = requireAdmin();
  const warehouseId = positiveInteger(data?.warehouseId, 'معرف المخزن');
  const countType = data?.countType;
  if (!['full', 'partial'].includes(countType)) {
    throw new Error('نوع الجرد غير صالح');
  }
  requireActiveWarehouse(warehouseId);
  const items = normalizeCountItems(data.items);
  if (countType === 'full') {
    const stock = inventoryRepo.listStock({ warehouseId });
    if (items.length !== stock.length || stock.some(
      (row) => !items.some((item) => item.variantId === row.variant_id)
    )) {
      throw new Error('الجرد الكلي يجب أن يشمل جميع الأصناف الموجودة في المخزن');
    }
  }
  const countId = inventoryRepo.createCount({
    warehouseId,
    countType,
    items,
    userId: session.id,
    notes: String(data.notes || '').trim(),
  });
  productsCache.invalidate();
  return { countId };
}

function normalizeCountItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('أضف صنفًا واحدًا على الأقل للجرد');
  }
  const seen = new Set();
  return items.map((item) => {
    const variantId = positiveInteger(item?.variantId, 'معرف الصنف');
    const countedQuantity = Number(item?.countedQuantity);
    if (!Number.isSafeInteger(countedQuantity) || countedQuantity < 0) {
      throw new Error('الكمية الفعلية يجب أن تكون عددًا صحيحًا غير سالب');
    }
    if (seen.has(variantId)) throw new Error('لا يمكن تكرار الصنف في عملية الجرد');
    seen.add(variantId);
    if (!variantsRepo.getById(variantId)) throw new Error('أحد الأصناف المحددة غير موجود');
    return { variantId, countedQuantity };
  });
}

module.exports = {
  getBranches,
  createBranch,
  updateBranch,
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  getStock,
  getMovementHistory,
  getTransfers,
  transferStock,
  adjustStock,
  setReorderLevel,
  countStock,
};
