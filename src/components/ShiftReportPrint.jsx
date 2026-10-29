import { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';

function ShiftReportPrint({ shift, reportType = 'Z' }) {
  const { settings } = useSettings();
  const [renderedAt] = useState(() => Date.now());
  if (!shift) return null;

  const storeName = settings?.store_name || 'FOX.CLOUD POS';
  const isZReport = reportType === 'Z' || shift.status === 'closed';
  const isClosed = shift.status === 'closed';

  const startDateObj = new Date(shift.start_time || renderedAt);
  const formattedStart = `${startDateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })} • ${startDateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

  const formattedEnd = shift.end_time
    ? `${new Date(shift.end_time).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })} • ${new Date(shift.end_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    : 'وردية جارية (مفتوحة حالياً)';

  const live = shift.liveTotals || {};
  const openingCash = Number(shift.opening_cash || 0);
  const cashSales = Number(shift.total_cash_sales ?? live.cashSales ?? 0);
  const cardSales = Number(shift.total_card_sales ?? live.cardSales ?? 0);
  const creditSales = Number(shift.total_credit_sales ?? live.creditSales ?? 0);
  const totalSales = cashSales + cardSales + creditSales;
  const totalExpenses = Number(shift.total_expenses ?? live.totalExpenses ?? 0);
  const expectedCash = Number(shift.expected_cash ?? live.expectedCash ?? (openingCash + cashSales - totalExpenses));
  const actualCash = shift.actual_cash != null ? Number(shift.actual_cash) : null;
  const cashDifference = shift.cash_difference != null ? Number(shift.cash_difference) : (actualCash != null ? actualCash - expectedCash : null);

  const salesCount = Number(shift.sales_count ?? live.salesCount ?? shift.sales?.length ?? 0);
  const avgTicket = salesCount > 0 ? (totalSales / salesCount).toFixed(2) : '0.00';

  let diffBadgeText = 'مطابقة تامة 100% ✓';
  let diffBadgeStyle = { background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' };

  if (cashDifference != null && cashDifference !== 0) {
    if (cashDifference < 0) {
      diffBadgeText = `عجز مالي: ${Math.abs(cashDifference).toFixed(2)} ج.م 🔴`;
      diffBadgeStyle = { background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5' };
    } else {
      diffBadgeText = `فائض / زيادة: +${cashDifference.toFixed(2)} ج.م 🟢`;
      diffBadgeStyle = { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' };
    }
  }

  const breakdown = shift.cashBreakdownParsed || (shift.cash_breakdown ? JSON.parse(shift.cash_breakdown) : null);

  return (
    <div className="shift-print-container" style={{ direction: 'rtl', fontFamily: 'Cairo, sans-serif', color: '#1E293B', lineHeight: 1.5 }}>
      
      {/* 1. Header Section */}
      <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '2px dashed #E2E8F0', marginBottom: '14px' }}>
        {settings?.store_logo && settings?.show_logo_on_receipt === '1' && (
          <div style={{ marginBottom: '6px' }}>
            <img src={settings.store_logo} alt="Logo" style={{ maxHeight: '45px', maxWidth: '120px', objectFit: 'contain' }} />
          </div>
        )}
        <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#0F172A', margin: '0 0 4px 0' }}>
          {storeName}
        </h2>
        {settings?.store_tagline && (
          <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 8px 0' }}>{settings.store_tagline}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          <span style={{
            background: isZReport ? '#0F172A' : '#0369A1',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: '800',
            padding: '4px 12px',
            borderRadius: '20px',
            display: 'inline-block'
          }}>
            {isZReport ? '🧾 تقرير التقفيل النهائي (Z-Report)' : '📊 تقرير استطلاعي للوردية (X-Report)'}
          </span>

          <span style={{
            background: isClosed ? '#F1F5F9' : '#DCFCE7',
            color: isClosed ? '#475569' : '#15803D',
            fontSize: '11px',
            fontWeight: '700',
            padding: '4px 10px',
            borderRadius: '20px',
            border: `1px solid ${isClosed ? '#CBD5E1' : '#86EFAC'}`
          }}>
            {isClosed ? '🔒 وردية مقفلة' : '🟢 وردية جارية'}
          </span>
        </div>
      </div>

      {/* 2. Metadata Grid Card */}
      <div style={{
        background: '#F8FAFC',
        borderRadius: '12px',
        padding: '12px 14px',
        border: '1px solid #E2E8F0',
        marginBottom: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
          <span style={{ color: '#64748B' }}>رقم الوردية:</span>
          <strong style={{ color: '#F2600C', fontSize: '14px', fontFamily: 'Space Grotesk' }}>#{shift.id}</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
          <span style={{ color: '#64748B' }}>الكاشير المسؤول:</span>
          <strong style={{ color: '#0F172A' }}>{shift.cashier_username || shift.opened_by_name || 'غير محدد'}</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
          <span style={{ color: '#64748B' }}>فترة الوردية:</span>
          <span style={{
            background: shift.shift_type === 'evening' ? '#EEF2FF' : '#FEF3C7',
            color: shift.shift_type === 'evening' ? '#4338CA' : '#B45309',
            padding: '2px 8px',
            borderRadius: '6px',
            fontWeight: '700',
            fontSize: '11.5px'
          }}>
            {shift.shift_type === 'evening' ? '🌙 وردية مسائية' : '☀️ وردية صباحية'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
          <span style={{ color: '#64748B' }}>نقطة البيع (Station):</span>
          <span style={{ fontWeight: '600', color: '#334155' }}>{shift.pos_station || 'الدرج الرئيسي - POS 1'}</span>
        </div>

        <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: '#64748B' }}>توقيت الاستلام:</span>
          <span style={{ fontWeight: '600', color: '#334155' }}>{formattedStart}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: '#64748B' }}>توقيت الإغلاق:</span>
          <span style={{ fontWeight: '600', color: isClosed ? '#334155' : '#059669' }}>{formattedEnd}</span>
        </div>

        {shift.closed_by_username && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ color: '#64748B' }}>تم الإغلاق بواسطة:</span>
            <span style={{ fontWeight: '700', color: '#0F172A' }}>{shift.closed_by_username}</span>
          </div>
        )}
      </div>

      {/* 3. Drawer Audit & Financial Summary Card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #CBD5E1',
        padding: '14px',
        marginBottom: '14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
      }}>
        <div style={{
          fontSize: '13.5px',
          fontWeight: '800',
          color: '#0F172A',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '8px',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>💰</span> مطابقة النقدية وحسابات الدرج
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ color: '#475569' }}>1. العهدة النقدية الابتدائية (الفكة):</span>
            <strong style={{ fontFamily: 'Space Grotesk', fontSize: '14px' }}>{openingCash.toFixed(2)} ج.م</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ color: '#15803D', fontWeight: '600' }}>2. مبيعات الكاش النقدية (+):</span>
            <strong style={{ color: '#15803D', fontFamily: 'Space Grotesk', fontSize: '14px' }}>+{cashSales.toFixed(2)} ج.م</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ color: '#DC2626', fontWeight: '600' }}>3. المصروفات المسحوبة من الدرج (-):</span>
            <strong style={{ color: '#DC2626', fontFamily: 'Space Grotesk', fontSize: '14px' }}>-{totalExpenses.toFixed(2)} ج.م</strong>
          </div>

          {/* Expected Cash Box */}
          <div style={{
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '8px',
            padding: '10px 12px',
            margin: '4px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: '800', color: '#0369A1', fontSize: '13px' }}>النقدية المحسوبة بالدرج (=)</div>
              <div style={{ fontSize: '11px', color: '#0284C7' }}>(العهدة + الكاش - المصروفات)</div>
            </div>
            <strong style={{ color: '#0369A1', fontSize: '16px', fontFamily: 'Space Grotesk' }}>
              {expectedCash.toFixed(2)} ج.م
            </strong>
          </div>

          {/* Actual Cash & Audit Match Result (If Shift is closed or actual entered) */}
          {actualCash != null && (
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: '#334155', fontWeight: '700' }}>النقدية الفعلية بالعد اليدوي:</span>
                <strong style={{ color: '#0F172A', fontSize: '15px', fontFamily: 'Space Grotesk' }}>
                  {actualCash.toFixed(2)} ج.م
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed #CBD5E1' }}>
                <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#475569' }}>نتيجة المطابقة:</span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontWeight: '800',
                  fontSize: '12px',
                  ...diffBadgeStyle
                }}>
                  {diffBadgeText}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Sales Summary & Payment Channels Card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #CBD5E1',
        padding: '14px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '13.5px',
          fontWeight: '800',
          color: '#0F172A',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '8px',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>💳</span> مبيعات قنوات الدفع وإحصائيات الشيفت
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
            <span style={{ color: '#475569' }}>مبيعات البطاقات (فيزا / شبكة):</span>
            <strong style={{ color: '#0F172A', fontFamily: 'Space Grotesk' }}>{cardSales.toFixed(2)} ج.م</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
            <span style={{ color: '#475569' }}>مبيعات الدفع الآجل (عملاء):</span>
            <strong style={{ color: '#0F172A', fontFamily: 'Space Grotesk' }}>{creditSales.toFixed(2)} ج.م</strong>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '8px',
            borderTop: '1px dashed #CBD5E1',
            fontSize: '14px'
          }}>
            <span style={{ fontWeight: '800', color: '#0F172A' }}>إجمالي كل المبيعات (كاش + فيزا + آجل):</span>
            <strong style={{ color: '#F2600C', fontSize: '16px', fontFamily: 'Space Grotesk' }}>
              {totalSales.toFixed(2)} ج.م
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748B', paddingTop: '4px' }}>
            <span>عدد فواتير البيع: <strong style={{ color: '#0F172A' }}>{salesCount} فاتورة</strong></span>
            <span>متوسط الفاتورة: <strong style={{ color: '#0F172A' }}>{avgTicket} ج.م</strong></span>
          </div>
        </div>
      </div>

      {/* 5. Denominations Breakdown (If counted) */}
      {breakdown && Object.values(breakdown).some((v) => Number(v) > 0) && (
        <div style={{
          background: '#F8FAFC',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px',
          marginBottom: '14px'
        }}>
          <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', marginBottom: '8px' }}>
            💵 تفقيط فئات النقدية بالدرج:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px' }}>
            {[200, 100, 50, 20, 10, 5, 1].map((denom) => {
              const count = Number(breakdown[denom] || 0);
              if (count === 0) return null;
              return (
                <div key={denom} style={{
                  background: '#FFFFFF',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  fontSize: '11.5px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ color: '#64748B' }}>{denom} ج.م × {count}</span>
                  <strong style={{ color: '#0F172A' }}>{(denom * count).toFixed(0)}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Expenses List (If any) */}
      {shift.expenses && shift.expenses.length > 0 && (
        <div style={{
          background: '#FFF5F5',
          borderRadius: '12px',
          border: '1px solid #FECACA',
          padding: '12px',
          marginBottom: '14px'
        }}>
          <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#991B1B', marginBottom: '8px' }}>
            💸 المصروفات المسحوبة أثناء الوردية ({shift.expenses.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {shift.expenses.map((exp, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11.5px',
                background: '#FFFFFF',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #FEE2E2'
              }}>
                <span>{exp.category} {exp.notes ? `(${exp.notes})` : ''}</span>
                <strong style={{ color: '#DC2626' }}>-{Number(exp.amount).toFixed(2)} ج.م</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Closing Notes (If any) */}
      {shift.closing_notes && (
        <div style={{
          background: '#F8FAFC',
          borderRadius: '8px',
          padding: '8px 12px',
          border: '1px solid #E2E8F0',
          fontSize: '12px',
          color: '#475569',
          marginBottom: '14px'
        }}>
          <strong>ملاحظات التقفيل: </strong>
          <span>{shift.closing_notes}</span>
        </div>
      )}

      {/* 8. Signatures Block */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        paddingTop: '10px',
        borderTop: '1px dashed #CBD5E1',
        marginTop: '10px',
        textAlign: 'center'
      }}>
        <div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '24px' }}>توقيع الكاشير المسلم</div>
          <div style={{ borderTop: '1px dotted #94A3B8', width: '80%', margin: '0 auto' }}></div>
        </div>
        <div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '24px' }}>توقيع المشرف / الإدارة</div>
          <div style={{ borderTop: '1px dotted #94A3B8', width: '80%', margin: '0 auto' }}></div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '11px', color: '#94A3B8' }}>
        <span>نظام إدارة الورديات والمبيعات • </span>
        <strong style={{ color: '#F2600C' }}>FOX.CLOUD POS Engine</strong>
      </div>
    </div>
  );
}

export default ShiftReportPrint;
