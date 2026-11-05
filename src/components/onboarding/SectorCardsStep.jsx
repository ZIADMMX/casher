import { useState, useEffect } from 'react';
import * as onboardingApi from '../../api/onboarding.js';

/**
 * SectorCardsStep.jsx
 * الخطوة الأولى من معالج التهيئة (نشاطك):
 * كروت الأنشطة الـ (6 + أخرى) بهوية فوكس مع معاينة فورية للمصطلحات والوحدات
 */

export const SECTOR_CARDS = [
  {
    key: 'retail',
    title: 'تجزئة وملابس',
    subtitle: 'Retail & Apparel',
    desc: 'محلات الملابس، الأحذية، الحقائب، الموضة وتجارة التجزئة العامة',
    badge: 'كاشير + مقاسات وألوان',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    key: 'grocery',
    title: 'سوبر ماركت وبقالة',
    subtitle: 'Grocery & Market',
    desc: 'مواد غذائية، ألبان، معلبات، منظفات ومبيعات سريعة مع ميزان باركود',
    badge: 'كاشير فائق السرعة + ميزان',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    key: 'cafe_restaurant',
    title: 'مطاعم وكافيهات',
    subtitle: 'Cafe & Restaurant',
    desc: 'مشروبات ساخنة وباردة، وجبات، طاولة وتيك أواي ومحطات مطبخ وبار',
    badge: 'منيو + محطات KDS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
  {
    key: 'electronics',
    title: 'إلكترونيات وتكنولوجيا',
    subtitle: 'Tech & Phones',
    desc: 'هواتف، أجهزة، إكسسوارات، شواحن، وفواتير ضمان بالسيريال',
    badge: 'سيريال + فواتير ضمان',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
  {
    key: 'maintenance',
    title: 'ورش صيانة ومراكز خدمة',
    subtitle: 'Maintenance & Repair',
    desc: 'تذاكر صيانة، دورات عمل فنيين، كشف أعطال، وقطع غيار وأجور خدمة',
    badge: 'تذاكر صيانة + فنيين',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    key: 'subscriptions_gym',
    title: 'صالات رياضية وجيم',
    subtitle: 'Gym & Wellness',
    desc: 'عضويات شهرية، باقات حصص تدريب PT، تجميد اشتراكات ومكملات صحية',
    badge: 'عضويات + باقات PT',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h3v4h-3M3 10h3v4H3M9 10h6v4H9z" />
        <path d="M6 14l-3 4M18 14l3 4M6 10L3 6M18 10l3-4" />
      </svg>
    ),
  },
  {
    key: 'law_firm',
    title: 'مكاتب محاماة واستشارات',
    subtitle: 'Law Firm & Legal',
    desc: 'ملفات قضايا، محاكم وجلسات، أطراف وخصوم، أمانات موكّلين وأرشيف مستندات',
    badge: 'قضايا + جلسات وموكّلين',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" />
        <path d="M4 7h16" />
        <path d="M4 7l3 7h-6l3-7z" />
        <path d="M20 7l3 7h-6l3-7z" />
        <path d="M9 21h6" />
      </svg>
    ),
  },
  {
    key: 'spare_parts',
    title: 'قطع غيار وسيارات',
    subtitle: 'Auto Parts & Vehicles',
    desc: 'قطع غيار، كود OEM، موديلات وسنوات الصنع، وأوامر شغل سيارات ومصنعيات',
    badge: 'كود OEM + موديل وسنة',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17h14v-5l-2-5H7l-2 5v5z" />
        <circle cx="7.5" cy="17.5" r="2.5" />
        <circle cx="16.5" cy="17.5" r="2.5" />
      </svg>
    ),
  },
  {
    key: 'salon_barbershop',
    title: 'صالونات وحلاقة وتجميل',
    subtitle: 'Salon & Barbershop',
    desc: 'كراسي حلاقة وتصفيف، خدمات، باقات، وعمولات الفنيين والمصففين',
    badge: 'كراسي + عمولات مصففين',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" />
        <line x1="14.47" y1="14.48" x2="20" y2="20" />
        <line x1="8.12" y1="8.12" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    key: 'crm',
    title: 'إدارة علاقات العملاء (CRM)',
    subtitle: 'Customer Relationship Management',
    desc: 'إدارة مستقلة للعملاء والشركات والعملاء المحتملين والصفقات وسجل التواصل',
    badge: 'عملاء + Pipeline + متابعة',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="4" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 11a4 4 0 1 0 0-8" />
        <path d="M18 14a5 5 0 0 1 3 5v2" />
      </svg>
    ),
  },
  {
    key: 'custom',
    title: 'نشاط تجاري عام (أخرى)',
    subtitle: 'Custom & Other',
    desc: 'قالب مرن وشامل يتكيف مع أي نشاط تجاري، مهني أو خدمي آخر',
    badge: 'قالب مرن مخصص',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
];

export default function SectorCardsStep({
  storeName = '',
  selectedSector = 'retail',
  customSectorName = '',
  onSelectSector,
  onChangeCustomSectorName,
  onNext,
}) {
  const [activePresetDetails, setActivePresetDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadPreset() {
      if (!selectedSector) return;
      setLoadingDetails(true);
      try {
        if (onboardingApi.getOnboardingPreset.isAvailable()) {
          const res = await onboardingApi.getOnboardingPreset(selectedSector);
          if (isMounted && res?.success && res.data) {
            setActivePresetDetails(res.data);
          }
        }
      } catch (err) {
        console.error('Failed to load preset details:', err);
      } finally {
        if (isMounted) setLoadingDetails(false);
      }
    }
    loadPreset();
    return () => {
      isMounted = false;
    };
  }, [selectedSector]);

  return (
    <div className="onboarding-step-view">
      {/* Header Info */}
      <div className="onboarding-step-header">
        <div className="onboarding-sparkle-badge">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
          </svg>
          <span>الخطوة الأولى • تخصيص هوية النظام</span>
        </div>

        <h2 className="onboarding-heading">
          ما نوع نشاط <span className="highlight-store">{storeName || 'نشاطك التجاري'}</span>؟
        </h2>
        <p className="onboarding-subheading">
          اضغط مرة واحدة على نشاطك — وسنجهّز لك الأقسام والمنتجات والمصطلحات المناسبة له تلقائياً.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="sector-cards-grid">
        {SECTOR_CARDS.map((card) => {
          const isSelected = selectedSector === card.key;

          return (
            <div
              key={card.key}
              role="button"
              tabIndex={0}
              className={`sector-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectSector(card.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSector(card.key);
                }
              }}
            >
              {/* Top Row: Icon + Selection Badge */}
              <div className="sector-card-top">
                <div className="sector-card-icon">{card.icon}</div>
                {isSelected ? (
                  <div className="sector-check-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <div className="sector-select-ring" />
                )}
              </div>

              {/* Card Title & Subtitle */}
              <div className="sector-card-title-wrap">
                <h3 className="sector-card-title">{card.title}</h3>
                <span className="sector-card-subtitle">{card.subtitle}</span>
              </div>

              {/* Description */}
              <p className="sector-card-desc">{card.desc}</p>

              {/* Feature Badge */}
              <div className="sector-card-footer">
                <span className="sector-feature-pill">{card.badge}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Sector Input if 'custom' is chosen */}
      {selectedSector === 'custom' && (
        <div className="custom-sector-box">
          <label htmlFor="custom-sector-input" className="custom-sector-label">
            اسم نشاطك التجاري المخصص:
          </label>
          <input
            id="custom-sector-input"
            type="text"
            className="custom-sector-input"
            placeholder="مثال: استشارات قانونية، معرض سيارات، ورشة نجارة..."
            value={customSectorName}
            onChange={(e) => onChangeCustomSectorName(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* Live Preset Preview Pill / Bar */}
      <div className="selected-preset-summary-bar">
        <div className="summary-bar-content">
          <div className="summary-status-dot" />
          <div className="summary-text-group">
            <span className="summary-main-text">
              النشاط المختار: <strong>{SECTOR_CARDS.find((c) => c.key === selectedSector)?.title}</strong>
            </span>
            {activePresetDetails && (
              <span className="summary-details-text">
                {selectedSector === 'crm'
                  ? '• قطاع مستقل للعملاء والشركات والفرص البيعية والمتابعة'
                  : (
                    <>
                      • {activePresetDetails.starter_categories?.length || 0} أقسام جاهزة •{' '}
                      {activePresetDetails.starter_products?.length || 0} منتجات نموذجية بأسعار محلية • مصطلح الطلب: &ldquo;
                      {activePresetDetails.terminology?.order || 'فاتورة'}&rdquo;
                    </>
                  )}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="onboarding-primary-btn"
          disabled={loadingDetails}
          onClick={onNext}
        >
          <span>{selectedSector === 'crm' ? 'المتابعة لإعداد CRM' : 'المتابعة إلى الإعداد الجاهز'}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="btn-arrow-icon">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
