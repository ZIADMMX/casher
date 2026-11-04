import { useEffect, useState } from 'react';

function RateLimitNotice() {
  const [expiresAt, setExpiresAt] = useState(null);
  const [now, setNow] = useState(0);
  const [reason, setReason] = useState('rate_limit');

  useEffect(() => {
    if (!window.electronAPI?.onRateLimitBlocked) return undefined;
    return window.electronAPI.onRateLimitBlocked(({ retryAfterMs, reason: noticeReason }) => {
      const currentTime = Date.now();
      setNow(currentTime);
      setExpiresAt((currentExpiry) => Math.max(currentExpiry || 0, currentTime + retryAfterMs));
      setReason(noticeReason);
    });
  }, []);

  useEffect(() => {
    if (expiresAt === null) return undefined;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= expiresAt) setExpiresAt(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (expiresAt === null) return null;
  const secondsRemaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <div className="rate-limit-backdrop">
      <section
        className="rate-limit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rate-limit-title"
        aria-describedby="rate-limit-description"
      >
        <div className="rate-limit-dialog-icon" aria-hidden="true">⏳</div>
        <h2 id="rate-limit-title">
          {reason === 'server_busy' ? 'الخادم مشغول حاليًا' : 'يرجى الانتظار قليلًا'}
        </h2>
        <p id="rate-limit-description">
          {reason === 'server_busy'
            ? 'لتخفيف الضغط على الخادم، انتظر حتى ينتهي العد التنازلي قبل إعادة المحاولة.'
            : 'تم إيقاف تكرار الطلبات مؤقتًا لحماية النظام. يمكنك المحاولة مجددًا بعد انتهاء العد التنازلي.'}
        </p>
        <div className="rate-limit-countdown" aria-live="assertive">
          {secondsRemaining} <span>ثانية</span>
        </div>
        <span className="rate-limit-dialog-hint">سيُغلق هذا التنبيه تلقائيًا عند انتهاء الانتظار.</span>
      </section>
    </div>
  );
}

export default RateLimitNotice;
