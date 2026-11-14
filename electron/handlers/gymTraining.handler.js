const { safeHandle } = require('./safeHandle');
const gym = require('../services/gymTraining.service');
const gate = require('../services/gymGate.service');
const members = require('../services/gymMembers.service');

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
  // "check" and "get" count as reads, so reception staff with only subscriptions.view can run the gate.
  safeHandle('subscriptions:checkGymEntry', (event, payload) => gate.scan({ code: payload?.code, gateName: payload?.gate }));
  safeHandle('subscriptions:getGymGateOverview', () => gate.getOverview());
  safeHandle('subscriptions:registerGymSession', (event, id) => gate.registerSession(id));
  safeHandle('subscriptions:setGymCapacity', (event, value) => gate.setCapacity(value));
  safeHandle('subscriptions:getGymAttendanceReport', (event, filters) => gate.getAttendanceReport(filters || {}));
  safeHandle('subscriptions:getGymMemberProfile', (event, customerId) => members.getMemberProfile(customerId));
  safeHandle('subscriptions:saveGymMemberProfile', (event, payload) => members.saveMemberProfile(payload?.customerId, payload?.data));
  safeHandle('subscriptions:getGymMemberCode', (event, customerId) => members.getMemberCode(customerId));
  safeHandle('subscriptions:getGymVisitSummary', () => gate.getVisitSummary());
  safeHandle('subscriptions:getGymMemberProfiles', () => members.getAllMemberProfiles());
  safeHandle('subscriptions:getGymMemberCheckins', (event, payload) => gate.getMemberCheckins(payload?.customerId, payload?.filters || {}));
}

module.exports = { registerGymTrainingHandlers };
