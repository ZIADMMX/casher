import { useNotifications } from '../contexts/NotificationsContext.jsx';

function getNotificationIcon(type) {
  switch (type) {
    case 'shift_opened':
      return '🟢';
    case 'shift_closed':
      return '🔒';
    case 'shift_shortage':
      return '🔴';
    case 'expense_created':
      return '💸';
    case 'low_stock':
      return '⚠️';
    case 'out_of_stock':
      return '🚫';
    case 'sale_return':
    case 'sale_exchange':
      return '🔄';
    case 'sale_credit':
      return '👤';
    case 'purchase_created':
      return '🚚';
    case 'supplier_payment':
      return '💰';
    default:
      return '🔔';
  }
}

function NotificationToast({ onNavigate }) {
  const { toastNotification, dismissToast, markAsRead } = useNotifications();

  if (!toastNotification) return null;

  const handleClick = () => {
    markAsRead(toastNotification.id);
    if (toastNotification.link_page && typeof onNavigate === 'function') {
      onNavigate(toastNotification.link_page);
    }
    dismissToast();
  };

  return (
    <div
      className="notification-toast-container"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '24px',
        zIndex: 99999,
        maxWidth: '380px',
        background: '#0F172A',
        color: '#FFFFFF',
        borderRadius: '14px',
        padding: '14px 16px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        direction: 'rtl',
        cursor: 'pointer',
        animation: 'slideUp 0.3s ease',
      }}
      onClick={handleClick}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'rgba(46, 91, 255, 0.2)',
          border: '1px solid rgba(46, 91, 255, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          flexShrink: 0,
        }}
      >
        {getNotificationIcon(toastNotification.type)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
          <strong style={{ fontSize: '13px', color: '#60A5FA', fontWeight: '800' }}>
            {toastNotification.title}
          </strong>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '12px', color: '#E2E8F0', margin: 0, lineHeight: 1.4 }}>
          {toastNotification.message}
        </p>
      </div>
    </div>
  );
}

export default NotificationToast;
