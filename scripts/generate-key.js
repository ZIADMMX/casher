/* global require, process, console */
/**
 * Kashiear POS - Developer License Key Generator CLI
 * Usage:
 *   node scripts/generate-key.js <HWID> [days]
 * Examples:
 *   node scripts/generate-key.js KASH8888          (Generates Lifetime Key)
 *   node scripts/generate-key.js 7F89B2AC 365      (Generates 1-Year Key)
 *   node scripts/generate-key.js 7F89B2AC 30       (Generates 30-Day Key)
 */

const { generateLicenseKey } = require('../electron/services/license.service');

const args = process.argv.slice(2);
const hwid = args[0];
const daysArg = args[1] || 'lifetime';

if (!hwid) {
  console.log(`
======================================================
🔑 Kashiear POS - Developer License Key Generator
======================================================
الاستخدام:
  node scripts/generate-key.js <HWID> [عدد_الأيام]

أمثلة:
  node scripts/generate-key.js 7F89B2AC            (تفعيل مدى الحياة)
  node scripts/generate-key.js 7F89B2AC 365        (تفعيل لمدة سنة)
  node scripts/generate-key.js 7F89B2AC 30         (تفعيل لمدة 30 يوم)
======================================================
  `);
  process.exit(0);
}

let expiryTimestamp;
let durationLabel;

if (daysArg.toLowerCase() === 'lifetime' || daysArg === '0') {
  expiryTimestamp = 9999999999000; // Far future timestamp for lifetime
  durationLabel = 'مدى الحياة (Lifetime)';
} else {
  const days = parseInt(daysArg, 10);
  if (isNaN(days) || days <= 0) {
    console.error('❌ خطأ: عدد الأيام يجب أن يكون رقماً صحيحاً أكبر من الصفر');
    process.exit(1);
  }
  expiryTimestamp = Date.now() + days * 24 * 60 * 60 * 1000;
  durationLabel = `${days} يوماً (حتى ${new Date(expiryTimestamp).toLocaleDateString('ar-EG')})`;
}

const key = generateLicenseKey({ hwid, expiryTimestamp });

console.log(`
======================================================
🎯 تم توليد مفتاح التفعيل بنجاح!
======================================================
📱 رمز جهاز العميل (HWID) : ${hwid.toUpperCase()}
⏳ مدة التفعيل            : ${durationLabel}
🔑 مفتاح التفعيل (Serial)  : ${key}
======================================================
انسخ السيريال أعلاه وأرسله للعميل لفك قفل البرنامج.
`);
