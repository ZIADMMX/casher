import { useState, useMemo, useEffect } from 'react';
import useCustomers from '../hooks/useCustomers.js';
import ImportExcelModal from '../components/ImportExcelModal.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { useUser } from '../contexts/UserContext.jsx';
import CustomerTimelineDrawer from '../components/crm/CustomerTimelineDrawer.jsx';
import SalesPipelineBoard from '../components/crm/SalesPipelineBoard.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';

function CustomersPage() {
  const { getTerm } = useBusinessProfile();
  const { currentUser } = useUser();
  const isAdmin = currentUser?.role === 'admin';
  const { customers, addCustomer, addManualDebt, recordPayment, loading, error, refetch } = useCustomers();
  
  const [activeView, setActiveView] = useState('customers'); // 'customers' | 'pipeline'
  const [selectedTimelineCustomer, setSelectedTimelineCustomer] = useState(null);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [copiedPhone, setCopiedPhone] = useState(null);
  const [debtModalCustomer, setDebtModalCustomer] = useState(null);
  const [debtForm, setDebtForm] = useState({ amount: '', notes: '', dueDate: '' });
  const [paymentModalCustomer, setPaymentModalCustomer] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'cash', notes: '' });

  async function handleCopyPhone(phone) {
    if (!phone) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(phone);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = phone;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedPhone(phone);
      setTimeout(() => {
        setCopiedPhone(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy phone:', err);
    }
  }

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) =>
      c.name.toLowerCase().includes(term) || (c.phone || '').includes(term)
    );
  }, [customers, debouncedSearch]);

  const stats = useMemo(() => {
    const totalSpentAll = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    const totalInvoicesAll = customers.reduce((sum, c) => sum + (c.invoiceCount || 0), 0);
    return {
      count: customers.length,
      totalSpent: totalSpentAll,
      totalInvoices: totalInvoicesAll,
    };
  }, [customers]);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await addCustomer(form);
    if (result) {
      setForm({ name: '', phone: '', email: '' });
      setShowForm(false);
    }
  }

  async function handleAddDebtSubmit(e) {
    e.preventDefault();
    if (!debtModalCustomer) return;
    const result = await addManualDebt({
      customerId: debtModalCustomer.id,
      amount: Number(debtForm.amount),
      notes: debtForm.notes,
      dueDate: debtForm.dueDate
    });
    if (result) {
      setDebtModalCustomer(null);
      setDebtForm({ amount: '', notes: '', dueDate: '' });
    }
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!paymentModalCustomer) return;
    const result = await recordPayment({
      customerId: paymentModalCustomer.id,
      amount: Number(paymentForm.amount),
      paymentMethod: paymentForm.paymentMethod,
      notes: paymentForm.notes,
    });
    if (result) {
      setPaymentModalCustomer(null);
      setPaymentForm({ amount: '', paymentMethod: 'cash', notes: '' });
    }
  }

  async function handleExport() {
    try {
      const result = await window.electronAPI.exportCustomers();
      if (!result.canceled) {
        alert('تم تصدير ملف إكسيل بنجاح');
      }
    } catch (err) {
      alert(err.message);
    }
  }

  useEffect(() => {
    try {
      const rawPending = localStorage.getItem('kashiear_pending_customer');
      if (!rawPending) return;

      const pending = JSON.parse(rawPending);
      if (pending?.name) {
        setForm({
          name: pending.name || '',
          phone: pending.phone || '',
          email: pending.email || '',
        });
        setShowForm(true);
      }

      localStorage.removeItem('kashiear_pending_customer');
    } catch (err) {
      console.error('Failed to load pending customer:', err);
    }
  }, []);

  const getTierBadgeClass = (tier) => {
    switch (tier) {
      case 'VIP': return 'badge-purple';
      case 'Gold': return 'badge-warning';
      case 'Silver': return 'badge-neutral';
      default: return 'badge-neutral';
    }
  };

  return (
    <div className="customers-page-container">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1>إدارة {getTerm('customer', 'العملاء')} ومركز الاتصالات (CRM)</h1>
          <p className="page-subtitle">سجل العملاء، السجل الموحد، العمولات وخط صفقات المبيعات</p>
        </div>
        <div className="header-action-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isAdmin && (
            <>
              <button 
                type="button" 
                className="secondary-btn" 
                onClick={() => setShowImportModal(true)} 
                title="استيراد عملاء من ملف Excel"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>📊</span>
                <span>استيراد من Excel</span>
              </button>
              <button className="secondary-btn" onClick={handleExport} title="تصدير بيانات العملاء إلى Excel">
                📥 تصدير البيانات (Excel)
              </button>
            </>
          )}
          <button className="primary-btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '✕ إلغاء' : '+ إضافة عميل جديد'}
          </button>
        </div>
      </div>

      {/* Main View Switcher Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '10px' }}>
        <button 
          className={`secondary-btn ${activeView === 'customers' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveView('customers')}
          style={{ fontWeight: activeView === 'customers' ? 'bold' : 'normal' }}
        >
          👥 جدول العملاء والدفاتر
        </button>
        <button 
          className={`secondary-btn ${activeView === 'pipeline' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveView('pipeline')}
          style={{ fontWeight: activeView === 'pipeline' ? 'bold' : 'normal' }}
        >
          💼 خط صفقات المبيعات (Pipeline)
        </button>
      </div>

      {activeView === 'pipeline' ? (
        <SalesPipelineBoard />
      ) : (
        <>
          {/* Stats Cards */}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">إجمالي العملاء المسجلين</span>
              <span className="stat-value">{stats.count}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي مشتريات العملاء</span>
              <span className="stat-value">{stats.totalSpent.toLocaleString()} ج.م</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">عدد فواتير العملاء</span>
              <span className="stat-value">{stats.totalInvoices}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">متوسط مشتريات العميل</span>
              <span className="stat-value">
                {stats.count ? Math.round(stats.totalSpent / stats.count).toLocaleString() : 0} ج.م
              </span>
            </div>
          </div>

          {showForm && (
            <form className="onyx-form-card reports-fade-in" style={{ marginBottom: '25px' }} onSubmit={handleSubmit}>
              <div className="onyx-form-card-header">
                <div className="form-card-title-group">
                  <span className="form-title-badge">➕ إضافة عميل</span>
                  <h3 className="form-card-title">إضافة عميل جديد</h3>
                </div>
                <button type="button" className="form-close-btn" onClick={() => setShowForm(false)}>✕ إغلاق</button>
              </div>
              
              {error && <p className="form-error">{error}</p>}
              
              <div className="onyx-form-grid-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', padding: '20px' }}>
                <div className="form-field-group">
                  <label className="form-label">اسم العميل <span className="req-star">*</span></label>
                  <div className="onyx-field-input-wrap">
                    <input
                      type="text"
                      className="onyx-lux-input"
                      placeholder="أدخل اسم العميل..."
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div className="form-field-group">
                  <label className="form-label">رقم الهاتف</label>
                  <div className="onyx-field-input-wrap">
                    <input
                      type="text"
                      className="onyx-lux-input"
                      placeholder="مهم للمتابعة والواتساب"
                      value={form.phone}
                      onChange={(e) => updateForm('phone', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="form-field-group">
                  <label className="form-label">البريد الإلكتروني</label>
                  <div className="onyx-field-input-wrap">
                    <input
                      type="email"
                      className="onyx-lux-input"
                      placeholder="اختياري"
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="form-actions-footer" style={{ padding: '0 20px 20px', display: 'flex', gap: '10px' }}>
                <button type="submit" className="primary-btn">حفظ العميل</button>
                <button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>إلغاء</button>
              </div>
            </form>
          )}

          {/* Search Bar */}
          <div className="search-bar-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="ابحث باسم العميل أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-search-btn" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* Customers Table */}
          {loading ? (
            <div className="table-loading-box">جاري تحميل بيانات العملاء...</div>
          ) : (
            <div className="customers-table-card">
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>اسم العميل</th>
                    <th>رقم الهاتف</th>
                    <th>التصنيف والتقييم</th>
                    <th>إجمالي المشتريات / المديونية</th>
                    <th>عدد الفواتير</th>
                    <th>إجراءات CRM والمالية</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="customer-name-cell">
                          <span className="customer-avatar-mini">{c.name.charAt(0).toUpperCase()}</span>
                          <span className="customer-name-text">{c.name}</span>
                        </div>
                      </td>
                      <td>
                        {c.phone ? (
                          <span
                            className={`phone-badge ${copiedPhone === c.phone ? 'copied' : ''}`}
                            onClick={() => handleCopyPhone(c.phone)}
                            title="انقر لنسخ الرقم"
                          >
                            {copiedPhone === c.phone ? '✓ تم النسخ!' : `📞 ${c.phone}`}
                            <span className="phone-copy-icon">
                              {copiedPhone === c.phone ? '' : '📋'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className={`badge ${getTierBadgeClass(c.tier)}`} style={{ alignSelf: 'flex-start' }}>
                            {c.tier || 'Regular'}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: '#f59e0b' }}>
                            {'★'.repeat(c.rating || 5)}{'☆'.repeat(5 - (c.rating || 5))}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="spent-highlight">{Number(c.totalSpent || 0).toLocaleString()} ج.م</span>
                        {Number(c.debt || 0) > 0 && (
                          <small style={{ display: 'block', color: '#b91c1c' }}>
                            متبقي آجل: {Number(c.debt).toLocaleString()} ج.م
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-neutral">{c.invoiceCount || 0} فاتورة</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            className="secondary-btn"
                            style={{ padding: '4px 8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setSelectedTimelineCustomer(c)}
                            title="عرض السجل الزمني والملاحظات وفرص البيع"
                          >
                            <span>🕒</span>
                            <span>Timeline & CRM</span>
                          </button>

                          {isAdmin && (
                            <button
                              className="secondary-btn"
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                              onClick={() => setDebtModalCustomer(c)}
                            >
                              ➕ مديونية
                            </button>
                          )}

                          {isAdmin && Number(c.debt || 0) > 0 && (
                            <button
                              className="primary-btn"
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                              onClick={() => setPaymentModalCustomer(c)}
                            >
                              💵 سداد
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-table-cell">
                        {search ? 'لا توجد نتائج مطابقة للبحث' : 'لم يتم تسجيل أي عملاء بعد'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Customer Timeline & CRM Drawer */}
      {selectedTimelineCustomer && (
        <CustomerTimelineDrawer
          customer={selectedTimelineCustomer}
          onClose={() => setSelectedTimelineCustomer(null)}
          onCustomerUpdated={() => refetch()}
        />
      )}

      {/* Manual Debt Modal */}
      {debtModalCustomer && (
        <div className="modal-overlay" onClick={() => setDebtModalCustomer(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>إضافة مديونية / رصيد آجل</h3>
              <button type="button" className="modal-close-btn" onClick={() => setDebtModalCustomer(null)}>✕</button>
            </div>
            <form onSubmit={handleAddDebtSubmit}>
              <div className="modal-body">
                <p>إضافة مديونية للعميل: <strong>{debtModalCustomer.name}</strong></p>
                {error && <p className="form-error">{error}</p>}
                
                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label>مبلغ المديونية (ج.م):</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={debtForm.amount}
                    onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>ملاحظات (مثال: رصيد افتتاحي، مديونية قديمة):</label>
                  <input
                    type="text"
                    value={debtForm.notes}
                    onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>تاريخ الاستحقاق (اختياري):</label>
                  <input
                    type="date"
                    value={debtForm.dueDate}
                    onChange={(e) => setDebtForm({ ...debtForm, dueDate: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '15px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #eee' }}>
                <button type="button" className="secondary-btn" onClick={() => setDebtModalCustomer(null)}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ المديونية</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentModalCustomer && (
        <div className="modal-overlay" onClick={() => setPaymentModalCustomer(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>تسجيل سداد مديونية</h3>
              <button type="button" className="modal-close-btn" onClick={() => setPaymentModalCustomer(null)}>✕</button>
            </div>
            <form onSubmit={handlePaymentSubmit}>
              <div className="modal-body">
                <p>العميل: <strong>{paymentModalCustomer.name}</strong></p>
                <p>الرصيد الحالي: <strong>{Number(paymentModalCustomer.debt || 0).toLocaleString()} ج.م</strong></p>
                {error && <p className="form-error">{error}</p>}
                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label>مبلغ السداد (ج.م):</label>
                  <input type="number" min="0.01" step="0.01" max={paymentModalCustomer.debt} value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>طريقة السداد:</label>
                  <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>ملاحظات:</label>
                  <input type="text" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '15px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #eee' }}>
                <button type="button" className="secondary-btn" onClick={() => setPaymentModalCustomer(null)}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ السداد</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      <ImportExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        type="customers"
        onSuccess={() => refetch()}
      />
    </div>
  );
}

export default CustomersPage;
