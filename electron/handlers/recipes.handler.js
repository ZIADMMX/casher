const { safeHandle } = require('./safeHandle');
const recipesService = require('../services/recipes.service');

function registerRecipesHandlers() {
  safeHandle('products:getRecipe', (_event, variantId) => recipesService.getRecipe(variantId));
  safeHandle('products:setRecipe', (_event, { variantId, ingredients } = {}) => recipesService.setRecipe(variantId, ingredients));
}

module.exports = { registerRecipesHandlers };
