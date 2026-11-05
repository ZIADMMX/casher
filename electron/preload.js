const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function invokeRemoteOrLocal(method, route, localChannel, body, ...localArgs) {
  if (await ipcRenderer.invoke('central:isConfigured')) {
    return ipcRenderer.invoke('central:request', { method, route, body });
  }
  return ipcRenderer.invoke(localChannel, ...localArgs);
}

async function invokeAuth(localChannel, credentials) {
  if (await ipcRenderer.invoke('central:isConfigured')) {
    if (localChannel === 'auth:login') return ipcRenderer.invoke('central:login', credentials);
    if (localChannel === 'auth:getSession') return ipcRenderer.invoke('central:getSession');
    if (localChannel === 'auth:logout') return ipcRenderer.invoke('central:logout');
    if (localChannel === 'auth:isSetupRequired') return false;
    if (localChannel === 'auth:refreshSession') return ipcRenderer.invoke('central:refreshSession');
    if (localChannel === 'auth:updateProfile') return ipcRenderer.invoke('central:updateProfile', credentials);
    if (localChannel === 'auth:getMyProfile') return ipcRenderer.invoke('central:getMyProfile');
    if (localChannel === 'auth:saveMyProfile') return ipcRenderer.invoke('central:saveMyProfile', credentials);
    if (localChannel === 'auth:changePassword') return ipcRenderer.invoke('central:changePassword', credentials);
    throw new Error('هذه العملية غير متاحة لحسابات الفروع المتصلة بالخادم المركزي');
  }
  return ipcRenderer.invoke(localChannel, credentials);
}

// Keep this object as the single, documented renderer-to-main API.
contextBridge.exposeInMainWorld('electronAPI', {
  restartApp: () => ipcRenderer.invoke('app:restart'),
  relaunchAfterError: () => ipcRenderer.invoke('recovery:relaunch'), // error screen; works when overloaded or logged out

  // Products and variants
  addProductWithVariant: (data) =>
    invokeRemoteOrLocal('POST', '/api/products/add', 'products:addWithVariant', data, data),
  addVariantToProduct: (productId, variant) =>
    invokeRemoteOrLocal('POST', '/api/products/add-variant', 'products:addVariant', { productId, variant }, { productId, variant }),
  getAllProductsWithVariants: () =>
    invokeRemoteOrLocal('GET', '/api/products', 'products:getAllWithVariants'),
  getByBarcode: (barcode) =>
    invokeRemoteOrLocal('GET', `/api/products/barcode/${encodeURIComponent(barcode)}`, 'products:getByBarcode', undefined, barcode),
  getProductByBarcode: (barcode) =>
    invokeRemoteOrLocal('GET', `/api/products/barcode/${encodeURIComponent(barcode)}`, 'products:getByBarcode', undefined, barcode),
  updateProduct: (productId, data) =>
    invokeRemoteOrLocal('POST', '/api/products/update', 'products:update', { productId, data }, { productId, data }),
  deleteProduct: (productId) =>
    invokeRemoteOrLocal('POST', '/api/products/delete', 'products:delete', { productId }, productId),
  updateVariant: (variantId, data) =>
    invokeRemoteOrLocal('POST', '/api/products/update-variant', 'variants:update', { variantId, data }, { variantId, data }),
  deleteVariant: (variantId) =>
    invokeRemoteOrLocal('POST', '/api/products/delete-variant', 'variants:delete', { variantId }, variantId),
  selectProductImage: () => ipcRenderer.invoke('products:selectImage'),

  // Returns
  findSaleForReturn: (saleId) => invokeRemoteOrLocal('GET', `/api/returns/find-sale/${saleId}`, 'returns:findSale', undefined, saleId),
  processReturn: (data) => invokeRemoteOrLocal('POST', '/api/returns/process', 'returns:process', data, data),
  getRecentReturns: () => invokeRemoteOrLocal('GET', '/api/returns/recent', 'returns:getRecent'),

  // Backups
  backupNow: () => ipcRenderer.invoke('backup:now'),
restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  // Categories
  getAllCategories: () => invokeRemoteOrLocal('GET', '/api/categories', 'categories:getAll'),
  
  // Reports
  getReports: (period) => ipcRenderer.invoke('reports:get', period),
  getReportInvoices: (query) => ipcRenderer.invoke('reports:getInvoices', query),
  getLegalCaseReport: (period) => ipcRenderer.invoke('reports:getLegalCases', period),
  // Printing & cash drawer
  printReceipt: (sale, options) => ipcRenderer.invoke('print:receipt', { sale, options }),
  openCashDrawer: (options) => ipcRenderer.invoke('print:openCashDrawer', options),
  getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
  printRaw: (rawBuffer, options) => ipcRenderer.invoke('print:raw', { rawBuffer, options }),
  cutPaper: (options) => ipcRenderer.invoke('print:cutPaper', options),
  printBarcodeLabel: (labelData) => ipcRenderer.invoke('print:barcodeLabel', labelData),
  // Customers
  getAllCustomersWithStats: () => invokeRemoteOrLocal('GET', '/api/customers', 'customers:getAllWithStats'),
  addCustomer: (data) => invokeRemoteOrLocal('POST', '/api/customers/add', 'customers:add', data, data),
  addManualDebt: (data) => ipcRenderer.invoke('customers:addManualDebt', data),
  recordCustomerPayment: (data) => ipcRenderer.invoke('customers:recordPayment', data),
  getCustomerLedger: (customerId) => ipcRenderer.invoke('customers:getLedger', customerId),

  // Excel export

  exportCustomers: () => ipcRenderer.invoke('export:customers'),
exportInvoices: (period) => ipcRenderer.invoke('export:invoices', period),
exportEmployees: () => ipcRenderer.invoke('export:employees'),

  // Sales
  createSale: (saleData) => invokeRemoteOrLocal('POST', '/api/sales/create', 'sales:create', saleData, saleData),
  getKitchenOrders: () => invokeRemoteOrLocal('GET', '/api/sales/kitchen-orders', 'sales:getKitchenOrders'),
  updateKitchenOrderStatus: (saleId, status) => invokeRemoteOrLocal(
    'POST',
    '/api/sales/kitchen-orders/status',
    'sales:updateKitchenOrderStatus',
    { saleId, status },
    { saleId, status }
  ),
  previewBundlePromotions: (items) => ipcRenderer.invoke('sales:previewBundlePromotion', items),
  getBundlePromotions: () => ipcRenderer.invoke('promotions:getBundles'),
  saveBundlePromotions: (promotions) => ipcRenderer.invoke('promotions:saveBundles', promotions),
  getSaleById: (saleId) => invokeRemoteOrLocal('GET', `/api/sales/${saleId}`, 'sales:getById', undefined, saleId),

  // Suppliers & Purchases (الموردين وفواتير الشراء والآجل)
  addSupplier: (data) => ipcRenderer.invoke('suppliers:add', data),
  updateSupplier: (id, data) => ipcRenderer.invoke('suppliers:update', { id, data }),
  deleteSupplier: (id) => ipcRenderer.invoke('suppliers:delete', id),
  getAllSuppliersWithStats: () => ipcRenderer.invoke('suppliers:getAllWithStats'),
  getSupplierLedger: (supplierId) => ipcRenderer.invoke('suppliers:getLedger', supplierId),
  createPurchase: (data) => invokeRemoteOrLocal('POST', '/api/purchases/create', 'purchases:create', data, data),
  getAllPurchases: (filters) => ipcRenderer.invoke('purchases:getAll', filters),
  getPurchaseById: (id) => ipcRenderer.invoke('purchases:getById', id),
  recordSupplierPayment: (data) => ipcRenderer.invoke('purchases:recordPayment', data),
  getAllSupplierPayments: (limit) => ipcRenderer.invoke('purchases:getAllPayments', limit),
  getPurchasesSummaryKPIs: () => ipcRenderer.invoke('purchases:getSummaryKPIs'),

  // Shifts & Z-Report (إدارة الورديات وتقفيل الدرج)
  getCurrentShift: () => invokeRemoteOrLocal('GET', '/api/shifts/current', 'shifts:getCurrent'),
  getLastClosedShift: () => ipcRenderer.invoke('shifts:getLastClosed'),
  openShift: (data) => invokeRemoteOrLocal('POST', '/api/shifts/open', 'shifts:open', data, data),
  closeShift: (data) => invokeRemoteOrLocal('POST', '/api/shifts/close', 'shifts:close', data, data),
  getShiftXReport: (shiftId) => ipcRenderer.invoke('shifts:getXReport', shiftId),
  addShiftExpense: (data) => ipcRenderer.invoke('shifts:addExpense', data),
  getShiftExpenses: (shiftId) => ipcRenderer.invoke('shifts:getExpenses', shiftId),
  getAllShifts: (filters) => ipcRenderer.invoke('shifts:getAll', filters),
  getShiftById: (shiftId) => ipcRenderer.invoke('shifts:getById', shiftId),
  getShiftsKPIs: () => ipcRenderer.invoke('shifts:getKPIs'),

  // Authentication & Recovery
  isSetupRequired: () => invokeAuth('auth:isSetupRequired'),
  createInitialAdmin: (credentials) => ipcRenderer.invoke('auth:createInitialAdmin', credentials),
  login: (credentials) => invokeAuth('auth:login', credentials),
  logout: () => invokeAuth('auth:logout'),
  getSession: () => invokeAuth('auth:getSession'),
  refreshSession: () => invokeAuth('auth:refreshSession'),
  updateProfile: (data) => invokeAuth('auth:updateProfile', data),
  getMyProfile: () => invokeAuth('auth:getMyProfile'),
  saveMyProfile: (data) => invokeAuth('auth:saveMyProfile', data),
  changePassword: (newPassword) => invokeAuth('auth:changePassword', newPassword),
  getRecoveryChallenge: () => ipcRenderer.invoke('auth:getRecoveryChallenge'),
  resetAdminPasswordWithRecoveryKey: (data) => ipcRenderer.invoke('auth:resetWithRecoveryKey', data),
  resetAdminPasswordWithChallenge: (data) => ipcRenderer.invoke('auth:resetWithChallenge', data),
  // Users & employees
  addCashier: (data) => ipcRenderer.invoke('users:add', data),
  selectUserImage: () => ipcRenderer.invoke('users:selectImage'),
  getAllUsers: () => ipcRenderer.invoke('users:getAll'),
  getEmployeeRoleOptions: () => ipcRenderer.invoke('users:getRoleOptions'),
  getUserDetails: (userId) => ipcRenderer.invoke('users:getDetails', userId),
  getUserActivity: (options) => ipcRenderer.invoke('users:getActivity', options),
  resetUserPassword: (data) => ipcRenderer.invoke('users:resetPassword', data),
  toggleUserActive: (userId) => ipcRenderer.invoke('users:toggleActive', userId),
  removeUser: (userId) => ipcRenderer.invoke('users:remove', userId),
  // Attendance & leave
  getAttendanceByDate: (date) =>
    invokeRemoteOrLocal('GET', `/api/attendance?date=${encodeURIComponent(date)}`, 'attendance:getByDate', undefined, date),
  getMyAttendanceStatus: () =>
    invokeRemoteOrLocal('GET', '/api/attendance/me/today', 'attendance:getMyTodayStatus'),
  getAttendanceSummary30Days: () =>
    invokeRemoteOrLocal('GET', '/api/attendance/summary-30-days', 'attendance:getLast30DaysSummary'),
  updateAttendanceSchedule: (data) =>
    invokeRemoteOrLocal('POST', '/api/attendance/schedule', 'attendance:updateSchedule', data, data),
  checkInEmployee: (data) =>
    invokeRemoteOrLocal('POST', '/api/attendance/check-in', 'attendance:checkIn', data, data),
  checkOutEmployee: (data) =>
    invokeRemoteOrLocal('POST', '/api/attendance/check-out', 'attendance:checkOut', data, data),
  getLeaveRequests: () =>
    invokeRemoteOrLocal('GET', '/api/leaves', 'leaves:getAll'),
  createLeaveRequest: (data) =>
    invokeRemoteOrLocal('POST', '/api/leaves', 'leaves:create', data, data),
  decideLeaveRequest: (data) =>
    invokeRemoteOrLocal('POST', '/api/leaves/decision', 'leaves:decide', data, data),

  // Cashier & User Audit Trail System
  getAuditLogs: (filters) => ipcRenderer.invoke('audit:getLogs', filters),
  getCashierAuditSummary: (userId) => ipcRenderer.invoke('audit:getCashierSummary', userId),
  logClientAuditAction: (data) => ipcRenderer.invoke('audit:logClientAction', data),

  // Store Settings & System Customization & Backup
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  backupDatabase: () => ipcRenderer.invoke('settings:backup'),
  restoreDatabase: () => ipcRenderer.invoke('settings:restore'),
  uploadStoreLogo: () => ipcRenderer.invoke('settings:uploadLogo'),

  // License & Software Activation
  getLicenseStatus: () => ipcRenderer.invoke('license:getStatus'),
  activateSoftware: (key) => ipcRenderer.invoke('license:activate', key),
  onLicenseStatusChanged: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('license:statusChanged', listener);
    return () => ipcRenderer.removeListener('license:statusChanged', listener);
  },
  onLicenseVerificationFailed: (callback) => {
    const listener = (_event, error) => callback(error);
    ipcRenderer.on('license:verificationFailed', listener);
    return () => ipcRenderer.removeListener('license:verificationFailed', listener);
  },

  // Excel Import
  selectImportFile: () => ipcRenderer.invoke('import:selectFile'),
  importExcel: (data) => ipcRenderer.invoke('import:excel', data),
  downloadImportTemplate: (type) => ipcRenderer.invoke('import:downloadTemplate', type),
  getDroppedImportFilePath: (file) => webUtils.getPathForFile(file),

  // Real-time Notifications System
  getNotifications: (options) => ipcRenderer.invoke('notifications:getAll', options),
  getUnreadNotificationsCount: () => ipcRenderer.invoke('notifications:getUnreadCount'),
  markNotificationAsRead: (id) => ipcRenderer.invoke('notifications:markAsRead', id),
  markAllNotificationsAsRead: () => ipcRenderer.invoke('notifications:markAllAsRead'),
  clearAllNotifications: () => ipcRenderer.invoke('notifications:clearAll'),
  onNotificationReceived: (callback) => {
    const subscription = (_event, notification) => callback(notification);
    ipcRenderer.on('notification:received', subscription);
    return () => ipcRenderer.removeListener('notification:received', subscription);
  },

  // Operations & Orders Center
  getAllOrders: (filters) => ipcRenderer.invoke('orders:getAll', filters),
  getOrderById: (orderId) => ipcRenderer.invoke('orders:getById', orderId),
  createOrder: (orderData, items) => ipcRenderer.invoke('orders:create', { orderData, items }),
  addOrderItem: (orderId, item) => ipcRenderer.invoke('orders:addItem', { orderId, item }),
  updateOrderStatus: (orderId, status, description) => ipcRenderer.invoke('orders:updateStatus', { orderId, status, description }),
  assignOrder: (orderId, assignedUserId) => ipcRenderer.invoke('orders:assign', { orderId, assignedUserId }),
  addOrderComment: (orderId, comment) => ipcRenderer.invoke('orders:addComment', { orderId, comment }),
  addOrderAttachment: (orderId, attachmentData) => ipcRenderer.invoke('orders:addAttachment', { orderId, attachmentData }),
  getOrderStats: () => ipcRenderer.invoke('orders:getStats'),

  // Subscriptions & Packages
  getAllPackages: () => ipcRenderer.invoke('subscriptions:getAllPackages'),
  createPackage: (data) => ipcRenderer.invoke('subscriptions:createPackage', data),
  updatePackage: (id, packageData) => ipcRenderer.invoke('subscriptions:updatePackage', { id, packageData }),
  deletePackage: (packageId) => ipcRenderer.invoke('subscriptions:deletePackage', packageId),
  getAllSubscriptions: (filters) => ipcRenderer.invoke('subscriptions:getAll', filters),
  getActiveSubscriptionByCustomer: (customerId) => ipcRenderer.invoke('subscriptions:getActiveByCustomer', customerId),
  subscribeCustomer: (data) => ipcRenderer.invoke('subscriptions:subscribeCustomer', data),
  consumeSubscriptionCredit: (subscriptionId, creditsDeducted, saleId, notes) => ipcRenderer.invoke('subscriptions:consumeCredit', { subscriptionId, creditsDeducted, saleId, notes }),
  freezeSubscription: (subscriptionId, reason) => ipcRenderer.invoke('subscriptions:freeze', { subscriptionId, reason }),
  unfreezeSubscription: (subscriptionId) => ipcRenderer.invoke('subscriptions:unfreeze', subscriptionId),
  renewSubscription: (subscriptionId) => ipcRenderer.invoke('subscriptions:renew', subscriptionId),
  getSubscriptionStats: () => ipcRenderer.invoke('subscriptions:getStats'),

  // Commissions & Incentives Engine
  getAllCommissionRules: () => ipcRenderer.invoke('commissions:getAllRules'),
  createCommissionRule: (ruleData) => ipcRenderer.invoke('commissions:createRule', ruleData),
  updateCommissionRule: (id, ruleData) => ipcRenderer.invoke('commissions:updateRule', { id, ruleData }),
  toggleCommissionRule: (ruleId) => ipcRenderer.invoke('commissions:toggleRule', ruleId),
  deleteCommissionRule: (ruleId) => ipcRenderer.invoke('commissions:deleteRule', ruleId),
  getAllCommissionEarnings: (filters) => ipcRenderer.invoke('commissions:getAllEarnings', filters),
  payoutCommissionEarnings: (userId, amount, paymentMethod, notes) => ipcRenderer.invoke('commissions:payoutEarnings', { userId, amount, paymentMethod, notes }),
  getCommissionSummary: () => ipcRenderer.invoke('commissions:getSummary'),

  // Payroll & Employee Salaries
  getAllPayrollPeriods: () => ipcRenderer.invoke('payroll:getAllPeriods'),
  getPayrollDetails: (periodId) => ipcRenderer.invoke('payroll:getDetails', periodId),
  generatePayrollPeriod: (data) => ipcRenderer.invoke('payroll:generatePeriod', data),
  payEmployeeSalary: (itemId, paymentData) => ipcRenderer.invoke('payroll:payEmployee', { itemId, paymentData }),
  approvePayrollPeriod: (periodId) => ipcRenderer.invoke('payroll:approvePeriod', periodId),
  deletePayrollPeriod: (periodId) => ipcRenderer.invoke('payroll:deletePeriod', periodId),
  getAllSalaryAdvances: (userId) => ipcRenderer.invoke('payroll:getAllAdvances', userId),
  createSalaryAdvance: (data) => ipcRenderer.invoke('payroll:createAdvance', data),

  // Salon & Barbershop Management APIs
  getAllSalonChairs: () => ipcRenderer.invoke('salon:getAllChairs'),
  createSalonChair: (data) => ipcRenderer.invoke('salon:createChair', data),
  updateSalonChair: (id, data) => ipcRenderer.invoke('salon:updateChair', { id, data }),
  setSalonChairStatus: (id, status) => ipcRenderer.invoke('salon:setChairStatus', { id, status }),
  deleteSalonChair: (id) => ipcRenderer.invoke('salon:deleteChair', id),

  getAllSalonServices: (category) => ipcRenderer.invoke('salon:getAllServices', category),
  createSalonService: (data) => ipcRenderer.invoke('salon:createService', data),
  updateSalonService: (id, data) => ipcRenderer.invoke('salon:updateService', { id, data }),
  deleteSalonService: (id) => ipcRenderer.invoke('salon:deleteService', id),

  getAllSalonPackages: () => ipcRenderer.invoke('salon:getAllPackages'),
  createSalonPackage: (data) => ipcRenderer.invoke('salon:createPackage', data),
  subscribeCustomerToSalonPackage: (data) => ipcRenderer.invoke('salon:subscribePackage', data),
  getCustomerActiveSalonSubscriptions: (customerId) => ipcRenderer.invoke('salon:getCustomerSubscriptions', customerId),

  getSalonAppointments: (filters) => ipcRenderer.invoke('salon:getAppointments', filters),
  createSalonAppointment: (data) => ipcRenderer.invoke('salon:createAppointment', data),
  updateSalonAppointmentStatus: (id, status, saleId) => ipcRenderer.invoke('salon:updateAppointmentStatus', { id, status, saleId }),
  getSalonWhatsAppReminderLink: (appointmentId) => ipcRenderer.invoke('salon:getWhatsAppReminderLink', appointmentId),

  logSalonServiceSale: (data) => ipcRenderer.invoke('salon:logServiceSale', data),
  getSalonStylistCommissions: (filters) => ipcRenderer.invoke('salon:getStylistCommissions', filters),

  // Live Chair Linkage, Barbers, Coupons & Tips
  seatSalonChair: (data) => ipcRenderer.invoke('salon:seatCustomerOnChair', data),
  vacateSalonChair: (chairId) => ipcRenderer.invoke('salon:vacateChair', chairId),
  completeSalonChairService: (data) => ipcRenderer.invoke('salon:completeChairService', data),
  getSalonBarbersWithStats: (filters) => ipcRenderer.invoke('salon:getBarbersWithStats', filters),
  getSalonStylistDetailedLedger: (stylistId, filters) => ipcRenderer.invoke('salon:getStylistDetailedLedger', { stylistId, filters }),
  getAllSalonCoupons: () => ipcRenderer.invoke('salon:getAllCoupons'),
  createSalonCoupon: (data) => ipcRenderer.invoke('salon:createCoupon', data),
  deleteSalonCoupon: (id) => ipcRenderer.invoke('salon:deleteCoupon', id),
  applySalonCoupon: (code, amount) => ipcRenderer.invoke('salon:applyCoupon', { code, amount }),
  getSalonTipPoolSummary: (filters) => ipcRenderer.invoke('salon:getTipPoolSummary', filters),

  // Legal Cases Module (قطاع المحاماة)
  getCaseLawyers: () => ipcRenderer.invoke('cases:getCaseLawyers'),
  getCourts: (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const query = params.toString();
    return invokeRemoteOrLocal(
      'GET',
      `/api/courts${query ? `?${query}` : ''}`,
      'courts:getAll',
      undefined,
      filters,
    );
  },
  getCourtById: (id) => invokeRemoteOrLocal('GET', `/api/courts/${encodeURIComponent(id)}`, 'courts:getById', undefined, id),
  createCourt: (data) => invokeRemoteOrLocal('POST', '/api/courts', 'courts:create', data, data),
  updateCourt: (id, data) => invokeRemoteOrLocal('PUT', `/api/courts/${encodeURIComponent(id)}`, 'courts:update', data, { id, data }),
  deactivateCourt: (id) => invokeRemoteOrLocal('DELETE', `/api/courts/${encodeURIComponent(id)}`, 'courts:deactivate', undefined, id),
  getAllCases: (filters) => ipcRenderer.invoke('cases:getAllCases', filters),
  getCaseById: (id) => ipcRenderer.invoke('cases:getCaseById', id),
  createCase: (data) => ipcRenderer.invoke('cases:createCase', data),
  updateCase: (id, data) => ipcRenderer.invoke('cases:updateCase', { id, data }),
  deleteCase: (id) => ipcRenderer.invoke('cases:deleteCase', id),
  getCasesSummaryStats: () => ipcRenderer.invoke('cases:getCasesSummaryStats'),
  getCasesByClientId: (clientId) => ipcRenderer.invoke('cases:getCasesByClientId', clientId),
  getLegalClientInteractions: (customerId) => ipcRenderer.invoke('cases:getLegalClientInteractions', customerId),
  addLegalClientInteraction: (data) => ipcRenderer.invoke('cases:addLegalClientInteraction', data),
  getCustomerPowerOfAttorneys: (customerId) => ipcRenderer.invoke('cases:getCustomerPowerOfAttorneys', customerId),
  createCustomerPowerOfAttorney: (customerId, data) => ipcRenderer.invoke('cases:createCustomerPowerOfAttorney', { customerId, data }),
  updateCustomerPowerOfAttorney: (id, data) => ipcRenderer.invoke('cases:updateCustomerPowerOfAttorney', { id, data }),
  deleteCustomerPowerOfAttorney: (id) => ipcRenderer.invoke('cases:deleteCustomerPowerOfAttorney', id),
  getLawFirmDashboard: (date) => ipcRenderer.invoke('cases:getLawFirmDashboard', date),

  getCaseSessions: (caseId) => ipcRenderer.invoke('cases:getSessionsByCaseId', caseId),
  getAllUpcomingCourtSessions: (filters) => ipcRenderer.invoke('cases:getAllUpcomingSessions', filters),
  getCourtSessionById: (id) => ipcRenderer.invoke('cases:getSessionById', id),
  createCourtSession: (data) => ipcRenderer.invoke('cases:createSession', data),
  updateCourtSession: (id, data) => ipcRenderer.invoke('cases:updateSession', { id, data }),
  deleteCourtSession: (id) => ipcRenderer.invoke('cases:deleteSession', id),
  getDailyCourtDocket: (date) => ipcRenderer.invoke('cases:getDailyDocket', date),
  checkDueCourtSessionReminders: (hoursAhead) => ipcRenderer.invoke('cases:checkDueCourtSessionReminders', hoursAhead),
  getCaseTasks: (caseId) => ipcRenderer.invoke('cases:getTasksByCaseId', caseId),
  createCaseTask: (data) => ipcRenderer.invoke('cases:createTask', data),
  updateCaseTask: (id, data) => ipcRenderer.invoke('cases:updateTask', { id, data }),
  deleteCaseTask: (id) => ipcRenderer.invoke('cases:deleteTask', id),
  getCaseFinancialBreakdown: (caseId) => ipcRenderer.invoke('cases:getCaseFinancialBreakdown', caseId),
  printCaseFinancialReceipt: (financialId) => ipcRenderer.invoke('cases:printFinancialReceipt', financialId),

  getCaseDocuments: (caseId) => ipcRenderer.invoke('cases:getDocumentsByCaseId', caseId),
  selectCaseDocumentFile: () => ipcRenderer.invoke('cases:selectDocumentFile'),
  createCaseDocument: (data) => ipcRenderer.invoke('cases:createDocument', data),
  updateCaseDocument: (id, data) => ipcRenderer.invoke('cases:updateDocument', { id, data }),
  deleteCaseDocument: (id) => ipcRenderer.invoke('cases:deleteDocument', id),
  getCaseDocumentVersions: (id) => ipcRenderer.invoke('cases:getDocumentVersions', id),
  openCaseDocument: (id, version) => ipcRenderer.invoke('cases:openDocument', { id, version }),
  restoreCaseDocumentVersion: (id, version) => ipcRenderer.invoke('cases:restoreDocumentVersion', { id, version }),
  downloadCaseDocument: (id, fileName, version) => ipcRenderer.invoke('cases:downloadDocument', { id, fileName, version }),

  getCaseFinancials: (caseId) => ipcRenderer.invoke('cases:getFinancialsByCaseId', caseId),
  createCaseFinancial: (data) => ipcRenderer.invoke('cases:createFinancial', data),
  updateCaseFinancial: (id, data) => ipcRenderer.invoke('cases:updateFinancial', { id, data }),
  deleteCaseFinancial: (id) => ipcRenderer.invoke('cases:deleteFinancial', id),

  getCaseTimeLogs: (caseId) => ipcRenderer.invoke('cases:getTimeLogsByCaseId', caseId),
  createCaseTimeLog: (data) => ipcRenderer.invoke('cases:createTimeLog', data),
  updateCaseTimeLog: (id, data) => ipcRenderer.invoke('cases:updateTimeLog', { id, data }),
  deleteCaseTimeLog: (id) => ipcRenderer.invoke('cases:deleteTimeLog', id),

  // Supermarket & Grocery APIs (محرك السوبر ماركت والبقالة المتقدم)
  resolveGroceryBarcode: (input) => ipcRenderer.invoke('grocery:resolveBarcode', input),
  parseGroceryScaleBarcode: (barcode) => ipcRenderer.invoke('grocery:parseScaleBarcode', barcode),
  parseGroceryQuickMultiplier: (input) => ipcRenderer.invoke('grocery:parseQuickMultiplier', input),
  getGroceryUnits: (variantId) => ipcRenderer.invoke('grocery:getUnits', variantId),
  getGroceryUnitByBarcode: (barcode) => ipcRenderer.invoke('grocery:getUnitByBarcode', barcode),
  createGroceryUnit: (data) => ipcRenderer.invoke('grocery:createUnit', data),
  updateGroceryUnit: (id, data) => ipcRenderer.invoke('grocery:updateUnit', { id, data }),
  deleteGroceryUnit: (id) => ipcRenderer.invoke('grocery:deleteUnit', id),
  getGroceryBatches: (variantId) => ipcRenderer.invoke('grocery:getBatches', variantId),
  createGroceryBatch: (data) => ipcRenderer.invoke('grocery:createBatch', data),
  getGroceryExpiringBatches: (daysAhead) => ipcRenderer.invoke('grocery:getExpiringBatches', daysAhead),
  getGroceryExpiredBatches: () => ipcRenderer.invoke('grocery:getExpiredBatches'),
  getGroceryExpirySummary: (daysAhead) => ipcRenderer.invoke('grocery:getExpirySummary', daysAhead),
  getGroceryScaleConfig: () => ipcRenderer.invoke('grocery:getScaleConfig'),
  saveGroceryScaleConfig: (data) => ipcRenderer.invoke('grocery:saveScaleConfig', data),
  getGrocerySpeedKeys: () => ipcRenderer.invoke('grocery:getSpeedKeys'),
  createGrocerySpeedKey: (data) => ipcRenderer.invoke('grocery:createSpeedKey', data),
  deleteGrocerySpeedKey: (id) => ipcRenderer.invoke('grocery:deleteSpeedKey', id),



  // CRM & Customer Communications Center
  getUnifiedTimeline: (customerId) => ipcRenderer.invoke('crm:getUnifiedTimeline', customerId),
  addCRMInteraction: (data) => ipcRenderer.invoke('crm:addInteraction', data),
  createCRMOpportunity: (data) => ipcRenderer.invoke('crm:createOpportunity', data),
  getAllCRMOpportunities: (filters) => ipcRenderer.invoke('crm:getAllOpportunities', filters),
  updateCRMOpportunityStage: (id, stage) => ipcRenderer.invoke('crm:updateOpportunityStage', { id, stage }),
  updateCustomerRatingAndTier: (customerId, rating, tier) => ipcRenderer.invoke('crm:updateRatingAndTier', { customerId, rating, tier }),
  checkCRMDueReminders: () => ipcRenderer.invoke('crm:checkDueReminders'),
  getCRMCampaigns: () => ipcRenderer.invoke('crm:getCampaigns'),
  createCRMCampaign: (data) => ipcRenderer.invoke('crm:createCampaign', data),
  getCRMCampaignAudience: (campaignId) => ipcRenderer.invoke('crm:getCampaignAudience', campaignId),
  createCRMCampaignReminders: (campaignId) => ipcRenderer.invoke('crm:createCampaignReminders', campaignId),
  getCRMCompanies: () => ipcRenderer.invoke('crm:getCompanies'),
  getCRMAssignees: () => ipcRenderer.invoke('crm:getAssignees'),
  createCRMCompany: (data) => ipcRenderer.invoke('crm:createCompany', data),
  updateCRMCompany: (data) => ipcRenderer.invoke('crm:updateCompany', data),
  getCRMLeads: (filters) => ipcRenderer.invoke('crm:getLeads', filters),
  createCRMLead: (data) => ipcRenderer.invoke('crm:createLead', data),
  updateCRMLead: (data) => ipcRenderer.invoke('crm:updateLead', data),
  deleteCRMLead: (leadId) => ipcRenderer.invoke('crm:deleteLead', leadId),
  updateCRMLeadStatus: (leadId, status) => ipcRenderer.invoke('crm:updateLeadStatus', { leadId, status }),
  convertCRMLead: (leadId) => ipcRenderer.invoke('crm:convertLead', leadId),
  getCRMPipelineStages: () => ipcRenderer.invoke('crm:getPipelineStages'),
  createCRMPipelineStage: (data) => ipcRenderer.invoke('crm:createPipelineStage', data),
  updateCRMPipelineStage: (data) => ipcRenderer.invoke('crm:updatePipelineStage', data),
  createCRMAdvancedOpportunity: (data) => ipcRenderer.invoke('crm:createAdvancedOpportunity', data),
  moveCRMOpportunity: (opportunityId, stageId) => ipcRenderer.invoke('crm:moveOpportunity', { opportunity_id: opportunityId, stage_id: stageId }),
  assignCRMOpportunity: (opportunityId, ownerUserId) => ipcRenderer.invoke('crm:assignOpportunity', {
    opportunity_id: opportunityId,
    owner_user_id: ownerUserId || null,
  }),
  getCRMActivities: (filters) => ipcRenderer.invoke('crm:getActivities', filters),
  createCRMActivity: (data) => ipcRenderer.invoke('crm:createActivity', data),
  completeCRMActivity: (activityId) => ipcRenderer.invoke('crm:completeActivity', activityId),
  getCRMNotes: (recordType, recordId) => ipcRenderer.invoke('crm:getNotes', { recordType, recordId }),
  createCRMNote: (data) => ipcRenderer.invoke('crm:createNote', data),
  getCRMAttachments: (recordType, recordId) => ipcRenderer.invoke('crm:getAttachments', { recordType, recordId }),
  selectCRMFileAttachment: (recordType, recordId) => ipcRenderer.invoke('crm:selectAttachment', { recordType, recordId }),
  openCRMAttachment: (attachmentId) => ipcRenderer.invoke('crm:openAttachment', attachmentId),
  setCRMRecordTags: (data) => ipcRenderer.invoke('crm:setTags', data),
  getCRMRecordTags: (recordType, recordId) => ipcRenderer.invoke('crm:getTags', { recordType, recordId }),
  getCRMSavedFilters: (entityType) => ipcRenderer.invoke('crm:getSavedFilters', entityType),
  saveCRMSavedFilter: (data) => ipcRenderer.invoke('crm:saveFilter', data),
  getCRMAuditLog: (entityType, entityId) => ipcRenderer.invoke('crm:getAuditLog', { entityType, entityId }),
  setCRMCustomerConsent: (customerId, consent) => ipcRenderer.invoke('crm:setConsent', { customerId, ...consent }),
  getCRMCustomerRelationships: (customerId) => ipcRenderer.invoke('crm:getCustomerRelationships', customerId),
  createCRMCustomerRelationship: (data) => ipcRenderer.invoke('crm:createCustomerRelationship', data),
  anonymizeCRMCustomer: (customerId) => ipcRenderer.invoke('crm:anonymizeCustomer', customerId),
  createCRMCustomField: (data) => ipcRenderer.invoke('crm:createCustomField', data),
  getCRMCustomFields: (entityType) => ipcRenderer.invoke('crm:getCustomFields', entityType),
  setCRMCustomFieldValues: (entityType, recordId, values) => ipcRenderer.invoke('crm:setCustomFieldValues', { entityType, recordId, values }),
  getCRMCustomFieldValues: (entityType, recordId) => ipcRenderer.invoke('crm:getCustomFieldValues', { entityType, recordId }),
  getCRMAutomationRules: () => ipcRenderer.invoke('crm:getAutomationRules'),
  saveCRMStaleOpportunityRule: (data) => ipcRenderer.invoke('crm:saveStaleOpportunityRule', data),
  importCRMLeads: () => ipcRenderer.invoke('crm:importLeads'),
  exportCRMRecords: (entityType) => ipcRenderer.invoke('crm:exportRecords', entityType),

  // Resilience & Central Nervous Backbone Engine
  getSystemBackboneHealth: () => ipcRenderer.invoke('resilience:getHealth'),

  // Enterprise Dynamic Framework (Modules, Profiles, Attributes, Workflows, Automations & RBAC)
  getSystemModules: () => ipcRenderer.invoke('enterprise:getModules'),
  setModuleEnabled: (key, isEnabled) => ipcRenderer.invoke('enterprise:setModuleEnabled', { key, isEnabled }),
  getBusinessProfiles: () => ipcRenderer.invoke('enterprise:getProfiles'),
  getActiveBusinessProfile: () => ipcRenderer.invoke('enterprise:getActiveProfile'),
  getActiveBusinessConfiguration: () => ipcRenderer.invoke('enterprise:getActiveConfiguration'),
  setActiveBusinessProfile: (profileKey) => ipcRenderer.invoke('enterprise:setActiveProfile', profileKey),
  getAttributeDefinitions: (profileKey) => ipcRenderer.invoke('enterprise:getAttributeDefs', profileKey),
  createAttributeDefinition: (data) => ipcRenderer.invoke('enterprise:createAttributeDef', data),
  getVariantAttributeValues: (variantId) => ipcRenderer.invoke('enterprise:getVariantAttributeValues', variantId),
  saveVariantAttributeValues: (variantId, valuesMap) => ipcRenderer.invoke('enterprise:saveVariantAttributeValues', { variantId, valuesMap }),
  getWorkflows: () => ipcRenderer.invoke('enterprise:getWorkflows'),
  createWorkflow: (data) => ipcRenderer.invoke('enterprise:createWorkflow', data),
  updateWorkflow: (id, data) => ipcRenderer.invoke('enterprise:updateWorkflow', { id, data }),
  deleteWorkflow: (id) => ipcRenderer.invoke('enterprise:deleteWorkflow', id),
  addWorkflowStatus: (workflowId, statusData) => ipcRenderer.invoke('enterprise:addWorkflowStatus', { workflowId, statusData }),
  updateWorkflowStatus: (statusId, statusData) => ipcRenderer.invoke('enterprise:updateWorkflowStatus', { statusId, statusData }),
  deleteWorkflowStatus: (statusId) => ipcRenderer.invoke('enterprise:deleteWorkflowStatus', statusId),
  saveWorkflowTransitions: (workflowId, transitions) => ipcRenderer.invoke('enterprise:saveWorkflowTransitions', { workflowId, transitions }),
  getWorkflowTickets: (workflowId, statusKey) => ipcRenderer.invoke('enterprise:getWorkflowTickets', { workflowId, statusKey }),
  createWorkflowTicket: (ticketData) => ipcRenderer.invoke('enterprise:createWorkflowTicket', ticketData),
  updateTicketStatus: (ticketId, workflowId, newStatusKey, userRole) => ipcRenderer.invoke('enterprise:updateTicketStatus', { ticketId, workflowId, newStatusKey, userRole }),
  deleteWorkflowTicket: (ticketId) => ipcRenderer.invoke('enterprise:deleteWorkflowTicket', ticketId),
  resetPresetWorkflows: () => ipcRenderer.invoke('enterprise:resetPresetWorkflows'),
  getAutomationRules: () => ipcRenderer.invoke('enterprise:getAutomations'),
  createAutomationRule: (data) => ipcRenderer.invoke('enterprise:createAutomation', data),
  setAutomationRuleEnabled: (id, isEnabled) => ipcRenderer.invoke('enterprise:setAutomationEnabled', { id, isEnabled }),
  getSystemRoles: () => ipcRenderer.invoke('enterprise:getRoles'),
  createSystemRole: (payload) => ipcRenderer.invoke('enterprise:createRole', payload),
  setRolePermissions: (roleKey, permissions) => ipcRenderer.invoke('enterprise:setRolePermissions', { roleKey, permissions }),

  // Branches, warehouses, stock transfers and inventory control
  getInventoryBranches: () => invokeRemoteOrLocal('GET', '/api/inventory/branches', 'inventory:getBranches'),
  createInventoryBranch: (data) => invokeRemoteOrLocal('POST', '/api/inventory/branches', 'inventory:createBranch', data, data),
  updateInventoryBranch: (id, data) => invokeRemoteOrLocal('PUT', `/api/inventory/branches/${id}`, 'inventory:updateBranch', data, { id, data }),
  getInventoryWarehouses: (branchId) => invokeRemoteOrLocal('GET', branchId == null
    ? '/api/inventory/warehouses'
    : `/api/inventory/warehouses?branchId=${encodeURIComponent(branchId)}`, 'inventory:getWarehouses', undefined, branchId),
  createInventoryWarehouse: (data) => invokeRemoteOrLocal('POST', '/api/inventory/warehouses', 'inventory:createWarehouse', data, data),
  updateInventoryWarehouse: (id, data) => invokeRemoteOrLocal('PUT', `/api/inventory/warehouses/${id}`, 'inventory:updateWarehouse', data, { id, data }),
  getInventoryStock: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.warehouseId != null) params.set('warehouseId', filters.warehouseId);
    if (filters.lowStockOnly) params.set('lowStockOnly', 'true');
    if (filters.search) params.set('search', filters.search);
    const query = params.toString();
    return invokeRemoteOrLocal('GET', `/api/inventory/stock${query ? `?${query}` : ''}`, 'inventory:getStock', undefined, filters);
  },
  getInventoryMovements: (filters = {}) => {
    const params = new URLSearchParams();
    for (const key of ['warehouseId', 'variantId', 'limit']) {
      if (filters[key] != null) params.set(key, filters[key]);
    }
    const query = params.toString();
    return invokeRemoteOrLocal('GET', `/api/inventory/movements${query ? `?${query}` : ''}`, 'inventory:getMovements', undefined, filters);
  },
  getInventoryTransfers: () => invokeRemoteOrLocal('GET', '/api/inventory/transfers', 'inventory:getTransfers'),
  transferInventoryStock: (data) => invokeRemoteOrLocal('POST', '/api/inventory/transfers', 'inventory:transfer', data, data),
  adjustInventoryStock: (data) => invokeRemoteOrLocal('POST', '/api/inventory/adjust', 'inventory:adjust', data, data),
  setInventoryReorderLevel: (data) => invokeRemoteOrLocal('POST', '/api/inventory/reorder-level', 'inventory:setReorderLevel', data, data),
  countInventoryStock: (data) => invokeRemoteOrLocal('POST', '/api/inventory/count', 'inventory:count', data, data),
  getAppointmentResources: (filters = {}) => {
    const query = new URLSearchParams({ activeOnly: String(Boolean(filters.activeOnly)) }).toString();
    return invokeRemoteOrLocal('GET', `/api/appointments/resources?${query}`, 'appointments:getResources', undefined, filters);
  },
  getAppointmentResource: (id) => invokeRemoteOrLocal('GET', `/api/appointments/resources/${id}`, 'appointments:getResource', undefined, id),
  saveAppointmentResource: (data) => invokeRemoteOrLocal('POST', '/api/appointments/resources', 'appointments:saveResource', data, data),
  getAppointmentServices: (filters = {}) => {
    const query = new URLSearchParams({ activeOnly: String(Boolean(filters.activeOnly)) }).toString();
    return invokeRemoteOrLocal('GET', `/api/appointments/services?${query}`, 'appointments:getServices', undefined, filters);
  },
  saveAppointmentService: (data) => invokeRemoteOrLocal('POST', '/api/appointments/services', 'appointments:saveService', data, data),
  getAppointmentHolidays: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.fromDate) params.set('fromDate', filters.fromDate);
    if (filters.toDate) params.set('toDate', filters.toDate);
    const query = params.toString();
    return invokeRemoteOrLocal('GET', `/api/appointments/holidays${query ? `?${query}` : ''}`, 'appointments:getHolidays', undefined, filters);
  },
  saveAppointmentHoliday: (data) => invokeRemoteOrLocal('POST', '/api/appointments/holidays', 'appointments:saveHoliday', data, data),
  removeAppointmentHoliday: (id) => invokeRemoteOrLocal('POST', '/api/appointments/holidays/delete', 'appointments:removeHoliday', { id }, id),
  getAppointments: (filters = {}) => {
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'status']) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const query = params.toString();
    return invokeRemoteOrLocal('GET', `/api/appointments/list${query ? `?${query}` : ''}`, 'appointments:getAll', undefined, filters);
  },
  createAppointment: (data) => invokeRemoteOrLocal('POST', '/api/appointments/create', 'appointments:create', data, data),
  updateAppointmentStatus: (id, status) => invokeRemoteOrLocal('POST', '/api/appointments/status', 'appointments:updateStatus', { id, status }, { id, status }),
  rescheduleAppointment: (id, data) => invokeRemoteOrLocal('POST', '/api/appointments/reschedule', 'appointments:reschedule', { id, data }, { id, data }),
  convertAppointmentToServiceOrder: (id) => invokeRemoteOrLocal('POST', '/api/appointments/convert', 'appointments:convertToOrder', { id }, id),
  getCentralServerConfig: () => ipcRenderer.invoke('central:getConfig'),
  configureCentralServer: (baseUrl) => ipcRenderer.invoke('central:configure', baseUrl),
  setCentralWarehouse: (warehouseId) => ipcRenderer.invoke('central:setWarehouse', warehouseId),
  testCentralServerConnection: (baseUrl) => ipcRenderer.invoke('central:testConnection', baseUrl),
  getCentralServerFingerprint: (baseUrl) => ipcRenderer.invoke('central:getServerFingerprint', baseUrl),
  getReviewPromptStatus: (options) => ipcRenderer.invoke('reviews:getPromptStatus', options),
  getMyReview: () => ipcRenderer.invoke('reviews:get'),
  saveMyReview: (review) => ipcRenderer.invoke('reviews:save', review),
  syncReviews: () => ipcRenderer.invoke('reviews:sync'),

  // High-Performance Load Balancer Diagnostics & Multi-Worker Engine
  getLoadBalancerDiagnostics: () => ipcRenderer.invoke('system:getLoadBalancerDiagnostics'),

  // Multi-Terminal LAN Hub & Server Engine
  getLanStatus: () => ipcRenderer.invoke('lan:getStatus'),
  getLanLocalIps: () => ipcRenderer.invoke('lan:getLocalIps'),
  startLanServer: (port) => ipcRenderer.invoke('lan:start', { port }),
  stopLanServer: () => ipcRenderer.invoke('lan:stop'),
  openLanFirewall: (port) => ipcRenderer.invoke('lan:openFirewall', { port }),
  testLanConnection: (targetUrl) => ipcRenderer.invoke('lan:testConnection', targetUrl),

  // Screen Designer & UI Customization Engine
  getUIConfig: (scope, roleOrUserId) => ipcRenderer.invoke('uiConfig:get', { scope, roleOrUserId }),
  saveUIConfig: (scope, config, roleOrUserId) => ipcRenderer.invoke('uiConfig:save', { scope, config, roleOrUserId }),
  resetUIConfig: (scope, roleOrUserId) => ipcRenderer.invoke('uiConfig:reset', { scope, roleOrUserId }),
  exportUIConfig: () => ipcRenderer.invoke('uiConfig:export'),
  importUIConfig: (configData) => ipcRenderer.invoke('uiConfig:import', configData),
  getAvailableWidgets: (scope) => ipcRenderer.invoke('uiConfig:getWidgets', scope),
  reorderUIItems: (scope, itemIds, roleOrUserId) => ipcRenderer.invoke('uiConfig:reorder', { scope, itemIds, roleOrUserId }),

  onRateLimitBlocked: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, notice) => {
      callback({
        retryAfterMs: Math.max(1000, Number(notice?.retryAfterMs) || 40000),
        reason: notice?.reason === 'server_busy' ? 'server_busy' : 'rate_limit',
      });
    };
    ipcRenderer.on('system:rateLimitBlocked', listener);
    return () => ipcRenderer.removeListener('system:rateLimitBlocked', listener);
  },

  // Onboarding Wizard APIs
  getOnboardingState: () => ipcRenderer.invoke('onboarding:getState'),
  getOnboardingPresets: () => ipcRenderer.invoke('onboarding:getPresets'),
  getOnboardingPreset: (sectorKey) => ipcRenderer.invoke('onboarding:getPreset', sectorKey),
  activateOnboardingPreset: (payload) => ipcRenderer.invoke('onboarding:activatePreset', payload),
  updateOnboardingState: (stateData) => ipcRenderer.invoke('onboarding:updateState', stateData),
  previewOnboardingCatalog: (previewData) => ipcRenderer.invoke('onboarding:preview', previewData),
  provisionOnboarding: (payload) => ipcRenderer.invoke('onboarding:provision', payload),
  resetOnboarding: () => ipcRenderer.invoke('onboarding:reset'),
});