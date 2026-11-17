import { useCallback, useEffect, useRef, useState } from 'react';
import * as workshopApi from '../../api/enterprise.js';
import { openWhatsapp } from '../../utils/whatsapp.js';
import LineIcon from '../icons/LineIcons.jsx';
import MacSheet from './MacSheet.jsx';

const MAX_SIDE = 960;

// Shrinks a camera photo to a small JPEG: the customer's phone only needs a preview, and the Worker caps the snapshot size.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.72, 0.6, 0.48, 0.36]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= 200_000) return url;
  }
  throw new Error('الصورة كبيرة جدًا حتى بعد التصغير');
}

export default function CustomerTrackingCard({ order, busy, onChanged, notify }) {
  const [photos, setPhotos] = useState([]);
  const [update, setUpdate] = useState({ title: '', note: '' });
  const [phase, setPhase] = useState('before');
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState(null);
  const file = useRef(null);
  const live = !['delivered', 'cancelled'].includes(order.status);

  const loadPhotos = useCallback(() => workshopApi.getWorkOrderPhotos(order.id).then(setPhotos).catch(() => setPhotos([])), [order.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function run(fn, done) {
    setWorking(true);
    try { await fn(); if (done) notify?.(done); onChanged?.(); } catch (err) { notify?.(err.message || 'تعذر تنفيذ العملية', 'danger'); } finally { setWorking(false); }
  }

  const link = () => workshopApi.createTrackingLink(order.id);
  const copy = () => run(async () => { const { url } = await link(); await navigator.clipboard.writeText(url); }, 'تم نسخ رابط المتابعة');
  const send = () => run(async () => {
    const { url } = await link();
    openWhatsapp(order.customer_phone, `أهلًا ${order.customer_name}، تقدر تتابع حالة سيارتك لحظة بلحظة من هنا: ${url}`);
  });
  const revoke = () => {
    if (window.confirm('إلغاء الرابط الحالي؟ العميل مش هيقدر يفتحه تاني، وأي رابط بعد كده هيكون جديد.')) run(() => workshopApi.revokeTrackingLink(order.id), 'تم إلغاء الرابط');
  };
  const showPreview = () => run(async () => setPreview(await workshopApi.previewTracking(order.id)));

  const post = (e) => {
    e.preventDefault();
    if (!update.title.trim()) return;
    run(async () => { await workshopApi.addWorkOrderUpdate(order.id, update); setUpdate({ title: '', note: '' }); }, 'وصل التحديث للعميل');
  };
  const addPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    run(async () => { await workshopApi.addWorkOrderPhoto(order.id, { phase, data: await shrink(f), caption: '' }); await loadPhotos(); }, 'تمت إضافة الصورة');
  };
  const toggle = (line) => run(async () => workshopApi.setWorkOrderLineDone(line.id, !line.done));

  return (
    <section className="wk-card wtc" aria-label="متابعة العميل">
      <header><h2>متابعة العميل</h2><small>صفحة تفتح من موبايله من غير حساب</small></header>
      <div className="wtc-actions">
        <button type="button" className="wk-btn" disabled={working} onClick={copy}><LineIcon name="file" size={16} /> نسخ الرابط</button>
        {order.customer_phone && <button type="button" className="wk-btn" disabled={working} onClick={send}><LineIcon name="message" size={16} /> إرسال واتساب</button>}
        <button type="button" className="wk-btn" disabled={working} onClick={showPreview}><LineIcon name="eye" size={16} /> معاينة</button>
        {order.tracking_token && <button type="button" className="wk-btn" disabled={working} onClick={revoke}><LineIcon name="x" size={16} /> إلغاء الرابط</button>}
      </div>

      {live && order.status === 'in_progress' && order.lines.length > 0 && (
        <div className="wtc-block">
          <b>علّم البنود المنتهية</b>
          {order.lines.map((l) => (
            <label key={l.id} className="wtc-check"><input type="checkbox" checked={!!l.done} disabled={working || busy} onChange={() => toggle(l)} /><span>{l.description}</span></label>
          ))}
        </div>
      )}

      {live && (
        <form className="wtc-block" onSubmit={post}>
          <b>تحديث للعميل</b>
          <input maxLength={80} placeholder="مثال: تم تغيير تيل الفرامل" aria-label="عنوان التحديث" value={update.title} onChange={(e) => setUpdate({ ...update, title: e.target.value })} />
          <input maxLength={200} placeholder="تفصيلة اختيارية" aria-label="تفاصيل التحديث" value={update.note} onChange={(e) => setUpdate({ ...update, note: e.target.value })} />
          <button type="submit" className="wk-btn is-primary" disabled={working || !update.title.trim()}>نشر التحديث</button>
        </form>
      )}

      <div className="wtc-block">
        <b>صور من الورشة</b>
        <div className="wtc-photos">
          {photos.map((p) => (
            <figure key={p.id}>
              <img src={p.src} alt="" />
              <figcaption className={p.phase === 'after' ? 'is-after' : ''}>{p.phase === 'after' ? 'بعد' : 'قبل'}</figcaption>
              <button type="button" aria-label="حذف الصورة" onClick={() => run(async () => { await workshopApi.removeWorkOrderPhoto(p.id); await loadPhotos(); })}><LineIcon name="x" size={12} strokeWidth={3} /></button>
            </figure>
          ))}
        </div>
        <div className="wtc-actions">
          <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="نوع الصورة"><option value="before">قبل</option><option value="after">بعد</option></select>
          <button type="button" className="wk-btn" disabled={working || photos.length >= 6} onClick={() => file.current?.click()}><LineIcon name="plus" size={16} /> إضافة صورة</button>
          <input ref={file} type="file" accept="image/*" hidden onChange={addPhoto} />
        </div>
      </div>

      {preview && (
        <MacSheet title="معاينة صفحة العميل" subtitle="هكذا ستظهر على موبايله" onClose={() => setPreview(null)}>
          <iframe className="wtc-frame" title="معاينة صفحة العميل" sandbox="allow-scripts" srcDoc={preview} />
        </MacSheet>
      )}
    </section>
  );
}
