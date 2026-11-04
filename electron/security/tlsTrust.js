const tls = require('node:tls');

let configured = false;

function configureSystemCertificateTrust() {
  if (configured) return;
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') {
    throw new Error('إصدار Node.js الحالي لا يدعم التحقق من شهادات مخزن النظام');
  }

  const certificates = new Set([
    ...tls.getCACertificates('bundled'),
    ...tls.getCACertificates('system'),
  ]);
  tls.setDefaultCACertificates([...certificates]);
  configured = true;
}

module.exports = { configureSystemCertificateTrust };
