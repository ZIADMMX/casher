// Recipes for menu items. One level only: an ingredient can't have its own
// recipe, so a sale never has to unfold nested recipes.
const recipesRepo = require('../repositories/recipes.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const productsCache = require('./products.cache');
const { requireAuth, hasGrantedPermission } = require('./auth.service');

const MAX_INGREDIENTS = 30;

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} غير صالح`);
  return id;
}

function getRecipe(variantId) {
  requireAuth();
  return recipesRepo.getRecipe(positiveId(variantId, 'الصنف'));
}

function setRecipe(variantId, ingredients) {
  requireAuth();
  if (!hasGrantedPermission('products.edit')) throw new Error('تعديل الوصفة يحتاج صلاحية تعديل المنتجات');
  const id = positiveId(variantId, 'الصنف');
  if (!variantsRepo.getById(id)) throw new Error('الصنف غير موجود');
  if (!Array.isArray(ingredients) || ingredients.length > MAX_INGREDIENTS) throw new Error('مكونات الوصفة غير صالحة');

  const seen = new Set();
  const cleaned = ingredients.map((ing) => {
    const ingredientId = positiveId(ing?.variantId, 'المكون');
    const quantity = Number(ing?.quantity);
    if (ingredientId === id) throw new Error('الصنف مينفعش يبقى مكون في وصفته');
    if (seen.has(ingredientId)) throw new Error('فيه مكون متكرر في الوصفة');
    seen.add(ingredientId);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error('كمية المكون غير صالحة');
    if (!variantsRepo.getById(ingredientId)) throw new Error('مكون غير موجود');
    if (recipesRepo.hasRecipe(ingredientId)) throw new Error('المكون ليه وصفة هو كمان؛ اختار الخامات نفسها');
    return { variantId: ingredientId, quantity };
  });
  // This item can't become an ingredient of others and have a recipe too.
  if (cleaned.length && recipesRepo.isIngredient(id)) {
    throw new Error('الصنف ده مكون في وصفة تانية، ومينفعش يبقى ليه وصفة');
  }

  recipesRepo.setRecipe(id, cleaned);
  productsCache.invalidate(); // the catalog's has_recipe flag changed
  return recipesRepo.getRecipe(id);
}

module.exports = { getRecipe, setRecipe };
