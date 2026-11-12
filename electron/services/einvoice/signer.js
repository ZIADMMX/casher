// توقيع المستند (CAdES-BES) على شهادة التوقيع الإلكتروني الموجودة على التوكن.
// التوقيع نفسه بيحصل جوه أداة خارجية على جهاز العميل (التوكن مالوش واجهة من
// Node)، فالملف ده مجرد حدّ فاصل: بياخد النص المسلسل ويرجّع التوقيع base64.
//
// shortcut: التوقيع متروك لأداة خارجية يحددها العميل في الإعدادات (eta_signer_path).
// لما تتعمل أداة توقيع مدمجة مع المشروع، استبدل استدعاء execFile بيها هنا فقط.
const { execFile } = require('node:child_process');

const SIGN_TIMEOUT_MS = 30_000;

class SignerNotConfiguredError extends Error {
  constructor() {
    super('شهادة التوقيع الإلكتروني (التوكن) غير مُعدّة. حدد أداة التوقيع في إعدادات الفاتورة الإلكترونية.');
    this.code = 'ETA_SIGNER_NOT_CONFIGURED';
  }
}

function isSignerConfigured(config) {
  return Boolean(config?.signerPath);
}

/**
 * @param {string} canonicalString ناتج serialize() للمستند
 * @returns {Promise<string>} قيمة التوقيع base64
 */
function signDocument(canonicalString, config) {
  if (!isSignerConfigured(config)) throw new SignerNotConfiguredError();
  if (!canonicalString) throw new Error('لا يوجد مستند لتوقيعه');

  return new Promise((resolve, reject) => {
    const child = execFile(
      config.signerPath,
      [],
      { timeout: SIGN_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`فشل توقيع الفاتورة: ${String(stderr || error.message).trim().slice(0, 300)}`));
          return;
        }
        const value = String(stdout || '').trim();
        if (!value) {
          reject(new Error('أداة التوقيع لم ترجع توقيعًا. تأكد من توصيل التوكن وإدخال رمز PIN.'));
          return;
        }
        resolve(value);
      }
    );
    child.stdin.end(canonicalString, 'utf8');
  });
}

function attachSignature(document, signatureValue) {
  return { ...document, signatures: [{ signatureType: 'I', value: signatureValue }] };
}

module.exports = { signDocument, attachSignature, isSignerConfigured, SignerNotConfiguredError };
