import { useState, useEffect, useCallback } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import Modal from '../components/Modal.jsx';

const ORDER_TYPES = [
  { key: 'all', label: 'جميع الأنواع' },
  { key: 'pos_sale', label: 'بيع متجر' },
  { key: 'online', label: 'طلب أونلاين' },
  { key: 'delivery', label: 'توصيل' },
  { key: 'reservation', label: 'حجز' },
  { key: 'maintenance', label: 'صيانة' },
  { key: 'tailoring', label: 'تفصيل' },
  { key: 'manufacturing', label: 'تصنيع' },
  { key: 'service', label: 'خدمة' }
];

const ORDER_STATUSES = [
  { key: 'new', label: 'جديد', color: '#3B82F6', bg: '#1E293B' },
  { key: 'in_progress', label: 'قيد التنفيذ', color: '#F59E0B', bg: '#292524' },
  { key: 'ready', label: 'جاهز للتسليم', color: '#10B981', bg: '#064E3B' },
  { key: 'delivered', label: 'تم التسليم', color: '#6B7280', bg: '#1F2937' },
  { key: 'on_hold', label: 'معلق', color: '#EF4444', bg: '#451A1A' }
];

const PRIORITIES = [
  { key: 'low', label: 'منخفضة', badgeClass: 'priority-low' },
  { key: 'medium', label: 'متوسطة', badgeClass: 'priority-medium' },
  { key: 'high', label: 'عالية', badgeClass: 'priority-high' },
  { key: 'urgent', label: 'عاجلة 🔥', badgeClass: 'priority-urgent' }
];

export default function OrdersPage({ onNavigate }) {
  const { getTerm } = useBusinessProfile();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'table'

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [commentText, setCommentText] = useState('');

  // New Order Form State
  const [formData, setFormData] = useState({
    order_type: 'online',
    customer_name: '',
    customer_phone: '',
    assigned_user_id: '',
    priority: 'medium',
    due_date: '',
    estimated_amount: 0,
    paid_amount: 0,
    notes: '',
    items: []
  });

  const loadData = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      setLoading(true);
      const filters = {};
      if (filterType !== 'all') filters.order_type = filterType;
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (filterPriority !== 'all') filters.priority = filterPriority;
      if (searchQuery.trim()) filters.search = searchQuery.trim();

      const [ordersList, orderStats, allUsers] = await Promise.all([
        window.electronAPI.getAllOrders(filters),
        window.electronAPI.getOrderStats(),
        window.electronAPI.getAllUsers ? window.electronAPI.getAllUsers() : []
      ]);

      setOrders(ordersList || []);
      setStats(orderStats || null);
      setUsers(allUsers || []);
    } catch (err) {
      console.error('فشل جلب بيانات الطلبات:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, filterPriority, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Optimistic Status Change
  async function handleStatusChange(orderId, newStatus) {
    // Optimistic UI Update
    setOrders((prev) =>
      prev.map((ord) => (ord.id === orderId ? { ...ord, status: newStatus } : ord))
    );

    try {
      await window.electronAPI.updateOrderStatus(orderId, newStatus, 'تغيير السحب والإفلات السريع');
      loadData();
    } catch (err) {
      console.error('فشل تحديث حالة الطلب:', err);
      loadData(); // Rollback on error
    }
  }

  // Handle Create Order
  async function handleCreateOrder(e) {
    e.preventDefault();
    if (!formData.customer_name && !formData.customer_phone) {
      alert('يرجى إدخال اسم العميل أو رقم الهاتف');
      return;
    }

    try {
      await window.electronAPI.createOrder(formData, formData.items);
      setShowFormModal(false);
      setFormData({
        order_type: 'online',
        customer_name: '',
        customer_phone: '',
        assigned_user_id: '',
        priority: 'medium',
        due_date: '',
        estimated_amount: 0,
        paid_amount: 0,
        notes: '',
        items: []
      });
      loadData();
    } catch (err) {
      alert('فشل إنشاء الطلب: ' + err.message);
    }
  }

  // Add Comment
  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim() || !selectedOrder) return;

    try {
      const updated = await window.electronAPI.addOrderComment(selectedOrder.id, commentText);
      setSelectedOrder(updated);
      setCommentText('');
      loadData();
    } catch (err) {
      alert('فشل إضافة التعليق: ' + err.message);
    }
  }

  // Open Full Order Details
  async function handleOpenDetails(orderId) {
    try {
      const fullOrder = await window.electronAPI.getOrderById(orderId);
      setSelectedOrder(fullOrder);
    } catch (err) {
      console.error('فشل جلب تفاصيل الطلب:', err);
    }
  }

  return (
    <div className="orders-page" style={{ padding: '24px', color: '#0F172A' }}>
      {/* Header & Stats Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#0F172A' }}>مركز {getTerm('order', 'العمليات والطلبات')}</h1>
          <p style={{ color: '#475569', margin: '4px 0 0 0', fontSize: '14px', fontWeight: '500' }}>
            إدارة كافة طلبات الصيانة والتفصيل والتوصيل والحجز والخدمات في مكان واحد
          </p>
        </div>
        <button
          onClick={() => setShowFormModal(true)}
          style={{
            backgroundColor: '#3B82F6',
            color: '#FFF',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          ➕ إضافة طلب جديد
        </button>
      </div>

      {/* Stats Summary Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>إجمالي الطلبات</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F8FAFC' }}>{stats.total_orders || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #3B82F6' }}>
            <div style={{ fontSize: '12px', color: '#3B82F6' }}>جديد</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3B82F6' }}>{stats.new_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #F59E0B' }}>
            <div style={{ fontSize: '12px', color: '#F59E0B' }}>قيد التنفيذ</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>{stats.in_progress_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #10B981' }}>
            <div style={{ fontSize: '12px', color: '#10B981' }}>جاهز للتسليم</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981' }}>{stats.ready_count || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #EF4444' }}>
            <div style={{ fontSize: '12px', color: '#EF4444' }}>متأخرة ⚠️</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444' }}>{stats.overdue_count || 0}</div>
          </div>
        </div>
      )}

      {/* Filters Bar & View Mode Toggle */}
      <div style={{ background: '#1E293B', padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="بحث برقم الطلب، اسم العميل، الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px 14px', borderRadius: '6px', width: '240px' }}
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px 14px', borderRadius: '6px' }}
          >
            {ORDER_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px 14px', borderRadius: '6px' }}
          >
            <option value="all">جميع الحالات</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            style={{ background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px 14px', borderRadius: '6px' }}
          >
            <option value="all">جميع الأولويات</option>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '4px', background: '#0F172A', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setViewMode('kanban')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'kanban' ? '#3B82F6' : 'transparent',
              color: '#FFF',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            لوحة كأنبان 📋
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'table' ? '#3B82F6' : 'transparent',
              color: '#FFF',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            جدول 📊
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>جاري تحميل الطلبات...</div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'start' }}>
          {ORDER_STATUSES.map((statusCol) => {
            const columnOrders = orders.filter((o) => o.status === statusCol.key);

            return (
              <div
                key={statusCol.key}
                style={{
                  background: '#0F172A',
                  borderRadius: '12px',
                  border: `1px solid ${statusCol.color}33`,
                  padding: '14px',
                  minHeight: '450px'
                }}
              >
                {/* Column Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid #1E293B' }}>
                  <span style={{ fontWeight: 'bold', color: statusCol.color, fontSize: '15px' }}>{statusCol.label}</span>
                  <span style={{ background: '#1E293B', color: '#94A3B8', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>
                    {columnOrders.length}
                  </span>
                </div>

                {/* Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {columnOrders.length === 0 ? (
                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>لا توجد طلبات</div>
                  ) : (
                    columnOrders.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => handleOpenDetails(ord.id)}
                        style={{
                          background: '#1E293B',
                          borderRadius: '8px',
                          padding: '12px',
                          border: '1px solid #334155',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                          transition: 'transform 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#3B82F6' }}>{ord.order_number}</span>
                          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: ord.priority === 'urgent' ? '#EF444422' : '#334155', color: ord.priority === 'urgent' ? '#EF4444' : '#94A3B8' }}>
                            {ord.priority === 'urgent' ? 'عاجل 🔥' : ord.priority}
                          </span>
                        </div>

                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#F8FAFC', marginBottom: '4px' }}>
                          {ord.customer_name || ord.registered_customer_name || 'عميل غير مسجل'}
                        </div>

                        {ord.customer_phone && (
                          <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '8px' }}>📞 {ord.customer_phone}</div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '11px', color: '#64748B' }}>
                          <span>نوع: {ord.order_type}</span>
                          <span>المسؤول: {ord.assigned_username || 'غير معين'}</span>
                        </div>

                        {/* Quick Status Switcher buttons */}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }} onClick={(e) => e.stopPropagation()}>
                          {ORDER_STATUSES.filter((s) => s.key !== ord.status).map((st) => (
                            <button
                              key={st.key}
                              onClick={() => handleStatusChange(ord.id, st.key)}
                              style={{
                                flex: 1,
                                fontSize: '10px',
                                padding: '3px 0',
                                border: 'none',
                                borderRadius: '4px',
                                background: '#0F172A',
                                color: st.color,
                                cursor: 'pointer'
                              }}
                              title={`نقل إلى ${st.label}`}
                            >
                              ➡️ {st.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div style={{ background: '#1E293B', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0F172A', color: '#94A3B8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 16px' }}>رقم الطلب</th>
                <th style={{ padding: '12px 16px' }}>النوع</th>
                <th style={{ padding: '12px 16px' }}>العميل</th>
                <th style={{ padding: '12px 16px' }}>المسؤول</th>
                <th style={{ padding: '12px 16px' }}>الحالة</th>
                <th style={{ padding: '12px 16px' }}>الأولوية</th>
                <th style={{ padding: '12px 16px' }}>الموعد</th>
                <th style={{ padding: '12px 16px' }}>التكلفة التقديرية</th>
                <th style={{ padding: '12px 16px' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>لا توجد طلبات تطابق الفلترة</td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#3B82F6' }}>{ord.order_number}</td>
                    <td style={{ padding: '12px 16px' }}>{ord.order_type}</td>
                    <td style={{ padding: '12px 16px' }}>{ord.customer_name || ord.registered_customer_name || '-'}</td>
                    <td style={{ padding: '12px 16px' }}>{ord.assigned_username || 'غير معين'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', background: '#0F172A', color: ORDER_STATUSES.find(s=>s.key===ord.status)?.color }}>
                        {ORDER_STATUSES.find(s=>s.key===ord.status)?.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{ord.priority}</td>
                    <td style={{ padding: '12px 16px' }}>{ord.due_date ? new Date(ord.due_date).toLocaleDateString('ar-EG') : '-'}</td>
                    <td style={{ padding: '12px 16px' }}>{ord.estimated_amount || 0} ج.م</td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => handleOpenDetails(ord.id)}
                        style={{ background: '#334155', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE ORDER MODAL */}
      {showFormModal && (
        <Modal title="إضافة طلب جديد" onClose={() => setShowFormModal(false)}>
          <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>نوع الطلب *</label>
                <select
                  value={formData.order_type}
                  onChange={(e) => setFormData({ ...formData, order_type: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  {ORDER_TYPES.filter(t => t.key !== 'all').map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>الأولوية</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>اسم العميل</label>
                <input
                  type="text"
                  placeholder="اسم العميل"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>رقم الهاتف</label>
                <input
                  type="text"
                  placeholder="رقم الهاتف"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>الموظف المسؤول</label>
                <select
                  value={formData.assigned_user_id}
                  onChange={(e) => setFormData({ ...formData, assigned_user_id: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                >
                  <option value="">-- اختياري --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>تاريخ / موعد الاستحقاق</label>
                <input
                  type="datetime-local"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>المبلغ التقديري (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.estimated_amount}
                  onChange={(e) => setFormData({ ...formData, estimated_amount: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>العربون / المدفوع (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.paid_amount}
                  onChange={(e) => setFormData({ ...formData, paid_amount: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>ملاحظات أو تفاصيل الخدمة / الطلب</label>
              <textarea
                rows="3"
                placeholder="أدخل الملاحظات والوصف التفصيلي هنا..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
              />
            </div>

            <button
              type="submit"
              style={{ background: '#3B82F6', color: '#FFF', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
            >
              حفظ وتأكيد الطلب
            </button>
          </form>
        </Modal>
      )}

      {/* FULL ORDER DETAILS & CHAT MODAL */}
      {selectedOrder && (
        <Modal title={`تفاصيل الطلب: ${selectedOrder.order_number}`} onClose={() => setSelectedOrder(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Header info */}
            <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div>العميل: <strong>{selectedOrder.customer_name || selectedOrder.registered_customer_name || 'غير معروف'}</strong></div>
              <div>الهاتف: <strong>{selectedOrder.customer_phone || '-'}</strong></div>
              <div>النوع: <strong>{selectedOrder.order_type}</strong></div>
              <div>المسؤول: <strong>{selectedOrder.assigned_username || 'غير معين'}</strong></div>
              <div>الحالة: <strong style={{ color: ORDER_STATUSES.find(s=>s.key===selectedOrder.status)?.color }}>{selectedOrder.status}</strong></div>
              <div>التكلفة التقديرية: <strong>{selectedOrder.estimated_amount || 0} ج.م</strong></div>
            </div>

            {/* Notes */}
            {selectedOrder.notes && (
              <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>الملاحظات والوصف:</div>
                <div style={{ fontSize: '13px' }}>{selectedOrder.notes}</div>
              </div>
            )}

            {/* Internal Comments Chat */}
            <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>الدردشة والتعليقات الداخلية ({selectedOrder.comments?.length || 0})</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                {selectedOrder.comments && selectedOrder.comments.length > 0 ? (
                  selectedOrder.comments.map((c) => (
                    <div key={c.id} style={{ background: '#1E293B', padding: '8px 10px', borderRadius: '6px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94A3B8', marginBottom: '2px' }}>
                        <span>👤 {c.username || 'مستخدم'}</span>
                        <span>{new Date(c.created_at).toLocaleString('ar-EG')}</span>
                      </div>
                      <div style={{ color: '#F8FAFC' }}>{c.comment}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#64748B', fontSize: '12px' }}>لا توجد تعليقات حتى الآن</div>
                )}
              </div>

              <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="أكتب تعليقاً..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  style={{ flex: 1, background: '#1E293B', border: '1px solid #334155', color: '#FFF', padding: '6px 10px', borderRadius: '6px', fontSize: '13px' }}
                />
                <button type="submit" style={{ background: '#3B82F6', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  إرسال
                </button>
              </form>
            </div>

            {/* Activity History Audit Trail */}
            <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>سجل الحركة والتغييرات</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#94A3B8' }}>
                {selectedOrder.history && selectedOrder.history.length > 0 ? (
                  selectedOrder.history.map((h) => (
                    <div key={h.id} style={{ borderBottom: '1px stroke #1E293B', paddingBottom: '4px' }}>
                      ⏱️ {new Date(h.created_at).toLocaleString('ar-EG')} - <strong>{h.username || 'النظام'}</strong>: {h.description || h.action_type}
                    </div>
                  ))
                ) : (
                  <div>لا يوجد سجل حركة</div>
                )}
              </div>
            </div>

            {/* Quick POS Converter Action */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('pos');
                  }
                }}
                style={{ flex: 1, background: '#10B981', color: '#FFF', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                🛒 تحويل إلى شاشة الكاشير (POS)
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
