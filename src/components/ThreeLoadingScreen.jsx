import './ThreeLoadingScreen.css';

import foxLogo from '../assets/fox-logo.png';
import Three3DLogo from './Three3DLogo';

/**
 * ThreeLoadingScreen
 * شاشة تحميل وترحيب ثلاثية الأبعاد بصرية واحترافية
 * تستخدم عند:
 * 1. فتح التطبيق وبدء الجلسة (Fullscreen)
 * 2. جلب بيانات النشاط التجاري (Fullscreen)
 * 3. التنقل بين الصفحات (Suspense fallback أو Fetching داخل المكونات)
 */
export default function ThreeLoadingScreen({
  text = 'أهلاً بك',
  subtext = 'نسعد بخدمتك، لحظات ونكون جاهزين...',
  fullscreen = false,
  badge = 'FOX.CLOUD POS',
  size = 'md', // 'sm' | 'md' | 'lg'
  use3d = true,
}) {
  // تحديد حجم المجسم ثلاثي الأبعاد بحسب سياق الشاشة
  const dimensions = {
    sm: { width: 140, height: 140 },
    md: { width: 200, height: 200 },
    lg: { width: 260, height: 260 },
  }[size] || { width: 200, height: 200 };

  const finalDimensions = fullscreen ? { width: 260, height: 260 } : dimensions;

  return (
    <div className={`three-splash-container ${fullscreen ? 'three-splash-fullscreen' : 'three-splash-inline'}`}>
      {fullscreen && <div className="three-splash-glow" />}

      <div className="three-content-box">
        {/* مجسم الثعلب ثلاثي الأبعاد التفاعلي */}
        {use3d ? (
          <Three3DLogo
            width={finalDimensions.width}
            height={finalDimensions.height}
            interactive={true}
          />
        ) : (
          <img
            src={foxLogo}
            alt="FOX .CLOUD Logo"
            style={{
              width: finalDimensions.width,
              height: finalDimensions.height,
              objectFit: 'contain',
            }}
          />
        )}

        {/* النصوص وشريط التقدم */}
        <h3 className="three-title">{text}</h3>
        {subtext && <p className="three-subtext">{subtext}</p>}

        <div className="three-progress-track">
          <div className="three-progress-bar" />
        </div>

        {badge && (
          <div className="three-badge">
            <span className="three-badge-dot" />
            <span>{badge}</span>
          </div>
        )}
      </div>
    </div>
  );
}
