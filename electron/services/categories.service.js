const categoriesRepo = require('../repositories/categories.repository');

function getAllCategories() {
  return categoriesRepo.getAll();
}

// لو الفئة موجودة يرجع id بتاعها، لو مش موجودة يعملها ويرجع id
function findOrCreateByName(name) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = categoriesRepo.getByName(trimmed);
  if (existing) return existing.id;
  return categoriesRepo.create(trimmed);
}

module.exports = { getAllCategories, findOrCreateByName };
