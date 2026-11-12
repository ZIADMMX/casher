const { addColumnIfMissing } = require('./helpers');

// موافقة العميل على التواصل (قانون حماية البيانات الشخصية 151/2020).
// الموافقة على البريد والرسائل موجودة من ترحيل الـ CRM، وده بيضيف القناة اللي
// التطبيق بيستخدمها فعلاً (واتساب)، ونسخة السياسة اللي العميل وافق عليها —
// من غير النسخة الموافقة ما بتنفعش كإثبات.
function ensurePrivacyConsent(dbInstance) {
  addColumnIfMissing('customers', 'whatsapp_consent', 'INTEGER NOT NULL DEFAULT 0', dbInstance);
  addColumnIfMissing('customers', 'consent_policy_version', 'TEXT', dbInstance);
}

module.exports = { ensurePrivacyConsent };
