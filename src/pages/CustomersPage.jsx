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
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignAudience, setCampaignAudience] = useState([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignError, setCampaignError] = useState('');
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    product_keyword: '',
    months_since_purchase: 10,
    follow_up_days: 1,
    offer_title: 'عرض إكسسوارات أو ترقية',
    offer_details: '',
    discount_percentage: 0
  });

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', initialDebt: '', dueDate: '', debtNotes: '' });
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
    const totalDebtAll = customers.reduce((sum, c) => sum + (Number(c.debt) || 0), 0);
    return {
      count: customers.length,
      totalSpent: totalSpentAll,
      totalInvoices: totalInvoicesAll,
      totalDebt: totalDebtAll,
    };
  }, [customers]);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      initialDebt: form.initialDebt ? Number(form.initialDebt) : 0,
      debtNotes: form.debtNotes || null,
      dueDate: form.dueDate || null,
    };
    const result = await addCustomer(payload);
    if (result) {
      setForm({ name: '', phone: '', email: '', initialDebt: '', dueDate: '', debtNotes: '' });
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

  useEffect(() => {
    if (activeView !== 'campaigns') return;
    window.electronAPI.getCRMCampaigns()
      .then(setCampaigns)
      .catch((err) => {
        console.error('Failed to load CRM campaigns:', err);
        setCampaignError(err.message || 'تعذر تحميل الحملات');
      });
  }, [activeView]);

  async function handleCreateCampaign(e) {
    e.preventDefault();
    setCampaignError('');
    setCampaignLoading(true);
    try {
      const campaign = await window.electronAPI.createCRMCampaign(campaignForm);
      setCampaignForm({
        name: '',
        product_keyword: '',
        months_since_purchase: 10,
        follow_up_days: 1,
        offer_title: 'عرض إكسسوارات أو ترقية',
        offer_details: '',
        discount_percentage: 0
      });
      const [campaignList, audience] = await Promise.all([
        window.electronAPI.getCRMCampaigns(),
        window.electronAPI.getCRMCampaignAudience(campaign.id)
      ]);
      setCampaigns(campaignList);
      setSelectedCampaign(campaign);
      setCampaignAudience(audience);
    } catch (err) {
      console.error('Failed to create CRM campaign:', err);
      setCampaignError(err.message || 'تعذر إنشاء الحملة');
    } finally {
      setCampaignLoading(false);
    }
  }

  async function handleShowCampaignAudience(campaign) {
    setSelectedCampaign(campaign);
    setCampaignError('');
    setCampaignLoading(true);
    try {
      setCampaignAudience(await window.electronAPI.getCRMCampaignAudience(campaign.id));
    } catch (err) {
      console.error('Failed to load CRM campaign audience:', err);
      setCampaignError(err.message || 'تعذر تحميل العملاء المؤهلين');
    } finally {
      setCampaignLoading(false);
    }
  }

  async function handleCreateCampaignReminders() {
    if (!selectedCampaign) return;
    setCampaignError('');
    setCampaignLoading(true);
    try {
      const result = await window.electronAPI.createCRMCampaignReminders(selectedCampaign.id);
      setCampaignAudience(await window.electronAPI.getCRMCampaignAudience(selectedCampaign.id));
      setCampaigns(await window.electronAPI.getCRMCampaigns());
      alert(`تم إنشاء ${result.createdCount} تذكير متابعة.`);
    } catch (err) {
      console.error('Failed to create campaign reminders:', err);
      setCampaignError(err.message || 'تعذر إنشاء تذكيرات الحملة');
    } finally {
      setCampaignLoading(false);
    }
  }

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
          <p className="page-subtitle">تواصل ومتابعة العملاء، الشكاوى، الفرص البيعية والحملات حسب سلوك الشراء</p>
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
        <button
          className={`secondary-btn ${activeView === 'campaigns' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveView('campaigns')}
          style={{ fontWeight: activeView === 'campaigns' ? 'bold' : 'normal' }}
        >
          🎯 حملات حسب الشراء
        </button>
      </div>

      {activeView === 'pipeline' ? (
        <SalesPipelineBoard />
      ) : activeView === 'campaigns' ? (
        <section style={{ display: 'grid', gap: '18px' }}>
          <form className="fox-form-card" onSubmit={handleCreateCampaign}>
            <div className="fox-form-card-header">
              <div className="form-card-title-group">
                <span className="form-title-badge">🎯 CRM</span>
                <h3 className="form-card-title">إنشاء حملة متابعة حسب سلوك الشراء</h3>
              </div>
            </div>
            {campaignError && <p className="form-error" role="alert">{campaignError}</p>}
            <div className="fox-form-grid-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', padding: '18px' }}>
              <label className="form-field-group">
                <span className="form-label">اسم الحملة *</span>
                <input className="fox-lux-input" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} required maxLength={100} placeholder="مثال: متابعة مشتري الهاتف" />
              </label>
              <label className="form-field-group">
                <span className="form-label">اسم المنتج أو جزء منه *</span>
                <input className="fox-lux-input" value={campaignForm.product_keyword} onChange={(e) => setCampaignForm({ ...campaignForm, product_keyword: e.target.value })} required maxLength={100} placeholder="مثال: هاتف" />
              </label>
              <label className="form-field-group">
                <span className="form-label">الشراء منذ (أشهر) *</span>
                <input className="fox-lux-input" type="number" min="1" max="120" value={campaignForm.months_since_purchase} onChange={(e) => setCampaignForm({ ...campaignForm, months_since_purchase: Number(e.target.value) })} required />
              </label>
              <label className="form-field-group">
                <span className="form-label">المتابعة بعد (أيام)</span>
                <input className="fox-lux-input" type="number" min="0" max="365" value={campaignForm.follow_up_days} onChange={(e) => setCampaignForm({ ...campaignForm, follow_up_days: Number(e.target.value) })} required />
              </label>
              <label className="form-field-group">
                <span className="form-label">عنوان العرض *</span>
                <input className="fox-lux-input" value={campaignForm.offer_title} onChange={(e) => setCampaignForm({ ...campaignForm, offer_title: e.target.value })} required maxLength={120} />
              </label>
              <label className="form-field-group">
                <span className="form-label">الخصم (%)</span>
                <input className="fox-lux-input" type="number" min="0" max="100" step="0.1" value={campaignForm.discount_percentage} onChange={(e) => setCampaignForm({ ...campaignForm, discount_percentage: Number(e.target.value) })} />
              </label>
              <label className="form-field-group" style={{ gridColumn: '1 / -1' }}>
                <span className="form-label">تفاصيل العرض</span>
                <textarea className="fox-lux-input" rows="3" value={campaignForm.offer_details} onChange={(e) => setCampaignForm({ ...campaignForm, offer_details: e.target.value })} maxLength={1000} placeholder="إكسسوارات متوافقة أو عرض ترقية مناسب للمنتج" />
              </label>
            </div>
            <div className="form-actions-footer" style={{ padding: '0 18px 18px' }}>
              <button type="submit" className="primary-btn" disabled={campaignLoading}>{campaignLoading ? 'جارٍ الحفظ...' : 'حفظ الحملة ومعاينة العملاء'}</button>
            </div>
          </form>

          <div className="customers-table-card" style={{ padding: '18px' }}>
            <h3 style={{ marginTop: 0 }}>الحملات المحفوظة</h3>
            {campaigns.length === 0 ? (
              <p className="text-muted">لا توجد حملات بعد. أنشئ حملة لتحديد العملاء الذين اشتروا منتجًا منذ مدة معينة.</p>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {campaigns.map((campaign) => (
                  <div key={campaign.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                    <div>
                      <strong>{campaign.name}</strong>
                      <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                        مشترو «{campaign.target_criteria.product_keyword}» قبل {campaign.target_criteria.months_since_purchase} شهرًا أو أكثر
                        {' · '}تذكيرات منشأة: {campaign.reminders_created || 0}
                      </div>
                    </div>
                    <button type="button" className="secondary-btn" onClick={() => handleShowCampaignAudience(campaign)} disabled={campaignLoading}>عرض الجمهور</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCampaign && (
            <div className="customers-table-card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0 }}>الجمهور المؤهل: {selectedCampaign.name}</h3>
                  <p style={{ margin: '5px 0 0', color: '#64748b' }}>آخر شراء للمنتج المطابق كان قبل المدة المحددة أو أكثر.</p>
                </div>
                <button type="button" className="primary-btn" onClick={handleCreateCampaignReminders} disabled={campaignLoading || !campaignAudience.some((customer) => !customer.reminder_created)}>
                  إنشاء تذكيرات العرض ({campaignAudience.filter((customer) => !customer.reminder_created).length})
                </button>
              </div>
              {campaignLoading ? <p>جارٍ تحميل الجمهور...</p> : campaignAudience.length === 0 ? (
                <p className="text-muted">لا يوجد عملاء مؤهلون لهذه الحملة حاليًا.</p>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                  <table className="customers-table">
                    <thead><tr><th>العميل</th><th>الهاتف</th><th>آخر شراء مطابق</th><th>التقييم</th><th>المتابعة</th></tr></thead>
                    <tbody>
                      {campaignAudience.map((customer) => (
                        <tr key={customer.id}>
                          <td>{customer.name}</td>
                          <td>{customer.phone || '-'}</td>
                          <td>{new Date(customer.last_matching_purchase_at).toLocaleDateString('ar-EG')}</td>
                          <td>{'★'.repeat(customer.rating || 5)}{'☆'.repeat(5 - (customer.rating || 5))}</td>
                          <td>{customer.reminder_created ? 'تم إنشاء التذكير' : 'بانتظار الإنشاء'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
            <div className="stat-card">
              <span className="stat-label">إجمالي العملاء المسجلين</span>
              <span className="stat-value">{stats.count}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي مشتريات العملاء</span>
              <span className="stat-value" style={{ color: '#2563eb' }}>{stats.totalSpent.toLocaleString()} ج.م</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي مديونية العملاء (الآجل)</span>
              <span className="stat-value" style={{ color: stats.totalDebt > 0 ? '#dc2626' : '#16a34a' }}>
                {stats.totalDebt.toLocaleString()} ج.م
              </span>
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
            <form className="fox-form-card reports-fade-in" style={{ marginBottom: '25px' }} onSubmit={handleSubmit}>
              <div className="fox-form-card-header">
                <div className="form-card-title-group">
                  <span className="form-title-badge">➕ إضافة عميل</span>
                  <h3 className="form-card-title">إضافة عميل جديد</h3>
                </div>
                <button type="button" className="form-close-btn" onClick={() => setShowForm(false)}>✕ إغلاق</button>
              </div>
              
              {error && <p className="form-error">{error}</p>}
              
              <div className="fox-form-grid-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', padding: '20px' }}>
                <div className="form-field-group">
                  <label className="form-label">اسم العميل <span className="req-star">*</span></label>
                  <div className="fox-field-input-wrap">
                    <input
                      type="text"
                      className="fox-lux-input"
                      placeholder="أدخل اسم العميل..."
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div className="form-field-group">
                  <label className="form-label">رقم الهاتف</label>
                  <div className="fox-field-input-wrap">
                    <input
                      type="text"
                      className="fox-lux-input"
                      placeholder="مهم للمتابعة والواتساب"
                      value={form.phone}
                      onChange={(e) => updateForm('phone', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="form-field-group">
                  <label className="form-label">البريد الإلكتروني</label>
                  <div className="fox-field-input-wrap">
                    <input
                      type="email"
                      className="fox-lux-input"
                      placeholder="اختياري"
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label className="form-label">الرصيد الافتتاحي / مديونية سابقة (ج.م)</label>
                  <div className="fox-field-input-wrap">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="fox-lux-input"
                      placeholder="0.00 (اختياري عند وجود دين سابق)"
                      value={form.initialDebt}
                      onChange={(e) => updateForm('initialDebt', e.target.value)}
                    />
                  </div>
                </div>

                {Number(form.initialDebt || 0) > 0 && (
                  <>
                    <div className="form-field-group">
                      <label className="form-label">تاريخ استحقاق المديونية</label>
                      <div className="fox-field-input-wrap">
                        <input
                          type="date"
                          className="fox-lux-input"
                          value={form.dueDate}
                          onChange={(e) => updateForm('dueDate', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-field-group">
                      <label className="form-label">ملاحظات الرصيد الافتتاحي</label>
                      <div className="fox-field-input-wrap">
                        <input
                          type="text"
                          className="fox-lux-input"
                          placeholder="مثال: رصيد سابق من الدفتر القديم"
                          value={form.debtNotes}
                          onChange={(e) => updateForm('debtNotes', e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
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
                    <th>إجمالي المشتريات والمديونية</th>
                    <th>عدد الفواتير</th>
                    <th>آخر تواصل</th>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>🛍️ مشتريات:</span>
                            <strong className="spent-highlight">{Number(c.totalSpent || 0).toLocaleString()} ج.م</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>💳 مديونية:</span>
                            {Number(c.debt || 0) > 0 ? (
                              <span style={{ color: '#dc2626', fontWeight: 'bold', backgroundColor: '#fee2e2', padding: '1px 6px', borderRadius: '4px' }}>
                                {Number(c.debt).toLocaleString()} ج.م (آجل)
                              </span>
                            ) : (
                              <span style={{ color: '#16a34a', fontWeight: '500' }}>
                                0 ج.م (خالص)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{c.invoiceCount || 0} فاتورة</span>
                      </td>
                      <td>
                        {c.last_interaction_at ? (
                          <span title={new Date(c.last_interaction_at).toLocaleString('ar-EG')}>
                            {new Date(c.last_interaction_at).toLocaleDateString('ar-EG')}
                          </span>
                        ) : <span className="text-muted">لا يوجد تواصل</span>}
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
                      <td colSpan={7} className="empty-table-cell">
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
