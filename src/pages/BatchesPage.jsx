import { useCallback, useEffect, useState } from 'react';
import * as groceryApi from '../api/grocery.js';
import { getAllProductsWithVariants } from '../api/products.js';
import MacSheet from '../components/workshop/MacSheet.jsx';
import '../styles/reservations.css';

const FILTERS = [['all', 'الكل'], ['expired', 'منتهية'], ['soon', 'قربت تنتهي'], ['ok', 'سليمة']];
const STATUS = { expired: ['منتهية', 'is-off'], soon: ['قربت تنتهي', ''], ok: ['سليمة', 'is-seated'] };
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const EMPTY = { variant_id: '', batch_number: '', expiry_date: '', quantity: '', purchase_price: '' };

export default function BatchesPage() {
  const [filter, setFilter] = useState('all');
  const [board, setBoard] = useState({ summary: { total: 0, expired: 0, soon: 0, expired_value: 0, soon_value: 0 }, batches: [] });
  const [menu, setMenu] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setBoard(await groceryApi.getGroceryBatchBoard(filter)); setError(''); } catch (err) { setError(err.message || 'تعذر تحميل التشغيلات'); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getAllProductsWithVariants().then((list) => setMenu((Array.isArray(list) ? list : []).flatMap((p) => (p.variants || []).map((v) => ({ id: v.id, label: `${p.name}${v.size ? ` - ${v.size}` : ''}` }))))).catch(() => setMenu([]));
  }, []);

  async function run(fn) {
    if (busy) return null;
    setBusy(true);
    try { const out = await fn(); setError(''); await load(); return out ?? true; } catch (err) { setError(err.message || 'تعذر تنفيذ العملية'); return null; } finally { setBusy(false); }
  }

  const writeOff = (b) => {
    const qty = window.prompt(`كمية الإتلاف من ${b.product_name} (المتبقي ${b.quantity})`, String(b.quantity));
    if (qty === null) return;
    const reason = window.prompt('سبب الإتلاف', b.status === 'expired' ? 'منتهي الصلاحية' : '');
    if (reason === null) return;
    run(() => groceryApi.writeOffGroceryBatch({ batchId: b.id, quantity: Number(qty), reason }));
  };
  async function save(e) {
    e.preventDefault();
    const ok = await run(() => groceryApi.createGroceryBatch({
      variant_id: Number(form.variant_id), batch_number: form.batch_number, expiry_date: form.expiry_date,
      quantity: Number(form.quantity), purchase_price: Number(form.purchase_price) || 0,
    }));
    if (ok) setForm(null);
  }
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });
  const { summary } = board;

  return (
    <div className="resv" dir="rtl">
      <header className="resv-head">
        <div>
          <h1>التشغيلات والصلاحية</h1>
          <p>{summary.expired} منتهية ({money(summary.expired_value)} ج.م) · {summary.soon} قربت تنتهي ({money(summary.soon_value)} ج.م)</p>
        </div>
        <button type="button" className="resv-btn is-primary" onClick={() => setForm({ ...EMPTY })}>+ تشغيلة جديدة</button>
      </header>

      <div className="resv-nav" role="group" aria-label="تصفية التشغيلات">
        {FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={`resv-btn${filter === key ? ' is-primary' : ''}`} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <p className="mut" style={{ margin: 0, color: '#8C7A69', fontSize: 13 }}>الصرف بنظام FIFO: الكاشير بيبيع من التشغيلة الأقرب انتهاءً الأول (المعلّمة «تُباع أولًا»).</p>

      {error && <p className="resv-error" role="alert">{error}</p>}
      {board.batches.length === 0 ? <p className="resv-empty">مفيش تشغيلات هنا.</p> : (
        <ul className="resv-list">
          {board.batches.map((b) => {
            const [label, tone] = STATUS[b.status];
            return (
              <li key={b.id} className={`resv-card ${tone}`} style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="resv-body">
                  <b>{b.product_name}{b.sells_first ? ' · تُباع أولًا' : ''}</b>
                  <span>تشغيلة {b.batch_number || `#${b.id}`} · {b.quantity} وحدة · قيمتها {money(b.value)} ج.م</span>
                  <small>
                    تنتهي {b.expiry_date} {b.days_remaining < 0 ? `(من ${-b.days_remaining} يوم)` : `(بعد ${b.days_remaining} يوم)`}
                  </small>
                </div>
                <div className="resv-actions" style={{ gridColumn: 'auto' }}>
                  <span className="resv-pill">{label}</span>
                  <button type="button" className="resv-btn is-danger" disabled={busy} onClick={() => writeOff(b)}>إتلاف</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <MacSheet title="تشغيلة جديدة" subtitle="تدخل المخزن بتاريخ صلاحية" onClose={() => setForm(null)}>
          <form className="wk-form" onSubmit={save}>
            <label className="wk-field"><span>الصنف</span>
              <select required {...field('variant_id')}><option value="">اختار الصنف</option>{menu.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            </label>
            <div className="resv-row">
              <label className="wk-field"><span>رقم التشغيلة</span><input maxLength={40} {...field('batch_number')} /></label>
              <label className="wk-field"><span>تاريخ الانتهاء</span><input type="date" required {...field('expiry_date')} /></label>
              <label className="wk-field"><span>الكمية</span><input type="number" min="0.001" step="any" required {...field('quantity')} /></label>
            </div>
            <label className="wk-field"><span>سعر الشراء للوحدة</span><input type="number" min="0" step="any" {...field('purchase_price')} /></label>
            {error && <p className="wk-error" role="alert">{error}</p>}
            <footer>
              <button type="button" className="wk-btn" onClick={() => setForm(null)}>إلغاء</button>
              <button type="submit" className="wk-btn is-primary" disabled={busy}>{busy ? '...' : 'حفظ'}</button>
            </footer>
          </form>
        </MacSheet>
      )}
    </div>
  );
}
