const licenseClock = require('./licenseClock.service');
const licenseService = require('./license.service');
const { clearExpiredTrialData } = require('../database/db');

async function requireActiveLicense(event) {
  const now = await licenseClock.getTrustedNow();
  const status = licenseService.getLicenseStatus(now, { updateClock: false });

  if (status.isExpired && !status.isActivated) {
    if (status.trialDeadlineReached) {
      try {
        clearExpiredTrialData();
      } catch (error) {
        error.message = `انتهت الفترة التجريبية، وتعذر تصفير بيانات المتجر: ${error.message}`;
        throw error;
      }
    }

    const sender = event?.sender;
    if (sender && !sender.isDestroyed?.()) {
      sender.send('license:statusChanged', status);
    }
    const message = status.trialDeadlineReached
      ? 'انتهت الفترة التجريبية. تم تصفير بيانات المتجر مع الإبقاء على قاعدة البيانات والترخيص.'
      : 'تعذر التحقق من صلاحية الوقت. تم إيقاف العمليات دون تصفير بيانات المتجر.';
    const error = new Error(message);
    error.code = 'LICENSE_EXPIRED';
    throw error;
  }

  return status;
}

module.exports = { requireActiveLicense };
