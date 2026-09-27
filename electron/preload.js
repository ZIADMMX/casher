const { contextBridge, ipcRenderer } = require('electron');

// Keep this object as the single, documented renderer-to-main API.
contextBridge.exposeInMainWorld('electronAPI', {
  // Products and variants
  addProductWithVariant: (data) =>
    ipcRenderer.invoke('products:addWithVariant', data),
  addVariantToProduct: (productId, variant) =>
    ipcRenderer.invoke('products:addVariant', { productId, variant }),
  getAllProductsWithVariants: () =>
    ipcRenderer.invoke('products:getAllWithVariants'),
  getByBarcode: (barcode) =>
    ipcRenderer.invoke('products:getByBarcode', barcode),
  getProductByBarcode: (barcode) =>
    ipcRenderer.invoke('products:getByBarcode', barcode),
  updateProduct: (productId, data) =>
    ipcRenderer.invoke('products:update', { productId, data }),
  deleteProduct: (productId) =>
    ipcRenderer.invoke('products:delete', productId),
  updateVariant: (variantId, data) =>
    ipcRenderer.invoke('variants:update', { variantId, data }),
  deleteVariant: (variantId) =>
    ipcRenderer.invoke('variants:delete', variantId),
  selectProductImage: () => ipcRenderer.invoke('products:selectImage'),

  findSaleForReturn: (saleId) => ipcRenderer.invoke('returns:findSale', saleId),
  processReturn: (data) => ipcRenderer.invoke('returns:process', data),
  getRecentReturns: () => ipcRenderer.invoke('returns:getRecent'),

  backupNow: () => ipcRenderer.invoke('backup:now'),
restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  getAllCategories: () => ipcRenderer.invoke('categories:getAll'),
  
  getReports: (period) => ipcRenderer.invoke('reports:get', period),
  printReceipt: (sale) => ipcRenderer.invoke('print:receipt', sale),
  printBarcodeLabel: (labelData) => ipcRenderer.invoke('print:barcodeLabel', labelData),
  getAllCustomersWithStats: () => ipcRenderer.invoke('customers:getAllWithStats'),
  addCustomer: (data) => ipcRenderer.invoke('customers:add', data),
  addManualDebt: (data) => ipcRenderer.invoke('customers:addManualDebt', data),
  recordCustomerPayment: (data) => ipcRenderer.invoke('customers:recordPayment', data),
  getCustomerLedger: (customerId) => ipcRenderer.invoke('customers:getLedger', customerId),

  // Sales

  exportCustomers: () => ipcRenderer.invoke('export:customers'),
exportInvoices: (period) => ipcRenderer.invoke('export:invoices', period),

  createSale: (saleData) => ipcRenderer.invoke('sales:create', saleData),
  getSaleById: (saleId) => ipcRenderer.invoke('sales:getById', saleId),

  // Suppliers & Purchases (الموردين وفواتير الشراء والآجل)
  addSupplier: (data) => ipcRenderer.invoke('suppliers:add', data),
  updateSupplier: (id, data) => ipcRenderer.invoke('suppliers:update', { id, data }),
  deleteSupplier: (id) => ipcRenderer.invoke('suppliers:delete', id),
  getAllSuppliersWithStats: () => ipcRenderer.invoke('suppliers:getAllWithStats'),
  getSupplierLedger: (supplierId) => ipcRenderer.invoke('suppliers:getLedger', supplierId),
  createPurchase: (data) => ipcRenderer.invoke('purchases:create', data),
  getAllPurchases: (filters) => ipcRenderer.invoke('purchases:getAll', filters),
  getPurchaseById: (id) => ipcRenderer.invoke('purchases:getById', id),
  recordSupplierPayment: (data) => ipcRenderer.invoke('purchases:recordPayment', data),
  getAllSupplierPayments: (limit) => ipcRenderer.invoke('purchases:getAllPayments', limit),
  getPurchasesSummaryKPIs: () => ipcRenderer.invoke('purchases:getSummaryKPIs'),

  // Shifts & Z-Report (إدارة الورديات وتقفيل الدرج)
  getCurrentShift: () => ipcRenderer.invoke('shifts:getCurrent'),
  getLastClosedShift: () => ipcRenderer.invoke('shifts:getLastClosed'),
  openShift: (data) => ipcRenderer.invoke('shifts:open', data),
  closeShift: (data) => ipcRenderer.invoke('shifts:close', data),
  getShiftXReport: (shiftId) => ipcRenderer.invoke('shifts:getXReport', shiftId),
  addShiftExpense: (data) => ipcRenderer.invoke('shifts:addExpense', data),
  getShiftExpenses: (shiftId) => ipcRenderer.invoke('shifts:getExpenses', shiftId),
  getAllShifts: (filters) => ipcRenderer.invoke('shifts:getAll', filters),
  getShiftById: (shiftId) => ipcRenderer.invoke('shifts:getById', shiftId),
  getShiftsKPIs: () => ipcRenderer.invoke('shifts:getKPIs'),

  // Authentication & Recovery
  isSetupRequired: () => ipcRenderer.invoke('auth:isSetupRequired'),
  createInitialAdmin: (credentials) => ipcRenderer.invoke('auth:createInitialAdmin', credentials),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  refreshSession: () => ipcRenderer.invoke('auth:refreshSession'),
  updateProfile: (data) => ipcRenderer.invoke('auth:updateProfile', data),
  changePassword: (newPassword) => ipcRenderer.invoke('auth:changePassword', newPassword),
  getRecoveryChallenge: () => ipcRenderer.invoke('auth:getRecoveryChallenge'),
  resetAdminPasswordWithRecoveryKey: (data) => ipcRenderer.invoke('auth:resetWithRecoveryKey', data),
  resetAdminPasswordWithChallenge: (data) => ipcRenderer.invoke('auth:resetWithChallenge', data),
  addCashier: (data) => ipcRenderer.invoke('users:add', data),
  getAllUsers: () => ipcRenderer.invoke('users:getAll'),
  toggleUserActive: (userId) => ipcRenderer.invoke('users:toggleActive', userId),
  removeUser: (userId) => ipcRenderer.invoke('users:remove', userId),

  // Store Settings & System Customization & Backup
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  backupDatabase: () => ipcRenderer.invoke('settings:backup'),
  restoreDatabase: () => ipcRenderer.invoke('settings:restore'),
  uploadStoreLogo: () => ipcRenderer.invoke('settings:uploadLogo'),

  // License & Software Activation
  getLicenseStatus: () => ipcRenderer.invoke('license:getStatus'),
  activateSoftware: (key) => ipcRenderer.invoke('license:activate', key),

  // Excel Import
  selectImportFile: () => ipcRenderer.invoke('import:selectFile'),
  importExcel: (data) => ipcRenderer.invoke('import:excel', data),
  downloadImportTemplate: (type) => ipcRenderer.invoke('import:downloadTemplate', type),

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

  // CRM & Customer Communications Center
  getUnifiedTimeline: (customerId) => ipcRenderer.invoke('crm:getUnifiedTimeline', customerId),
  addCRMInteraction: (data) => ipcRenderer.invoke('crm:addInteraction', data),
  createCRMOpportunity: (data) => ipcRenderer.invoke('crm:createOpportunity', data),
  getAllCRMOpportunities: (filters) => ipcRenderer.invoke('crm:getAllOpportunities', filters),
  updateCRMOpportunityStage: (id, stage) => ipcRenderer.invoke('crm:updateOpportunityStage', { id, stage }),
  updateCustomerRatingAndTier: (customerId, rating, tier) => ipcRenderer.invoke('crm:updateRatingAndTier', { customerId, rating, tier }),
  checkCRMDueReminders: () => ipcRenderer.invoke('crm:checkDueReminders'),

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
  addWorkflowStatus: (workflowId, statusData) => ipcRenderer.invoke('enterprise:addWorkflowStatus', { workflowId, statusData }),
  getAutomationRules: () => ipcRenderer.invoke('enterprise:getAutomations'),
  createAutomationRule: (data) => ipcRenderer.invoke('enterprise:createAutomation', data),
  setAutomationRuleEnabled: (id, isEnabled) => ipcRenderer.invoke('enterprise:setAutomationEnabled', { id, isEnabled }),
  getSystemRoles: () => ipcRenderer.invoke('enterprise:getRoles'),
  createSystemRole: (roleKey, roleName, description) => ipcRenderer.invoke('enterprise:createRole', { roleKey, roleName, description }),
  setRolePermissions: (roleKey, permissions) => ipcRenderer.invoke('enterprise:setRolePermissions', { roleKey, permissions }),

});