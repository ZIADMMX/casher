const { db } = require('../database/db');

// A variant's ingredients with what selling needs (stock label, cost).
function getRecipe(variantId) {
  return db.prepare(`
    SELECT r.ingredient_variant_id, r.quantity, pv.sku, pv.size, pv.color, pv.purchase_price, p.name AS product_name
    FROM recipe_items r
    JOIN product_variants pv ON pv.id = r.ingredient_variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE r.variant_id = ?
    ORDER BY r.id
  `).all(variantId);
}

// Replaces the whole recipe, all or nothing. An empty list removes it.
function setRecipe(variantId, ingredients) {
  db.transaction(() => {
    db.prepare('DELETE FROM recipe_items WHERE variant_id = ?').run(variantId);
    const insert = db.prepare('INSERT INTO recipe_items (variant_id, ingredient_variant_id, quantity) VALUES (?, ?, ?)');
    for (const ing of ingredients) insert.run(variantId, ing.variantId, ing.quantity);
  })();
}

function hasRecipe(variantId) {
  return Boolean(db.prepare('SELECT 1 FROM recipe_items WHERE variant_id = ? LIMIT 1').get(variantId));
}

function isIngredient(variantId) {
  return Boolean(db.prepare('SELECT 1 FROM recipe_items WHERE ingredient_variant_id = ? LIMIT 1').get(variantId));
}

module.exports = { getRecipe, setRecipe, hasRecipe, isIngredient };
