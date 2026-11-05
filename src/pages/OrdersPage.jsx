import { useState, useEffect, useCallback } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import Modal from '../components/Modal.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as ordersApi from '../api/orders.js';
import * as productsApi from '../api/products.js';
import * as usersApi from '../api/users.js';
import '../styles/orders.css';

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
  { key: 'new', label: 'جديد', color: '#EAB308', bg: '#292524' },
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

export default function OrdersPage({ onNavigate, onCheckoutOrder }) {
  const { getTerm, configuration } = useBusinessProfile();
  const isAutoWorkshop = configuration?.profile?.key === 'auto_workshop';
  const isSpareParts = configuration?.profile?.key === 'spare_parts';
  const isAutomotiveProfile = isAutoWorkshop || isSpareParts;
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
  const [orderProductVariants, setOrderProductVariants] = useState([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [orderItemQuantity, setOrderItemQuantity] = useState(1);

  // New Order Form State
  const [formData, setFormData] = useState({
    order_type: isAutoWorkshop ? 'maintenance' : 'online',
    customer_name: '',
    customer_phone: '',
    assigned_user_id: '',
    priority: 'medium',
    due_date: '',
    estimated_amount: 0,
    paid_amount: 0,
    vehicle_plate: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    odometer: '',
    fault_description: '',
    requested_part: '',
    part_number: '',
    requested_quantity: '1',
    notes: '',
    items: []
  });

  const loadData = useCallback(async () => {
    if (!isBridgeAvailable()) return;
    try {
      setLoading(true);
      const filters = {};
      if (filterType !== 'all') filters.order_type = filterType;
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (filterPriority !== 'all') filters.priority = filterPriority;
      if (searchQuery.trim()) filters.search = searchQuery.trim();

      const [ordersList, orderStats, allUsers] = await Promise.all([
        ordersApi.getAllOrders(filters),
        ordersApi.getOrderStats(),
        usersApi.getAllUsers.isAvailable() ? usersApi.getAllUsers() : []
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
      await ordersApi.updateOrderStatus(orderId, newStatus, 'تغيير السحب والإفلات السريع');
      loadData();
    } catch (err) {
      console.error('فشل تحديث حالة الطلب:', err);
      alert(err.message || 'تعذر تحديث حالة الطلب');
      loadData(); // Rollback on error
    }
  }

  // Handle Create Order
  async function handleCreateOrder(e) {
    e.preventDefault();
    if (isSpareParts && (!formData.customer_name.trim() || !formData.customer_phone.trim())) {
      alert('يرجى إدخال اسم العميل ورقم هاتفه');
      return;
    }
    if (!isSpareParts && !formData.customer_name && !formData.customer_phone) {
      alert('يرجى إدخال اسم العميل أو رقم الهاتف');
      return;
    }
    if (isAutoWorkshop && formData.order_type === 'maintenance'
      && (!formData.vehicle_plate.trim() || !formData.fault_description.trim())) {
      alert('يرجى إدخال رقم لوحة السيارة ووصف العطل');
      return;
    }
    if (isSpareParts && (!formData.requested_part.trim() || !Number.isInteger(Number(formData.requested_quantity)) || Number(formData.requested_quantity) <= 0)) {
      alert('يرجى إدخال اسم قطعة الغيار وكمية صحيحة');
      return;
    }

    try {
      await ordersApi.createOrder({
        ...formData,
        order_type: isSpareParts ? 'online' : formData.order_type,
        requested_part: isSpareParts ? formData.requested_part : undefined,
        part_number: isSpareParts ? formData.part_number : undefined,
        vehicle_year: formData.vehicle_year ? Number(formData.vehicle_year) : null,
        odometer: formData.odometer ? Number(formData.odometer) : null,
        requested_quantity: Number(formData.requested_quantity) || 1,
      }, formData.items);
      setShowFormModal(false);
      setFormData({
        order_type: isAutoWorkshop ? 'maintenance' : 'online',
        customer_name: '',
        customer_phone: '',
        assigned_user_id: '',
        priority: 'medium',
        due_date: '',
        estimated_amount: 0,
        paid_amount: 0,
        vehicle_plate: '',
        vehicle_make: '',
        vehicle_model: '',
        vehicle_year: '',
        odometer: '',
        fault_description: '',
        requested_part: '',
        part_number: '',
        requested_quantity: '1',
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
      const updated = await ordersApi.addOrderComment(selectedOrder.id, commentText);
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
      const fullOrder = await ordersApi.getOrderById(orderId);
      setSelectedOrder(fullOrder);
      setSelectedVariantId('');
      setOrderItemQuantity(1);
      if (fullOrder?.order_type === 'maintenance') {
        try {
          const products = await productsApi.getAllProductsWithVariants();
          setOrderProductVariants((products || []).flatMap((product) => (
            (product.variants || []).map((variant) => ({
              ...variant,
              productName: product.name,
            }))
          )));
        } catch (err) {
          console.error('فشل تحميل قطع الغيار لأمر الشغل:', err);
          alert('تعذر تحميل قائمة قطع الغيار والخدمات');
        }
      }
    } catch (err) {
      console.error('فشل جلب تفاصيل الطلب:', err);
      alert(err.message || 'تعذر جلب تفاصيل الطلب');
    }
  }

  async function handleAddOrderItem(e) {
    e.preventDefault();
    if (!selectedOrder || !selectedVariantId) return;

    try {
      const updatedOrder = await ordersApi.addOrderItem(selectedOrder.id, {
        variantId: Number(selectedVariantId),
        quantity: Number(orderItemQuantity),
      });
      setSelectedOrder(updatedOrder);
      setSelectedVariantId('');
      setOrderItemQuantity(1);
      loadData();
    } catch (err) {
      alert(err.message || 'تعذر إضافة القطعة إلى أمر الشغل');
    }
  }

  return (
    <div className="orders-page" style={{ padding: '24px', color: '#0F172A' }}>
      {/* Header & Stats Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#0F172A' }}>مركز {getTerm('order', 'العمليات والطلبات')}</h1>
          <p style={{ color: '#475569', margin: '4px 0 0 0', fontSize: '14px', fontWeight: '500' }}>
            {isSpareParts
              ? 'تسجيل طلبات قطع الغيار ومطابقتها مع بيانات السيارة ومتابعة التوريد'
              : isAutoWorkshop
                ? 'استلام السيارات ومتابعة أوامر الإصلاح وقطع الغيار حتى التسليم'
                : 'إدارة كافة طلبات الصيانة والتفصيل والتوصيل والحجز والخدمات في مكان واحد'}
          </p>
        </div>
        <button
          onClick={() => {
            if (isAutomotiveProfile) {
              setFormData((current) => ({
                ...current,
                order_type: isAutoWorkshop ? 'maintenance' : 'online',
              }));
            }
            setShowFormModal(true);
          }}
          className="orders-primary-btn"
        >
          {isSpareParts ? '➕ طلب قطعة غيار جديد' : isAutoWorkshop ? '➕ أمر إصلاح سيارة جديد' : '➕ إضافة طلب جديد'}
        </button>
      </div>

      {/* Stats Summary Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>إجمالي الطلبات</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F8FAFC' }}>{stats.total_orders || 0}</div>
          </div>
          <div style={{ background: '#1E293B', padding: '12px 16px', borderRadius: '10px', border: '1px solid #EAB308' }}>
            <div style={{ fontSize: '12px', color: '#EAB308' }}>جديد</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EAB308' }}>{stats.new_count || 0}</div>
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
              <option key={t.key} value={t.key}>
                {isAutoWorkshop && t.key === 'maintenance' ? 'أمر إصلاح سيارة' : t.label}
              </option>
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
            className={`orders-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
          >
            لوحة كأنبان 📋
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`orders-view-btn ${viewMode === 'table' ? 'active' : ''}`}
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
                          <span className="orders-number-highlight" style={{ fontSize: '12px' }}>{ord.order_number}</span>
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
                        {ord.requested_part && (
                          <div style={{ fontSize: '12px', color: '#FDE68A', marginBottom: '8px' }}>
                            ⚙️ {ord.requested_part}{ord.requested_quantity ? ` × ${ord.requested_quantity}` : ''}
                            {ord.part_number ? ` — ${ord.part_number}` : ''}
                          </div>
                        )}
                        {(ord.vehicle_plate || ord.vehicle_make || ord.vehicle_model) && (
                          <div style={{ fontSize: '12px', color: '#5EEAD4', marginBottom: '8px' }}>
                            🚘 {[ord.vehicle_make, ord.vehicle_model, ord.vehicle_year].filter(Boolean).join(' ') || 'السيارة'}
                            {ord.vehicle_plate ? ` — ${ord.vehicle_plate}` : ''}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '11px', color: '#64748B' }}>
                                  <span>نوع: {isSpareParts && ord.requested_part ? 'طلب قطعة غيار' : ORDER_TYPES.find((type) => type.key === ord.order_type)?.label || ord.order_type}</span>
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
        <div className="orders-table-view" style={{ background: '#1E293B', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
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
                    <td className="orders-number-highlight" style={{ padding: '12px 16px' }}>{ord.order_number}</td>
                    <td style={{ padding: '12px 16px' }}>{isSpareParts && ord.requested_part ? 'طلب قطعة غيار' : ORDER_TYPES.find((type) => type.key === ord.order_type)?.label || ord.order_type}</td>
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
        <Modal
          title={isSpareParts ? 'طلب قطعة غيار للسيارة' : isAutoWorkshop ? 'فتح أمر إصلاح سيارة' : 'إضافة طلب جديد'}
          onClose={() => setShowFormModal(false)}
          width={isAutomotiveProfile ? 'min(760px, 100%)' : undefined}
        >
          <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto', padding: '0 4px' }}>
            {isSpareParts && (
              <>
                <div className="orders-notice-banner">
                  سجل القطعة المطلوبة وبيانات السيارة للتأكد من التوافق قبل اعتماد الطلب. لن يتم خصم المخزون أو تسجيل فاتورة الآن.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label className="auto-order-label">اسم قطعة الغيار المطلوبة *</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="مثال: طقم تيل فرامل أمامي"
                      value={formData.requested_part}
                      onChange={(e) => setFormData({ ...formData, requested_part: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                  <div>
                    <label className="auto-order-label">رقم القطعة الأصلي (OEM) أو رقمها التجاري</label>
                    <input
                      type="text"
                      placeholder="إن وجد"
                      value={formData.part_number}
                      onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                  <div>
                    <label className="auto-order-label">الكمية المطلوبة *</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={formData.requested_quantity}
                      onChange={(e) => setFormData({ ...formData, requested_quantity: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                  <div>
                    <label className="auto-order-label">ماركة السيارة *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: تويوتا"
                      value={formData.vehicle_make}
                      onChange={(e) => setFormData({ ...formData, vehicle_make: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                  <div>
                    <label className="auto-order-label">موديل السيارة *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: كورولا"
                      value={formData.vehicle_model}
                      onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                  <div>
                    <label className="auto-order-label">سنة الصنع</label>
                    <input
                      type="number"
                      min="1900"
                      max={new Date().getFullYear() + 1}
                      placeholder="مثال: 2020"
                      value={formData.vehicle_year}
                      onChange={(e) => setFormData({ ...formData, vehicle_year: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                  <div>
                    <label className="auto-order-label">رقم اللوحة (اختياري)</label>
                    <input
                      type="text"
                      placeholder="للتعريف بالسيارة عند الحاجة"
                      value={formData.vehicle_plate}
                      onChange={(e) => setFormData({ ...formData, vehicle_plate: e.target.value })}
                      className="auto-order-input"
                    />
                  </div>
                </div>
                <div style={{ height: '1px', background: '#E2E8F0' }} />
              </>
            )}

            {!isSpareParts && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
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
            )}

            {isAutoWorkshop && formData.order_type === 'maintenance' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  {[
                    ['vehicle_plate', 'رقم لوحة السيارة *', 'مثال: س ص ع 1234'],
                    ['vehicle_make', 'ماركة السيارة', 'مثال: تويوتا'],
                    ['vehicle_model', 'الموديل', 'مثال: كورولا'],
                    ['vehicle_year', 'سنة الصنع', ''],
                    ['odometer', 'قراءة العداد (كم)', ''],
                  ].map(([field, label, placeholder]) => (
                    <div key={field}>
                      <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>{label}</label>
                      <input
                        type={field === 'vehicle_year' || field === 'odometer' ? 'number' : 'text'}
                        min={field === 'vehicle_year' ? 1900 : 0}
                        max={field === 'vehicle_year' ? new Date().getFullYear() + 1 : undefined}
                        placeholder={placeholder}
                        required={field === 'vehicle_plate'}
                        value={formData[field]}
                        onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                        style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' }}>وصف العطل أو شكوى العميل *</label>
                  <textarea
                    rows="2"
                    required
                    value={formData.fault_description}
                    onChange={(e) => setFormData({ ...formData, fault_description: e.target.value })}
                    style={{ width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className={isAutomotiveProfile ? 'auto-order-label' : undefined} style={!isAutomotiveProfile ? { display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' } : undefined}>اسم العميل {isSpareParts ? '*' : ''}</label>
                <input
                  type="text"
                  placeholder="اسم العميل"
                  required={isSpareParts}
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  className={isAutomotiveProfile ? 'auto-order-input' : undefined}
                  style={!isAutomotiveProfile ? { width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' } : undefined}
                />
              </div>

              <div>
                <label className={isAutomotiveProfile ? 'auto-order-label' : undefined} style={!isAutomotiveProfile ? { display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' } : undefined}>رقم الهاتف {isSpareParts ? '*' : ''}</label>
                <input
                  type={isSpareParts ? 'tel' : 'text'}
                  placeholder="رقم الهاتف"
                  required={isSpareParts}
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  className={isAutomotiveProfile ? 'auto-order-input' : undefined}
                  style={!isAutomotiveProfile ? { width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' } : undefined}
                />
              </div>
            </div>

            {!isSpareParts && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            </div>}

            {isSpareParts && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="auto-order-label">موعد الحاجة للقطعة</label>
                  <input
                    type="datetime-local"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="auto-order-input"
                  />
                </div>
                <div>
                  <label className="auto-order-label">السعر المتوقع (اختياري، ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.estimated_amount}
                    onChange={(e) => setFormData({ ...formData, estimated_amount: e.target.value })}
                    className="auto-order-input"
                  />
                </div>
                <div>
                  <label className="auto-order-label">الأولوية</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="auto-order-input"
                  >
                    {PRIORITIES.map((priority) => <option key={priority.key} value={priority.key}>{priority.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {!isSpareParts && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            </div>}

            <div>
              <label className={isAutomotiveProfile ? 'auto-order-label' : undefined} style={!isAutomotiveProfile ? { display: 'block', fontSize: '13px', color: '#94A3B8', marginBottom: '4px' } : undefined}>
                {isSpareParts ? 'ملاحظات إضافية (مثل تفاصيل المحرك أو الفئة)' : 'ملاحظات أو تفاصيل الخدمة / الطلب'}
              </label>
              <textarea
                rows={isAutomotiveProfile ? '2' : '3'}
                placeholder="أدخل الملاحظات والوصف التفصيلي هنا..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className={isAutomotiveProfile ? 'auto-order-input' : undefined}
                style={!isAutomotiveProfile ? { width: '100%', background: '#0F172A', border: '1px solid #334155', color: '#FFF', padding: '8px', borderRadius: '6px' } : undefined}
              />
            </div>

            <button
              type="submit"
              className="orders-submit-btn"
            >
              {isSpareParts ? 'حفظ طلب قطعة الغيار' : isAutoWorkshop ? 'حفظ أمر الإصلاح' : 'حفظ وتأكيد الطلب'}
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
              <div>النوع: <strong>{isSpareParts && selectedOrder.requested_part ? 'طلب قطعة غيار' : ORDER_TYPES.find((type) => type.key === selectedOrder.order_type)?.label || selectedOrder.order_type}</strong></div>
              <div>المسؤول: <strong>{selectedOrder.assigned_username || 'غير معين'}</strong></div>
              <div>الحالة: <strong style={{ color: ORDER_STATUSES.find(s=>s.key===selectedOrder.status)?.color }}>{selectedOrder.status}</strong></div>
              <div>التكلفة التقديرية: <strong>{selectedOrder.estimated_amount || 0} ج.م</strong></div>
            </div>

            {(selectedOrder.vehicle_plate || selectedOrder.vehicle_make || selectedOrder.vehicle_model) && (
              <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                <div>لوحة السيارة: <strong>{selectedOrder.vehicle_plate || '-'}</strong></div>
                <div>السيارة: <strong>{[selectedOrder.vehicle_make, selectedOrder.vehicle_model, selectedOrder.vehicle_year].filter(Boolean).join(' ') || '-'}</strong></div>
                {isAutoWorkshop && (
                  <>
                    <div>قراءة العداد: <strong>{selectedOrder.odometer ? `${selectedOrder.odometer} كم` : '-'}</strong></div>
                    <div>شكوى العميل: <strong>{selectedOrder.fault_description || '-'}</strong></div>
                  </>
                )}
              </div>
            )}

            {selectedOrder.requested_part && (
              <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                <div>القطعة المطلوبة: <strong>{selectedOrder.requested_part}</strong></div>
                <div>الكمية: <strong>{selectedOrder.requested_quantity || 1}</strong></div>
                <div>رقم القطعة: <strong>{selectedOrder.part_number || '-'}</strong></div>
                <div>موعد الحاجة: <strong>{selectedOrder.due_date ? new Date(selectedOrder.due_date).toLocaleString('ar-EG') : '-'}</strong></div>
              </div>
            )}

            {selectedOrder.order_type === 'maintenance' && (
              <div style={{ background: '#0F172A', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>قطع الغيار والمصنعية</div>
                {selectedOrder.items?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
                        <span>{item.title} × {item.quantity}</span>
                        <strong>{Number(item.total_price || 0).toFixed(2)} ج.م</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '12px' }}>لم تُسجل قطع أو خدمات بعد.</div>
                )}
                {!selectedOrder.sale_id && !['delivered', 'cancelled'].includes(selectedOrder.status) && (
                  <form onSubmit={handleAddOrderItem} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) minmax(90px, 1fr) auto auto', gap: '8px' }}>
                    <select
                      required
                      value={selectedVariantId}
                      onChange={(e) => {
                        setSelectedVariantId(e.target.value);
                      }}
                      style={{ minWidth: 0, background: '#1E293B', border: '1px solid #334155', color: '#FFF', padding: '7px', borderRadius: '6px' }}
                    >
                      <option value="">اختر قطعة غيار أو خدمة</option>
                      {orderProductVariants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.productName}{variant.sku ? ` — ${variant.sku}` : ''} (المخزون: {variant.stock_quantity ?? 0})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={orderItemQuantity}
                      onChange={(e) => setOrderItemQuantity(e.target.value)}
                      aria-label="الكمية"
                      style={{ minWidth: 0, background: '#1E293B', border: '1px solid #334155', color: '#FFF', padding: '7px', borderRadius: '6px' }}
                    />
                    <div style={{ alignSelf: 'center', color: '#94A3B8', fontSize: '12px' }}>
                      {selectedVariantId
                        ? `${Number(orderProductVariants.find((item) => String(item.id) === selectedVariantId)?.selling_price || 0).toFixed(2)} ج.م`
                        : 'السعر من قائمة المنتجات'}
                    </div>
                    <button type="submit" style={{ background: '#0F766E', color: '#FFF', border: 'none', padding: '7px 10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                      إضافة
                    </button>
                  </form>
                )}
                <small style={{ display: 'block', marginTop: '8px', color: '#94A3B8' }}>
                  لا يُخصم المخزون عند التسجيل؛ الخصم يتم مرة واحدة عند إصدار فاتورة التسليم.
                </small>
              </div>
            )}

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
                <button type="submit" className="orders-primary-btn" style={{ padding: '6px 14px', fontSize: '13px' }}>
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
              {selectedOrder.sale_id ? (
                <div style={{ flex: 1, background: '#064E3B', color: '#A7F3D0', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  صدرت الفاتورة رقم #{selectedOrder.sale_id}
                </div>
              ) : selectedOrder.order_type === 'maintenance' && selectedOrder.status === 'ready' && onCheckoutOrder ? (
                <button
                  onClick={() => onCheckoutOrder(selectedOrder)}
                  style={{ flex: 1, background: '#10B981', color: '#FFF', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  🛒 إصدار فاتورة التسليم من نقطة البيع
                </button>
              ) : (
                <button
                  onClick={() => onNavigate?.('pos')}
                  style={{ flex: 1, background: '#10B981', color: '#FFF', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  🛒 فتح شاشة نقطة البيع
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
