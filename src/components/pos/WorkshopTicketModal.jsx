import { useEffect, useState } from 'react';
import * as enterpriseApi from '../../api/enterprise.js';

/**
 * WorkshopTicketModal — اختيار تذكرة صيانة عشان تتحصّل مع الفاتورة الحالية.
 *
 * بيعرض التذاكر اللي لسه ما اتحصّلتش بس. الربط نفسه بيتم على السيرفر وقت
 * إتمام البيع، فاختيار تذكرة هنا ما بيغيّرش حاجة في المخزون ولا الفلوس.
 */
export default function WorkshopTicketModal({ onSelect, onClose }) {
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    enterpriseApi.getUnbilledTickets()
      .then((rows) => { if (!cancelled) setTickets(Array.isArray(rows) ? rows : []); })
      .catch((err) => { if (!cancelled) setError(err.message || 'تعذر تحميل التذاكر'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const term = search.trim().toLowerCase();
  const visible = term
    ? tickets.filter((t) => [t.ticket_number, t.title, t.customer_name, t.customer_phone, t.device_serial]
      .some((field) => String(field || '').toLowerCase().includes(term)))
    : tickets;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', width: '92%', maxWidth: '620px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0 }}>🛠️ تحصيل تذكرة صيانة</h3>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
          اختار التذكرة، وبعدين ضيف أجر الصيانة وقطع الغيار للسلة زي أي بيعة. التذكرة هتترّبط بالفاتورة وقت الدفع.
        </p>

        <input
          type="search"
          placeholder="ابحث برقم التذكرة أو اسم العميل أو السيريال..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
        />

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {loading && <p style={{ color: '#6b7280' }}>جارٍ التحميل...</p>}
          {!loading && error && <p style={{ color: '#b91c1c' }}>{error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p style={{ color: '#6b7280' }}>مفيش تذاكر مفتوحة للتحصيل.</p>
          )}
          {visible.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onSelect(ticket)}
              style={{ textAlign: 'right', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', cursor: 'pointer' }}
            >
              <strong>{ticket.ticket_number}</strong> — {ticket.title}
              <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '4px' }}>
                {ticket.customer_name || 'بدون اسم'}
                {ticket.customer_phone ? ` · ${ticket.customer_phone}` : ''}
                {ticket.device_serial ? ` · سيريال ${ticket.device_serial}` : ''}
                {Number(ticket.estimated_cost) > 0 ? ` · متوقع ${Number(ticket.estimated_cost).toLocaleString('ar-EG')} ج` : ''}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="secondary-btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
