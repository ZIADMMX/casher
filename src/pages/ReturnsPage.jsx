import { useState, useEffect, useCallback } from 'react';
import useBarcodeScanner from '../hooks/useBarcodeScanner.js';

function formatError(err) {
  if (!err) return '';
  const msg = typeof err === 'string' ? err : err?.message || 'حدث خطأ غير متوقع';
  return msg
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

function ReturnsPage() {
  const [saleId, setSaleId] = useState('');
  const [sale, setSale] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);
  const [returnQty, setReturnQty] = useState(1);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('return'); // return | exchange
  const [products, setProducts] = useState([]);
  const [exchangeProductId, setExchangeProductId] = useState('');
  const [exchangeVariantId, setExchangeVariantId] = useState('');
  const [message, setMessage] = useState(null);

  const [recentReturns, setRecentReturns] = useState([]);

  const loadRecent = useCallback(async () => {
    try {
      const data = await window.electronAPI.getRecentReturns();
      setRecentReturns(data || []);
    } catch (err) {
      console.error('Failed to load recent returns:', err);
    }
  }, []);

  useEffect(() => {
    window.electronAPI.getAllProductsWithVariants().then((res) => setProducts(res || []));
    loadRecent();
  }, [loadRecent]);

  async function performSearch(idToSearch) {
    const raw = idToSearch !== undefined ? idToSearch : saleId;
    const cleanId = String(raw).replace(/[^\d]/g, '');
    const parsedId = parseInt(cleanId, 10);
    if (!parsedId || isNaN(parsedId)) {
      setError('يرجى إدخال أو مسح رقم فاتورة صحيح');
      return;
    }

    setError('');
    setMessage(null);
    setSale(null);
    setSelectedItem(null);
    setLoading(true);
    try {
      const data = await window.electronAPI.findSaleForReturn(parsedId);
      if (!data) {
        setError(`لم يتم العثور على أي بيانات للفاتورة رقم #${parsedId}`);
      } else {
        setSale(data);
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    if (e) e.preventDefault();
    performSearch();
  }

  useBarcodeScanner((scannedCode) => {
    const cleanId = String(scannedCode).replace(/[^\d]/g, '');
    if (cleanId) {
      setSaleId(cleanId);
      performSearch(cleanId);
    }
  });

  function resolveVariantId(item) {
    if (!item) return null;
    let vId = item.variant_id || item.variantId;
    if (vId) return Number(vId);

    // Fallback: match from loaded products list
    if (products && products.length > 0) {
      const prod = products.find((p) => p.id === item.productId || p.name === item.productName);
      if (prod && Array.isArray(prod.variants)) {
        const match = prod.variants.find((v) =>
          (!item.size || v.size === item.size) &&
          (!item.color || v.color === item.color)
        );
        if (match) return Number(match.id);
        if (prod.variants.length === 1) return Number(prod.variants[0].id);
      }
    }
    return null;
  }

  function pickItem(item) {
    const vId = resolveVariantId(item);
    setSelectedItem({ ...item, variant_id: vId, variantId: vId });
    setReturnQty(1);
    setReason('');
    setMode('return');
    setExchangeProductId('');
    setExchangeVariantId('');
    setMessage(null);
  }

  const exchangeProduct = products.find((p) => p.id === Number(exchangeProductId));

  async function handleSubmitReturn(e) {
    e.preventDefault();
    setMessage(null);

    const vId = resolveVariantId(selectedItem);
    if (!vId) {
      setMessage({ type: 'error', text: 'بيانات الصنف غير مكتملة، يرجى إعادة اختيار الصنف أو إعادة تشغيل البرنامج' });
      return;
    }

    try {
      const result = await window.electronAPI.processReturn({
        saleId: Number(sale.id),
        variantId: vId,
        quantity: parseInt(returnQty, 10),
        reason,
        mode,
        exchangeVariantId: mode === 'exchange' && exchangeVariantId ? Number(exchangeVariantId) : null,
      });

      let text = `تم تنفيذ ${mode === 'exchange' ? 'الاستبدال' : 'الإرجاع'} بنجاح — مبلغ الاسترداد: ${Number(result.refundAmount || 0).toFixed(2)} ج.م`;
      if (result.exchangeInfo?.priceDifference) {
        const diff = result.exchangeInfo.priceDifference;
        text += diff > 0
          ? ` (مطلوب تحصيل فرق سعر إضافي: ${diff.toFixed(2)} ج.م)`
          : diff < 0
            ? ` (يُرد للعميل فرق سعر: ${Math.abs(diff).toFixed(2)} ج.م)`
            : '';
      }
      setMessage({ type: 'success', text });

      // نحدّث الفاتورة والقائمة الحديثة
      const refreshed = await window.electronAPI.findSaleForReturn(sale.id);
      setSale(refreshed);
      setSelectedItem(null);
      await loadRecent();
    } catch (err) {
      setMessage({ type: 'error', text: formatError(err) });
    }
  }

  const maxReturnable = selectedItem ? selectedItem.quantity - (selectedItem.alreadyReturned || 0) : 0;

  return (
    <div className="suppliers-container returns-page" style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div className="page-header-row" style={{ marginBottom: '20px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔄</span> المرتجعات والاستبدال
          </h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            ابحث عن الفاتورة برقمها لتنفيذ إرجاع مالي أو استبدال فوري لأحد أصنافها وتحديث المخزون تلقائياً
          </p>
        </div>
      </div>

      {/* Search Card */}
      <div className="table-card" style={{ padding: '20px', marginBottom: '20px' }}>
        <form onSubmit={handleSearch}>
          <label className="form-label" style={{ fontWeight: '700', marginBottom: '8px', display: 'block' }}>
            بحث عن فاتورة برقمها
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '540px' }}>
            <input
              type="text"
              className="form-input form-input-lg"
              placeholder="أدخل رقم الفاتورة أو امسح باركود الإيصال مباشرة..."
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              required
              autoFocus
            />
            <button type="submit" className="primary-btn" style={{ padding: '12px 24px', whiteSpace: 'nowrap' }}>
              <span>🔍</span> بحث عن الفاتورة
            </button>
          </div>
          {error && (
            <div
              style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13.5px',
                fontWeight: '600',
                animation: 'fadeIn 0.2s ease-in-out'
              }}
            >
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '14px' }}>
          <span>⏳ جاري البحث واسترجاع الفاتورة...</span>
        </div>
      )}

      {/* Sale Items Table */}
      {sale && (
        <div className="table-card" style={{ marginBottom: '20px', padding: '20px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: '12px'
          }}>
            <div>
              <h3 style={{ margin: 0, color: '#0F172A', fontSize: '16px', fontWeight: '800' }}>
                🧾 فاتورة رقم #{String(sale.id).padStart(4, '0')}
              </h3>
              <span style={{ fontSize: '12.5px', color: '#64748B' }}>
                العميل: <strong>{sale.customer_name || 'عميل نقدي سريع'}</strong> {sale.customer_phone ? `(${sale.customer_phone})` : ''} · تاريخ الفاتورة: {sale.created_at?.split(' ')[0]}
              </span>
            </div>
            <span style={{
              background: '#EFF6FF',
              color: '#2563EB',
              padding: '6px 14px',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '13.5px'
            }}>
              إجمالي الفاتورة: {Number(sale.total_amount || 0).toFixed(2)} ج.م
            </span>
          </div>

          <table className="shifts-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>الصنف والمنتج</th>
                <th>المقاس / اللون</th>
                <th>سعر القطعة</th>
                <th>الكمية المباعة</th>
                <th>مرتجع سابقاً</th>
                <th>المتاح للإرجاع</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, i) => {
                const remaining = item.quantity - (item.alreadyReturned || 0);
                return (
                  <tr key={i}>
                    <td>
                      <strong style={{ color: '#0F172A' }}>{item.productName}</strong>
                    </td>
                    <td>
                      <span style={{ color: '#475569', fontSize: '12.5px' }}>
                        {item.size || '-'} {item.color ? ` / ${item.color}` : ''}
                      </span>
                    </td>
                    <td style={{ fontWeight: '700', color: '#2E5BFF' }}>
                      {Number(item.unit_price || 0).toFixed(2)} ج.م
                    </td>
                    <td>{item.quantity}</td>
                    <td>
                      {item.alreadyReturned > 0 ? (
                        <span style={{ color: '#DC2626', fontWeight: '700' }}>{item.alreadyReturned}</span>
                      ) : '0'}
                    </td>
                    <td>
                      <strong style={{ color: remaining > 0 ? '#15803D' : '#94A3B8' }}>{remaining}</strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        disabled={remaining <= 0}
                        onClick={() => pickItem({ ...item, variant_id: item.variant_id || item.variantId })}
                      >
                        {remaining > 0 ? '🔄 إرجاع / استبدال' : 'تم استرجاعها كاملة'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Return/Exchange Action Box */}
      {selectedItem && (
        <div className="table-card" style={{ padding: '22px', marginBottom: '24px', border: '1.5px solid #BFDBFE', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1E40AF', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚙️</span> تنفيذ العملية على: {selectedItem.productName} ({selectedItem.size || ''} {selectedItem.color || ''})
            </h3>
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setSelectedItem(null)}
            >
              ✖ إلغاء الاختيار
            </button>
          </div>

          {message && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '16px',
                fontWeight: '700',
                fontSize: '13.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: message.type === 'error' ? '#FEF2F2' : '#F0FDF4',
                color: message.type === 'error' ? '#991B1B' : '#15803D',
                border: `1px solid ${message.type === 'error' ? '#FECACA' : '#BBF7D0'}`
              }}
            >
              <span>{message.type === 'error' ? '❌' : '✅'}</span>
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmitReturn}>
            {/* Mode Toggle */}
            <div className="shift-type-pills" style={{ maxWidth: '400px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`shift-type-btn ${mode === 'return' ? 'active morning' : ''}`}
                onClick={() => setMode('return')}
              >
                <span>💵</span> إرجاع (استرداد نقدي)
              </button>
              <button
                type="button"
                className={`shift-type-btn ${mode === 'exchange' ? 'active evening' : ''}`}
                onClick={() => setMode('exchange')}
              >
                <span>🔄</span> استبدال بصنف آخر
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label className="form-label">
                  الكمية المرتجعة (الحد الأقصى: {maxReturnable}) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={maxReturnable}
                  className="form-input form-input-lg"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">سبب الإرجاع / الاستبدال (اختياري)</label>
                <input
                  type="text"
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: مقاس غير مناسب، عيب صناعة، تغيير اللون..."
                />
              </div>
            </div>

            {mode === 'exchange' && (
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <span className="denom-title" style={{ marginBottom: '10px' }}>📦 اختيار الصنف البديل للاستبدال:</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="form-label">المنتج البديل <span style={{ color: '#EF4444' }}>*</span></label>
                    <select
                      className="form-input"
                      value={exchangeProductId}
                      onChange={(e) => { setExchangeProductId(e.target.value); setExchangeVariantId(''); }}
                      required
                    >
                      <option value="">-- اختر المنتج البديل --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">المقاس واللون البديل <span style={{ color: '#EF4444' }}>*</span></label>
                    <select
                      className="form-input"
                      value={exchangeVariantId}
                      onChange={(e) => setExchangeVariantId(e.target.value)}
                      required
                      disabled={!exchangeProduct}
                    >
                      <option value="">-- اختر المقاس / اللون --</option>
                      {exchangeProduct?.variants.map((v) => (
                        <option key={v.id} value={v.id} disabled={v.stock_quantity === 0}>
                          {v.size || '-'} / {v.color || '-'} — (المتاح: {v.stock_quantity}) — {v.selling_price} ج.م
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" className="primary-btn" style={{ padding: '10px 24px' }}>
                تأكيد {mode === 'exchange' ? 'الاستبدال' : 'الإرجاع'} وتحديث المخزون ✓
              </button>
              <button type="button" className="secondary-btn" onClick={() => setSelectedItem(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Recent Returns Table */}
      <div className="table-card">
        <div className="table-toolbar">
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>
              🕒 سجل آخر المرتجعات والاستبدالات
            </h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              آخر 15 عملية إرجاع أو استبدال مسجلة بالنظام
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="shifts-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>الصنف والمنتج</th>
                <th>الكمية</th>
                <th>مبلغ الاسترداد</th>
                <th>نوع العملية</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {recentReturns.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong style={{ color: '#2E5BFF' }}>#INV-{String(r.sale_id).padStart(4, '0')}</strong>
                  </td>
                  <td>
                    <strong style={{ color: '#0F172A' }}>{r.productName}</strong>
                    {r.size && <span style={{ fontSize: '12px', color: '#64748B', marginRight: '6px' }}>({r.size} {r.color ? `/ ${r.color}` : ''})</span>}
                  </td>
                  <td style={{ fontWeight: '700' }}>{r.quantity}</td>
                  <td style={{ color: '#DC2626', fontWeight: '700' }}>{Number(r.refund_amount || 0).toFixed(2)} ج.م</td>
                  <td>
                    <span className={r.exchange_variant_id ? 'badge-open' : 'badge-danger'}>
                      {r.exchange_variant_id ? '🔄 استبدال' : '💵 إرجاع نقدي'}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px', color: '#64748B' }}>{r.created_at?.split(' ')[0]}</td>
                </tr>
              ))}
              {recentReturns.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#8A8A93', padding: '30px' }}>
                    لا توجد أي عمليات إرجاع أو استبدال مسجلة بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ReturnsPage;