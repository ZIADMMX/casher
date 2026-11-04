import React from 'react';
import { getSectorSvgIcon } from '../icons/SectorIcons.jsx';

/**
 * SectorHeader.jsx
 * شريط أنيق يبرز هوية النشاط المختار والخصائص المفعلة لنقطة البيع (POS)
 */
export default function SectorHeader({
  sectorConfig,
  activeOrderMode,
  onSelectOrderMode,
  onOpenWorkOrders,
  onOpenKitchen,
}) {
  if (!sectorConfig) return null;

  return (
    <div className="pos-sector-header-banner" style={{ borderRightColor: sectorConfig.color }}>
      <div className="pos-sector-badge-wrap">
        <span className="pos-sector-icon" style={{ display: 'flex', alignItems: 'center', color: sectorConfig.color }}>
          {getSectorSvgIcon(sectorConfig.key, { size: 22 })}
        </span>
        <div className="pos-sector-title-group">
          <div className="pos-sector-name-row">
            <span className="pos-sector-title">{sectorConfig.name}</span>
            <span className="pos-sector-badge-tag" style={{ backgroundColor: `${sectorConfig.color}15`, color: sectorConfig.color }}>
              {sectorConfig.badge}
            </span>
          </div>
          <span className="pos-sector-term-hint">
            نوع الطلب الحالي: <strong>{sectorConfig.orderTerm}</strong>
          </span>
        </div>
      </div>

      {sectorConfig.features?.vehicleWorkOrders && (
        <button type="button" className="order-mode-btn" onClick={onOpenWorkOrders}>
          أوامر إصلاح السيارات
        </button>
      )}

      {/* أزرار مخصصة حسب نوع النشاط مثل صالة/تيك أواي للمطاعم أو صيانة فورية */}
      {sectorConfig.features?.tableService && (
        <>
          <div className="pos-order-modes-toggle" role="group" aria-label="طريقة استلام الطلب">
            <button
              type="button"
              className={`order-mode-btn ${activeOrderMode === 'takeaway' ? 'active' : ''}`}
              aria-pressed={activeOrderMode === 'takeaway'}
              onClick={() => onSelectOrderMode?.('takeaway')}
            >
              سفري / Takeaway
            </button>
            <button
              type="button"
              className={`order-mode-btn ${activeOrderMode === 'dine_in' ? 'active' : ''}`}
              aria-pressed={activeOrderMode === 'dine_in'}
              onClick={() => onSelectOrderMode?.('dine_in')}
            >
              صالة / طاولات
            </button>
            <button
              type="button"
              className={`order-mode-btn ${activeOrderMode === 'delivery' ? 'active' : ''}`}
              aria-pressed={activeOrderMode === 'delivery'}
              onClick={() => onSelectOrderMode?.('delivery')}
            >
              دليفري / توصيل
            </button>
          </div>
          <button type="button" className="order-mode-btn" onClick={onOpenKitchen}>
            شاشة المطبخ (KDS)
          </button>
        </>
      )}

      {sectorConfig.features?.maintenanceTicket && (
        <div className="pos-order-modes-toggle">
          <button
            type="button"
            className={`order-mode-btn ${activeOrderMode === 'quick_repair' ? 'active' : ''}`}
            onClick={() => onSelectOrderMode?.('quick_repair')}
          >
            صيانة فورية
          </button>
          <button
            type="button"
            className={`order-mode-btn ${activeOrderMode === 'intake_ticket' ? 'active' : ''}`}
            onClick={() => onSelectOrderMode?.('intake_ticket')}
          >
            تذكرة استلام جهاز
          </button>
        </div>
      )}

      {sectorConfig.features?.subscriptions && (
        <div className="pos-gym-quick-indicator">
          <span className="gym-pulse-dot" />
          <span>نظام العضويات وحصص PT متصل تلقائياً</span>
        </div>
      )}
    </div>
  );
}
