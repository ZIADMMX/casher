import { useState, useEffect } from 'react';
import * as groceryApi from '../../api/grocery.js';
import { ProductLineIcon, TagIcon } from '../icons/PosIcons.jsx';

// Speed-key colors are stored per key (user data), so they are values, not theme tokens.
const SPEED_KEY_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const DEFAULT_SPEED_KEY_COLOR = SPEED_KEY_COLORS[0];

/**
 * SpeedKeysBar Component
 * شريط أزرار السلع السريعة بدون باركود (العيش، الخضار، البيض، الأكياس...)
 * مخصص لكاشير السوبر ماركت فائق السرعة
 */
export default function SpeedKeysBar({
  onSelectSpeedKey,
  products = [],
}) {
  const [speedKeys, setSpeedKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({
    variant_id: '',
    label: '',
    shortcut_code: '',
    color: DEFAULT_SPEED_KEY_COLOR,
    icon: '🛒',
    display_order: 0,
  });
  const [errorMsg, setErrorMsg] = useState('');

  const loadKeys = async () => {
    if (!groceryApi.getGrocerySpeedKeys.isAvailable()) return;
    try {
      setLoading(true);
      const keys = await groceryApi.getGrocerySpeedKeys();
      setSpeedKeys(keys || []);
    } catch (err) {
      console.error('Failed to load speed keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newKeyForm.variant_id) {
      setErrorMsg('يرجى اختيار الصنف المرتبط بهذا الزر');
      return;
    }
    if (!newKeyForm.label.trim()) {
      setErrorMsg('اسم الزر مطلوب');
      return;
    }

    try {
      await groceryApi.createGrocerySpeedKey({
        variant_id: Number(newKeyForm.variant_id),
        label: newKeyForm.label.trim(),
        shortcut_code: newKeyForm.shortcut_code.trim() || null,
        color: newKeyForm.color,
        icon: newKeyForm.icon || '🛒',
        display_order: Number(newKeyForm.display_order) || 0,
      });
      setShowAddModal(false);
      setNewKeyForm({
        variant_id: '',
        label: '',
        shortcut_code: '',
        color: DEFAULT_SPEED_KEY_COLOR,
        icon: '🛒',
        display_order: 0,
      });
      loadKeys();
    } catch (err) {
      setErrorMsg(err.message || 'تعذر إضافة الزر السريع');
    }
  };

  const handleDeleteKey = async (keyId, e) => {
    e.stopPropagation();
    if (!window.confirm('هل تريد بالتأكيد حذف هذا الزر السريع؟')) return;
    try {
      await groceryApi.deleteGrocerySpeedKey(keyId);
      loadKeys();
    } catch (err) {
      console.error('Failed to delete speed key:', err);
    }
  };

  // جميع الـ variants المتاحة للاختيار في القائمة المنسدلة
  const allVariants = products.flatMap((p) =>
    (p.variants || []).map((v) => ({
      id: v.id,
      name: `${p.name} ${v.size || ''} ${v.color || ''}`.trim(),
      price: v.selling_price,
      barcode: v.barcode || v.sku,
    }))
  );

  return (
    <div className="pos-speed-keys-container">
      <div className="pos-speed-keys-header">
        <div className="speed-keys-title">
          <span className="speed-keys-icon"><TagIcon size={16} /></span>
          <span className="speed-keys-heading">سلع سريعة بدون باركود (PLU)</span>
        </div>

        <div className="speed-keys-actions">
          <button
            type="button"
            className="speed-keys-add-btn"
            onClick={() => setShowAddModal(true)}
            title="إضافة زر سلعة سريعة جديدة"
          >
            + إضافة زر
          </button>
        </div>
      </div>

      <div className="pos-speed-keys-scroll">
        {loading ? (
          <div className="speed-keys-empty-hint">
            <span>جاري التحميل...</span>
          </div>
        ) : speedKeys.length === 0 ? (
          <div className="speed-keys-empty-hint">
            <span>لا توجد أزرار سريعة حالياً. اضغط على &quot;+ إضافة زر&quot; لإضافة سلع شائعة مثل: عيش، بيض، ليمون، أكياس...</span>
          </div>
        ) : (
          speedKeys.map((key) => (
            <button
              key={key.id}
              type="button"
              className="pos-speed-key-btn"
              style={{ '--btn-accent': key.color || DEFAULT_SPEED_KEY_COLOR }}
              onClick={() => onSelectSpeedKey(key)}
            >
              <div className="speed-key-top">
                <span className="speed-key-emoji"><ProductLineIcon emoji={key.icon || '🛒'} size={18} /></span>
                {key.shortcut_code && (
                  <span className="speed-key-shortcut" title={`اختصار: ${key.shortcut_code}`}>
                    {key.shortcut_code}
                  </span>
                )}
                <span
                  className="speed-key-del"
                  onClick={(e) => handleDeleteKey(key.id, e)}
                  title="حذف الزر"
                >
                  ×
                </span>
              </div>
              <span className="speed-key-label">{key.label}</span>
              <span className="speed-key-price">{Number(key.selling_price || 0).toFixed(2)} ج.م</span>
            </button>
          ))
        )}
      </div>

      {/* مودال إنشاء زر سريع جديد */}
      {showAddModal && (
        <div className="fox-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="fox-modal-card speed-key-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fox-modal-header">
              <div className="fox-modal-title">
                <span>⚡</span>
                <h4>إضافة زر سلعة سريعة لكاشير السوبر ماركت</h4>
              </div>
              <button type="button" className="fox-modal-close" onClick={() => setShowAddModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="fox-modal-body">
              {errorMsg && (
                <div className="fox-alert-error speed-key-form-error">
                  {errorMsg}
                </div>
              )}

              <div className="form-field-group">
                <label className="form-label">الصنف المرتبط من المخزن: <span className="req-star">*</span></label>
                <select
                  className="fox-lux-input"
                  value={newKeyForm.variant_id}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const found = allVariants.find((v) => String(v.id) === selId);
                    setNewKeyForm((prev) => ({
                      ...prev,
                      variant_id: selId,
                      label: prev.label || (found ? found.name : ''),
                    }));
                  }}
                  required
                >
                  <option value="">-- اختر صنفاً --</option>
                  {allVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.price} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field-group">
                <label className="form-label">الاسم الظاهر على الزر (مثال: عيش بلدي، كيس تسوق): <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="fox-lux-input"
                  placeholder="مثال: عيش فينو"
                  value={newKeyForm.label}
                  onChange={(e) => setNewKeyForm({ ...newKeyForm, label: e.target.value })}
                  required
                />
              </div>

              <div className="speed-key-form-grid">
                <div className="form-field-group">
                  <label className="form-label">كود اختصار سريع (Shortcut):</label>
                  <input
                    type="text"
                    className="fox-lux-input"
                    placeholder="مثال: 1 أو B1 أو F1"
                    value={newKeyForm.shortcut_code}
                    onChange={(e) => setNewKeyForm({ ...newKeyForm, shortcut_code: e.target.value })}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-label">رمز / إيموجي الزر:</label>
                  <select
                    className="fox-lux-input"
                    value={newKeyForm.icon}
                    onChange={(e) => setNewKeyForm({ ...newKeyForm, icon: e.target.value })}
                  >
                    <option value="🥖">🥖 عيش ومخبوزات</option>
                    <option value="🥚">🥚 بيض</option>
                    <option value="🧀">🧀 أجبان وألبان</option>
                    <option value="🍋">🍋 ليمون وخضار</option>
                    <option value="🛍️">🛍️ أكياس تسوق</option>
                    <option value="🥤">🥤 مشروبات</option>
                    <option value="🛒">🛒 عام / أخرى</option>
                  </select>
                </div>
              </div>

              <div className="form-field-group">
                <label className="form-label">لون تمييز الزر:</label>
                <div className="speed-key-swatches" role="group" aria-label="لون تمييز الزر">
                  {SPEED_KEY_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className="speed-key-swatch"
                      aria-pressed={newKeyForm.color === c}
                      aria-label={`اللون ${c}`}
                      onClick={() => setNewKeyForm({ ...newKeyForm, color: c })}
                      style={{ '--swatch': c }}
                    />
                  ))}
                </div>
              </div>

              <div className="fox-modal-actions speed-key-form-actions">
                <button type="button" className="fox-btn-secondary" onClick={() => setShowAddModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="fox-btn-primary">
                  حفظ الزر السريع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
