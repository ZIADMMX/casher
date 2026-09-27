const suppliersService = require('../services/suppliers.service');
const { safeHandle } = require('./safeHandle');
const { addSupplierSchema, updateSupplierSchema, positiveIdSchema } = require('../validators/schema');

function registerSuppliersHandlers() {
  safeHandle('suppliers:add', addSupplierSchema, (event, data) => {
    return suppliersService.addSupplier(data);
  });

  safeHandle('suppliers:update', updateSupplierSchema, (event, { id, data }) => {
    return suppliersService.updateSupplier(id, data);
  });

  safeHandle('suppliers:delete', positiveIdSchema, (event, id) => {
    return suppliersService.deleteSupplier(id);
  });

  safeHandle('suppliers:getAllWithStats', () => {
    return suppliersService.getAllSuppliersWithStats();
  });

  safeHandle('suppliers:getLedger', positiveIdSchema, (event, supplierId) => {
    return suppliersService.getSupplierLedger(supplierId);
  });
}

module.exports = { registerSuppliersHandlers };
