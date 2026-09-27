const suppliersRepo = require('../repositories/suppliers.repository');
const { requireAdmin } = require('./auth.service');

function addSupplier(data) {
  requireAdmin();
  if (!data.name || !data.name.trim()) {
    throw new Error('اسم المورد أو المصنع مطلوب');
  }

  const id = suppliersRepo.create({
    name: data.name.trim(),
    phone: data.phone ? data.phone.trim() : null,
    company: data.company ? data.company.trim() : null,
    address: data.address ? data.address.trim() : null,
    notes: data.notes ? data.notes.trim() : null,
  });

  return { id };
}

function updateSupplier(id, data) {
  requireAdmin();
  if (!id) throw new Error('معرف المورد مطلوب');
  if (!data.name || !data.name.trim()) {
    throw new Error('اسم المورد أو المصنع مطلوب');
  }

  suppliersRepo.update(id, {
    name: data.name.trim(),
    phone: data.phone ? data.phone.trim() : null,
    company: data.company ? data.company.trim() : null,
    address: data.address ? data.address.trim() : null,
    notes: data.notes ? data.notes.trim() : null,
  });

  return { success: true };
}

function deleteSupplier(id) {
  requireAdmin();
  if (!id) throw new Error('معرف المورد مطلوب');
  suppliersRepo.deleteSupplier(id);
  return { success: true };
}

function getAllSuppliersWithStats() {
  requireAdmin();
  return suppliersRepo.getAllWithStats();
}

function getSupplierLedger(supplierId) {
  requireAdmin();
  if (!supplierId) throw new Error('معرف المورد مطلوب');
  return suppliersRepo.getSupplierLedger(supplierId);
}

module.exports = {
  addSupplier,
  updateSupplier,
  deleteSupplier,
  getAllSuppliersWithStats,
  getSupplierLedger,
};
