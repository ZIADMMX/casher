import { useState, useEffect, useCallback } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';

const ALL_PERMISSIONS_BY_MODULE = [
  { moduleName: 'شاشة الكاشير والمبيعات (POS)', moduleKey: 'pos', permissions: ['pos.view', 'pos.sell', 'pos.discount', 'pos.refund'] },
  { moduleName: 'إدارة المنتجات والمخزون', moduleKey: 'inventory', permissions: ['products.view', 'products.create', 'products.edit', 'products.delete'] },
  { moduleName: 'سجل الفواتير والمبيعات', moduleKey: 'sales', permissions: ['sales.view', 'sales.refund', 'sales.export'] },
  { moduleName: 'العملاء والاتصالات (CRM)', moduleKey: 'customers', permissions: ['customers.view', 'customers.create', 'customers.edit', 'customers.delete'] },
  { moduleName: 'مركز الطلبات والعمليات', moduleKey: 'orders', permissions: ['orders.view', 'orders.manage', 'orders.delete'] },
  { moduleName: 'الاشتراكات والباقات', moduleKey: 'subscriptions', permissions: ['subscriptions.view', 'subscriptions.manage', 'subscriptions.freeze'] },
  { moduleName: 'العمولات والحوافز', moduleKey: 'commissions', permissions: ['commissions.view', 'commissions.manage'] },
  { moduleName: 'التقارير والتحليلات', moduleKey: 'reports', permissions: ['reports.view', 'reports.export'] },
  { moduleName: 'إعدادات النظام والأمان', moduleKey: 'settings', permissions: ['settings.view', 'settings.manage'] },
  { moduleName: 'البنية والديناميكية (Enterprise)', moduleKey: 'enterprise', permissions: ['enterprise.view', 'enterprise.manage'] },
];

function EnterpriseManagementPage() {
  const { refreshConfiguration } = useBusinessProfile();
  const [activeTab, setActiveTab] = useState('modules'); // 'modules', 'profiles', 'attributes', 'workflows', 'automations', 'roles'
  const [modules, setModules] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [attributeDefs, setAttributeDefs] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState('manager');
  const [selectedRolePermissions, setSelectedRolePermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // New Attribute Form
  const [newAttrForm, setNewAttrForm] = useState({
    attribute_name: '',
    attribute_key: '',
    data_type: 'text',
    is_required: false
  });

  // New Automation Form
  const [newAutoForm, setNewAutoForm] = useState({
    rule_name: '',
    trigger_event: 'sale_created',
    action_type: 'notify_user',
    threshold: '',
    points: 10,
    notification_title: 'تنبيه بيع جديد',
    notification_message: 'تم تسجيل فاتورة جديدة'
  });

  // New Role Form
  const [newRoleForm, setNewRoleForm] = useState({
    role_key: '',
    role_name: '',
    description: ''
  });

  const getApi = () => window.electronAPI || window.api || {};

  const loadData = useCallback(async () => {
    const api = getApi();
    setLoading(true);
    try {
      const [modsList, profsList, activeProf, attrsList, wfsList, autosList, rolesList] = await Promise.all([
        api.getSystemModules?.() || [],
        api.getBusinessProfiles?.() || [],
        api.getActiveBusinessProfile?.() || null,
        api.getAttributeDefinitions?.() || [],
        api.getWorkflows?.() || [],
        api.getAutomationRules?.() || [],
        api.getSystemRoles?.() || []
      ]);

      setModules(modsList);
      setProfiles(profsList);
      setActiveProfile(activeProf);
      setAttributeDefs(attrsList);
      setWorkflows(wfsList);
      setAutomations(autosList);
      setRoles(rolesList);

      const targetRole = rolesList.find(r => r.role_key === selectedRoleKey) || rolesList[0];
      if (targetRole) {
        setSelectedRoleKey(targetRole.role_key);
        setSelectedRolePermissions(targetRole.permissions || []);
      }
    } catch (err) {
      console.error('Failed to load enterprise data:', err);
      setMessage({ type: 'error', text: 'فشل تحميل بيانات إدارة المحرك والتكوين' });
    } finally {
      setLoading(false);
    }
  }, [selectedRoleKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleModule = async (key, currentStatus) => {
    const api = getApi();
    try {
      if (api.setModuleEnabled) {
        await api.setModuleEnabled(key, !currentStatus);
        setMessage({ type: 'success', text: `تم تحديث حالة القسم ${key}` });
        await loadData();
        await refreshConfiguration();
      }
    } catch (err) {
      alert('خطأ: ' + err.message);
    }
  };

  const handleSelectProfile = async (profileKey) => {
    const api = getApi();
    try {
      if (api.setActiveBusinessProfile) {
        await api.setActiveBusinessProfile(profileKey);
        setMessage({ type: 'success', text: `تم تفعيل القالب التجاري بنجاح!` });
        await loadData();
        await refreshConfiguration();
      }
    } catch (err) {
      alert('فشل تفعيل القالب: ' + err.message);
    }
  };

  const handleCreateAttribute = async (e) => {
    e.preventDefault();
    const api = getApi();
    if (!newAttrForm.attribute_name.trim() || !newAttrForm.attribute_key.trim()) return;
    try {
      if (api.createAttributeDefinition) {
        await api.createAttributeDefinition({
          ...newAttrForm,
          business_profile_key: activeProfile?.key || null,
        });
        setNewAttrForm({ attribute_name: '', attribute_key: '', data_type: 'text', is_required: false });
        setMessage({ type: 'success', text: 'تمت إضافة الخاصية الديناميكية بنجاح' });
        await loadData();
      }
    } catch (err) {
      alert('خطأ أثناء إضافة الخاصية: ' + err.message);
    }
  };

  const handleCreateAutomation = async (e) => {
    e.preventDefault();
    const api = getApi();
    if (!newAutoForm.rule_name.trim()) return;
    try {
      if (api.createAutomationRule) {
        const condition = newAutoForm.threshold !== '' ? { threshold: Number(newAutoForm.threshold) } : {};
        await api.createAutomationRule({
          rule_name: newAutoForm.rule_name,
          trigger_event: newAutoForm.trigger_event,
          condition_json: condition,
          action_type: newAutoForm.action_type,
          action_payload_json: {
            title: newAutoForm.notification_title,
            message: newAutoForm.notification_message,
            points: Number(newAutoForm.points) || 10,
            type: 'info'
          }
        });
        setNewAutoForm({
          rule_name: '',
          trigger_event: 'sale_created',
          action_type: 'notify_user',
          threshold: '',
          points: 10,
          notification_title: 'تنبيه بيع جديد',
          notification_message: 'تم تسجيل فاتورة جديدة'
        });
        setMessage({ type: 'success', text: 'تمت إضافة قاعدة الأتمتة التلقائية بنجاح' });
        await loadData();
      }
    } catch (err) {
      alert('خطأ أثناء إضافة القاعدة: ' + err.message);
    }
  };

  const handleToggleAutomation = async (id, currentStatus) => {
    const api = getApi();
    try {
      if (api.setAutomationRuleEnabled) {
        await api.setAutomationRuleEnabled(id, !currentStatus);
        await loadData();
      }
    } catch (err) {
      alert('خطأ: ' + err.message);
    }
  };

  const handleRoleSelectChange = (roleKey) => {
    setSelectedRoleKey(roleKey);
    const targetRole = roles.find(r => r.role_key === roleKey);
    setSelectedRolePermissions(targetRole ? targetRole.permissions || [] : []);
  };

  const handleTogglePermission = (permissionKey) => {
    if (selectedRolePermissions.includes('*')) return; // Admin full permission
    if (selectedRolePermissions.includes(permissionKey)) {
      setSelectedRolePermissions(selectedRolePermissions.filter(p => p !== permissionKey));
    } else {
      setSelectedRolePermissions([...selectedRolePermissions, permissionKey]);
    }
  };

  const handleToggleModuleAllPermissions = (modulePermissions) => {
    if (selectedRolePermissions.includes('*')) return;
    const hasAll = modulePermissions.every(p => selectedRolePermissions.includes(p));
    if (hasAll) {
      setSelectedRolePermissions(selectedRolePermissions.filter(p => !modulePermissions.includes(p)));
    } else {
      const merged = new Set([...selectedRolePermissions, ...modulePermissions]);
      setSelectedRolePermissions([...merged]);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    const api = getApi();
    if (!newRoleForm.role_key.trim() || !newRoleForm.role_name.trim()) return;
    try {
      if (api.createSystemRole) {
        await api.createSystemRole({
          roleKey: newRoleForm.role_key.trim().toLowerCase(),
          roleName: newRoleForm.role_name.trim(),
          description: newRoleForm.description.trim()
        });
        setNewRoleForm({ role_key: '', role_name: '', description: '' });
        setMessage({ type: 'success', text: 'تم إنشاء الدور الجديد بنجاح' });
        await loadData();
      }
    } catch (err) {
      alert('خطأ أثناء إضافة الدور: ' + err.message);
    }
  };

  const handleSaveRolePermissions = async () => {
    const api = getApi();
    try {
      if (api.setRolePermissions) {
        await api.setRolePermissions(selectedRoleKey, selectedRolePermissions);
        setMessage({ type: 'success', text: `تمت تحديثات صلاحيات الدور ${selectedRoleKey} بنجاح` });
        await loadData();
      }
    } catch (err) {
      alert('خطأ أثناء حفظ الصلاحيات: ' + err.message);
    }
  };

  return (
    <div className="enterprise-page-container" style={{ padding: '20px' }}>
      {/* Page Header */}
      <div className="page-header-row" style={{ marginBottom: '20px' }}>
        <div>
          <h1>⚙️ المحرك الديناميكي وإدارة البنية (Enterprise Engine)</h1>
          <p className="page-subtitle">تعديل الأقسام، أنماط الأنشطة، الصفات الديناميكية، سير العمل والأتمتة والصلاحيات</p>
        </div>
        <div>
          <button className="secondary-btn" onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔄 تحديث التكوين
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          backgroundColor: message.type === 'error' ? '#fef2f2' : '#ecfdf5',
          color: message.type === 'error' ? '#991b1b' : '#065f46',
          border: `1px solid ${message.type === 'error' ? '#fca5a5' : '#6ee7b7'}`
        }}>
          {message.text}
        </div>
      )}

      {/* Main Tab Navigation */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e5e7eb', paddingBottom: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button 
          className={`secondary-btn ${activeTab === 'modules' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveTab('modules')}
        >
          🧩 وحدات النظام (Modules)
        </button>
        <button 
          className={`secondary-btn ${activeTab === 'profiles' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveTab('profiles')}
        >
          🏢 أنماط الأنشطة (Business Profiles)
        </button>
        <button 
          className={`secondary-btn ${activeTab === 'attributes' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveTab('attributes')}
        >
          🏷️ الصفات الديناميكية (Attributes)
        </button>
        <button 
          className={`secondary-btn ${activeTab === 'workflows' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          🔄 سير العمل والحالات (Workflows)
        </button>
        <button 
          className={`secondary-btn ${activeTab === 'automations' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveTab('automations')}
        >
          ⚡ محرك الأتمتة (No-Code Rules)
        </button>
        <button 
          className={`secondary-btn ${activeTab === 'roles' ? 'active-tab-btn' : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          🔐 الأدوار والصلاحيات (Dynamic RBAC)
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>جاري تحميل تكوين المحرك...</div>
      ) : (
        <div>

          {/* TAB 1: MODULES */}
          {activeTab === 'modules' && (
            <div>
              <h3 style={{ marginBottom: '10px' }}>🧩 إدارة الأقسام والوحدات البرمجية</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '20px' }}>
                قم بتفعيل أو تعطيل أي قسم من القائمة الجانبية وشاشات النظام بنقرة واحدة
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {modules.map(mod => (
                  <div key={mod.key} style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{mod.name}</span>
                        <span className={`badge ${mod.is_enabled ? 'badge-success' : 'badge-neutral'}`}>
                          {mod.is_enabled ? 'مفعل ✅' : 'معطل ❌'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '4px 0 12px' }}>
                        {mod.description || 'وحدة برمجية تابعة للهيكل'}
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>مفتاح: `{mod.key}`</span>
                      <button 
                        className={mod.is_enabled ? 'secondary-btn' : 'primary-btn'} 
                        style={{ fontSize: '0.85rem', padding: '4px 12px' }}
                        onClick={() => handleToggleModule(mod.key, mod.is_enabled)}
                      >
                        {mod.is_enabled ? 'إيقاف التفعيل' : 'تفعيل القسم'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: BUSINESS PROFILES */}
          {activeTab === 'profiles' && (
            <div>
              <h3 style={{ marginBottom: '10px' }}>🏢 قوالب الأنشطة التجارية (Business Profiles Presets)</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '15px' }}>
                اختر نوع نشاط متجرك لضبط الأقسام المفعلة والصفات والمسميات تلقائياً
              </p>

              {activeProfile && (
                <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', padding: '10px 14px', borderRadius: '8px', marginBottom: '20px', color: '#065f46', fontSize: '0.9rem' }}>
                  <strong>القالب المفعل حالياً:</strong> {activeProfile.name}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {profiles.map(prof => (
                  <div key={prof.key} style={{
                    backgroundColor: prof.is_active ? '#f0fdf4' : '#ffffff',
                    border: prof.is_active ? '2px solid #10b981' : '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{prof.name}</span>
                        {prof.is_active && <span className="badge badge-success">القالب النشط حالياً 🌟</span>}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '12px' }}>
                      <button 
                        className={prof.is_active ? 'secondary-btn' : 'primary-btn'} 
                        disabled={prof.is_active}
                        onClick={() => handleSelectProfile(prof.key)}
                        style={{ width: '100%' }}
                      >
                        {prof.is_active ? '✓ القالب المفعل حالياً' : 'تطبيق هذا القالب التجاري'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DYNAMIC ATTRIBUTES */}
          {activeTab === 'attributes' && (
            <div>
              <h3 style={{ marginBottom: '10px' }}>🏷️ حقول وصفات المنتجات الديناميكية (Custom Attributes)</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '20px' }}>
                إضافة صفات مخصصة للمنتجات بدلاً من الاقتصار على المقاس واللون فقط
              </p>

              {/* Form Create Attribute */}
              <form onSubmit={handleCreateAttribute} style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px' }}>➕ إضافة خاصية جديدة للمنتجات</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>اسم الخاصية (عربي):</label>
                    <input 
                      type="text" 
                      placeholder="مثال: سنة الصنع، الماركة، الضمان"
                      value={newAttrForm.attribute_name}
                      onChange={(e) => setNewAttrForm({ ...newAttrForm, attribute_name: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>المفتاح البرمجي (English):</label>
                    <input 
                      type="text" 
                      placeholder="مثال: brand, model, warranty"
                      value={newAttrForm.attribute_key}
                      onChange={(e) => setNewAttrForm({ ...newAttrForm, attribute_key: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>نوع البيانات:</label>
                    <select 
                      value={newAttrForm.data_type}
                      onChange={(e) => setNewAttrForm({ ...newAttrForm, data_type: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    >
                      <option value="text">نص (Text)</option>
                      <option value="number">رقم (Number)</option>
                      <option value="date">تاريخ (Date)</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '12px', textAlign: 'left' }}>
                  <button type="submit" className="primary-btn">حفظ الخاصية الديناميكية</button>
                </div>
              </form>

              {/* Attributes List Table */}
              <div className="customers-table-card">
                <table className="customers-table">
                  <thead>
                    <tr>
                      <th>اسم الخاصية</th>
                      <th>المفتاح (Key)</th>
                      <th>نوع البيانات</th>
                      <th>مطلوبة؟</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attributeDefs.map(attr => (
                      <tr key={attr.id}>
                        <td><strong>{attr.attribute_name}</strong></td>
                        <td><code>{attr.attribute_key}</code></td>
                        <td><span className="badge badge-neutral">{attr.data_type}</span></td>
                        <td>{attr.is_required ? 'نعم ⚠️' : 'اختياري'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: WORKFLOWS */}
          {activeTab === 'workflows' && (
            <div>
              <h3 style={{ marginBottom: '10px' }}>🔄 سير العمل والحالات الديناميكية (Dynamic Workflows)</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '20px' }}>
                تخصيص مراحل وحالات الطلبات والصفقات البيعية دون تعديل في الكود البرمجي
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {workflows.map(wf => (
                  <div key={wf.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '1.1rem' }}>📌 مسار: {wf.name} ({wf.module_key})</h4>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 16px' }}>{wf.description}</p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {wf.statuses?.map((st, idx) => (
                        <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            backgroundColor: st.badge_color || '#3b82f6',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold'
                          }}>
                            {st.status_label} ({st.status_key})
                          </span>
                          {idx < wf.statuses.length - 1 && <span style={{ color: '#9ca3af' }}>➔</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: AUTOMATIONS */}
          {activeTab === 'automations' && (
            <div>
              <h3 style={{ marginBottom: '10px' }}>⚡ محرك الأتمتة والقواعد بدون كود (No-Code Automations)</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '20px' }}>
                تكوين أحداث وتنبيهات وإجراءات تلقائية فورية دون الحاجة لكتابة كود برمجي
              </p>

              {/* Automation Create Form */}
              <form onSubmit={handleCreateAutomation} style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px' }}>➕ إضافة قاعدة أتمتة جديدة</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>اسم القاعدة:</label>
                    <input 
                      type="text" 
                      placeholder="مثال: مكافأة مبيعات سريعة"
                      value={newAutoForm.rule_name}
                      onChange={(e) => setNewAutoForm({ ...newAutoForm, rule_name: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>الحدث المحفز (Trigger):</label>
                    <select 
                      value={newAutoForm.trigger_event}
                      onChange={(e) => setNewAutoForm({ ...newAutoForm, trigger_event: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    >
                      <option value="sale_created">إتمام عملية بيع جديد (sale_created)</option>
                      <option value="sale_amount_exceeded">تخطي المبلغ الإجمالي للفاتورة (sale_amount_exceeded)</option>
                      <option value="stock_low">انخفاض مخزون منتج (stock_low)</option>
                      <option value="customer_debt_exceeded">تخطي حد دَين العميل (customer_debt_exceeded)</option>
                      <option value="order_status_changed">تغيير حالة طلب (order_status_changed)</option>
                      <option value="customer_subscription_expired">انتهاء اشتراك عميل (customer_subscription_expired)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>حد الشرط / Threshold (اختياري):</label>
                    <input 
                      type="number" 
                      placeholder="مثال: 1000 ج.م أو 5 قطع"
                      value={newAutoForm.threshold}
                      onChange={(e) => setNewAutoForm({ ...newAutoForm, threshold: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>الإجراء التلقائي (Action):</label>
                    <select 
                      value={newAutoForm.action_type}
                      onChange={(e) => setNewAutoForm({ ...newAutoForm, action_type: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    >
                      <option value="notify_user">إرسال إشعار للنظام (notify_user)</option>
                      <option value="grant_loyalty_points">منح نقاط ولاء تلقائية للعميل (grant_loyalty_points)</option>
                      <option value="add_customer_note">إضافة ملاحظة وتفاعل لسجل CRM (add_customer_note)</option>
                      <option value="flag_order_urgent">تمييز الطلب كـ عاجل (flag_order_urgent)</option>
                    </select>
                  </div>
                </div>

                {newAutoForm.action_type === 'grant_loyalty_points' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>عدد نقاط الولاء:</label>
                    <input 
                      type="number" 
                      value={newAutoForm.points}
                      onChange={(e) => setNewAutoForm({ ...newAutoForm, points: e.target.value })}
                      style={{ width: '200px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                )}

                <div style={{ marginTop: '12px', textAlign: 'left' }}>
                  <button type="submit" className="primary-btn">حفظ قاعدة الأتمتة</button>
                </div>
              </form>

              {/* Automation List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {automations.map(auto => (
                  <div key={auto.id} style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>{auto.rule_name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                        ⚡ المحفز: <code>{auto.trigger_event}</code> ➔ الإجراء: <code>{auto.action_type}</code>
                        {auto.condition_json && auto.condition_json !== '{}' && (
                          <span style={{ marginRight: '8px', color: '#2563eb' }}>[شرط: {auto.condition_json}]</span>
                        )}
                      </div>
                    </div>
                    <button 
                      className={auto.is_enabled ? 'secondary-btn' : 'primary-btn'}
                      onClick={() => handleToggleAutomation(auto.id, auto.is_enabled)}
                      style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                    >
                      {auto.is_enabled ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: ROLES & RBAC MATRIX */}
          {activeTab === 'roles' && (
            <div>
              <h3 style={{ marginBottom: '10px' }}>🔐 الأدوار ومصفوفة الصلاحيات الديناميكية (Dynamic RBAC)</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '20px' }}>
                إنشاء أدوار مستخدمين جديدة وتحديد مصفوفة الصلاحيات المسموح بها بدقة لكل وظيفة
              </p>

              {/* Create Custom Role */}
              <form onSubmit={handleCreateRole} style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px' }}>➕ إضافة دور مستخدم جديد (Custom Role)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>المفتاح البرمجي (Key):</label>
                    <input 
                      type="text" 
                      placeholder="مثال: supervisor, accountant"
                      value={newRoleForm.role_key}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, role_key: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>اسم الدور (عنوان الوظيفة):</label>
                    <input 
                      type="text" 
                      placeholder="مثال: مشرف وردية / محاسب"
                      value={newRoleForm.role_name}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, role_name: e.target.value })}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>الوصف:</label>
                    <input 
                      type="text" 
                      placeholder="وصف مختصر للوظيفة وصلاحياتها"
                      value={newRoleForm.description}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '12px', textAlign: 'left' }}>
                  <button type="submit" className="primary-btn">إنشاء الدور الجديد</button>
                </div>
              </form>

              {/* Role Picker & Permissions Matrix Grid */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <label style={{ fontWeight: 'bold', marginRight: '8px' }}>اختر الدور لتعديل صلاحياته:</label>
                    <select 
                      value={selectedRoleKey} 
                      onChange={(e) => handleRoleSelectChange(e.target.value)}
                      style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                    >
                      {roles.map(r => (
                        <option key={r.role_key} value={r.role_key}>
                          {r.role_name} ({r.role_key}) {r.is_system ? '[نظامي]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <button className="primary-btn" onClick={handleSaveRolePermissions}>
                      💾 حفظ مصفوفة الصلاحيات
                    </button>
                  </div>
                </div>

                {selectedRolePermissions.includes('*') ? (
                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '14px', borderRadius: '8px', color: '#1e40af' }}>
                    🌟 <strong>مدير النظام (Admin):</strong> يمتلك كافة الصلاحيات بشكل كامل في جميع الأقسام.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {ALL_PERMISSIONS_BY_MODULE.map(group => {
                      const hasAll = group.permissions.every(p => selectedRolePermissions.includes(p));
                      return (
                        <div key={group.moduleKey} style={{ border: '1px solid #f3f4f6', borderRadius: '8px', padding: '12px 16px', backgroundColor: '#fafafa' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{group.moduleName}</span>
                            <button 
                              type="button" 
                              className="secondary-btn" 
                              onClick={() => handleToggleModuleAllPermissions(group.permissions)}
                              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            >
                              {hasAll ? 'إلغاء تحديد الكل' : 'تحديد جميع صلاحيات القسم'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {group.permissions.map(perm => (
                              <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', backgroundColor: '#ffffff', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                <input 
                                  type="checkbox"
                                  checked={selectedRolePermissions.includes(perm)}
                                  onChange={() => handleTogglePermission(perm)}
                                />
                                <code>{perm}</code>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default EnterpriseManagementPage;
