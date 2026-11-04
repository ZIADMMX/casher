const { safeHandle } = require('./safeHandle');
const courtsService = require('../services/courts.service');

function registerCourtsHandlers() {
  safeHandle('courts:getAll', (event, filters) => courtsService.getCourts(filters || {}));
  safeHandle('courts:getById', (event, id) => courtsService.getCourtById(id));
  safeHandle('courts:create', (event, data) => courtsService.createCourt(data || {}));
  safeHandle('courts:update', (event, payload) => {
    const { id, data } = payload || {};
    return courtsService.updateCourt(id, data || {});
  });
  safeHandle('courts:deactivate', (event, id) => courtsService.deactivateCourt(id));
}

module.exports = { registerCourtsHandlers };
