import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';

const PACKAGE_TYPES = [
  { key: 'time_based', label: 'اشتراك زمني (شهري/سنوي)', badgeColor: '#3B82F6' },
  { key: 'session_based', label: 'باقة جلسات', badgeColor: '#F59E0B' },
  { key: 'product_quota', label: 'باقة منتجات', badgeColor: '#10B981' },
  { key: 'membership', label: 'عضوية خصومات VIP', badgeColor: '#EC4899' }
];

const SUB_STATUSES = [
  { key: 'active', label: 'نشط', color: '#10B981', bg: '#064E3B' },
  { key: 'frozen', label: 'مجمد 🧊', color: '#3B82F6', bg: '#1E293B' },
  { key: 'expired', label: 'منتهي ⚠️', color: '#EF4444', bg: '#451A1A' },
  { key: 'depleted', label: 'نفد الرصيد 🛑', color: '#F59E0B', bg: '#292524' }
];

export default function SubscriptionsPage() {
  const [activeTab, setActiveTab] = useState('subscriptions'); // 'subscriptions' or 'packages'
  const [subscriptions, setSubscriptions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showSubModal, setShowSubModal] = useState(false);
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [selectedSubForFreeze, setSelectedSubForFreeze] = useState(null);
  const [freezeReason, setFreezeReason] = useState('');

  // Form States
  const [subForm, setSubForm] = useState({
    customer_id: '',
    package_id: '',
    auto_renew: false,
    notes: ''
  });

  const [pkgForm, setPkgForm] = useState({
    name: '',
    type: 'session_based',
    price: 0,
    duration_days: 30,
    total_credits: 10,
    discount_percentage: 0,
    max_freeze_days: 7,
    description: ''
  });

  const loadData = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      setLoading(true);
      const [subsList, pkgsList, subStats, custsList] = await Promise.all([
        window.electronAPI.getAllSubscriptions(),
        window.electronAPI.getAllPackages(),
        window.electronAPI.getSubscriptionStats(),
        window.electronAPI.getAllCustomersWithStats ? window.electronAPI.getAllCustomersWithStats() : []
      ]);

      setSubscriptions(subsList || []);
      setPackages(pkgsList || []);
      setStats(subStats || null);
      setCustomers(custsList || []);
    } catch (err) {
      console.error('فشل جلب بيانات الاشتراكات:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create Package
  async function handleCreatePackage(e) {
    e.preventDefault();
    if (!pkgForm.name.trim()) return alert('اسم الباقة مطلوب');

    try {
      await window.electronAPI.createPackage(pkgForm);
      setShowPkgModal(false);
      setPkgForm({
        name: '',
        type: 'session_based',
        price: 0,
        duration_days: 30,
        total_credits: 10,
        discount_percentage: 0,
        max_freeze_days: 7,
        description: ''
      });
      loadData();
    } catch (err) {
      alert('فشل إنشاء الباقة: ' + err.message);
    }
  }

  // Subscribe Customer
  async function handleSubscribeCustomer(e) {
    e.preventDefault();
    if (!subForm.customer_id || !subForm.package_id) {
      return alert('يرجى اختيار العميل والباقة');
    }

    try {
      await window.electronAPI.subscribeCustomer({
        customer_id: Number(subForm.customer_id),
        package_id: Number(subForm.package_id),
        auto_renew: subForm.auto_renew,
        notes: subForm.notes
      });
      setShowSubModal(false);
      setSubForm({ customer_id: '', package_id: '', auto_renew: false, notes: '' });
      loadData();
    } catch (err) {
      alert('فشل تفعيل الاشتراك: ' + err.message);
    }
  }

  // Freeze Action
  async function handleConfirmFreeze(e) {
    e.preventDefault();
    if (!selectedSubForFreeze) return;

    try {
      await window.electronAPI.freezeSubscription(selectedSubForFreeze.id, freezeReason);
      setShowFreezeModal(false);
      setSelectedSubForFreeze(null);
      setFreezeReason('');
      loadData();
    } catch (err) {
      alert('فشل تجميد الاشتراك: ' + err.message);
    }
  }

  // Unfreeze Action
  async function handleUnfreeze(subId) {
    try {
      await window.electronAPI.unfreezeSubscription(subId);
      loadData();
    } catch (err) {
      alert('فشل إعادة التفعيل: ' + err.message);
    }
  }

  // Renew Action
  async function handleRenew(subId) {
    if (!window.confirm('هل تريد تجديد هذا الاشتراك بنفس مدة ورصيد الباقة؟')) return;
    try {
      await window.electronAPI.renewSubscription(subId);
      loadData();
    } catch (err) {
      alert('فشل التجديد: ' + err.message);
    }
  }

  // Consume Credit Action
  async function handleConsumeCredit(subId) {
    try {
      await window.electronAPI.consumeSubscriptionCredit(subId, 1, null, 'خصم جلسة يدوي من شاشة الاشتراكات');
      loadData();
    } catch (err) {
      alert('فشل خصم الجلسة: ' + err.message);
    }
  }

  return (
    <div className="subscriptions-page" style={{ padding: '24px', color: '#0F172A' }}>
      {/* Header & Main Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#0F172A' }}>إدارة الاشتراكات والباقات</h1>
          <p style={{ color: '#475569', margin: '4px 0 0 0', fontSize: '14px', fontWeight: '500' }}>
            اشتراكات الجلسات، العضويات الزمنيّة، وتجميد وتجديد باقات العملاء
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowPkgModal(true)}
            style={{
              backgroundColor: '#334155',
              color: '#FFF',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            📦 إضافة باقة جديدة
          </button>
          <button
            onClick={() => setShowSubModal(true)}
            style={{
              backgroundColor: '#10B981',
              color: '#FFF',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            💳 اشتراك عميل جديد
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>إجمالي الاشتراكات</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F8FAFC' }}>{stats.total_subscriptions || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #10B981' }}>
            <div style={{ fontSize: '12px', color: '#10B981' }}>اشتراكات نشطة</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981' }}>{stats.active_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #3B82F6' }}>
            <div style={{ fontSize: '12px', color: '#3B82F6' }}>مجمدة 🧊</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3B82F6' }}>{stats.frozen_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #EF4444' }}>
            <div style={{ fontSize: '12px', color: '#EF4444' }}>منتهية ⚠️</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444' }}>{stats.expired_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #F59E0B' }}>
            <div style={{ fontSize: '12px', color: '#F59E0B' }}>نفد الرصيد 🛑</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>{stats.depleted_count || 0}</div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('subscriptions')}
          style={{
            background: activeTab === 'subscriptions' ? '#10B981' : 'transparent',
            color: '#FFF',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          اشتراكات العملاء ({subscriptions.length})
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          style={{
            background: activeTab === 'packages' ? '#10B981' : 'transparent',
            color: '#FFF',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          دليل الباقات والأنواع ({packages.length})
        </button>
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>جاري التحميل...</div>
      ) : activeTab === 'subscriptions' ? (
        /* CUSTOMER SUBSCRIPTIONS TABLE */
        <div style={{ background: '#1E293B', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0F172A', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 16px' }}>العميل</th>
                <th style={{ padding: '12px 16px' }}>الباقة</th>
                <th style={{ padding: '12px 16px' }}>الحالة</th>
                <th style={{ padding: '12px 16px' }}>تاريخ الانتهاء</th>
                <th style={{ padding: '12px 16px' }}>رصيد الجلسات / الاستهلاك</th>
                <th style={{ padding: '12px 16px' }}>إجراءات السريعة</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>لا توجد اشتراكات عملاء مسجلة</td>
                </tr>
              ) : (
                subscriptions.map((sub) => {
                  const statusInfo = SUB_STATUSES.find((s) => s.key === sub.status);

                  return (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 'bold', color: '#F8FAFC' }}>{sub.customer_name}</div>
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>{sub.customer_phone || '-'}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '600' }}>{sub.package_name}</div>
                        <div style={{ fontSize: '11px', color: '#3B82F6' }}>{sub.package_price} ج.م</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', background: statusInfo?.bg || '#0F172A', color: statusInfo?.color || '#FFF' }}>
                          {statusInfo?.label || sub.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {new Date(sub.end_date).toLocaleDateString('ar-EG')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {sub.package_type === 'session_based' ? (
                          <div>
                            <span style={{ fontWeight: 'bold', color: sub.remaining_credits > 0 ? '#10B981' : '#EF4444' }}>
                              {sub.remaining_credits}
                            </span>
                            <span style={{ color: '#94A3B8' }}> / {sub.total_credits} جلسة</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>عضوية زمنية</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {sub.package_type === 'session_based' && sub.status === 'active' && sub.remaining_credits > 0 && (
                            <button
                              onClick={() => handleConsumeCredit(sub.id)}
                              style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="خصم 1 جلسة"
                            >
                              🎟️ خصم جلسة
                            </button>
                          )}

                          {sub.status === 'active' && (
                            <button
                              onClick={() => {
                                setSelectedSubForFreeze(sub);
                                setShowFreezeModal(true);
                              }}
                              style={{ background: '#3B82F6', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              🧊 تجميد
                            </button>
                          )}

                          {sub.status === 'frozen' && (
                            <button
                              onClick={() => handleUnfreeze(sub.id)}
                              style={{ background: '#F59E0B', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              🔥 فك التجميد
                            </button>
                          )}

                          <button
                            onClick={() => handleRenew(sub.id)}
                            style={{ background: '#334155', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            🔄 تجديد
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* PACKAGES CATALOG GRID */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          {packages.length === 0 ? (
            <div style={{ color: '#94A3B8', padding: '30px', textAlign: 'center', gridColumn: '1/-1' }}>لا توجد باقات متاحة</div>
          ) : (
            packages.map((pkg) => {
              const typeInfo = PACKAGE_TYPES.find((t) => t.key === pkg.type);

              return (
                <div
                  key={pkg.id}
                  style={{
                    background: '#1E293B',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#F8FAFC' }}>{pkg.name}</span>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: `${typeInfo?.badgeColor}22`, color: typeInfo?.badgeColor }}>
                        {typeInfo?.label}
                      </span>
                    </div>

                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#10B981', marginBottom: '12px' }}>
                      {pkg.price} ج.م <span style={{ fontSize: '12px', color: '#94A3B8' }}>/ {pkg.duration_days} يوم</span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {pkg.total_credits > 0 && <div>🎟️ عدد الجلسات/الرصيد: <strong>{pkg.total_credits}</strong></div>}
                      {pkg.discount_percentage > 0 && <div>🏷️ خصم الـ POS الممنوح: <strong>{pkg.discount_percentage}%</strong></div>}
                      {pkg.max_freeze_days > 0 && <div>🧊 أقصى أيام تجميد مسموحة: <strong>{pkg.max_freeze_days} يوم</strong></div>}
                      {pkg.description && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>{pkg.description}</div>}
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px solid #334155', fontSize: '12px', color: '#64748B' }}>
                    المشتركون النشطون حالياً: <strong>{pkg.active_subscribers_count || 0}</strong>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* CREATE PACKAGE MODAL */}
      {showPkgModal && (
        <Modal title="إضافة باقة جديدة" onClose={() => setShowPkgModal(false)}>
          <form onSubmit={handleCreatePackage} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اسم الباقة *</label>
              <input
                type="text"
                placeholder="مثال: باقة 10 جلسات صيانة أو اشتراك شهري VIP"
                value={pkgForm.name}
                onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>نوع الباقة</label>
                <select
                  value={pkgForm.type}
                  onChange={(e) => setPkgForm({ ...pkgForm, type: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  {PACKAGE_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>السعر (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  value={pkgForm.price}
                  onChange={(e) => setPkgForm({ ...pkgForm, price: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>مدة الصلاحية (بالأيام)</label>
                <input
                  type="number"
                  min="1"
                  value={pkgForm.duration_days}
                  onChange={(e) => setPkgForm({ ...pkgForm, duration_days: parseInt(e.target.value) || 30 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>عدد الجلسات / الرصيد</label>
                <input
                  type="number"
                  min="0"
                  value={pkgForm.total_credits}
                  onChange={(e) => setPkgForm({ ...pkgForm, total_credits: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>نسبة خصومات الـ POS (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pkgForm.discount_percentage}
                  onChange={(e) => setPkgForm({ ...pkgForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>أقصى أيام تجميد مسموحة</label>
                <input
                  type="number"
                  min="0"
                  value={pkgForm.max_freeze_days}
                  onChange={(e) => setPkgForm({ ...pkgForm, max_freeze_days: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <button type="submit" style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
              حفظ وتأكيد الباقة
            </button>
          </form>
        </Modal>
      )}

      {/* SUBSCRIBE CUSTOMER MODAL */}
      {showSubModal && (
        <Modal title="تفعيل اشتراك عميل" onClose={() => setShowSubModal(false)}>
          <form onSubmit={handleSubscribeCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اختر العميل *</label>
              <select
                value={subForm.customer_id}
                onChange={(e) => setSubForm({ ...subForm, customer_id: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                required
              >
                <option value="">-- اختر العميل --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone || 'بدون هاتف'})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اختر الباقة *</label>
              <select
                value={subForm.package_id}
                onChange={(e) => setSubForm({ ...subForm, package_id: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                required
              >
                <option value="">-- اختر الباقة --</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} - {p.price} ج.م ({p.duration_days} يوم)</option>
                ))}
              </select>
            </div>

            <button type="submit" style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
              تفعيل الاشتراك وحفظ
            </button>
          </form>
        </Modal>
      )}

      {/* FREEZE SUBSCRIPTION MODAL */}
      {showFreezeModal && selectedSubForFreeze && (
        <Modal title={`تجميد اشتراك العميل: ${selectedSubForFreeze.customer_name}`} onClose={() => setShowFreezeModal(false)}>
          <form onSubmit={handleConfirmFreeze} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '13px', color: '#CBD5E1' }}>
              سيتم إيقاف حساب الأيام والرصيد مؤقتاً لحين إعادة التفعيل. سيتم تمديد تاريخ الانتهاء تلقائياً بقدر عدد أيام التجميد عند الفك.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>سبب التجميد (اختياري)</label>
              <input
                type="text"
                placeholder="مثال: سفر العميل / تجميد بناءً على الطلب"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
              />
            </div>
            <button type="submit" style={{ background: '#3B82F6', color: '#FFF', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              تأكيد التجميد
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
