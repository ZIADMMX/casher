import { Component, useEffect, useRef, useState } from 'react';
import * as appApi from '../../api/app.js';
import { AlertIcon, RefreshIcon, ClipboardCheckIcon } from '../icons/PosIcons.jsx';
import '../../styles/error-screen.css';

const PAGE_NAMES = {
  pos: 'نقطة البيع',
  today: 'اليوم',
  reports: 'التقارير',
  customers: 'العملاء',
  products: 'الأصناف',
  inventory: 'المخزون',
  branches: 'الفروع والمخازن',
  shifts: 'الورديات',
  users: 'المستخدمين',
  settings: 'الإعدادات',
  returns: 'المرتجعات',
  suppliers: 'الموردين',
  crm: 'إدارة العملاء',
  cases: 'القضايا',
  leaves: 'الإجازات',
  profile: 'الملف الشخصي',
};

const AUTO_RETRY_SECONDS = 10;
const MAX_AUTO_RETRIES = 3;

// The page file was replaced by a newer build while the app was open; only a reload fixes it.
function isStaleBuild(message = '') {
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message);
}

function isOverloaded(message = '') {
  return /مشغول|server_busy|SERVER_BUSY|تكرار المحاولة|timeout|ETIMEDOUT/i.test(message);
}

// Plain-language explanation for the details box; the raw message goes only into "copy details".
function explain(kind) {
  if (kind === 'stale') return 'البرنامج اتحدّث وهو مفتوح، فملفات الصفحة دي اتغيرت. اضغط «تحديث الصفحة» وهتفتح عادي.';
  if (kind === 'overloaded') return 'قاعدة البيانات أو الخادم مشغول بطلبات كتير في نفس الوقت. استنى ثواني وجرّب تاني.';
  return 'الصفحة واجهت خطأ أثناء العرض. لو تكرر، اضغط «نسخ التفاصيل» وابعتها للدعم الفني عشان نحدد السبب.';
}

export function ErrorScreen({ error, pageName, attempt, onRetry }) {
  const message = error?.message || 'خطأ غير معروف';
  const stale = isStaleBuild(message);
  const overloaded = !stale && isOverloaded(message);
  const kind = stale ? 'stale' : overloaded ? 'overloaded' : 'generic';
  const canAutoRetry = !stale && attempt < MAX_AUTO_RETRIES;
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETRY_SECONDS);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');
  const [copied, setCopied] = useState(false);
  const primaryRef = useRef(null);

  useEffect(() => { primaryRef.current?.focus(); }, []);

  useEffect(() => {
    if (!canAutoRetry || restarting) return undefined;
    if (secondsLeft <= 0) {
      onRetry();
      return undefined;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, canAutoRetry, restarting, onRetry]);

  async function restartApp() {
    setRestarting(true);
    setRestartError('');
    try {
      if (appApi.relaunchAfterError.isAvailable()) {
        await appApi.relaunchAfterError();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setRestarting(false);
      setRestartError(err?.message || 'تعذر إعادة التشغيل. أغلق البرنامج وافتحه يدويًا.');
    }
  }

  async function copyDetails() {
    const details = [
      `الصفحة: ${pageName || '-'}`,
      `الخطأ: ${message}`,
      `الوقت: ${new Date().toLocaleString('en-GB')}`,
      error?.stack ? `\n${error.stack.split('\n').slice(0, 6).join('\n')}` : '',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const pageLabel = PAGE_NAMES[pageName] || 'هذه الصفحة';
  const progress = ((AUTO_RETRY_SECONDS - secondsLeft) / AUTO_RETRY_SECONDS) * 100;

  return (
    <section className="err-screen" dir="rtl" role="alert" aria-live="assertive">
      <div className="err-card">
        <span className={`err-icon${overloaded ? ' err-icon--warning' : ''}`} aria-hidden="true">
          <AlertIcon size={32} />
        </span>

        <h1 className="err-title">
          {stale ? 'فيه نسخة أحدث من البرنامج' : overloaded ? 'النظام عليه ضغط كبير دلوقتي' : `حصلت مشكلة في عرض ${pageLabel}`}
        </h1>
        <p className="err-lead">
          {stale
            ? 'بياناتك محفوظة. حدّث الصفحة عشان تفتح بالنسخة الجديدة.'
            : overloaded
              ? 'البرنامج بيحاول يرجع لوحده. لو ماشتغلش، إعادة التشغيل بتحلها في ثواني.'
              : 'بياناتك محفوظة ومفيش حاجة اتمسحت. جرّب تاني، ولو المشكلة فضلت أعد تشغيل البرنامج.'}
        </p>

        {canAutoRetry && !restarting ? (
          <div className="err-auto">
            <div className="err-auto__row">
              <RefreshIcon size={16} className="err-spin" />
              <span>
                محاولة تلقائية خلال <bdi>{secondsLeft}</bdi> ثانية
                <span className="err-muted"> · المحاولة <bdi>{attempt + 1}</bdi> من <bdi>{MAX_AUTO_RETRIES}</bdi></span>
              </span>
            </div>
            <span className="err-progress"><span style={{ inlineSize: `${progress}%` }} /></span>
          </div>
        ) : !restarting && !stale && (
          <p className="err-note">المحاولات التلقائية ما نفعتش. أعد تشغيل البرنامج، ولو تكررت المشكلة ابعت تفاصيل الخطأ للدعم.</p>
        )}

        <div className="err-actions">
          {stale ? (
            <button ref={primaryRef} type="button" className="err-btn err-btn--primary" onClick={() => window.location.reload()}>
              <RefreshIcon size={18} />
              تحديث الصفحة
            </button>
          ) : (
            <>
              <button ref={primaryRef} type="button" className="err-btn err-btn--primary" onClick={restartApp} disabled={restarting}>
                <RefreshIcon size={18} className={restarting ? 'err-spin' : ''} />
                {restarting ? 'جارٍ إعادة تشغيل البرنامج…' : 'إعادة تشغيل البرنامج'}
              </button>
              <button type="button" className="err-btn err-btn--secondary" onClick={onRetry} disabled={restarting}>
                إعادة المحاولة الآن
              </button>
            </>
          )}
        </div>

        {restartError && <p className="err-restart-error">{restartError}</p>}

        <details className="err-details">
          <summary>تفاصيل للدعم الفني</summary>
          <p className="err-details__msg">{explain(kind)}</p>
          <button type="button" className="err-link" onClick={copyDetails}>
            <ClipboardCheckIcon size={16} /> {copied ? 'اتنسخت' : 'نسخ التفاصيل'}
          </button>
        </details>
      </div>
    </section>
  );
}

// Catches render errors in one page, shows ErrorScreen, and retries on its own a
// few times before leaving it to the user. Give it key={page} so a new page starts fresh.
export default class PageErrorBoundary extends Component {
  state = { error: null, attempt: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`تعذر عرض الصفحة ${this.props.pageName}:`, error, errorInfo);
  }

  retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          key={this.state.attempt}
          error={this.state.error}
          pageName={this.props.pageName}
          attempt={this.state.attempt}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}
