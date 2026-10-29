const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const productsRoutes = require('./products');
const salesRoutes = require('./sales');
const shiftsRoutes = require('./shifts');
const attendanceRoutes = require('./attendance');
const leavesRoutes = require('./leaves');
const returnsRoutes = require('./returns');
const customersRoutes = require('./customers');
const suppliersRoutes = require('./suppliers');
const purchasesRoutes = require('./purchases');
const ordersRoutes = require('./orders');
const subscriptionsRoutes = require('./subscriptions');
const commissionsRoutes = require('./commissions');
const onboardingRoutes = require('./onboarding');
const systemRoutes = require('./system');

router.use(authRoutes);
router.use(productsRoutes);
router.use(salesRoutes);
router.use(shiftsRoutes);
router.use(attendanceRoutes);
router.use(leavesRoutes);
router.use(returnsRoutes);
router.use(customersRoutes);
router.use(suppliersRoutes);
router.use(purchasesRoutes);
router.use(ordersRoutes);
router.use(subscriptionsRoutes);
router.use(commissionsRoutes);
router.use(onboardingRoutes);
router.use(systemRoutes);

module.exports = router;
