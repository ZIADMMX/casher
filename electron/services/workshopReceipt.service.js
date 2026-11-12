/**
 * إيصال استلام جهاز لورشة الصيانة.
 *
 * العميل بيسيب جهازه في الورشة ومش بياخد ورقة تثبت كده. الإيصال ده هو
 * الورقة: رقم التذكرة، الجهاز وسيريـاله، العطل، التكلفة المتوقعة ومدة الضمان،
 * وتوقيع الطرفين. بيتطبع من شاشة سير العمل وقت فتح التذكرة.
 *
 * الـ HTML بيتبني هنا وبيتطبع بـ print.service.printHtml زي إيصال القضية.
 */

const enterpriseRepo = require('../repositories/enterprise.repository');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function storeName() {
  try {
    const configured = require('../repositories/settings.repository').get('store_name');
    if (configured && String(configured).trim()) return String(configured).trim();
  } catch {}
  return 'مركز الصيانة';
}

function money(amount) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 })
    .format(Number(amount) || 0);
}

function getReceiptHtml(ticketId) {
  const ticket = enterpriseRepo.getTicketById(ticketId);
  if (!ticket) throw new Error('التذكرة غير موجودة');

  // created_at جاي من SQLite بصيغة 'YYYY-MM-DD HH:MM:SS' بتوقيت UTC.
  const receivedAt = ticket.created_at
    ? new Date(`${String(ticket.created_at).replace(' ', 'T')}Z`)
    : new Date();
  const received = Number.isNaN(receivedAt.getTime()) ? String(ticket.created_at) : receivedAt.toLocaleString('ar-EG');
  const warranty = Number(ticket.warranty_days) > 0
    ? `${Math.trunc(Number(ticket.warranty_days))} يوم من تاريخ الاستلام النهائي`
    : 'بدون ضمان';
  const cost = Number(ticket.estimated_cost) > 0 ? money(ticket.estimated_cost) : 'يُحدد بعد الفحص';

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>إيصال استلام جهاز ${escapeHtml(ticket.ticket_number)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px; color: #24231f; font: 15px "Segoe UI", Tahoma, sans-serif; }
      main { max-width: 720px; margin: auto; border: 1px solid #d8d2c4; border-radius: 12px; padding: 28px; }
      header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 16px; }
      h1 { margin: 0 0 6px; font-size: 22px; } p { margin: 4px 0; color: #625e54; }
      dl { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 22px 0; }
      dt { color: #625e54; } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
      .terms { margin-top: 18px; padding: 14px; background: #f7f7f5; border: 1px solid #e8e4d9; border-radius: 8px; font-size: 13px; color: #4b5563; }
      .terms li { margin: 4px 0; }
      .signatures { display: flex; gap: 40px; margin-top: 36px; }
      .signatures div { flex: 1; border-top: 1px solid #9ca3af; padding-top: 8px; text-align: center; font-size: 13px; color: #625e54; }
      footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e8e4d9; color: #827d70; font-size: 12px; }
      @media print { body { padding: 0; } main { border: 0; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div><h1>إيصال استلام جهاز</h1><p>${escapeHtml(storeName())}</p></div>
        <div><strong>رقم التذكرة</strong><p>${escapeHtml(ticket.ticket_number)}</p></div>
      </header>
      <dl>
        <dt>العميل</dt><dd>${escapeHtml(ticket.customer_name || 'غير محدد')}</dd>
        <dt>رقم الموبايل</dt><dd>${escapeHtml(ticket.customer_phone || '—')}</dd>
        <dt>الجهاز</dt><dd>${escapeHtml(ticket.title)}</dd>
        <dt>السيريال</dt><dd>${escapeHtml(ticket.device_serial || '—')}</dd>
        <dt>العطل المبدئي</dt><dd>${escapeHtml(ticket.notes || '—')}</dd>
        <dt>تاريخ الاستلام</dt><dd>${escapeHtml(received)}</dd>
        <dt>التكلفة المتوقعة</dt><dd>${escapeHtml(cost)}</dd>
        <dt>الضمان على الإصلاح</dt><dd>${escapeHtml(warranty)}</dd>
      </dl>
      <div class="terms">
        <ul>
          <li>التكلفة المتوقعة تقديرية، وأي زيادة بتتبلغ للعميل قبل تنفيذها.</li>
          <li>الضمان على الإصلاح والقطعة المستبدلة فقط، ولا يشمل سوء الاستخدام أو الكسر أو السوائل.</li>
          <li>الورشة غير مسؤولة عن البيانات المخزنة على الجهاز، وعلى العميل أخذ نسخة احتياطية قبل التسليم.</li>
          <li>استلام الجهاز لا يتم إلا بهذا الإيصال وبعد سداد قيمة الإصلاح.</li>
        </ul>
      </div>
      <div class="signatures">
        <div>توقيع موظف الاستلام</div>
        <div>توقيع العميل</div>
      </div>
      <footer>الإيصال ده مطبوع إلكترونيًا من نظام تذاكر الصيانة — ${escapeHtml(ticket.ticket_number)}</footer>
    </main>
  </body>
</html>`;
}

module.exports = { getReceiptHtml };
