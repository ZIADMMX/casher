import { useCallback, useEffect, useState } from 'react';

const KITCHEN_COLUMNS = [
  { key: 'new', label: 'طلبات جديدة', color: '#f59e0b', next: 'preparing', action: 'بدء التحضير' },
  { key: 'preparing', label: 'قيد التحضير', color: '#38bdf8', next: 'ready', action: 'جاهز' },
  { key: 'ready', label: 'جاهز للتقديم', color: '#34d399', next: 'served', action: 'تم التسليم' },
  { key: 'served', label: 'تم التسليم', color: '#94a3b8' },
];

const ORDER_MODES = {
  dine_in: 'صالة / طاولات',
  takeaway: 'سفري',
  delivery: 'توصيل',
};

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      if (!window.electronAPI?.getKitchenOrders) {
        throw new Error('شاشة المطبخ غير متاحة في هذا الإصدار');
      }
      const result = await window.electronAPI.getKitchenOrders();
      setOrders(Array.isArray(result) ? result : []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل طلبات المطبخ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const timer = window.setInterval(loadOrders, 10000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  async function advanceOrder(order, nextStatus) {
    setUpdatingId(order.id);
    setError('');
    try {
      await window.electronAPI.updateKitchenOrderStatus(order.id, nextStatus);
      await loadOrders();
    } catch (updateError) {
      setError(updateError.message || 'تعذر تحديث حالة الطلب');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main style={{ minHeight: '100%', padding: 24, background: '#0f172a', color: '#f8fafc' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>شاشة المطبخ (KDS)</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>طلبات اليوم مرتبة حسب وقت تسجيلها — تتحدث الشاشة تلقائيًا كل 10 ثوانٍ.</p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          disabled={loading}
          style={{ border: '1px solid #475569', borderRadius: 8, padding: '9px 14px', background: '#1e293b', color: '#f8fafc', cursor: loading ? 'wait' : 'pointer' }}
        >
          تحديث الطلبات
        </button>
      </header>

      {error && (
        <div role="alert" style={{ marginBottom: 16, border: '1px solid #b91c1c', borderRadius: 8, padding: 12, background: '#450a0a', color: '#fecaca' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div role="status" style={{ padding: 40, textAlign: 'center', color: '#cbd5e1' }}>جاري تحميل طلبات المطبخ...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14, alignItems: 'start' }}>
          {KITCHEN_COLUMNS.map((column) => {
            const columnOrders = orders.filter((order) => (order.kitchen_status || 'new') === column.key);
            return (
              <section key={column.key} aria-label={column.label} style={{ minHeight: 220, padding: 12, border: '1px solid #334155', borderRadius: 12, background: '#111c30' }}>
                <h2 style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 12px', fontSize: 16, color: column.color }}>
                  <span>{column.label}</span>
                  <span>{columnOrders.length}</span>
                </h2>
                <div style={{ display: 'grid', gap: 10 }}>
                  {columnOrders.map((order) => (
                    <article key={order.id} style={{ padding: 12, border: '1px solid #334155', borderRadius: 9, background: '#1e293b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <strong style={{ color: '#f8fafc' }}>طلب #{order.id}</strong>
                        <span style={{ color: '#cbd5e1', fontSize: 12 }}>{formatTime(order.created_at)}</span>
                      </div>
                      <div style={{ marginBottom: 8, color: '#fbbf24', fontWeight: 700 }}>
                        {ORDER_MODES[order.order_mode] || 'طلب مطعم'}
                      </div>
                      {order.customer_name && <div style={{ color: '#cbd5e1', marginBottom: 4 }}>{order.customer_name}</div>}
                      {order.customer_phone && <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>{order.customer_phone}</div>}
                      <ul style={{ margin: '8px 0', paddingInlineStart: 20, color: '#e2e8f0' }}>
                        {(order.items || []).map((item, index) => (
                          <li key={`${order.id}-${index}`} style={{ marginBottom: 5 }}>
                            <strong>{item.quantity} ×</strong> {item.product_name || 'صنف محذوف'}
                            {[item.size, item.color].filter(Boolean).length > 0
                              ? ` (${[item.size, item.color].filter(Boolean).join(' / ')})`
                              : ''}
                          </li>
                        ))}
                      </ul>
                      {column.next && (
                        <button
                          type="button"
                          onClick={() => advanceOrder(order, column.next)}
                          disabled={updatingId === order.id}
                          style={{ width: '100%', marginTop: 6, border: 0, borderRadius: 7, padding: '9px 10px', background: column.color, color: '#0f172a', fontWeight: 800, cursor: updatingId === order.id ? 'wait' : 'pointer' }}
                        >
                          {updatingId === order.id ? 'جارٍ التحديث...' : column.action}
                        </button>
                      )}
                    </article>
                  ))}
                  {!columnOrders.length && <div style={{ padding: 18, textAlign: 'center', color: '#64748b' }}>لا توجد طلبات</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
