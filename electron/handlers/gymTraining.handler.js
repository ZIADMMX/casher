const { safeHandle } = require('./safeHandle');
const gym = require('../services/gymTraining.service');

// "subscriptions:" prefix: gym training reuses the subscriptions view/manage permissions.
function registerGymTrainingHandlers() {
  safeHandle('subscriptions:getGymTrainers', (event, filters) => gym.getTrainersOverview(filters || {}));
  safeHandle('subscriptions:createGymTrainer', (event, data) => gym.createTrainer(data));
  safeHandle('subscriptions:updateGymTrainer', (event, payload) => gym.updateTrainer(payload?.id, payload?.data));
  safeHandle('subscriptions:getGymWeek', (event, filters) => gym.getWeekSchedule(filters || {}));
  safeHandle('subscriptions:createGymClass', (event, data) => gym.createClass(data));
  safeHandle('subscriptions:deactivateGymClass', (event, id) => gym.deactivateClass(id));
  safeHandle('subscriptions:getGymClassRoster', (event, filters) => gym.getClassRoster(filters || {}));
  safeHandle('subscriptions:bookGymClass', (event, data) => gym.bookClass(data));
  safeHandle('subscriptions:setGymAttendance', (event, data) => gym.setAttendance(data));
  safeHandle('subscriptions:cancelGymBooking', (event, id) => gym.cancelBooking(id));
  safeHandle('subscriptions:getGymPtPackages', () => gym.getPackages());
  safeHandle('subscriptions:createGymPtPackage', (event, data) => gym.createPackage(data));
  safeHandle('subscriptions:logGymPtSession', (event, id) => gym.logPtSession(id));
  safeHandle('subscriptions:changeGymPtTrainer', (event, data) => gym.changePackageTrainer(data));
}

module.exports = { registerGymTrainingHandlers };
