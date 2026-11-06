/**
 * foxcloud POS - vendor license tool. Needs the private key from scripts/license-init.js.
 *
 *   node scripts/generate-key.js <HWID> [days]      license key (no days = lifetime)
 *   node scripts/generate-key.js recovery <CHALLENGE>  answer an admin-recovery challenge
 */
const { signLicenseKey, signRecoveryResponse } = require('../electron/security/licenseSigning');
const { readPrivateKey } = require('./lib/license-private-key');

const [first, second] = process.argv.slice(2);

function usage() {
  console.log(`
الاستخدام:
  node scripts/generate-key.js <HWID> [عدد_الأيام]        مفتاح تفعيل (من غير أيام = مدى الحياة)
  node scripts/generate-key.js recovery <رمز_التحدي>       كود استرداد حساب المدير

أمثلة:
  node scripts/generate-key.js 7F89B2AC
  node scripts/generate-key.js 7F89B2AC 365
  node scripts/generate-key.js recovery CHAL-7F89B2AC-20261106-1A2B3C4D
`);
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!first) {
  usage();
  process.exit(0);
}

let privateKey;
try {
  privateKey = readPrivateKey();
} catch (error) {
  fail(error.message);
}

if (first.toLowerCase() === 'recovery') {
  if (!second) fail('اكتب رمز التحدي اللي ظاهر على شاشة العميل');
  console.log(`\nكود الاسترداد (صالح لرمز التحدي ده بس):\n\n${signRecoveryResponse(second, privateKey)}\n`);
  process.exit(0);
}

const daysArg = second || 'lifetime';
let expiryTimestamp;
let durationLabel;
if (daysArg.toLowerCase() === 'lifetime' || daysArg === '0') {
  expiryTimestamp = 9999999999000;
  durationLabel = 'مدى الحياة';
} else {
  const days = Number.parseInt(daysArg, 10);
  if (!Number.isInteger(days) || days <= 0) fail('عدد الأيام لازم يكون رقم صحيح أكبر من صفر');
  expiryTimestamp = Date.now() + days * 24 * 60 * 60 * 1000;
  durationLabel = `${days} يوم (لحد ${new Date(expiryTimestamp).toLocaleDateString('ar-EG')})`;
}

let key;
try {
  key = signLicenseKey({ hwid: first, expiryTimestamp, privateKey });
} catch (error) {
  fail(error.message);
}

console.log(`
======================================================
رمز الجهاز (HWID) : ${first.toUpperCase()}
مدة التفعيل       : ${durationLabel}
مفتاح التفعيل     :

${key}
======================================================
ابعت المفتاح للعميل نسخ ولصق (واتساب أو إيميل).
`);
