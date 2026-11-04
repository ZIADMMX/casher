import { getSectorIdentity } from '../../utils/sectorIdentity';

export default function LaunchSuccessStep({
  customizedData,
  provisionSummary,
  onLaunch,
}) {
  const sectorKey = customizedData?.sectorKey;
  const identity = getSectorIdentity(sectorKey);
  const storeName = customizedData?.storeName || (identity.businessNamePrefix ? `${identity.businessNamePrefix} الجديد` : 'متجرك');
  const sectorName = customizedData?.customSectorName || customizedData?.sectorKey || 'النشاط';
  const primaryTitle = customizedData?.primaryActionTitle || identity.primaryActionTitle || 'ابدأ العمل الآن';

  const isService = identity.isService;
  const categoriesCount = identity.type === 'crm'
    ? 1
    : provisionSummary?.categoriesCreated ?? customizedData?.categories?.length ?? 0;
  const productsCount = identity.type === 'crm'
    ? 5
    : provisionSummary?.productsCreated ?? customizedData?.products?.length ?? 0;

  // Third metric: Service sectors show active system status, retail shows stock units
  const metric3Value = isService 
    ? 'مفعل وجاهز' 
    : (customizedData?.kpis?.totalStock ?? 0);
  
  const metric3Icon = identity.type === 'crm' ? '👥'
    : identity.type === 'legal' ? '⚖️'
    : identity.type === 'gym' ? '🏋️' 
    : identity.type === 'salon' ? '✂️' 
    : identity.type === 'repair' ? '🔧' 
    : '📦';

  return (
    <div className="launch-success-step-container">
      {/* Celebration Icon Card */}
      <div className="success-badge-card">
        <div className="celebration-icon-wrap">
          <div className="celebration-rings" />
          <div className="celebration-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="success-check-svg">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <div className="success-text-content">
          <span className="success-pill-tag">جاهز للعمل بنسبة 100%</span>
          <h2 className="success-main-title">
            {identity.successTitle ? identity.successTitle(storeName) : (
              <>مبروك! أصبح متجر <strong className="text-highlight">«{storeName}»</strong> جاهزاً تماماً</>
            )}
          </h2>
          <p className="success-sub-title">
            {identity.successSubtitle || (
              <>تم ضبط جميع الإعدادات الأولية، الأقسام، والكتالوج بنجاح لتناسب قطاع <strong>{sectorName}</strong>.</>
            )}
          </p>
        </div>
      </div>

      {/* Provision Summary Grid */}
      <div className="success-summary-grid">
        <div className="summary-metric-card">
          <span className="metric-icon">{identity.type === 'crm' ? '👥' : identity.type === 'legal' ? '⚖️' : '📂'}</span>
          <div className="metric-text-group">
            <span className="metric-number">
              {categoriesCount}
            </span>
            <span className="metric-label">{identity.metric1Label || 'أقسام مفعلة ومحطات عمل'}</span>
          </div>
        </div>

        <div className="summary-metric-card">
          <span className="metric-icon">{identity.type === 'crm' ? '📊' : identity.type === 'legal' ? '📜' : (isService ? '⭐' : '🏷️')}</span>
          <div className="metric-text-group">
            <span className="metric-number">
              {productsCount}
            </span>
            <span className="metric-label">{identity.metric2Label || 'منتجات بأسعار محلية وباركود'}</span>
          </div>
        </div>

        <div className="summary-metric-card">
          <span className="metric-icon">{metric3Icon}</span>
          <div className="metric-text-group">
            <span className={`metric-number ${isService ? 'text-green' : 'text-cyan'}`}>
              {metric3Value}
            </span>
            <span className="metric-label">{identity.metric3Label || 'إجمالي قطع المخزون الافتتاحي'}</span>
          </div>
        </div>

        <div className="summary-metric-card">
          <span className="metric-icon">⏰</span>
          <div className="metric-text-group">
            <span className="metric-number text-orange">
              {identity.type === 'crm'
                ? 'مركز موحد'
                : `${customizedData?.workingHours?.open_time || '09:00'} - ${customizedData?.workingHours?.close_time || '23:00'}`}
            </span>
            <span className="metric-label">{identity.metric4Label || 'مواعيد التشغيل اليومية'}</span>
          </div>
        </div>
      </div>

      {/* Launch Actions */}
      <div className="success-actions-wrap">
        <button
          type="button"
          className="launch-hero-cta-btn"
          onClick={onLaunch}
        >
          <span>{primaryTitle} 🚀</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="btn-arrow-icon">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
