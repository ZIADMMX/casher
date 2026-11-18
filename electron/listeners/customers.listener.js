const eventBus = require('../services/eventBus.service');
const cloudCustomerSync = require('../services/cloudCustomerSync.service');

// مزامنة العميل تلقائياً مع السحابة عند إضافته أو تعديله
eventBus.on('customer:saved', ({ id }) => {
  if (id) {
    cloudCustomerSync.syncSingleCustomer(id).catch(() => {});
  }
});

