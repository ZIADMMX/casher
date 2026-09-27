import { useState, useRef, useEffect } from 'react';
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

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const value = String(dateString).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const normalizedValue = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(hasTimezone ? normalizedValue : `${normalizedValue}Z`);

  if (Number.isNaN(date.getTime())) return '';

  // SQLite's CURRENT_TIMESTAMP is UTC, but it returns a timezone-less string.
  // Append Z above so it is not interpreted as local time by the browser.
  const diffInSec = Math.max(0, Math.floor((now - date) / 1000));

  if (diffInSec < 60) return 'الآن';
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `منذ ${diffInMin} دقيقة`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `منذ ${diffInHours} ساعة`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `منذ ${diffInDays} يوم`;
}

function NotificationBell({ onNavigate }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const dropdownRef = useRef(null);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredList = notifications.filter((n) => {
    if (filter === 'unread') return n.is_read === 0;
    return true;
  });

  const handleItemClick = (n) => {
    if (!n.is_read) {
      markAsRead(n.id);
    }
    if (n.link_page && typeof onNavigate === 'function') {
      onNavigate(n.link_page);
      setIsOpen(false);
    }
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        type="button"
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="مركز الإشعارات والتنبيهات"
        style={{
          background: isOpen ? '#334155' : 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '10px',
          width: '38px',
          height: '38px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          color: '#F8FAFC',
          transition: 'all 0.2s ease',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: '10.5px',
              fontWeight: '900',
              padding: '1px 5px',
              borderRadius: '10px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 2px #15151A, 0 2px 6px rgba(239, 68, 68, 0.6)',
              animation: 'pulse 2s infinite',
            }}
          >
            {unreadCount > 99 ? '+99' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="notifications-dropdown-panel"
          style={{
            position: 'absolute',
            top: '46px',
            right: '0',
            width: '380px',
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: '500px',
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)',
            border: '1px solid #CBD5E1',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            direction: 'rtl',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🔔</span>
              <strong style={{ fontSize: '14px', color: '#0F172A' }}>مركز الإشعارات</strong>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: '#FEE2E2',
                    color: '#DC2626',
                    fontSize: '11px',
                    fontWeight: '800',
                    padding: '2px 7px',
                    borderRadius: '12px',
                  }}
                >
                  {unreadCount} جديد
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary-color)',
                  fontSize: '11.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                تحديد الكل كمقروء ✓
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '8px 12px',
              gap: '6px',
              borderBottom: '1px solid #F1F5F9',
              background: '#FFFFFF',
            }}
          >
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: '11.5px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: filter === 'all' ? 'var(--primary-color)' : '#F1F5F9',
                color: filter === 'all' ? '#FFFFFF' : '#475569',
              }}
            >
              الكل ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: '11.5px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: filter === 'unread' ? 'var(--primary-color)' : '#F1F5F9',
                color: filter === 'unread' ? '#FFFFFF' : '#475569',
              }}
            >
              غير مقروءة ({unreadCount})
            </button>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
            {filteredList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: '#94A3B8' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.7 }}>📭</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748B' }}>لا توجد إشعارات حالياً</div>
                <div style={{ fontSize: '11.5px', marginTop: '2px' }}>ستظهر التنبيهات هنا فور حدوث أي عملية</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredList.map((n) => {
                  const isUnread = n.is_read === 0;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid #F1F5F9',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start',
                        background: isUnread ? '#F0F7FF' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isUnread ? '#E0EFFF' : '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isUnread ? '#F0F7FF' : '#FFFFFF';
                      }}
                    >
                      {/* Icon Bubble */}
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isUnread ? '#DBEAFE' : '#F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          flexShrink: 0,
                        }}
                      >
                        {getNotificationIcon(n.type)}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <strong
                            style={{
                              fontSize: '12.5px',
                              color: isUnread ? '#1E3A8A' : '#0F172A',
                              fontWeight: isUnread ? '800' : '700',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {n.title}
                          </strong>
                          <span style={{ fontSize: '10.5px', color: '#94A3B8', flexShrink: 0 }}>
                            {formatRelativeTime(n.created_at)}
                          </span>
                        </div>

                        <p
                          style={{
                            fontSize: '11.5px',
                            color: isUnread ? '#334155' : '#64748B',
                            margin: 0,
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}
                        >
                          {n.message}
                        </p>

                        {n.link_page && (
                          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--primary-color)', fontWeight: '700' }}>
                            انقر للانتقال ↵
                          </div>
                        )}
                      </div>

                      {/* Unread indicator dot */}
                      {isUnread && (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: 'var(--primary-color)',
                            flexShrink: 0,
                            marginTop: '6px',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                onClick={clearAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  fontSize: '11.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: '2px 8px',
                }}
                onMouseEnter={(e) => (e.target.style.color = '#EF4444')}
                onMouseLeave={(e) => (e.target.style.color = '#94A3B8')}
              >
                🗑️ مسح كافة الإشعارات
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
