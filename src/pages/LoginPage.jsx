import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import { normalizeErrorMessage } from '../utils/normalizeError.js';
import AdminRecoveryModal from '../components/AdminRecoveryModal.jsx';
import foxLogo from '../assets/fox-logo.png';
import './LoginPage.css';

function LoginPage() {
  const { login, setSetupRequired } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false);

  // Network & Central Server State
  const [serverAddress, setServerAddress] = useState('');
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverMessage, setServerMessage] = useState('');
  const [serverMessageStatus, setServerMessageStatus] = useState('info'); // 'success' | 'error' | 'info'
  const [lanServerStatus, setLanServerStatus] = useState({ isRunning: false, port: 5000, httpsPort: 5443 });
  const [lanServerIps, setLanServerIps] = useState([]);
  const [testingConnection, setTestingConnection] = useState(false);
  const [scanningLan, setScanningLan] = useState(false);
  const [connectionMode, setConnectionMode] = useState('standalone'); // 'master' | 'remote' | 'standalone'
  const [copiedIp, setCopiedIp] = useState(null);
  const [firewallConfiguring, setFirewallConfiguring] = useState(false);
  const [firewallMessage, setFirewallMessage] = useState('');
  // { baseUrl, fingerprint256 } waiting for the user to compare with the server screen
  const [pendingPairing, setPendingPairing] = useState(null);

  useEffect(() => {
    refreshNetworkInfo();
    if (window.electronAPI?.isSetupRequired) {
      window.electronAPI.isSetupRequired()
        .then((req) => setSetupAvailable(Boolean(req)))
        .catch(() => {});
    }
  }, []);

  async function refreshNetworkInfo() {
    try {
      const [config, status, ips] = await Promise.all([
        window.electronAPI.getCentralServerConfig(),
        window.electronAPI.getLanStatus(),
        window.electronAPI.getLanLocalIps(),
      ]);

      setServerAddress(config.baseUrl || '');
      setLanServerStatus(status);
      setLanServerIps(ips || []);

      if (status.isRunning) {
        setConnectionMode('master');
      } else if (config.baseUrl) {
        setConnectionMode('remote');
        if (!config.pinned) {
          setServerMessageStatus('info');
          setServerMessage('هذا الجهاز مربوط بالطريقة القديمة. اضغط "حفظ وربط" لتثبيت بصمة الخادم، ثم احذف شهادة الخادم من مخزن الشهادات الموثوقة في ويندوز.');
        }
      } else {
        setConnectionMode('standalone');
      }
    } catch (err) {
      console.error('Failed to load network config:', err);
    }
  }

  // Handle Mode Selection: Master Server Mode
  async function selectMasterMode() {
    setServerMessage('');
    try {
      if (!lanServerStatus.isRunning) {
        if (serverAddress) {
          await window.electronAPI.configureCentralServer('');
          setServerAddress('');
        }
        const status = await window.electronAPI.startLanServer(5000);
        if (status && status.success === false) {
          throw new Error(status.message || 'تعذر تشغيل الخادم على المنفذ 5000');
        }
        setLanServerStatus(status);
      }
      setConnectionMode('master');
      setServerMessageStatus('success');
      setServerMessage('تم تفعيل خادم HTTPS. عند ربط كل جهاز كاشير، قارن البصمة التي تظهر عليه بالبصمة الظاهرة هنا.');
    } catch (serverError) {
      setServerMessageStatus('error');
      setServerMessage(normalizeErrorMessage(serverError));
    }
  }

  // Handle Mode Selection: Remote Branch Mode
  async function selectRemoteMode() {
    setServerMessage('');
    try {
      if (lanServerStatus.isRunning) {
        await window.electronAPI.stopLanServer();
        setLanServerStatus({ isRunning: false, port: 5000, httpsPort: 5443 });
      }
      setConnectionMode('remote');
      setServerMessageStatus('info');
      setServerMessage('أدخل عنوان الـ IP الخاص بالخادم الرئيسي أدناه ثم اضغط "حفظ وربط".');
    } catch (err) {
      setServerMessageStatus('error');
      setServerMessage(normalizeErrorMessage(err));
    }
  }

  // Handle Mode Selection: Standalone Mode
  async function selectStandaloneMode() {
    setServerMessage('');
    try {
      if (lanServerStatus.isRunning) {
        await window.electronAPI.stopLanServer();
        setLanServerStatus({ isRunning: false, port: 5000, httpsPort: 5443 });
      }
      if (serverAddress) {
        await window.electronAPI.configureCentralServer('');
        setServerAddress('');
      }
      setConnectionMode('standalone');
      setServerMessageStatus('info');
      setServerMessage('يعمل الجهاز الآن بشكل محلي مستقل دون ربط شبكي.');
    } catch (err) {
      setServerMessageStatus('error');
      setServerMessage(normalizeErrorMessage(err));
    }
  }

  function formatServerUrl(input) {
    let raw = input.trim();
    if (!raw) return '';
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }
    try {
      const urlObj = new URL(raw);
      if (urlObj.protocol === 'http:') {
        urlObj.protocol = 'https:';
        urlObj.port = urlObj.port ? String(Number(urlObj.port) + 443) : '5443';
      }
      if (!urlObj.port) {
        urlObj.port = '5443';
      }
      return urlObj.toString().replace(/\/$/, '');
    } catch {
      return raw;
    }
  }

  async function saveServerAddress() {
    setServerMessage('');
    const formatted = formatServerUrl(serverAddress);
    if (!formatted) {
      return selectStandaloneMode();
    }

    try {
      const { baseUrl, fingerprint256 } = await window.electronAPI.getCentralServerFingerprint(formatted);
      setPendingPairing({ baseUrl, fingerprint256 });
      setServerMessageStatus('info');
      setServerMessage('قارن البصمة أدناه بالبصمة الظاهرة على شاشة الخادم قبل التأكيد.');
    } catch (configError) {
      setPendingPairing(null);
      setServerMessageStatus('error');
      setServerMessage(normalizeErrorMessage(configError));
    }
  }

  async function confirmPairing() {
    if (!pendingPairing) return;
    try {
      const result = await window.electronAPI.configureCentralServer(pendingPairing);
      setServerAddress(result.baseUrl || pendingPairing.baseUrl);
      setConnectionMode('remote');
      setServerMessageStatus('success');
      setServerMessage('تم ربط الجهاز بالخادم الرئيسي وتثبيت بصمته بنجاح!');
    } catch (configError) {
      setServerMessageStatus('error');
      setServerMessage(normalizeErrorMessage(configError));
    } finally {
      setPendingPairing(null);
    }
  }

  async function testServerConnection() {
    setServerMessage('');
    const formatted = formatServerUrl(serverAddress);
    if (!formatted) {
      setServerMessageStatus('error');
      setServerMessage('أدخل عنوان الخادم أو IP (مثال: https://192.168.1.10:5443).');
      return;
    }

    setTestingConnection(true);
    const start = Date.now();
    try {
      let res = await window.electronAPI.testLanConnection(formatted);
      
      if (!res || !res.success) {
        try {
          const centralRes = await window.electronAPI.testCentralServerConnection(formatted);
          if (centralRes && centralRes.name) {
            res = { success: true, message: `متصل بـ ${centralRes.name}` };
          }
        } catch (fallbackError) {
          console.warn('Central server fallback test failed:', fallbackError);
        }
      }

      const elapsed = Date.now() - start;

      if (res && res.success) {
        setServerAddress(formatted);
        setServerMessageStatus('success');
        const fingerprintNote = res.fingerprint256 ? ` · البصمة: ${res.fingerprint256}` : '';
        setServerMessage(`الاتصال ناجح ومستقر مع الخادم (${res.message || 'خادم FOX.CLOUD'}) · السرعة: ${elapsed}ms${fingerprintNote}`);
      } else {
        setServerMessageStatus('error');
        setServerMessage(res?.message || 'تعذر الاتصال بهذا العنوان. تأكد من تشغيل السيرفر ووجود الجهازين على نفس الشبكة.');
      }
    } catch (configError) {
      setServerMessageStatus('error');
      setServerMessage(normalizeErrorMessage(configError));
    } finally {
      setTestingConnection(false);
    }
  }

  async function scanLanNetwork() {
    setScanningLan(true);
    setServerMessageStatus('info');
    setServerMessage('جاري فحص الأجهزة المتاحة على الشبكة المحلية (LAN)...');

    try {
      const localIps = lanServerIps.map(i => i.address);
      const primaryIp = localIps[0] || '192.168.1.1';
      const subnetParts = primaryIp.split('.').slice(0, 3).join('.');

      const candidateIps = [];
      for (let host = 1; host <= 20; host++) {
        const testIp = `${subnetParts}.${host}`;
        if (!localIps.includes(testIp)) {
          candidateIps.push(`https://${testIp}:5443`);
        }
      }

      const results = await Promise.all(
        candidateIps.map(async (url) => {
          try {
            const testRes = await window.electronAPI.testLanConnection(url);
            if (testRes && testRes.success) return url;
          } catch {
            return null;
          }
          return null;
        })
      );

      const foundServer = results.find(url => url !== null);

      if (foundServer) {
        setServerAddress(foundServer);
        setServerMessageStatus('success');
        setServerMessage(`تم العثور على خادم FOX.CLOUD نشط على الشبكة: ${foundServer}`);
      } else {
        setServerMessageStatus('info');
        setServerMessage(`لم يتم العثور تلقائياً على سيرفر نشط في نطاق ${subnetParts}.X. يمكنك إدخال الـ IP يدوياً.`);
      }
    } catch (err) {
      setServerMessageStatus('error');
      setServerMessage(`حدث خطأ أثناء فحص الشبكة: ${normalizeErrorMessage(err)}`);
    } finally {
      setScanningLan(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  }

  async function handleConfigureFirewall() {
    setFirewallConfiguring(true);
    setFirewallMessage('');
    try {
      if (window.electronAPI?.openLanFirewall) {
        const res = await window.electronAPI.openLanFirewall(lanServerStatus.port || 5000);
        setFirewallMessage(res.message || 'تم ضبط جدار الحماية بنجاح.');
      } else {
        setFirewallMessage('الميزة غير متاحة في هذا الإصدار.');
      }
    } catch (err) {
      setFirewallMessage(normalizeErrorMessage(err));
    } finally {
      setFirewallConfiguring(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(normalizeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function getNetworkBadge() {
    if (connectionMode === 'master') {
      return {
        label: 'خادم رئيسي نشط (Master)',
        color: '#10B981',
        bg: 'rgba(16, 185, 129, 0.12)',
        border: 'rgba(16, 185, 129, 0.3)',
        icon: '🏢',
      };
    }
    if (connectionMode === 'remote') {
      return {
        label: `كاشير فرعي (${serverAddress ? serverAddress.replace(/^https?:\/\//, '') : 'مُهيأ'})`,
        color: '#F2600C',
        bg: 'rgba(242, 96, 12, 0.12)',
        border: 'rgba(242, 96, 12, 0.35)',
        icon: '🔗',
      };
    }
    return {
      label: 'جهاز محلي مستقل',
      color: '#94A3B8',
      bg: 'rgba(148, 163, 184, 0.08)',
      border: 'rgba(148, 163, 184, 0.2)',
      icon: '💻',
    };
  }

  const badgeInfo = getNetworkBadge();

  return (
    <div className="login-container">
      {/* Background ambient light */}
      <div className="login-bg-glow" />

      {/* Main Glass Card */}
      <div className="login-card">
        
        {/* Top Network Pill Button */}
        <div className="login-top-bar">
          <button
            type="button"
            className="login-network-pill"
            onClick={() => {
              refreshNetworkInfo();
              setShowServerModal(true);
            }}
            style={{
              backgroundColor: badgeInfo.bg,
              borderColor: badgeInfo.border,
              color: badgeInfo.color,
            }}
            title="انقر لتعديل إعدادات الربط والشبكة المحلية"
          >
            <span className="login-pill-dot" style={{ backgroundColor: badgeInfo.color }} />
            <span className="login-pill-icon">{badgeInfo.icon}</span>
            <span className="login-pill-text">{badgeInfo.label}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, marginRight: 2 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Brand Header */}
        <div className="login-header">
          <div className="login-logo-wrap">
            <img src={foxLogo} alt="FOX .CLOUD" className="login-logo-img" />
          </div>
          <h1 className="login-title">
            FOX <span className="login-title-dot">.</span><span className="login-title-cloud">CLOUD</span>
          </h1>
          <p className="login-subtitle">
            سجل دخولك للوصول إلى لوحة تحكم ونقاط بيع متجرك
          </p>
        </div>

        {/* Divider */}
        <div className="login-divider">
          <span>تسجيل الدخول للنظام</span>
        </div>

        {/* Login Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {/* Username / Email */}
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">
              اسم المستخدم أو البريد <span className="field-sub">(Username / Email)</span>
            </label>
            <div className="login-input-box">
              <span className="login-field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                id="login-username"
                type="text"
                className="login-input login-input-with-icon"
                placeholder="أدخل اسم المستخدم أو البريد"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="login-label" htmlFor="login-password">
                كلمة المرور <span className="field-sub">(Password)</span>
              </label>
              <button
                type="button"
                className="login-forgot-link"
                onClick={() => setShowRecoveryModal(true)}
              >
                نسيت كلمة المرور؟
              </button>
            </div>
            <div className="login-input-box">
              <span className="login-field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input login-input-with-icon login-input-password"
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && <div className="login-error-banner">{error}</div>}

          {/* Sign In Button */}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-btn-loading">
                <span className="login-spinner" /> جاري التحقق وتسجيل الدخول...
              </span>
            ) : (
              'تسجيل الدخول • Sign In'
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="login-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {setupAvailable && (
            <button
              type="button"
              className="login-forgot-link"
              style={{ color: '#F2600C', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
              onClick={() => setSetupRequired && setSetupRequired(true)}
            >
              🚀 العودة لإعداد النظام لأول مرة (إنشاء النشاط والمدير)
            </button>
          )}
          <span>FOX .CLOUD • Enterprise Smart POS</span>
        </div>
      </div>

      {/* Network Configuration Modal */}
      {showServerModal && (
        <div className="network-modal-overlay" onClick={() => setShowServerModal(false)}>
          <div className="network-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="network-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="network-icon-circle">🌐</div>
                <div>
                  <h3 className="network-modal-title">إعدادات الربط والشبكة المحلية</h3>
                  <p className="network-modal-subtitle">ربط الكاشيرات والفروع بقاعدة بيانات موحدة</p>
                </div>
              </div>
              <button type="button" className="network-modal-close" onClick={() => setShowServerModal(false)}>×</button>
            </div>

            <div className="network-modal-body">
              <label className="network-section-title">اختر وضع التشغيل لهذا الجهاز:</label>
              
              <div className="network-modes-grid">
                {/* Master Node */}
                <div
                  className={`network-mode-card ${connectionMode === 'master' ? 'active' : ''}`}
                  onClick={selectMasterMode}
                >
                  <div className="mode-card-header">
                    <span className="mode-icon">🏢</span>
                    <div className="mode-toggle-switch">
                      <input
                        type="checkbox"
                        checked={lanServerStatus.isRunning}
                        onChange={selectMasterMode}
                      />
                      <span className="switch-slider" />
                    </div>
                  </div>
                  <h4>الخادم الرئيسي (Master Node)</h4>
                  <p>اجعل هذا الجهاز هو السيرفر الذي تستند إليه بقية الكاشيرات والفروع.</p>
                  
                  {lanServerStatus.isRunning && (
                    <div className="mode-ips-box" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', color: '#94A3B8' }}>عناوين HTTPS للأجهزة الأخرى:</span>
                      </div>

                      {/* Computer Hostname URL (Recommended) */}
                      {lanServerStatus.hostname && (
                        <div
                          className="mode-ip-item"
                          style={{ borderColor: 'rgba(59, 130, 246, 0.4)', background: 'rgba(59, 130, 246, 0.08)' }}
                          onClick={() => copyToClipboard(`https://${lanServerStatus.hostname}:${lanServerStatus.httpsPort || 5443}`)}
                          title="انقر لنسخ عنوان HTTPS باسم الجهاز"
                        >
                          <code>{`https://${lanServerStatus.hostname}:${lanServerStatus.httpsPort || 5443}`}</code>
                          <span style={{ color: '#60A5FA', fontSize: '11px' }}>
                            {copiedIp === `https://${lanServerStatus.hostname}:${lanServerStatus.httpsPort || 5443}` ? '✓ تم النسخ' : 'اسم الجهاز 📋'}
                          </span>
                        </div>
                      )}

                      {/* Local IPv4 items */}
                      {lanServerIps.map((ip, idx) => {
                        const fullUrl = `https://${ip.address}:${lanServerStatus.httpsPort || 5443}`;
                        return (
                          <div
                            key={idx}
                            className="mode-ip-item"
                            onClick={() => copyToClipboard(fullUrl)}
                            title="انقر لنسخ عنوان الـ IP"
                          >
                            <code>{fullUrl}</code>
                            <span>{copiedIp === fullUrl ? '✓ تم النسخ' : '📋'}</span>
                          </div>
                        );
                      })}

                      {lanServerStatus.certificatePath && (
                        <div style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', color: '#FCD34D', fontSize: '11px', lineHeight: 1.7 }}>
                          <div>بصمة الخادم (SHA-256). عند ربط كل جهاز كاشير ستظهر له بصمة؛ اربطه فقط إذا كانت مطابقة لهذه:</div>
                          <code dir="ltr" style={{ display: 'block', overflowWrap: 'anywhere' }}>{lanServerStatus.certificateFingerprint}</code>
                          <div>لا حاجة لنسخ الشهادة أو تثبيتها في ويندوز. لا تشارك ملف <code>server.key</code>.</div>
                        </div>
                      )}

                      {/* Windows Firewall Permission Button */}
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                        <button
                          type="button"
                          onClick={handleConfigureFirewall}
                          disabled={firewallConfiguring}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#34D399',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>🛡️</span>
                          <span>{firewallConfiguring ? 'جاري ضبط جدار الحماية...' : `السماح بمنفذ HTTPS ${lanServerStatus.httpsPort || 5443} في جدار الحماية`}</span>
                        </button>
                        {firewallMessage && (
                          <div style={{
                            fontSize: '11px',
                            marginTop: '6px',
                            textAlign: 'center',
                            color: firewallMessage.includes('تعذر') || firewallMessage.includes('خطأ') ? '#F87171' : '#34D399'
                          }}>
                            {firewallMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Branch Node */}
                <div
                  className={`network-mode-card ${connectionMode === 'remote' ? 'active' : ''}`}
                  onClick={selectRemoteMode}
                >
                  <div className="mode-card-header">
                    <span className="mode-icon">🔗</span>
                    {connectionMode === 'remote' && <span className="active-dot-badge">مُفعّل</span>}
                  </div>
                  <h4>كاشير فرعي (Branch Node)</h4>
                  <p>اتصل بسيرفر رئيسي آخر موجود على نفس الشبكة المحلية (LAN).</p>
                </div>
              </div>

              {/* Standalone Button */}
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className={`network-standalone-btn ${connectionMode === 'standalone' ? 'active' : ''}`}
                  onClick={selectStandaloneMode}
                >
                  💻 العمل كـ جهاز محلي مستقل (بدون ربط شبكي)
                </button>
              </div>

              {/* Remote Server Section */}
              {connectionMode === 'remote' && (
                <div className="network-input-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label htmlFor="central-server-address" style={{ margin: 0, fontSize: '13px', color: '#E2E8F0', fontWeight: '600' }}>
                      عنوان الخادم الرئيسي (IP أو URL)
                    </label>
                    <button
                      type="button"
                      className="network-scan-link"
                      onClick={scanLanNetwork}
                      disabled={scanningLan}
                    >
                      {scanningLan ? '🔍 جاري الفحص...' : '🔍 فحص أجهزة الشبكة تلقائياً'}
                    </button>
                  </div>

                  <div className="network-input-group">
                    <input
                      id="central-server-address"
                      type="text"
                      className="network-text-input"
                      value={serverAddress}
                      onChange={(event) => {
                        setServerAddress(event.target.value);
                        setPendingPairing(null);
                      }}
                      placeholder="192.168.1.10:5443"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      className="network-action-btn secondary"
                      onClick={testServerConnection}
                      disabled={testingConnection || !serverAddress.trim()}
                    >
                      {testingConnection ? 'جاري الفحص...' : '⚡ فحص الاتصال'}
                    </button>
                    <button
                      type="button"
                      className="network-action-btn primary"
                      onClick={saveServerAddress}
                    >
                      حفظ وربط
                    </button>
                  </div>

                  {pendingPairing && (
                    <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: '#FCD34D', fontSize: '12px', lineHeight: 1.7 }}>
                      <div>بصمة الخادم <code dir="ltr">{pendingPairing.baseUrl}</code>:</div>
                      <code dir="ltr" style={{ display: 'block', overflowWrap: 'anywhere', fontSize: '12.5px', color: '#FDE68A' }}>
                        {pendingPairing.fingerprint256}
                      </code>
                      <div>هل تطابق البصمة الظاهرة على شاشة الخادم حرفًا بحرف؟ إذا اختلفت فلا تؤكد، فقد يكون جهاز آخر ينتحل الخادم.</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button type="button" className="network-action-btn primary" onClick={confirmPairing}>
                          البصمة مطابقة، اربط الجهاز
                        </button>
                        <button type="button" className="network-action-btn secondary" onClick={() => setPendingPairing(null)}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback Message */}
              {serverMessage && (
                <div className={`network-feedback-box ${serverMessageStatus}`}>
                  <span>{serverMessageStatus === 'success' ? '✅' : serverMessageStatus === 'error' ? '❌' : 'ℹ️'}</span>
                  <p>{serverMessage}</p>
                </div>
              )}
            </div>

            <div className="network-modal-footer">
              <button
                type="button"
                className="login-btn"
                style={{ height: '42px', fontSize: '13.5px' }}
                onClick={() => setShowServerModal(false)}
              >
                تأكيد وإغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Recovery Golden Key Modal */}
      <AdminRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        onResetSuccess={() => {
          setError('');
        }}
      />
    </div>
  );
}

export default LoginPage;
