const leavesService = require('../services/leaves.service');
const { safeHandle } = require('./safeHandle');
const {
  createLeaveRequestSchema,
  leaveRequestDecisionSchema,
} = require('../validators/schema');

function registerLeavesHandlers() {
  safeHandle('leaves:getAll', () => leavesService.getLeaveRequests());

  safeHandle('leaves:create', createLeaveRequestSchema, (event, data) => (
    leavesService.createLeaveRequest(data)
  ));

  safeHandle('leaves:decide', leaveRequestDecisionSchema, (event, data) => (
    leavesService.decideLeaveRequest(data)
  ));
}

module.exports = { registerLeavesHandlers };
