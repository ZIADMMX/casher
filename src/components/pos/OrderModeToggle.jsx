const RESTAURANT_MODES = [
  { key: 'takeaway', label: 'سفري' },
  { key: 'dine_in', label: 'صالة' },
  { key: 'delivery', label: 'دليفري' },
];

const MAINTENANCE_MODES = [
  { key: 'quick_repair', label: 'صيانة فورية' },
  { key: 'intake_ticket', label: 'استلام جهاز' },
];

export function getOrderModeLabel(sectorConfig, mode) {
  const features = sectorConfig?.features || {};
  const modes = features.tableService ? RESTAURANT_MODES : features.maintenanceTicket ? MAINTENANCE_MODES : [];
  return modes.find((item) => item.key === mode)?.label || '';
}

/**
 * Segmented control for the sector's order modes: takeaway / dine-in / delivery for
 * restaurants, quick repair / device intake for maintenance shops. Renders nothing otherwise.
 */
export default function OrderModeToggle({ sectorConfig, activeOrderMode, onSelectOrderMode }) {
  const features = sectorConfig?.features || {};
  const modes = features.tableService ? RESTAURANT_MODES : features.maintenanceTicket ? MAINTENANCE_MODES : null;
  if (!modes) return null;

  return (
    <div
      className="pos-order-modes-toggle"
      role="group"
      aria-label={features.tableService ? 'طريقة استلام الطلب' : 'نوع الخدمة'}
    >
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
          </button>
        );
      })}
    </div>
  );
}
