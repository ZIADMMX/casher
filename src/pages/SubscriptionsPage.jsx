import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import MembershipPlanModal from '../components/MembershipPlanModal.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as customersApi from '../api/customers.js';
import * as inventoryApi from '../api/inventory.js';
import * as productsApi from '../api/products.js';
import * as subscriptionsApi from '../api/subscriptions.js';
import '../styles/subscriptions.css';

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
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showSubModal, setShowSubModal] = useState(false);
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
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

  const loadData = useCallback(async () => {
    if (!isBridgeAvailable()) return;
    try {
      setLoading(true);
      const [subsList, pkgsList, subStats, custsList, prodsList, branchesList] = await Promise.all([
        subscriptionsApi.getAllSubscriptions(),
        subscriptionsApi.getAllPackages(),
        subscriptionsApi.getSubscriptionStats(),
        customersApi.getAllCustomersWithStats.isAvailable() ? customersApi.getAllCustomersWithStats() : [],
        productsApi.getAllProductsWithVariants.isAvailable() ? productsApi.getAllProductsWithVariants() : [],
        inventoryApi.getInventoryBranches.isAvailable() ? inventoryApi.getInventoryBranches() : []
      ]);

      setSubscriptions(subsList || []);
      setPackages(pkgsList || []);
      setStats(subStats || null);
      setCustomers(custsList || []);
      setAvailableProducts(prodsList || []);
      setAvailableBranches(branchesList || []);
    } catch (err) {
      console.error('فشل جلب بيانات الاشتراكات:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create or Update Package using MembershipPlanModal
  async function handleSavePackage(payload) {
    try {
      if (editingPackage) {
        await subscriptionsApi.updatePackage(editingPackage.id, payload);
      } else {
        await subscriptionsApi.createPackage(payload);
      }
      setShowPkgModal(false);
      setEditingPackage(null);
      loadData();
    } catch (err) {
      alert('فشل حفظ الباقة: ' + err.message);
    }
  }

  // Delete Package
  async function handleDeletePackage(pkgId) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الباقة؟')) return;
    try {
      await subscriptionsApi.deletePackage(pkgId);
      loadData();
    } catch (err) {
      alert('تعذر حذف الباقة: ' + err.message);
    }
  }

  // Subscribe Customer
  async function handleSubscribeCustomer(e) {
    e.preventDefault();
    if (!subForm.customer_id || !subForm.package_id) {
      return alert('يرجى اختيار العميل والباقة');
    }

    try {
      await subscriptionsApi.subscribeCustomer({
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
      await subscriptionsApi.freezeSubscription(selectedSubForFreeze.id, freezeReason);
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
      await subscriptionsApi.unfreezeSubscription(subId);
      loadData();
    } catch (err) {
      alert('فشل إعادة التفعيل: ' + err.message);
    }
  }

  // Renew Action
  async function handleRenew(subId) {
    if (!window.confirm('هل تريد تجديد هذا الاشتراك بنفس مدة ورصيد الباقة؟')) return;
    try {
      await subscriptionsApi.renewSubscription(subId);
      loadData();
    } catch (err) {
      alert('فشل التجديد: ' + err.message);
    }
  }

  // Consume Credit Action
  async function handleConsumeCredit(subId) {
    try {
      await subscriptionsApi.consumeSubscriptionCredit(subId, 1, null, 'خصم جلسة يدوي من شاشة الاشتراكات');
      loadData();
    } catch (err) {
      alert('فشل خصم الجلسة: ' + err.message);
    }
  }

  return (
    <div className="subscriptions-page">
      {/* Header & Main Stats */}
      <div className="subscriptions-header">
        <div>
          <h1 className="subscriptions-title">إدارة الاشتراكات والباقات</h1>
          <p className="subscriptions-subtitle">
            اشتراكات الجلسات، العضويات الزمنيّة، وتجميد وتجديد باقات العملاء
          </p>
        </div>
        <div className="subscriptions-header-actions">
          <button
            type="button"
            className="subscription-btn subscription-btn-secondary"
            onClick={() => {
              setEditingPackage(null);
              setShowPkgModal(true);
            }}
          >
            📦 إضافة باقة جديدة
          </button>
          <button
            type="button"
            className="subscription-btn subscription-btn-primary"
            onClick={() => setShowSubModal(true)}
          >
            💳 اشتراك عميل جديد
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      {stats && (
        <div className="subscriptions-stats">
          <div className="subscription-stat-card">
            <div className="subscription-stat-label">إجمالي الاشتراكات</div>
            <div className="subscription-stat-value">{stats.total_subscriptions || 0}</div>
          </div>
          <div className="subscription-stat-card subscription-stat-active">
            <div className="subscription-stat-label">اشتراكات نشطة</div>
            <div className="subscription-stat-value">{stats.active_count || 0}</div>
          </div>
          <div className="subscription-stat-card subscription-stat-frozen">
            <div className="subscription-stat-label">مجمدة 🧊</div>
            <div className="subscription-stat-value">{stats.frozen_count || 0}</div>
          </div>
          <div className="subscription-stat-card subscription-stat-expired">
            <div className="subscription-stat-label">منتهية ⚠️</div>
            <div className="subscription-stat-value">{stats.expired_count || 0}</div>
          </div>
          <div className="subscription-stat-card subscription-stat-depleted">
            <div className="subscription-stat-label">نفد الرصيد 🛑</div>
            <div className="subscription-stat-value">{stats.depleted_count || 0}</div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="subscriptions-tabs" role="tablist" aria-label="أقسام الاشتراكات">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subscriptions'}
          className={`subscriptions-tab${activeTab === 'subscriptions' ? ' active' : ''}`}
          onClick={() => setActiveTab('subscriptions')}
        >
          اشتراكات العملاء ({subscriptions.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'packages'}
          className={`subscriptions-tab${activeTab === 'packages' ? ' active' : ''}`}
          onClick={() => setActiveTab('packages')}
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
                              type="button"
                              className="subscription-btn subscription-btn-success subscription-action-btn"
                              onClick={() => handleConsumeCredit(sub.id)}
                              title="خصم 1 جلسة"
                            >
                              🎟️ خصم جلسة
                            </button>
                          )}

                          {sub.status === 'active' && (
                            <button
                              type="button"
                              className="subscription-btn subscription-btn-info subscription-action-btn"
                              onClick={() => {
                                setSelectedSubForFreeze(sub);
                                setShowFreezeModal(true);
                              }}
                            >
                              🧊 تجميد
                            </button>
                          )}

                          {sub.status === 'frozen' && (
                            <button
                              type="button"
                              className="subscription-btn subscription-btn-warning subscription-action-btn"
                              onClick={() => handleUnfreeze(sub.id)}
                            >
                              🔥 فك التجميد
                            </button>
                          )}

                          <button
                            type="button"
                            className="subscription-btn subscription-btn-secondary subscription-action-btn"
                            onClick={() => handleRenew(sub.id)}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {packages.length === 0 ? (
            <div style={{ color: '#94A3B8', padding: '30px', textAlign: 'center', gridColumn: '1/-1' }}>لا توجد باقات متاحة</div>
          ) : (
            packages.map((pkg) => {
              const typeInfo = PACKAGE_TYPES.find((t) => t.key === pkg.type);
              const cycleLabel =
                pkg.billing_cycle === 'yearly'
                  ? 'سنوي'
                  : pkg.billing_cycle === 'quarterly'
                  ? 'ربع سنوي'
                  : 'شهري';

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
                    justifyContent: 'space-between',
                    position: 'relative',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <div>
                    {/* Badges Bar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                      {pkg.badge_text && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: pkg.badge_color || '#3b82f6',
                            color: '#ffffff',
                          }}
                        >
                          {pkg.badge_text}
                        </span>
                      )}

                      {pkg.is_featured ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#f59e0b',
                            color: '#ffffff',
                          }}
                        >
                          ⭐ مميزة
                        </span>
                      ) : null}

                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: `${typeInfo?.badgeColor || '#0891b2'}22`,
                          color: typeInfo?.badgeColor || '#0891b2',
                          fontWeight: '600',
                        }}
                      >
                        {cycleLabel}
                      </span>

                      {!pkg.is_active && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#ef444422',
                            color: '#ef4444',
                            fontWeight: 'bold',
                          }}
                        >
                          معطلة
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '17px', color: '#F8FAFC' }}>
                      {pkg.name}
                    </h3>

                    {/* Price and Savings */}
                    <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '24px', fontWeight: '800', color: '#10B981' }}>
                        {pkg.price} ج.م
                      </span>
                      <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                        / {pkg.duration_days} يوم
                      </span>

                      {pkg.original_price > pkg.price && (
                        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', textDecoration: 'line-through', color: '#64748B' }}>
                            {pkg.original_price} ج.م
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#059669', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' }}>
                            وفر {pkg.discount_percentage || Math.round(((pkg.original_price - pkg.price) / pkg.original_price) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Features list */}
                    <div style={{ fontSize: '13px', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      <div>
                        {pkg.is_unlimited_sessions ? (
                          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>♾️ جلسات غير محدودة</span>
                        ) : (
                          <span>🎟️ عدد الجلسات / الرصيد: <strong style={{ color: '#F8FAFC' }}>{pkg.total_credits || 0}</strong></span>
                        )}
                      </div>

                      {pkg.advance_booking_days > 0 ? (
                        <div>📅 أيام الحجز المسبق: <strong>{pkg.advance_booking_days} يوم</strong></div>
                      ) : (
                        <div>📅 الحجز المسبق: <span style={{ color: '#94A3B8' }}>غير محدود</span></div>
                      )}

                      {Array.isArray(pkg.eligible_services) && pkg.eligible_services.length > 0 ? (
                        <div style={{ color: '#a7f3d0' }}>
                          ✨ <strong>{pkg.eligible_services.length}</strong> خدمات مؤهلة ومشمولة
                        </div>
                      ) : (
                        <div style={{ color: '#94A3B8' }}>✨ جميع الخدمات مؤهلة بالخطة</div>
                      )}

                      {pkg.discount_percentage > 0 && (
                        <div>🏷️ خصم الـ POS الممنوح: <strong>{pkg.discount_percentage}%</strong></div>
                      )}

                      {pkg.grace_period_days > 0 && (
                        <div>⏳ فترة السماح: <strong>{pkg.grace_period_days} أيام</strong></div>
                      )}

                      {pkg.description && (
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontStyle: 'italic', borderTop: '1px dashed #334155', paddingTop: '6px' }}>
                          {pkg.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer & Actions */}
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                      مشتركون حالياً: <strong style={{ color: '#F8FAFC' }}>{pkg.active_subscribers_count || 0}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        style={{
                          background: '#0284c7',
                          border: 'none',
                          color: '#FFF',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setEditingPackage(pkg);
                          setShowPkgModal(true);
                        }}
                      >
                        ✏️ تعديل
                      </button>

                      <button
                        type="button"
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleDeletePackage(pkg.id)}
                        title="حذف الباقة"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MEMBERSHIP PLAN MODAL (CREATE / EDIT MATCHING REFERENCE) */}
      <MembershipPlanModal
        isOpen={showPkgModal}
        onClose={() => {
          setShowPkgModal(false);
          setEditingPackage(null);
        }}
        onSubmit={handleSavePackage}
        initialData={editingPackage}
        availableProducts={availableProducts}
        availableBranches={availableBranches}
      />

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

            <button type="submit" className="subscription-btn subscription-btn-primary subscription-submit-btn">
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
            <button type="submit" className="subscription-btn subscription-btn-info subscription-submit-btn">
              تأكيد التجميد
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
