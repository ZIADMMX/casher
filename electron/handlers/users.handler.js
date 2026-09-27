const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const { addUserSchema } = require('../validators/schema');

function registerUsersHandlers() {
  safeHandle('users:add', addUserSchema, (event, data) => {
    return authService.addCashier(data);
  });

  safeHandle('users:getAll', () => {
    return authService.getAllUsers();
  });

  safeHandle('users:toggleActive', (event, userId) => {
    return authService.toggleUserActive(userId);
  });

  safeHandle('users:remove', (event, userId) => {
    return authService.removeUser(userId);
  });
}

module.exports = { registerUsersHandlers };