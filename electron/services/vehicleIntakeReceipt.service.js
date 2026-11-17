/**
 * إيصال استلام مركبة لورشة السيارات: الورقة اللي العميلة بتاخدها وقت ما تسيب عربيتها.
 * فيها المركبة والعدّاد والوقود وشكوى العميلة، حالة الهيكل على رسم السيارة، اللي موجود وغير
 * الموجود جوه العربية، وتوقيع العميلة. الـ HTML بيتبني هنا وبيتطبع بـ print.service.printHtml.
 */
const workshop = require('./autoWorkshop.service');
const vehicleRepo = require('../repositories/autoWorkshop.repository');
const INTAKE = require('../../shared/vehicleIntake.json');

const AR = '٠١٢٣٤٥٦٧٨٩';
const arDigits = (s) => String(s ?? '').replace(/\d/g, (d) => AR[d]);
const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function setting(key, fallback) {
  try {
    const v = require('../repositories/settings.repository').get(key);
    if (v && String(v).trim()) return String(v).trim();
  } catch { /* settings are optional on the paper */ }
  return fallback;
}

function plateHtml(plate, city, kind) {
  const letters = String(plate || '').replace(/[0-9٠-٩\s-]/g, '').split('').join(' ');
  const digits = arDigits((String(plate || '').match(/[0-9]+/g) || []).join(''));
  const color = kind === 'authority' ? '#1B7A45' : kind === 'military' ? '#1C1C1E' : '#1F4E9E';
  return `<div class="plate" style="--pc:${color}"><div class="plate-num"><b>${esc(letters)}</b><i></i><b>${esc(digits)}</b></div><div class="plate-bar">${esc(city || 'مصر')}</div></div>`;
}

function markerHtml(d, i) {
  const x = d.x; const y = d.y; // percent of the diagram box
  const n = i + 1;
  const shape = d.type === 'break' ? 'diamond' : d.type === 'dent' ? 'square' : 'round';
  return `<span class="mk ${shape}" style="left:${x}%;top:${y}%"><b>${n}</b></span>`;
}

// QR for the customer's tracking page, drawn as one SVG path. Empty when the licence server (the page's host) is not configured.
function trackingQrHtml(orderId) {
  try {
    const { url } = require('./tracking.service').getLink(orderId);
    const qr = require('qrcode').create(url, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) path += `M${x} ${y}h1v1h-1z`;
    return `<div class="trk"><svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><path d="${path}"/></svg><div><b>تابع سيارتك من موبايلك</b><p>امسح الرمز لمعرفة حالة السيارة والصور وموعد التسليم لحظة بلحظة، من غير حساب.</p></div></div>`;
  } catch { return ''; } // shortcut: no QR when the link cannot be made; the receipt still prints
}

function getReceiptHtml(orderId) {
  const { order, intake } = workshop.getCheckIn(orderId);
  if (!intake) throw new Error('أمر الشغل ده مفيهوش ورقة استلام');
  const vehicle = vehicleRepo.getVehicle(order.vehicle_id);
  const fuel = INTAKE.fuel.find((f) => f.level === intake.fuel_level) || INTAKE.fuel[0];
  const opened = new Date(`${String(order.opened_at).replace(' ', 'T')}Z`);
  const when = Number.isNaN(opened.getTime()) ? '' : `${opened.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })} · ${opened.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}`;
  const items = Object.values(INTAKE.checklist).flat();
  const present = items.filter((i) => intake.checklist[i.key] === 'present').map((i) => i.label);
  const missing = items.filter((i) => intake.checklist[i.key] === 'missing').map((i) => i.label);
  const car = [vehicle.make, vehicle.model, vehicle.year, vehicle.color].filter(Boolean);
  const carLine = `${car.slice(0, 3).join(' ')}${vehicle.color ? ` · ${vehicle.color}` : ''}`;
  const phones = setting('store_phone', '');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>إيصال استلام مركبة ${esc(order.order_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; color: #2A1D14; background: #fff; font: 15px "Segoe UI", Tahoma, sans-serif; }
  main { max-width: 760px; margin: auto; border: 1px solid #F0E2D3; border-radius: 14px; overflow: hidden; }
  .bar { block-size: 8px; background: linear-gradient(90deg, #F5C86A, #F97316); }
  .pad { padding: 26px 32px 30px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid #F0E2D3; }
  .brand { display: flex; gap: 16px; align-items: center; }
  .tile { display: grid; place-items: center; inline-size: 56px; block-size: 56px; border-radius: 14px; color: #fff; background: linear-gradient(160deg, #FB923C, #EA580C); font-size: 28px; }
  h1 { margin: 0 0 4px; font-size: 21px; } h2 { margin: 0 0 10px; font-size: 15px; color: #9A3A0B; }
  p { margin: 3px 0; color: #7A5A43; font-size: 13px; }
  .no { text-align: start; } .no b { font-size: 17px; }
  .grid { display: grid; grid-template-columns: auto 1fr 1fr; gap: 14px 28px; margin: 20px 0; align-items: start; } .col { display: grid; gap: 14px; }
  .cell small { display: block; color: #8A6A52; font-size: 12px; } .cell b { font-size: 16px; }
  .plate { display: inline-grid; inline-size: 190px; border: 2px solid var(--pc); border-radius: 9px; overflow: hidden; }
  .plate-num { display: flex; justify-content: center; align-items: center; gap: 12px; padding: 4px 8px; font-size: 24px; font-weight: 800; }
  .plate-num i { inline-size: 1.5px; align-self: stretch; margin-block: 4px; background: var(--pc); opacity: .5; }
  .plate-bar { background: var(--pc); color: #fff; font-size: 12px; font-weight: 700; text-align: center; padding: 1px 6px 2px; }
  .complaint { padding: 14px 16px; border: 1px solid #F3DCC6; border-radius: 12px; background: #FFF3E8; line-height: 1.9; }
  .cond { display: grid; grid-template-columns: 1fr 210px; gap: 22px; margin-top: 22px; align-items: start; }
  .cond ol { margin: 0; padding: 0; list-style: none; }
  .cond li { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F6EBDF; font-size: 14px; }
  .cond li em { inline-size: 18px; color: #9A3A0B; font-style: normal; font-weight: 800; }
  .cond .none { color: #8A6A52; }
  .car { position: relative; border: 1px solid #F0E2D3; border-radius: 14px; background: #FFFAF5; padding: 8px 24px; }
  .cv { position: relative; } .car svg { display: block; inline-size: 100%; height: auto; }
  .cd-body { fill: #FCE9D8; stroke: #8A6A52; stroke-width: 1.6; } .cd-glass { fill: #D9D2CB; stroke: #8A6A52; stroke-width: 1; }
  .cd-roof { fill: #F8DDC4; stroke: #8A6A52; stroke-width: 1; } .cd-wheel { fill: #B8A99C; } .cd-light { fill: #F3D9BE; stroke: #8A6A52; stroke-width: .6; } .cd-line { fill: none; stroke: #C9B29C; stroke-width: 1; }
  .mk { position: absolute; display: grid; place-items: center; inline-size: 20px; block-size: 20px; margin: -10px 0 0 -10px; color: #fff; background: #EA580C; font-size: 11px; }
  .mk b { font-weight: 800; } .mk.round { border-radius: 50%; } .mk.square { border-radius: 4px; background: #F5C86A; color: #5A3A00; }
  .mk.diamond { background: #C0392B; transform: rotate(45deg); } .mk.diamond b { transform: rotate(-45deg); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 26px; }
  .two p { color: #2A1D14; line-height: 1.9; font-size: 14px; } .miss { color: #B3261E !important; font-weight: 700; }
  .terms { margin-top: 28px; color: #5A4636; font-size: 13px; line-height: 1.9; }
  .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 26px; }
  .sig > div { min-block-size: 96px; border-bottom: 1px solid #9A8B7E; display: grid; align-items: end; justify-items: center; }
  .sig img { max-block-size: 80px; max-inline-size: 100%; } .sig b { font-size: 16px; padding-bottom: 6px; }
  .trk { display: flex; align-items: center; gap: 16px; margin-top: 22px; padding: 12px 16px; border: 1px dashed #E8C9A6; border-radius: 12px; background: #FFF9F2; }
  .trk svg { flex: none; inline-size: 92px; block-size: 92px; background: #fff; border-radius: 6px; } .trk path { fill: #2A1D14; } .trk b { font-size: 14px; }
  .cap { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 8px; color: #7A5A43; font-size: 13px; }
  @media print { body { padding: 0; } main { border: 0; border-radius: 0; } }
</style>
</head>
<body>
<main>
  <div class="bar"></div>
  <div class="pad">
    <header>
      <div class="brand"><span class="tile">&#128295;</span><div><h1>${esc(setting('store_name', 'ورشة صيانة السيارات'))}</h1><p>${esc(setting('store_address', ''))}</p><p>${esc(phones)}</p></div></div>
      <div class="no"><h1>إيصال استلام مركبة</h1><p>رقم <b>#${esc(order.order_number)}</b></p><p>${esc(when)}</p></div>
    </header>

    <section class="grid">
      ${plateHtml(vehicle.plate, vehicle.plate_city, vehicle.plate_kind)}
      <div class="col"><div class="cell"><small>السيارة</small><b>${esc(carLine)}</b></div><div class="cell"><small>العدّاد</small><b>${esc(Number(order.odometer_in).toLocaleString('en-US'))} كم</b></div></div>
      <div class="col"><div class="cell"><small>العميلة / العميل</small><b>${esc(vehicle.customer_name)}</b></div><div class="cell"><small>الوقود</small><b>${esc(fuel.label)}</b></div></div>
    </section>

    <h2>شكوى العميلة</h2>
    <div class="complaint">${esc(order.complaint)}</div>

    <section class="cond">
      <div>
        <h2>حالة الهيكل عند الاستلام</h2>
        ${intake.damages.length ? `<ol>${intake.damages.map((d, i) => `<li><em>${i + 1}</em><span><b>${esc(INTAKE.damageTypes[d.type])}</b> · ${esc(d.zone)}${d.note ? `. ${esc(d.note)}` : ''}</span></li>`).join('')}</ol>` : '<p class="none">لا توجد ملاحظات على الهيكل.</p>'}
      </div>
      <div class="car"><div class="cv"><svg viewBox="${INTAKE.diagram.viewBox}" aria-hidden="true">${INTAKE.diagram.shapes}</svg>${intake.damages.map(markerHtml).join('')}</div></div>
    </section>

    <section class="two">
      <div><h2>الموجود في السيارة</h2><p>${esc(present.join('، ') || '—')}</p></div>
      <div><h2>غير موجود</h2><p class="miss">${esc(missing.join('، ') || 'لا يوجد')}</p></div>
    </section>

    ${trackingQrHtml(order.id)}

    <p class="terms">تُسلَّم السيارة بحالتها الموضّحة أعلاه. لا تتحمل الورشة مسؤولية الأغراض الشخصية داخل السيارة. يُرجى إبراز هذا الإيصال عند الاستلام.</p>

    <div class="sig">
      <div><img alt="توقيع العميلة" src="${esc(intake.signature)}"></div>
      <div><b>${esc(intake.received_by || '')}</b></div>
    </div>
    <div class="cap"><span>توقيع العميلة</span><span>مستلم المركبة</span></div>
  </div>
</main>
</body>
</html>`;
}

module.exports = { getReceiptHtml };
