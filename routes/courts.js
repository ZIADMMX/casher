const express = require('express');
const router = express.Router();
const courtsService = require('../electron/services/courts.service');

router.get('/courts', (req, res, next) => {
  try {
    res.json(courtsService.getCourts(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/courts/:id', (req, res, next) => {
  try {
    const court = courtsService.getCourtById(req.params.id);
    if (!court) return res.status(404).json({ error: 'المحكمة غير موجودة' });
    return res.json(court);
  } catch (error) {
    return next(error);
  }
});

router.post('/courts', (req, res, next) => {
  try {
    res.status(201).json(courtsService.createCourt(req.body));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'يوجد محكمة نشطة بهذا الاسم بالفعل' });
    }
    return next(error);
  }
});

router.put('/courts/:id', (req, res, next) => {
  try {
    const court = courtsService.updateCourt(req.params.id, req.body);
    if (!court) return res.status(404).json({ error: 'المحكمة غير موجودة' });
    return res.json(court);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'يوجد محكمة نشطة بهذا الاسم بالفعل' });
    }
    return next(error);
  }
});

router.delete('/courts/:id', (req, res, next) => {
  try {
    const court = courtsService.deactivateCourt(req.params.id);
    if (!court) return res.status(404).json({ error: 'المحكمة غير موجودة' });
    return res.json(court);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
