import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as commissionsApi from '../api/commissions.js';
import * as productsApi from '../api/products.js';
import * as usersApi from '../api/users.js';
import '../styles/commissions.css';

const TARGET_TYPES = [
  { key: 'all_sales', label: 'جميع المبيعات' },
  { key: 'product', label: 'منتج محدد' },
  { key: 'category', label: 'تصنيف محدد' },
  { key: 'employee', label: 'موظف محدد' },
  { key: 'debt_collection', label: 'تحصيل المديونيات' },
  { key: 'net_profit', label: 'صافي الربح' },
  { key: 'sales_target', label: 'تحقيق هدف مبيعات (Target)' }
];

const CALC_TYPES = [
  { key: 'percentage', label: 'نسبة مئوية (%)' },
  { key: 'fixed_amount', label: 'مبلغ ثابت لكل قطعة/فاتورة (ج.م)' },
  { key: 'lump_sum_bonus', label: 'مكافأة مقطوعة (ج.م)' }
];

export default function CommissionsPage() {
  const [activeTab, setActiveTab] = useState('earnings'); // 'earnings' or 'rules'
  const [rules, setRules] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [selectedUserForPayout, setSelectedUserForPayout] = useState(null);

  // Form States
  const [ruleForm, setRuleForm] = useState({
    title: '',
    target_type: 'all_sales',
    target_id: '',
    calculation_type: 'percentage',
    rate_value: 5,
    min_sales_threshold: 0,
    description: ''
  });

  const [payoutForm, setPayoutForm] = useState({
    amount: 0,
    paymentMethod: 'cash',
    notes: ''
  });

  const loadData = useCallback(async () => {
    if (!isBridgeAvailable()) return;
    try {
      setLoading(true);
      const [rulesList, earningsList, summaryData, usersList, productsList, categoriesList] = await Promise.all([
        commissionsApi.getAllCommissionRules(),
        commissionsApi.getAllCommissionEarnings(),
        commissionsApi.getCommissionSummary(),
        usersApi.getAllUsers.isAvailable() ? usersApi.getAllUsers() : [],
        productsApi.getAllProductsWithVariants.isAvailable() ? productsApi.getAllProductsWithVariants() : [],
        productsApi.getAllCategories.isAvailable() ? productsApi.getAllCategories() : []
      ]);

      setRules(rulesList || []);
      setEarnings(earningsList || []);
      setSummary(summaryData || null);
      setUsers(usersList || []);
      setProducts(productsList || []);
      setCategories(categoriesList || []);
    } catch (err) {
      console.error('فشل جلب بيانات العمولات:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create Rule
  async function handleCreateRule(e) {
    e.preventDefault();
    if (!ruleForm.title.trim()) return alert('عنوان القاعدة مطلوب');

    try {
      await commissionsApi.createCommissionRule({
        ...ruleForm,
        target_id: ruleForm.target_id ? Number(ruleForm.target_id) : null,
        rate_value: parseFloat(ruleForm.rate_value) || 0,
        min_sales_threshold: parseFloat(ruleForm.min_sales_threshold) || 0
      });
      setShowRuleModal(false);
      setRuleForm({
        title: '',
        target_type: 'all_sales',
        target_id: '',
        calculation_type: 'percentage',
        rate_value: 5,
        min_sales_threshold: 0,
        description: ''
      });
      loadData();
    } catch (err) {
      alert('فشل إنشاء القاعدة: ' + err.message);
    }
  }

  // Toggle Rule Status
  async function handleToggleRule(ruleId) {
    try {
      await commissionsApi.toggleCommissionRule(ruleId);
      loadData();
    } catch (err) {
      alert('فشل تغيير حالة القاعدة: ' + err.message);
    }
  }

  // Delete Rule
  async function handleDeleteRule(ruleId) {
    if (!window.confirm('هل تريد حذف هذه القاعدة؟')) return;
    try {
      await commissionsApi.deleteCommissionRule(ruleId);
      loadData();
    } catch (err) {
      alert('فشل حذف القاعدة: ' + err.message);
    }
  }

  // Payout Earnings
  async function handleConfirmPayout(e) {
    e.preventDefault();
    if (!selectedUserForPayout) return;

    try {
      await commissionsApi.payoutCommissionEarnings(
        selectedUserForPayout.user_id,
        parseFloat(payoutForm.amount) || selectedUserForPayout.pending_amount,
        payoutForm.paymentMethod,
        payoutForm.notes
      );
      setShowPayoutModal(false);
      setSelectedUserForPayout(null);
      setPayoutForm({ amount: 0, paymentMethod: 'cash', notes: '' });
      loadData();
    } catch (err) {
      alert('فشل عملية الصرف: ' + err.message);
    }
  }

  return (
    <div className="commissions-page">
      {/* Header & Main Actions */}
      <div className="commissions-header">
        <div>
          <h1>نظام العمولات والحوافز</h1>
          <p>تابع مستحقات الفريق، راجع تفاصيل كل عمولة، وأنشئ قواعد حساب تناسب طريقة البيع لديك.</p>
        </div>
        <button
          type="button"
          className="commissions-primary-action"
          onClick={() => setShowRuleModal(true)}
        >
          ➕ إضافة قاعدة عمولة جديدة
        </button>
      </div>

      <section className="commission-workflow" aria-label="طريقة عمل العمولات">
        <div className="commission-workflow-heading">
          <span className="commission-workflow-mark">كيف تعمل العمولات؟</span>
          <span>ثلاث خطوات واضحة من إعداد القاعدة حتى التسوية</span>
        </div>
        <ol>
          <li><b>١</b><span><strong>أنشئ قاعدة</strong><small>حدد الهدف وطريقة الحساب</small></span></li>
          <li><b>٢</b><span><strong>راجع المستحقات</strong><small>تظهر الحركات المسجلة لكل موظف</small></span></li>
          <li><b>٣</b><span><strong>سوِّ العمولة</strong><small>اصرف المستحق وحدّث سجل التسوية</small></span></li>
        </ol>
      </section>

      {/* Summary KPI Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          <div style={{ background: '#1E293B', padding: '14px 18px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>الموظفون المستحقون للعمولات</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#F8FAFC' }}>{summary.employees_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '14px 18px', borderRadius: '10px', border: '1px solid #F59E0B' }}>
            <div style={{ fontSize: '12px', color: '#F59E0B' }}>العمولات المستحقة (معلقة)</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#F59E0B' }}>{(summary.pending_total || 0).toLocaleString()} ج.م</div>
          </div>
          <div style={{ background: '#1E293B', padding: '14px 18px', borderRadius: '10px', border: '1px solid #10B981' }}>
            <div style={{ fontSize: '12px', color: '#10B981' }}>إجمالي العمولات المصروفة</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#10B981' }}>{(summary.paid_total || 0).toLocaleString()} ج.م</div>
          </div>
          <div style={{ background: '#1E293B', padding: '14px 18px', borderRadius: '10px', border: '1px solid #3B82F6' }}>
            <div style={{ fontSize: '12px', color: '#3B82F6' }}>القواعد النشطة حالياً</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#3B82F6' }}>{summary.active_rules_count || 0}</div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('earnings')}
          style={{
            background: activeTab === 'earnings' ? '#3B82F6' : '#CBD5E1',
            color: activeTab === 'earnings' ? '#FFF' : '#334155',
            border: activeTab === 'earnings' ? '1px solid #3B82F6' : '1px solid #94A3B8',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          تقرير عمولات الموظفين والتسويات
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          style={{
            background: activeTab === 'rules' ? '#3B82F6' : '#CBD5E1',
            color: activeTab === 'rules' ? '#FFF' : '#334155',
            border: activeTab === 'rules' ? '1px solid #3B82F6' : '1px solid #94A3B8',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          قواعد العمولات والشروط ({rules.length})
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>جاري التحميل...</div>
      ) : activeTab === 'earnings' ? (
        /* EMPLOYEE EARNINGS SUMMARY & LOGS */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Employees Summary */}
          <div style={{ background: '#1E293B', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155', padding: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '14px', color: '#F8FAFC' }}>
              ملخص مستحقات الموظفين
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#0F172A', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '12px 16px' }}>الموظف</th>
                  <th style={{ padding: '12px 16px' }}>عدد الحركات</th>
                  <th style={{ padding: '12px 16px' }}>العمولات المستحقة (معلقة)</th>
                  <th style={{ padding: '12px 16px' }}>العمولات المصروفة</th>
                  <th style={{ padding: '12px 16px' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(!summary?.employees || summary.employees.length === 0) ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>لا توجد مستحقات عمولات مسجلة للموظفين حتى الآن</td>
                  </tr>
                ) : (
                  summary.employees.map((emp) => (
                    <tr key={emp.user_id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#F8FAFC' }}>👤 {emp.username}</td>
                      <td style={{ padding: '12px 16px' }}>{emp.total_commission_entries}</td>
                      <td style={{ padding: '12px 16px', color: emp.pending_amount > 0 ? '#F59E0B' : '#94A3B8', fontWeight: 'bold' }}>
                        {emp.pending_amount || 0} ج.م
                      </td>
                      <td style={{ padding: '12px 16px', color: '#10B981', fontWeight: 'bold' }}>
                        {emp.paid_amount || 0} ج.م
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {emp.pending_amount > 0 && (
                          <button
                            onClick={() => {
                              setSelectedUserForPayout(emp);
                              setPayoutForm({ amount: emp.pending_amount, paymentMethod: 'cash', notes: '' });
                              setShowPayoutModal(true);
                            }}
                            style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                          >
                            💵 صرف وتصفية العمولات
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Earnings Audit Logs */}
          <div style={{ background: '#1E293B', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155', padding: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '14px', color: '#F8FAFC' }}>
              سجل العمولات التفصيلي الحسابي
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#0F172A', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 14px' }}>التاريخ</th>
                  <th style={{ padding: '10px 14px' }}>الموظف</th>
                  <th style={{ padding: '10px 14px' }}>القاعدة / المرجع</th>
                  <th style={{ padding: '10px 14px' }}>مبلغ العمليات (Base)</th>
                  <th style={{ padding: '10px 14px' }}>قيمة العمولة المستحقة</th>
                  <th style={{ padding: '10px 14px' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {earnings.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>لا توجد سجلات عمولات في الوقت الحالي</td>
                  </tr>
                ) : (
                  earnings.map((e) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '10px 14px', color: '#94A3B8' }}>{new Date(e.created_at).toLocaleString('ar-EG')}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 'bold' }}>{e.username}</td>
                      <td style={{ padding: '10px 14px' }}>{e.rule_title || 'عمولة مبيعات'}</td>
                      <td style={{ padding: '10px 14px' }}>{e.base_amount} ج.م</td>
                      <td style={{ padding: '10px 14px', color: '#10B981', fontWeight: 'bold' }}>{e.commission_amount} ج.م</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', background: e.status === 'paid' ? '#064E3B' : e.status === 'cancelled' ? '#451A1A' : '#292524', color: e.status === 'paid' ? '#10B981' : e.status === 'cancelled' ? '#EF4444' : '#F59E0B' }}>
                          {e.status === 'paid' ? 'تم الصرف' : e.status === 'cancelled' ? 'ملغاة' : 'مستحقة'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* COMMISSION RULES GRID */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {rules.length === 0 ? (
            <div style={{ color: '#94A3B8', padding: '30px', textAlign: 'center', gridColumn: '1/-1' }}>لا توجد قواعد عمولات معرفة حتى الآن</div>
          ) : (
            rules.map((rule) => {
              const targetInfo = TARGET_TYPES.find((t) => t.key === rule.target_type);
              const calcInfo = CALC_TYPES.find((c) => c.key === rule.calculation_type);

              return (
                <div
                  key={rule.id}
                  style={{
                    background: '#1E293B',
                    borderRadius: '12px',
                    padding: '16px',
                    border: `1px solid ${rule.is_active ? '#3B82F6' : '#334155'}`,
                    opacity: rule.is_active ? 1 : 0.65,
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#F8FAFC' }}>{rule.title}</span>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#0F172A', color: rule.is_active ? '#10B981' : '#64748B' }}>
                        {rule.is_active ? 'مفعلة ✅' : 'معطلة ⛔'}
                      </span>
                    </div>

                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3B82F6', marginBottom: '10px' }}>
                      {rule.rate_value} {rule.calculation_type === 'percentage' ? '%' : 'ج.م'}
                      <span style={{ fontSize: '12px', color: '#94A3B8', marginRight: '6px' }}>({calcInfo?.label})</span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>الهدف: <strong>{targetInfo?.label}</strong> {rule.product_name || rule.category_name || rule.employee_name ? `(${rule.product_name || rule.category_name || rule.employee_name})` : ''}</div>
                      {rule.min_sales_threshold > 0 && <div>الحد الأدنى للاستحقاق: <strong>{rule.min_sales_threshold} ج.م</strong></div>}
                      {rule.description && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>{rule.description}</div>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '10px', borderTop: '1px solid #334155' }}>
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      style={{ flex: 1, background: rule.is_active ? '#334155' : '#10B981', color: '#FFF', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      {rule.is_active ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      style={{ background: '#EF444422', color: '#EF4444', border: '1px solid #EF4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* CREATE RULE MODAL */}
      {showRuleModal && (
        <Modal title="إضافة قاعدة عمولة جديدة" onClose={() => setShowRuleModal(false)}>
          <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>عنوان القاعدة *</label>
              <input
                type="text"
                placeholder="مثال: عمولة 5% على قسم الملابس الرجالي"
                value={ruleForm.title}
                onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>الهدف الخاضع للعمولة</label>
                <select
                  value={ruleForm.target_type}
                  onChange={(e) => setRuleForm({ ...ruleForm, target_type: e.target.value, target_id: '' })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  {TARGET_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>طريقة الحساب</label>
                <select
                  value={ruleForm.calculation_type}
                  onChange={(e) => setRuleForm({ ...ruleForm, calculation_type: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  {CALC_TYPES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Target Selector */}
            {ruleForm.target_type === 'product' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اختر المنتج</label>
                <select
                  value={ruleForm.target_id}
                  onChange={(e) => setRuleForm({ ...ruleForm, target_id: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  <option value="">-- اختر المنتج --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {ruleForm.target_type === 'category' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اختر التصنيف</label>
                <select
                  value={ruleForm.target_id}
                  onChange={(e) => setRuleForm({ ...ruleForm, target_id: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  <option value="">-- اختر التصنيف --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            {ruleForm.target_type === 'employee' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اختر الموظف</label>
                <select
                  value={ruleForm.target_id}
                  onChange={(e) => setRuleForm({ ...ruleForm, target_id: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  <option value="">-- اختر الموظف --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>قيمة النسبة أو المبلغ الثابت *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={ruleForm.rate_value}
                  onChange={(e) => setRuleForm({ ...ruleForm, rate_value: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>الحد الأدنى للمبيعات للطلب (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  value={ruleForm.min_sales_threshold}
                  onChange={(e) => setRuleForm({ ...ruleForm, min_sales_threshold: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>الوصف والشروط (اختياري)</label>
              <textarea
                rows="2"
                placeholder="تفاصيل وشروط تطبيق هذه العمولة..."
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
              />
            </div>

            <button type="submit" style={{ background: '#3B82F6', color: '#FFF', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
              حفظ وتأكيد القاعدة
            </button>
          </form>
        </Modal>
      )}

      {/* PAYOUT MODAL */}
      {showPayoutModal && selectedUserForPayout && (
        <Modal title={`صرف عمولات للموظف: ${selectedUserForPayout.username}`} onClose={() => setShowPayoutModal(false)}>
          <form onSubmit={handleConfirmPayout} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>
              إجمالي العمولات المستحقة المعلقة: <strong style={{ color: '#F59E0B' }}>{selectedUserForPayout.pending_amount} ج.م</strong>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>المبلغ المراد صرفه (ج.م)</label>
              <input
                type="number"
                min="1"
                max={selectedUserForPayout.pending_amount}
                value={payoutForm.amount}
                onChange={(e) => setPayoutForm({ ...payoutForm, amount: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>طريقة الدفع</label>
              <select
                value={payoutForm.paymentMethod}
                onChange={(e) => setPayoutForm({ ...payoutForm, paymentMethod: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
              >
                <option value="cash">نقداً من الدرج / الخزينة</option>
                <option value="bank_transfer">تحويل بنكي / فودافون كاش</option>
                <option value="with_salary">إضافة لمرتب الشهر</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>ملاحظات وتفاصيل إذن الصرف</label>
              <input
                type="text"
                placeholder="أدخل ملاحظات الصرف..."
                value={payoutForm.notes}
                onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
              />
            </div>

            <button type="submit" style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
              تأكيد وتسوية إذن الصرف
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
