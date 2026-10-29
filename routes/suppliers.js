const express = require('express');
const router = express.Router();
const suppliersRepo = require('../electron/repositories/suppliers.repository');

router.get('/suppliers', (req, res, next) => {
  try {
    res.json(suppliersRepo.getAllWithStats());
  } catch (err) {
    next(err);
  }
});

router.post('/suppliers', (req, res, next) => {
  try {
    const id = suppliersRepo.create(req.body);
    res.status(201).json({ success: true, supplierId: id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
