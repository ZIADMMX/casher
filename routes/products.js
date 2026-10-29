const express = require('express');
const router = express.Router();
const productsService = require('../electron/services/products.service');
const { getAllCategories } = require('../electron/services/categories.service');

router.get('/products', (req, res, next) => {
  try {
    const products = productsService.getAllProductsWithVariants();
    res.json(products);
  } catch (err) {
    next(err);
  }
});

router.post('/products', (req, res, next) => {
  try {
    const result = productsService.addProductWithVariant(req.body);
    res.status(201).json({ success: true, productId: result });
  } catch (err) {
    next(err);
  }
});

router.get('/products/barcode/:barcode', (req, res, next) => {
  try {
    const barcode = decodeURIComponent(req.params.barcode);
    const product = productsService.getProductByBarcode(barcode);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.get('/categories', (req, res, next) => {
  try {
    res.json(getAllCategories());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
