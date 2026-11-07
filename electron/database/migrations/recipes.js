// Recipes: a menu item made of stock ingredients ("burger" = 1 bun + 150 g beef).
// Selling the item takes its ingredients out of stock instead of the item itself.
const SQL = `
CREATE TABLE IF NOT EXISTS recipe_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    ingredient_variant_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    UNIQUE (variant_id, ingredient_variant_id),
    CHECK (variant_id != ingredient_variant_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient ON recipe_items(ingredient_variant_id);
`;

function ensureRecipes(database) {
  database.exec(SQL);
}

module.exports = { ensureRecipes, RECIPES_SQL: SQL };
