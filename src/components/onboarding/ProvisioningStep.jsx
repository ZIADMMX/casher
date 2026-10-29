import { useState, useEffect, useRef } from 'react';
import Three3DLogo from '../Three3DLogo.jsx';

/**
 * ProvisioningStep.jsx
 * الخطوة 3 من معالج التهيئة: الإنشاء الآلي للبيانات بهوية ثلاثية الأبعاد 3D
 * تقوم ببناء الجداول والأقسام والمنتجات والمخزون في معاملة ذرية متكاملة
 */

export default function ProvisioningStep({
  customizedData,
  onCompleted,
}) {
  const [progress, setProgress] = useState(10);
  const [currentStatusText, setCurrentStatusText] = useState('جاري تهيئة قاعدة البيانات وبناء أقسام المتجر...');
  const [provisionState, setProvisionState] = useState('running'); // 'running' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  const completedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let timer1;
    let timer2;
    let timer3;
    let timer4;

    async function executeProvisioning() {
      try {
        setProvisionState('running');
        setProgress(15);
        setCurrentStatusText('جاري تهيئة قاعدة البيانات وبناء الأقسام ومحطات العمل...');

        // Smooth visual progress cadence
        timer1 = setTimeout(() => {
          if (isMounted) {
            setProgress(38);
            setCurrentStatusText('جاري حقن المنتجات والأسعار وتخصيص الباركودات...');
          }
        }, 500);

        timer2 = setTimeout(() => {
          if (isMounted) {
            setProgress(65);
            setCurrentStatusText('جاري إنشاء المخزون الافتتاحي وربط حركات الجرد الأولي...');
          }
        }, 1100);

        timer3 = setTimeout(() => {
          if (isMounted) {
            setProgress(88);
            setCurrentStatusText('جاري ضبط الهوية البصرية ومواعيد العمل والورديات...');
          }
        }, 1600);

        // Actual Backend Call
        const provisionApi = window.electronAPI?.provisionOnboarding;
        let result = null;

        if (provisionApi) {
          result = await provisionApi({
            sectorKey: customizedData?.sectorKey || 'retail',
            customSectorName: customizedData?.customSectorName || '',
            storeName: customizedData?.storeName || 'متجري',
            storeLogo: customizedData?.storeLogo || null,
            workingHours: customizedData?.workingHours || null,
            categories: customizedData?.categories || [],
            products: customizedData?.products || [],
            addons: customizedData?.addons || [],
          });
        } else {
          // Fallback simulation for browser/development
          await new Promise((resolve) => setTimeout(resolve, 2200));
          result = {
            success: true,
            summary: {
              categoriesCreated: customizedData?.categories?.length || 2,
              productsCreated: customizedData?.products?.length || 5,
              variantsCreated: customizedData?.products?.length || 5,
              stockItemsCreated: customizedData?.products?.length || 5,
            },
          };
        }

        if (isMounted) {
          setProgress(100);
          setCurrentStatusText('اكتمل إعداد النظام بنجاح وجاهز للتشغيل! 🚀');
          setProvisionState('success');

          // Transition to Step 4 after brief celebratory delay
          timer4 = setTimeout(() => {
            if (isMounted && !completedRef.current) {
              completedRef.current = true;
              onCompleted(result);
            }
          }, 900);
        }
      } catch (err) {
        if (isMounted) {
          setProvisionState('error');
          setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء بناء البيانات');
        }
      }
    }

    executeProvisioning();

    return () => {
      isMounted = false;
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [customizedData, onCompleted]);

  return (
    <div className="provisioning-step-container">
      {/* 3D Model Center Stage */}
      <div className="provisioning-3d-stage">
        <div className="stage-glow-ambient" />
        <div className="stage-rings-pulse" />
        <div className="three-fox-wrapper">
          <Three3DLogo
            width={260}
            height={260}
            interactive={true}
            showParticles={true}
          />
        </div>
      </div>

      {/* Dynamic Status Text & Indicators */}
      <div className="provisioning-content-card">
        <div className="status-badge-row">
          {provisionState === 'running' && (
            <span className="state-pill running">
              <span className="dot-pulse" />
              جاري الإنشاء الآلي...
            </span>
          )}
          {provisionState === 'success' && (
            <span className="state-pill success">
              ✓ تم البناء بنجاح
            </span>
          )}
          {provisionState === 'error' && (
            <span className="state-pill error">
              ✕ تعذر الإنشاء
            </span>
          )}
          <span className="sector-tag">
            القطاع: {customizedData?.customSectorName || customizedData?.sectorKey || 'عام'}
          </span>
        </div>

        <h3 className="provisioning-title">
          {provisionState === 'error' ? 'حدث خطأ أثناء الإنشاء' : currentStatusText}
        </h3>

        {provisionState === 'error' ? (
          <div className="provisioning-error-box">
            <p className="error-desc">{errorMessage}</p>
            <button
              type="button"
              className="onboarding-primary-btn"
              onClick={() => window.location.reload()}
            >
              إعادة المحاولة 🔄
            </button>
          </div>
        ) : (
          <>
            {/* Smooth Progress Bar */}
            <div className="provisioning-progress-wrap">
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="progress-numbers-row">
                <span className="progress-phase-label">
                  {progress < 30 && 'المرحلة 1 / 4 • الأقسام'}
                  {progress >= 30 && progress < 60 && 'المرحلة 2 / 4 • المنتجات والأسعار'}
                  {progress >= 60 && progress < 90 && 'المرحلة 3 / 4 • المخزون والباركود'}
                  {progress >= 90 && 'المرحلة 4 / 4 • التهيئة النهائية'}
                </span>
                <span className="progress-percent-text">{progress}%</span>
              </div>
            </div>

            {/* Micro Steps Checklist */}
            <div className="provisioning-checklist">
              <div className={`check-item ${progress >= 25 ? 'done' : 'active'}`}>
                <span className="check-icon">{progress >= 25 ? '✓' : '•'}</span>
                <span>الأقسام ومحطات العمل</span>
              </div>
              <div className={`check-item ${progress >= 55 ? 'done' : progress >= 25 ? 'active' : 'pending'}`}>
                <span className="check-icon">{progress >= 55 ? '✓' : '•'}</span>
                <span>المنتجات والأسعار المحلية</span>
              </div>
              <div className={`check-item ${progress >= 80 ? 'done' : progress >= 55 ? 'active' : 'pending'}`}>
                <span className="check-icon">{progress >= 80 ? '✓' : '•'}</span>
                <span>رصيد المخزون الافتتاحي</span>
              </div>
              <div className={`check-item ${progress >= 100 ? 'done' : progress >= 80 ? 'active' : 'pending'}`}>
                <span className="check-icon">{progress >= 100 ? '✓' : '•'}</span>
                <span>مواعيد العمل والهوية البصرية</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
