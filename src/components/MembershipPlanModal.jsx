import { useState, useMemo, useEffect } from 'react';
import '../styles/membership-modal.css';

const BILLING_CYCLES = [
  { key: 'monthly', label: 'شهري', days: 30 },
  { key: 'quarterly', label: 'ربع سنوي', days: 90 },
  { key: 'yearly', label: 'سنوي', days: 365 },
];

export default function MembershipPlanModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  availableProducts = [],
  availableBranches = [],
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [durationDays, setDurationDays] = useState(30);
  const [selectedServices, setSelectedServices] = useState([]);
  const [totalSessions, setTotalSessions] = useState('');
  const [advanceBookingDays, setAdvanceBookingDays] = useState('');
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [trialDays, setTrialDays] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [badgeText, setBadgeText] = useState('');
  const [badgeColor, setBadgeColor] = useState('#3b82f6');
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  // Initialize or reset form
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      setPrice(initialData.price !== undefined ? String(initialData.price) : '0');
      setOriginalPrice(initialData.original_price ? String(initialData.original_price) : '');
      setBillingCycle(initialData.billing_cycle || 'monthly');
      setDurationDays(initialData.duration_days || 30);
      setSelectedServices(Array.isArray(initialData.eligible_services) ? initialData.eligible_services : []);
      setTotalSessions(
        initialData.is_unlimited_sessions ? '' : initialData.total_credits ? String(initialData.total_credits) : ''
      );
      setAdvanceBookingDays(
        initialData.advance_booking_days ? String(initialData.advance_booking_days) : ''
      );
      setGracePeriodDays(initialData.grace_period_days !== undefined ? initialData.grace_period_days : 3);
      setTrialDays(initialData.trial_days !== undefined ? initialData.trial_days : 1);
      setIsActive(initialData.is_active !== undefined ? Boolean(initialData.is_active) : true);
      setIsFeatured(Boolean(initialData.is_featured));
      setBadgeText(initialData.badge_text || '');
      setBadgeColor(initialData.badge_color || '#3b82f6');
      setSelectedBranches(Array.isArray(initialData.branch_ids) ? initialData.branch_ids : []);
    } else {
      setName('');
      setDescription('');
      setPrice('');
      setOriginalPrice('');
      setBillingCycle('monthly');
      setDurationDays(30);
      setSelectedServices([]);
      setTotalSessions('');
      setAdvanceBookingDays('');
      setGracePeriodDays(3);
      setTrialDays(1);
      setIsActive(true);
      setIsFeatured(false);
      setBadgeText('');
      setBadgeColor('#3b82f6');
      // Default to all branches if available
      if (availableBranches.length > 0) {
        setSelectedBranches(availableBranches.map((b) => b.id));
      } else {
        setSelectedBranches([1]);
      }
    }
  }, [initialData, availableBranches, isOpen]);

  // Calculate discount percentage
  const discountSavingsPercent = useMemo(() => {
    const p = parseFloat(price) || 0;
    const orig = parseFloat(originalPrice) || 0;
    if (orig > 0 && orig > p) {
      return Math.round(((orig - p) / orig) * 100);
    }
    return 0;
  }, [price, originalPrice]);

  // Filtered products for eligible services
  const filteredProducts = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return availableProducts;
    return availableProducts.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [availableProducts, serviceSearch]);

  const handleCycleSelect = (cycle) => {
    setBillingCycle(cycle.key);
    setDurationDays(cycle.days);
  };

  const toggleService = (prodId) => {
    setSelectedServices((prev) =>
      prev.includes(prodId) ? prev.filter((id) => id !== prodId) : [...prev, prodId]
    );
  };

  const handleSelectAllServices = () => {
    if (selectedServices.length === availableProducts.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices(availableProducts.map((p) => p.id));
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('يرجى إدخال اسم الخطة');
      return;
    }

    const numericPrice = parseFloat(price) || 0;
    const numericOriginalPrice = parseFloat(originalPrice) || 0;
    const isUnlimited = !totalSessions || parseInt(totalSessions, 10) <= 0;
    const credits = isUnlimited ? 0 : parseInt(totalSessions, 10);

    const payload = {
      name: name.trim(),
      description: description.trim(),
      type: isUnlimited ? 'time_based' : 'session_based',
      price: numericPrice,
      original_price: numericOriginalPrice,
      billing_cycle: billingCycle,
      duration_days: durationDays || 30,
      total_credits: credits,
      is_unlimited_sessions: isUnlimited ? 1 : 0,
      advance_booking_days: advanceBookingDays ? parseInt(advanceBookingDays, 10) : 0,
      grace_period_days: parseInt(gracePeriodDays, 10) || 0,
      trial_days: parseInt(trialDays, 10) || 0,
      is_active: isActive ? 1 : 0,
      is_featured: isFeatured ? 1 : 0,
      badge_text: badgeText.trim(),
      badge_color: badgeColor,
      eligible_services: selectedServices,
      branch_ids: selectedBranches,
      discount_percentage: discountSavingsPercent,
    };

    onSubmit(payload);
  };

  if (!isOpen) return null;

  // Live checklist validations
  const isNameValid = name.trim().length > 0;
  const isPriceValid = price !== '' && !isNaN(parseFloat(price)) && parseFloat(price) >= 0;
  const isServicesValid = selectedServices.length > 0;
  const isBranchesValid = selectedBranches.length > 0;

  return (
    <div className="membership-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="membership-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="membership-modal-header">
          <button
            type="button"
            className="membership-modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق"
          >
            ✕
          </button>
          <h2 id="membership-modal-title" className="membership-modal-title">
            {initialData ? 'تعديل خطة عضوية' : 'إنشاء خطة عضوية'}
          </h2>
        </div>

        {/* Scrollable Body Form */}
        <form id="membership-plan-form" onSubmit={handleFormSubmit} className="membership-modal-body">
          {/* SECTION 1: Basic Info */}
          <div className="membership-section">
            <div className="membership-section-header">
              <div className="membership-section-icon membership-icon-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <div className="membership-section-titles">
                <h3 className="membership-section-title">المعلومات الأساسية</h3>
                <span className="membership-section-subtitle">معلومات الخطة الأساسية</span>
              </div>
            </div>

            <div className="membership-form-group">
              <label className="membership-label">
                الاسم <span className="membership-required">*</span>
              </label>
              <input
                type="text"
                className="membership-input"
                placeholder="مثال: عضوية الكيك بوكسينج الشهرية"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="membership-form-group">
              <label className="membership-label">الوصف</label>
              <textarea
                className="membership-textarea"
                placeholder="أضف وصفاً توضيحياً لمزايا هذه الخطة..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="membership-divider" />

          {/* SECTION 2: Pricing */}
          <div className="membership-section">
            <div className="membership-section-header">
              <div className="membership-section-icon membership-icon-teal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M6 12h.01M18 12h.01" />
                </svg>
              </div>
              <div className="membership-section-titles">
                <h3 className="membership-section-title">التسعير</h3>
                <span className="membership-section-subtitle">تحديد التسعير ودورة الفوترة</span>
              </div>
            </div>

            <div className="membership-grid-3">
              <div className="membership-form-group">
                <label className="membership-label">
                  السعر (EGP) <span className="membership-required">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="membership-input"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>

              <div className="membership-form-group">
                <label className="membership-label">السعر الأصلي (EGP)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="membership-input"
                  placeholder="0.00"
                  value={originalPrice}
                  onChange={(e) => setOriginalPrice(e.target.value)}
                />
                <span className="membership-savings-badge">
                  وفر {discountSavingsPercent}%
                </span>
              </div>

              <div className="membership-form-group">
                <label className="membership-label">
                  دورة الفوترة <span className="membership-required">*</span>
                </label>
                <div className="membership-cycle-buttons">
                  {BILLING_CYCLES.map((cycle) => (
                    <button
                      key={cycle.key}
                      type="button"
                      className={`membership-cycle-btn ${
                        billingCycle === cycle.key ? 'active' : ''
                      }`}
                      onClick={() => handleCycleSelect(cycle)}
                    >
                      <span>📅</span>
                      <span>{cycle.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="membership-divider" />

          {/* SECTION 3: Access Control */}
          <div className="membership-section">
            <div className="membership-section-header">
              <div className="membership-section-icon membership-icon-cyan">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </div>
              <div className="membership-section-titles">
                <h3 className="membership-section-title">التحكم في الوصول</h3>
                <span className="membership-section-subtitle">تكوين الميزات والحدود</span>
              </div>
            </div>

            {/* Eligible Services */}
            <div className="membership-form-group">
              <div className="membership-label-row">
                <label className="membership-label">
                  الخدمات المؤهلة <span className="membership-required">*</span>
                </label>
                {availableProducts.length > 0 && (
                  <button
                    type="button"
                    className="membership-link-btn"
                    onClick={handleSelectAllServices}
                  >
                    {selectedServices.length === availableProducts.length
                      ? 'إلغاء تحديد الكل'
                      : 'تحديد جميع الخدمات'}
                  </button>
                )}
              </div>

              <div className="membership-services-box">
                <div
                  className="membership-services-input-wrapper"
                  onClick={() => setShowServiceDropdown(true)}
                >
                  <input
                    type="text"
                    className="membership-input membership-services-search"
                    placeholder="اختر الخدمات المشمولة في هذه الخطة أو ابحث..."
                    value={serviceSearch}
                    onChange={(e) => {
                      setServiceSearch(e.target.value);
                      setShowServiceDropdown(true);
                    }}
                    onFocus={() => setShowServiceDropdown(true)}
                  />
                  <span className="membership-search-icon">🔍</span>
                </div>

                {/* Selected chips */}
                {selectedServices.length > 0 && (
                  <div className="membership-chips-container">
                    {selectedServices.map((id) => {
                      const prod = availableProducts.find((p) => p.id === id);
                      return (
                        <span key={id} className="membership-chip">
                          {prod ? prod.name : `خدمة #${id}`}
                          <button
                            type="button"
                            className="membership-chip-remove"
                            onClick={() => toggleService(id)}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Dropdown list */}
                {showServiceDropdown && (
                  <div className="membership-services-dropdown">
                    <div className="membership-dropdown-header">
                      <span>اختر من القائمة:</span>
                      <button
                        type="button"
                        className="membership-dropdown-close"
                        onClick={() => setShowServiceDropdown(false)}
                      >
                        إغلاق ✕
                      </button>
                    </div>
                    <div className="membership-dropdown-list">
                      {filteredProducts.length === 0 ? (
                        <div className="membership-dropdown-empty">
                          لا توجد خدمات مطابقة للبحث
                        </div>
                      ) : (
                        filteredProducts.map((p) => {
                          const isSelected = selectedServices.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              className={`membership-dropdown-item ${
                                isSelected ? 'selected' : ''
                              }`}
                              onClick={() => toggleService(p.id)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="membership-checkbox"
                              />
                              <span className="membership-item-name">{p.name}</span>
                              {p.price !== undefined && (
                                <span className="membership-item-price">
                                  {p.price} ج.م
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sessions & Advance Booking */}
            <div className="membership-grid-2">
              <div className="membership-form-group">
                <label className="membership-label">إجمالي الجلسات في الدورة</label>
                <input
                  type="number"
                  min="1"
                  className="membership-input"
                  placeholder="غير محدود"
                  value={totalSessions}
                  onChange={(e) => setTotalSessions(e.target.value)}
                />
                <span className="membership-helper-text">
                  الحد الأقصى عبر دورة الفوترة كاملة، اتركه فارغاً لجعله غير محدود
                </span>
              </div>

              <div className="membership-form-group">
                <label className="membership-label">أيام الحجز المسبق</label>
                <input
                  type="number"
                  min="0"
                  className="membership-input"
                  placeholder="غير محدود"
                  value={advanceBookingDays}
                  onChange={(e) => setAdvanceBookingDays(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="membership-divider" />

          {/* SECTION 4: Renewal Settings & Badge */}
          <div className="membership-section">
            <div className="membership-section-header">
              <div className="membership-section-icon membership-icon-settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div className="membership-section-titles">
                <h3 className="membership-section-title">إعدادات التجديد</h3>
                <span className="membership-section-subtitle">إعدادات الخطة الإضافية</span>
              </div>
            </div>

            <div className="membership-grid-4">
              <div className="membership-form-group">
                <label className="membership-label">فترة السماح (أيام)</label>
                <input
                  type="number"
                  min="0"
                  className="membership-input"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                />
              </div>

              <div className="membership-form-group">
                <label className="membership-label">أيام التجربة</label>
                <input
                  type="number"
                  min="0"
                  className="membership-input"
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                />
              </div>

              <div className="membership-form-group membership-toggle-group">
                <label className="membership-label">نشطة</label>
                <label className="membership-switch">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span className="membership-slider round" />
                </label>
              </div>

              <div className="membership-form-group membership-toggle-group">
                <label className="membership-label">مميزة</label>
                <label className="membership-switch">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                  />
                  <span className="membership-slider round" />
                </label>
              </div>
            </div>

            <div className="membership-grid-2" style={{ marginTop: '14px' }}>
              <div className="membership-form-group">
                <label className="membership-label">نص الشارة</label>
                <input
                  type="text"
                  className="membership-input"
                  placeholder="مثال: الأفضل قيمة"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                />
              </div>

              <div className="membership-form-group">
                <label className="membership-label">لون الشارة</label>
                <div className="membership-color-picker-wrapper">
                  <input
                    type="text"
                    className="membership-input membership-color-text"
                    value={badgeColor}
                    onChange={(e) => setBadgeColor(e.target.value)}
                  />
                  <input
                    type="color"
                    className="membership-color-input"
                    value={badgeColor}
                    onChange={(e) => setBadgeColor(e.target.value)}
                  />
                  <div
                    className="membership-color-preview"
                    style={{ backgroundColor: badgeColor }}
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* INTERACTIVE STICKY FOOTER */}
        <div className="membership-modal-footer">
          <div className="membership-footer-left">
            <button
              type="submit"
              form="membership-plan-form"
              className="membership-submit-btn"
            >
              {initialData ? 'تحديث الخطة' : 'إنشاء خطة'}
            </button>
            <button
              type="button"
              className="membership-cancel-btn"
              onClick={onClose}
            >
              إلغاء
            </button>
          </div>

          <div className="membership-footer-right">
            <div className="membership-price-display">
              <span className="membership-price-label">السعر</span>
              <span className="membership-price-val">
                EGP {price !== '' ? parseFloat(price || 0).toFixed(2) : '0.00'}
              </span>
            </div>

            <div className="membership-checklist">
              <div
                className={`membership-check-item ${isNameValid ? 'valid' : ''}`}
              >
                <span className="membership-check-circle">
                  {isNameValid ? '✔' : '○'}
                </span>
                <span>الاسم</span>
              </div>

              <div
                className={`membership-check-item ${isPriceValid ? 'valid' : ''}`}
              >
                <span className="membership-check-circle">
                  {isPriceValid ? '✔' : '○'}
                </span>
                <span>السعر</span>
              </div>

              <div
                className={`membership-check-item ${
                  isServicesValid ? 'valid' : ''
                }`}
              >
                <span className="membership-check-circle">
                  {isServicesValid ? '✔' : '○'}
                </span>
                <span>الخدمات المؤهلة</span>
              </div>

              <div
                className={`membership-check-item ${
                  isBranchesValid ? 'valid' : ''
                }`}
              >
                <span className="membership-check-circle">
                  {isBranchesValid ? '✔' : '○'}
                </span>
                <span>الفروع</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
