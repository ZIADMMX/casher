import { useEffect, useMemo, useState } from 'react';
import '../styles/reviews.css';

const POSITIVE_TAGS = [
  'أسرع في البيع',
  'سهولة الاستخدام',
  'تقارير مفيدة',
  'دعم جيد',
  'ثبات النظام',
  'إدارة المخزون',
];
const NEGATIVE_TAGS = [
  'النظام بطيء',
  'ميزة ناقصة',
  'صعب التعلم',
  'الدعم بطيء',
  'أخطاء تقنية',
  'إدارة المخزون',
];

export default function ReviewModal({ onClose }) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    window.electronAPI.getMyReview()
      .then(({ review, syncPending: pending }) => {
        if (!isMounted) return;
        setRating(review?.rating || 0);
        setTags(review?.tags || []);
        setComment(review?.comment || '');
        setConsent(typeof review?.consent === 'boolean' ? review.consent : null);
        setSyncPending(Boolean(pending));
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError.message || 'تعذر تحميل التقييم السابق');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const availableTags = rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS;
  const commentLength = useMemo(() => comment.trim().length, [comment]);
  const canSubmit = rating > 0
    && (commentLength === 0 || commentLength >= 20)
    && commentLength <= 1000
    && (rating < 4 || consent !== null);

  function toggleTag(tag) {
    setTags((selected) => (
      selected.includes(tag)
        ? selected.filter((value) => value !== tag)
        : [...selected, tag]
    ));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await window.electronAPI.saveMyReview({
        rating,
        tags,
        comment: comment.trim(),
        ...(rating >= 4 ? { consent } : {}),
      });
      setSyncPending(Boolean(result.syncPending));
      setMessage(result.syncPending
        ? 'تم حفظ تقييمك على هذا الجهاز، وسيتم مزامنته مع الخادم المركزي عند عودة الاتصال.'
        : 'شكرًا لك، وصل تقييمك إلى FOX.CLOUD.');
      if (result.syncError) setError(`تعذرت المزامنة الآن: ${result.syncError}`);
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ التقييم');
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setError('');
    try {
      const result = await window.electronAPI.syncReviews();
      setSyncPending(result.pendingCount > 0);
      if (result.error) setError(`لم تكتمل المزامنة: ${result.error}`);
      else setMessage(result.pendingCount
        ? 'ما زالت بعض التقييمات بانتظار الاتصال.'
        : 'تمت مزامنة التقييمات المحفوظة.');
    } catch (syncError) {
      setError(syncError.message || 'تعذرت مزامنة التقييمات');
    }
  }

  return (
    <div
      className="review-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        dir="rtl"
      >
        <header className="review-modal-header">
          <div>
            <span className="review-eyebrow">FOX.CLOUD</span>
            <h2 id="review-modal-title">شاركنا رأيك</h2>
            <p>تقييمك يساعدنا على تحسين تجربتك — لن يستغرق أكثر من 30 ثانية.</p>
          </div>
          <button type="button" className="review-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>

        {loading ? (
          <div className="review-loading" role="status">نحمّل تقييمك السابق...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {message && <div className="review-message" role="status">{message}</div>}
            {syncPending && (
              <div className="review-sync-status">
                <span>يوجد تقييم محفوظ بانتظار الاتصال بالخادم المركزي.</span>
                <button type="button" onClick={handleSync}>إعادة المزامنة</button>
              </div>
            )}
            {error && <div className="review-error" role="alert">{error}</div>}

            <fieldset className="review-rating-field">
              <legend>{rating ? 'كيف تقيّم تجربتك؟' : 'اختر تقييمك'}</legend>
              <div className="review-stars" role="radiogroup" aria-label="التقييم من نجمة إلى خمس نجوم">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} ${value === 1 ? 'نجمة' : 'نجوم'}`}
                    className={`review-star ${rating >= value ? 'selected' : ''}`}
                    onClick={() => {
                      setRating(value);
                      setTags([]);
                      setConsent(null);
                      setMessage('');
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="review-rating-caption">
                {rating >= 4 ? 'سعداء أن تجربتك إيجابية!' : rating > 0 ? 'ملاحظاتك تصل لفريق FOX.CLOUD فقط.' : 'تقييمك يهمنا'}
              </div>
            </fieldset>

            {rating > 0 && (
              <>
                <fieldset className="review-tags-field">
                  <legend>{rating >= 4 ? 'ما أكثر شيء أعجبك؟' : 'ما الذي نحتاج لتحسينه؟'}</legend>
                  <div className="review-tags">
                    {availableTags.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className={`review-tag ${tags.includes(tag) ? 'active' : ''}`}
                        aria-pressed={tags.includes(tag)}
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="review-comment-label" htmlFor="review-comment">
                  {rating >= 4 ? 'تحب تضيف لنا تفاصيل؟ (اختياري)' : 'ما الذي نصلحه أولاً؟ (اختياري)'}
                </label>
                <textarea
                  id="review-comment"
                  className="review-comment"
                  value={comment}
                  maxLength={1000}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="شاركنا أي تفاصيل تساعدنا..."
                  rows={3}
                />
                <div className={`review-character-count ${commentLength > 0 && commentLength < 20 ? 'invalid' : ''}`}>
                  {commentLength > 0 && commentLength < 20
                    ? `تبقّى ${20 - commentLength} حرفًا للوصول إلى الحد الأدنى`
                    : `${commentLength} / 1000`}
                </div>

                {rating >= 4 && (
                  <fieldset className="review-consent-field">
                    <legend>هل توافق على إظهار اسم نشاطك وشعاره مع التقييم؟</legend>
                    <label>
                      <input
                        type="radio"
                        name="review-consent"
                        checked={consent === true}
                        onChange={() => setConsent(true)}
                      />
                      أوافق
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="review-consent"
                        checked={consent === false}
                        onChange={() => setConsent(false)}
                      />
                      لا أوافق
                    </label>
                    <small>اسمك الشخصي لا يظهر. نحتفظ بموافقتك، ولا يتم النشر تلقائيًا حاليًا.</small>
                  </fieldset>
                )}
              </>
            )}

            <footer className="review-modal-footer">
              <span>يمكنك تعديل تقييمك في أي وقت.</span>
              <button type="submit" className="review-submit" disabled={!canSubmit || saving}>
                {saving ? 'جارٍ الحفظ...' : 'إرسال التقييم'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
