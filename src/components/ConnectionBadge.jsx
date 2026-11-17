import { useConnection } from '../hooks/useConnection.js';
import '../styles/connectionBadge.css';

// A small always-visible icon on the side: green wifi when online, amber crossed wifi when offline.
// Offline is not an error: the app keeps working and syncs when the connection returns.
export default function ConnectionBadge() {
  const online = useConnection();
  const text = online ? 'متصل بالإنترنت' : 'بدون إنترنت — الشغل مستمر ويتزامن عند عودة الاتصال';
  return (
    <div className={`conn-badge ${online ? 'is-online' : 'is-offline'}`} role="status" aria-live="polite" aria-label={text} title={text}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19.2" r="0.6" fill="currentColor" />
        {!online && <path className="conn-badge__slash" d="M4 4l16 16" />}
      </svg>
      <span>{online ? 'متصل' : 'أوفلاين'}</span>
    </div>
  );
}
