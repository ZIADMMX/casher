import { getSectorSvgIcon } from '../icons/SectorIcons.jsx';

const RESTAURANT_MODES = [
  { key: 'takeaway', label: 'سفري', hint: 'Takeaway' },
  { key: 'dine_in', label: 'صالة', hint: 'طاولات' },
  { key: 'delivery', label: 'دليفري', hint: 'توصيل' },
];

const MAINTENANCE_MODES = [
  { key: 'quick_repair', label: 'صيانة فورية' },
  { key: 'intake_ticket', label: 'تذكرة استلام جهاز' },
];

function ModeToggle({ label, modes, activeOrderMode, onSelectOrderMode }) {
  return (
    <div className="pos-order-modes-toggle" role="group" aria-label={label}>
      {modes.map((mode) => {
        const active = activeOrderMode === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            className={`order-mode-btn${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => onSelectOrderMode?.(mode.key)}
          >
            {mode.label}
            {mode.hint && <small>{mode.hint}</small>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * SectorHeader — the POS identity bar: sector icon, name and wording, plus the
 * sector-specific controls (restaurant order modes + KDS, maintenance modes, work orders).
 * Colors come from --pos-sector-accent, set on the POS wrapper.
 */
export default function SectorHeader({
  sectorConfig,
  activeOrderMode,
  onSelectOrderMode,
  onOpenWorkOrders,
  onOpenKitchen,
}) {
  if (!sectorConfig) return null;
  const { features = {} } = sectorConfig;

  return (
    <header className="pos-sector-header-banner">
      <div className="pos-sector-badge-wrap">
        <span className="pos-sector-icon" aria-hidden="true">
          {getSectorSvgIcon(sectorConfig.key, { size: 22 })}
        </span>
        <div className="pos-sector-title-group">
          <div className="pos-sector-name-row">
            <h2 className="pos-sector-title">{sectorConfig.name}</h2>
            <span className="pos-sector-badge-tag">{sectorConfig.badge}</span>
          </div>
          <span className="pos-sector-term-hint">
            نوع العملية: <strong>{sectorConfig.orderTerm}</strong>
          </span>
        </div>
      </div>

      <div className="pos-sector-actions">
        {features.tableService && (
          <>
            <ModeToggle
              label="طريقة استلام الطلب"
              modes={RESTAURANT_MODES}
              activeOrderMode={activeOrderMode}
              onSelectOrderMode={onSelectOrderMode}
            />
            <button type="button" className="pos-sector-link-btn" onClick={onOpenKitchen}>
              👨‍🍳 شاشة المطبخ (KDS)
            </button>
          </>
        )}

        {features.maintenanceTicket && (
          <ModeToggle
            label="نوع الخدمة"
            modes={MAINTENANCE_MODES}
            activeOrderMode={activeOrderMode}
            onSelectOrderMode={onSelectOrderMode}
          />
        )}

        {features.vehicleWorkOrders && (
          <button type="button" className="pos-sector-link-btn" onClick={onOpenWorkOrders}>
            🚗 أوامر إصلاح السيارات
          </button>
        )}

        {features.subscriptions && (
          <div className="pos-gym-quick-indicator">
            <span className="pos-status-dot is-live" aria-hidden="true" />
            <span>العضويات والباقات متصلة تلقائياً</span>
          </div>
        )}
      </div>
    </header>
  );
}
