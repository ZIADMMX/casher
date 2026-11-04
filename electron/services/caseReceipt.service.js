const casesRepository = require('../repositories/cases.repository');

const TRANSACTION_LABELS = {
  retainer_deposit: 'إيداع أمانة من الموكل',
  court_fee: 'رسوم قضائية ومحكمة',
  expert_fee: 'أمانة خبير قضائي',
  announcement_fee: 'رسوم إعلان محضرين',
  fee_payment: 'سداد أتعاب محاماة',
  other_expense: 'مصروفات قضائية أخرى',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getReceiptHtml(financialId) {
  const receipt = casesRepository.getFinancialReceipt(financialId);
  if (!receipt) throw new Error('الحركة المالية غير موجودة');
  const amount = new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(Number(receipt.amount));
  const type = TRANSACTION_LABELS[receipt.type] || receipt.type;
  const date = new Date(receipt.date).toLocaleString('ar-EG');

  return `<!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>إيصال ${escapeHtml(receipt.receipt_number || receipt.id)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 36px; color: #24231f; font: 16px "Segoe UI", Tahoma, sans-serif; }
          main { max-width: 720px; margin: auto; border: 1px solid #d8d2c4; border-radius: 12px; padding: 30px; }
          header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #b79443; padding-bottom: 18px; }
          h1 { margin: 0 0 6px; font-size: 24px; } p { margin: 5px 0; color: #625e54; }
          .amount { margin: 24px 0; padding: 18px; background: #f5f8f5; border: 1px solid #dce8dd; border-radius: 8px; text-align: center; }
          .amount strong { display: block; margin-top: 6px; font-size: 28px; color: #397354; }
          dl { display: grid; grid-template-columns: 150px 1fr; gap: 12px; }
          dt { color: #625e54; } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
          footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e8e4d9; color: #827d70; font-size: 12px; }
          @media print { body { padding: 0; } main { border: 0; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div><h1>إيصال حركة مالية</h1><p>ملف قضية رقم ${escapeHtml(receipt.case_number)}</p></div>
            <div><strong>رقم الإيصال</strong><p>${escapeHtml(receipt.receipt_number || `TX-${receipt.id}`)}</p></div>
          </header>
          <div class="amount">المبلغ المسجل<strong>${escapeHtml(amount)}</strong></div>
          <dl>
            <dt>نوع الحركة</dt><dd>${escapeHtml(type)}</dd>
            <dt>الموكّل</dt><dd>${escapeHtml(receipt.client_name || 'غير محدد')}</dd>
            <dt>المحكمة</dt><dd>${escapeHtml(receipt.court_name || 'غير محددة')}</dd>
            <dt>تاريخ الحركة</dt><dd>${escapeHtml(date)}</dd>
            <dt>البيان</dt><dd>${escapeHtml(receipt.description || '—')}</dd>
            <dt>تم التسجيل بواسطة</dt><dd>${escapeHtml(receipt.recorded_by_name || 'مسؤول النظام')}</dd>
          </dl>
          <footer>تم إنشاء الإيصال إلكترونيًا من سجل الحركات المالية للقضية.</footer>
        </main>
      </body>
    </html>`;
}

module.exports = { getReceiptHtml };
