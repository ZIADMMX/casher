import { useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import foxLogo from '../assets/fox-logo.png';
import OnboardingStepper from '../components/onboarding/OnboardingStepper.jsx';
import SectorCardsStep from '../components/onboarding/SectorCardsStep.jsx';
import CatalogPreviewStep from '../components/onboarding/CatalogPreviewStep.jsx';
import ProvisioningStep from '../components/onboarding/ProvisioningStep.jsx';
import LaunchSuccessStep from '../components/onboarding/LaunchSuccessStep.jsx';
import '../components/onboarding/OnboardingWizard.css';
import './InitialSetupPage.css';



export default function InitialSetupPage() {
  const { createInitialAdmin, completeInitialSetup, setSetupRequired } = useUser();
  const { refreshConfiguration } = useBusinessProfile();
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Steps: 'form' -> 'recovery_key' -> 'sector'
  const [step, setStep] = useState('form');
  const [createdUser, setCreatedUser] = useState(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [selectedSector, setSelectedSector] = useState('');
  const [customSectorName, setCustomSectorName] = useState('');
  const [customizedCatalogData, setCustomizedCatalogData] = useState(null);
  const [provisionSummary, setProvisionSummary] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!businessName.trim()) {
      setError('يرجى إدخال اسم النشاط التجاري');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
      return;
    }

    setLoading(true);
    try {
      // Save business / store name if API available
      if (window.electronAPI?.saveSettings && businessName.trim()) {
        try {
          await window.electronAPI.saveSettings({ store_name: businessName.trim() });
        } catch {
          // ignore if non-blocking
        }
      }

      const res = await createInitialAdmin(username.trim(), password, false, {
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setCreatedUser(res.user);

      // If user profile updates exist
      if (window.electronAPI?.updateProfile && (fullName.trim() || phone.trim())) {
        try {
          await window.electronAPI.updateProfile({
            fullName: fullName.trim() || undefined,
            phone: phone.trim() || undefined,
          });
        } catch {
          // ignore
        }
      }

      if (res?.recoveryKey) {
        setRecoveryKey(res.recoveryKey);
        setStep('recovery_key');
      } else {
        setStep('sector');
      }
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إنشاء حساب المدير');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyKey() {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 3000);
  }

  function handleFinishSetup() {
    if (!confirmedSaved) {
      setError('يرجى تأكيد حفظ مفتاح الاسترداد قبل المتابعة');
      return;
    }
    setStep('sector');
  }

  function handleSectorStepNext() {
    setError('');
    if (selectedSector === 'crm') {
      setCustomizedCatalogData({
        sectorKey: 'crm',
        storeName: businessName,
        customSectorName: '',
        categories: [],
        products: [],
        addons: [],
        workingHours: null,
        primaryActionTitle: 'ابدأ بإضافة أول عميل',
        primaryActionRoute: 'crm',
      });
      setStep('provisioning');
      return;
    }
    setStep('catalog');
  }

  function handleCatalogStepBack() {
    setError('');
    setStep('sector');
  }

  function handleCatalogStepNext(customData) {
    setError('');
    setCustomizedCatalogData(customData);
    setStep('provisioning');
  }

  function handleProvisionCompleted(summary) {
    setProvisionSummary(summary);
    setStep('launch');
  }

  async function handleFinalAppLaunch() {
    setLoading(true);
    setError('');
    try {
      await refreshConfiguration();
      completeInitialSetup(createdUser);
    } catch (err) {
      setError(err.message || 'تعذر استكمال تشغيل النظام');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="launch-container">
      {/* Ambient background glow */}
      <div className="launch-bg-glow" />

      {/* Main Glass Card */}
      <div className={`launch-card ${step !== 'form' && step !== 'recovery_key' ? 'launch-card-wide' : ''}`}>

        {/* Brand Header */}
        <div className="launch-header">
          <div className="launch-logo-wrap">
            <img src={foxLogo} alt="FOX .CLOUD" className="launch-logo-img" />
          </div>
          <h1 className="launch-title">
            FOX <span className="launch-title-dot">.</span><span className="launch-title-cloud">CLOUD</span>
          </h1>
          <p className="launch-subtitle">
            {step === 'form' && 'إعداد النظام لأول مرة • إطلاق نشاطك وإدارته باحترافية'}
            {step === 'recovery_key' && 'مفتاح الاسترداد الذهبي للطوارئ'}
            {step === 'sector' && 'معالج التهيئة الذكي • اختر مجال وطبيعة نشاطك'}
            {step === 'catalog' && (selectedSector === 'law_firm' ? 'معالج التهيئة الذكي • التخصصات القضائية ولائحة الأتعاب' : 'معالج التهيئة الذكي • الإعداد الجاهز ولائحة الأسعار')}
            {step === 'provisioning' && 'معالج التهيئة الذكي • جاري تجهيز وضبط النظام...'}
            {step === 'launch' && 'مبروك! اكتملت تهيئة النظام بنجاح'}
          </p>
        </div>

        {/* Outer Stepper only for Initial Registration */}
        {(step === 'form' || step === 'recovery_key') && (
          <nav className="setup-stepper" aria-label="خطوات الإعداد">
            {[
              { number: 1, label: 'بيانات المنشأة', step: 'form' },
              { number: 2, label: 'حماية الحساب', step: 'recovery_key' },
              { number: 3, label: 'طبيعة النشاط', step: 'sector' },
            ].map((item, index) => {
              const currentStep = step === 'form' ? 1 : 2;
              const isComplete = item.number < currentStep;
              const isCurrent = item.number === currentStep;
              return (
                <div className="setup-stepper-item" key={item.step}>
                  <div
                    className={`setup-stepper-step ${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="setup-stepper-number">{isComplete ? '✓' : item.number}</span>
                    <span className="setup-stepper-label">{item.label}</span>
                  </div>
                  {index < 2 && (
                    <span className={`setup-stepper-line ${item.number < currentStep ? 'is-complete' : ''}`} />
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* Divider */}
        {(step === 'form' || step === 'recovery_key') && (
          <div className="launch-divider">
            <span>{step === 'form' ? 'بيانات المنشأة والمسؤول' : 'حماية الحساب'}</span>
          </div>
        )}

        {/* STEP 1: Main Reference Form */}
        {step === 'form' && (
          <form className="launch-form" onSubmit={handleSubmit}>
            {/* Business Name */}
            <div className="launch-field">
              <label className="launch-label" htmlFor="business-name">
                اسم النشاط / المنشأة <span className="field-sub">(Business / Office Name)</span>
              </label>
              <input
                id="business-name"
                type="text"
                className="launch-input"
                placeholder="مثال: مكتب الأستاذ أحمد للمحاماة، صالة الأبطال، متجر فوكس..."
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* First Name / Owner Name */}
            <div className="launch-field">
              <label className="launch-label" htmlFor="owner-name">
                اسم صاحب العمل / المدير <span className="field-sub">(First Name / Owner)</span>
              </label>
              <input
                id="owner-name"
                type="text"
                className="launch-input"
                placeholder="أدخل اسمك الكريم"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            {/* Username / Email */}
            <div className="launch-field">
              <label className="launch-label" htmlFor="admin-username">
                اسم المستخدم للدخول <span className="field-sub">(Username / Email)</span>
              </label>
              <input
                id="admin-username"
                type="text"
                className="launch-input"
                placeholder="مثال: admin أو yourname@mail.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="launch-field">
              <label className="launch-label" htmlFor="admin-password">
                كلمة المرور <span className="field-sub">(Password)</span>
              </label>
              <div className="launch-input-box">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  className="launch-input"
                  placeholder="6 أحرف أو أرقام على الأقل"
                  minLength="6"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="launch-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="launch-field">
              <label className="launch-label" htmlFor="admin-confirm-password">
                تأكيد كلمة المرور <span className="field-sub">(Confirm Password)</span>
              </label>
              <input
                id="admin-confirm-password"
                type={showPassword ? 'text' : 'password'}
                className="launch-input"
                placeholder="أعد إدخال كلمة المرور"
                minLength="6"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {/* Phone */}
            <div className="launch-field">
              <label className="launch-label" htmlFor="admin-phone">
                رقم الهاتف <span className="field-sub">(Phone)</span>
              </label>
              <div className="launch-phone-wrap">
                <div className="launch-phone-badge" title="جمهورية مصر العربية">
                  <span className="launch-flag">🇪🇬</span>
                  <span className="launch-country-code">+20</span>
                </div>
                <input
                  id="admin-phone"
                  type="tel"
                  className="launch-input launch-phone-input"
                  placeholder="010XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Terms notice */}
            <p className="launch-terms">
              بإنشاء حسابك وتفعيل النظام، أنت توافق على{' '}
              <span className="launch-terms-link">شروط الاستخدام</span> و{' '}
              <span className="launch-terms-link">سياسة الخصوصية</span>.
            </p>

            {/* Error message */}
            {error && <div className="launch-error-banner">{error}</div>}

            {/* Big Launch Button */}
            <button type="submit" className="launch-btn" disabled={loading}>
              {loading ? (
                <span className="launch-btn-loading">
                  <span className="launch-spinner" /> جاري الإعداد والتشغيل...
                </span>
              ) : (
                'Launch Business • بدء تشغيل النظام'
              )}
            </button>

            {/* Footer */}
            <div className="launch-footer-row">
              <span>لديك حساب بالفعل؟</span>
              <button
                type="button"
                className="launch-signin-btn"
                onClick={() => setSetupRequired(false)}
              >
                تسجيل الدخول (Sign In)
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Recovery Golden Key */}
        {step === 'recovery_key' && (
          <div className="launch-step-box">
            <div className="recovery-badge-circle">🔑</div>
            <h2 className="recovery-title">مفتاح الاسترداد في حالات الطوارئ</h2>
            <p className="recovery-desc">
              تم إنشاء حسابك بنجاح! هذا المفتاح هو وسيلتك الوحيدة لاسترجاع حسابك إذا نسيت كلمة المرور مستقبلاً بدون الحاجة لاتصال إنترنت.
            </p>

            <div className="recovery-card">
              <div className="recovery-card-label">
                <span>🛡️</span> <span>مفتاح الطوارئ الخاص بك (Rescue Key):</span>
              </div>
              <div className="recovery-key-display">
                <code className="recovery-key-code">{recoveryKey}</code>
                <button
                  type="button"
                  className={`recovery-copy-btn ${copiedKey ? 'copied' : ''}`}
                  onClick={handleCopyKey}
                >
                  {copiedKey ? '✓ تم النسخ' : '📋 نسخ الرمز'}
                </button>
              </div>
              <p className="recovery-hint">💡 احتفظ بهذا المفتاح في مكان آمن وخاص بك وحدك.</p>
            </div>

            <label className="recovery-confirm-check">
              <input
                type="checkbox"
                checked={confirmedSaved}
                onChange={(e) => setConfirmedSaved(e.target.checked)}
              />
              <span>أقر بأنني قمت بنسخ وحفظ هذا المفتاح في مكان آمن.</span>
            </label>

            {error && <div className="launch-error-banner">{error}</div>}

            <button
              type="button"
              className="launch-btn"
              onClick={handleFinishSetup}
              disabled={!confirmedSaved}
            >
              متابعة لاختيار قطاع النشاط 🚀
            </button>
          </div>
        )}

        {/* ONBOARDING STEP 1: Sector Selection */}
        {step === 'sector' && (
          <div className="onboarding-step-wrapper" style={{ width: '100%' }}>
            <OnboardingStepper currentStep={1} />
            <SectorCardsStep
              storeName={businessName}
              selectedSector={selectedSector || 'retail'}
              customSectorName={customSectorName}
              onSelectSector={(key) => {
                setSelectedSector(key);
                setError('');
              }}
              onChangeCustomSectorName={setCustomSectorName}
              onNext={handleSectorStepNext}
            />
            {error && <div className="launch-error-banner" style={{ marginTop: '16px' }}>{error}</div>}
          </div>
        )}

        {/* ONBOARDING STEP 2: Customized Catalog & Pricing Preview */}
        {step === 'catalog' && (
          <div className="onboarding-step-wrapper" style={{ width: '100%' }}>
            <OnboardingStepper currentStep={2} />
            <CatalogPreviewStep
              sectorKey={selectedSector || 'retail'}
              storeName={businessName}
              customSectorName={customSectorName}
              onBack={handleCatalogStepBack}
              onNext={handleCatalogStepNext}
            />
            {error && <div className="launch-error-banner" style={{ marginTop: '16px' }}>{error}</div>}
          </div>
        )}

        {/* ONBOARDING STEP 3: 3D Provisioning Engine */}
        {step === 'provisioning' && (
          <div className="onboarding-step-wrapper" style={{ width: '100%' }}>
            <OnboardingStepper currentStep={3} />
            <ProvisioningStep
              customizedData={customizedCatalogData}
              onCompleted={handleProvisionCompleted}
            />
            {error && <div className="launch-error-banner" style={{ marginTop: '16px' }}>{error}</div>}
          </div>
        )}

        {/* ONBOARDING STEP 4: Launch Success */}
        {step === 'launch' && (
          <div className="onboarding-step-wrapper" style={{ width: '100%' }}>
            <OnboardingStepper currentStep={4} />
            <LaunchSuccessStep
              customizedData={customizedCatalogData}
              provisionSummary={provisionSummary}
              onLaunch={handleFinalAppLaunch}
            />
            {error && <div className="launch-error-banner" style={{ marginTop: '16px' }}>{error}</div>}
          </div>
        )}

      </div>
    </div>
  );
}
