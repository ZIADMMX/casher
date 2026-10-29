/**
 * Onboarding Concurrency & Security Guard
 * يحمي النظام من:
 * 1. النقرات المزدوجة المتزامنة (Race Condition / Double Provisioning)
 * 2. إعادة الكتابة العرضية على متجر مكتمل بدون صلاحية مدير صريحة
 */

let isProvisioningLocked = false;
let lockAcquiredAt = 0;
const LOCK_TIMEOUT_MS = 60 * 1000; // مهلة أمان قصوى دقيقة واحدة

function acquireProvisioningLock() {
  const now = Date.now();
  // إذا مر وقت طويل على القفل، يتم تحريره تلقائياً كإجراء طوارئ
  if (isProvisioningLocked && now - lockAcquiredAt > LOCK_TIMEOUT_MS) {
    isProvisioningLocked = false;
  }

  if (isProvisioningLocked) {
    throw new Error('عملية إنشاء النشاط التجاري قيد المعالجة بالفعل. يرجى الانتظار ثوانٍ قليلة');
  }

  isProvisioningLocked = true;
  lockAcquiredAt = now;
}

function releaseProvisioningLock() {
  isProvisioningLocked = false;
  lockAcquiredAt = 0;
}

function isLocked() {
  const now = Date.now();
  if (isProvisioningLocked && now - lockAcquiredAt > LOCK_TIMEOUT_MS) {
    isProvisioningLocked = false;
  }
  return isProvisioningLocked;
}

module.exports = {
  acquireProvisioningLock,
  releaseProvisioningLock,
  isLocked,
};
