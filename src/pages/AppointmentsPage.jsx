import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import '../styles/appointments.css';

const GYM_RESOURCE_TYPES = [
  ['trainer', '🏋️‍♂️ كابتن / مدرب شخصي (PT)'],
  ['class_hall', '🧘 صالة كلاسات جماعية'],
  ['sauna_spa', '🧖‍♂️ منطقة سونا وسبا / ريكفري'],
  ['inbody_room', '📊 غرفة قياسات InBody وتغذية'],
  ['court_field', '⚽ ملعب / صالة مخصصة'],
  ['device_zone', '🏋️ منطقة أجهزة مخصصة'],
  ['other', 'أخرى'],
];

const LAW_FIRM_RESOURCE_TYPES = [
  ['employee', 'محامٍ / مستشار قانوني'],
  ['room', 'قاعة جلسات / غرفة اجتماعات'],
  ['chair', 'سكرتير / موظف قانوني'],
  ['car', 'انتقال إلى المحكمة'],
  ['device', 'جلسة عن بُعد / اتصال مرئي'],
  ['other', 'أخرى'],
];

const STATUS_LABELS = {
  booked: 'محجوز',
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  no_show: 'لم يحضر',
  converted: 'محول لطلب خدمة',
};

const GYM_STATUS_LABELS = {
  ...STATUS_LABELS,
  confirmed: 'مؤكد 🟢',
  completed: 'مكتمل ✅',
  cancelled: 'ملغي ❌',
  no_show: 'لم يحضر ⚠️',
  converted: 'محول لطلب خدمة 📑',
};

function LegalIcon({ name, size = 18 }) {
  const paths = {
    scale: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM8 21h8" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 14h.01" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    alert: <><path d="m12 3 9 18H3l9-18Z" /><path d="M12 9v4M12 17h.01" /></>,
  };
  return (
    <svg
      className="legal-appointment-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function localDateValue(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultHours() {
  return DAYS.map((_, weekday) => ({
    weekday,
    enabled: weekday < 6, // Open 6 days by default for Gyms
    startTime: '08:00',
    endTime: '22:00',
  }));
}

const blankResource = (resourceType = 'trainer') => ({
  id: null,
  name: '',
  resourceType,
  description: '',
  isActive: true,
  workingHours: defaultHours(),
});

const blankService = (resourceType = 'trainer') => ({
  id: null,
  name: '',
  durationMinutes: 45,
  bufferMinutes: 15,
  price: 150,
  resourceType,
  description: '',
  isActive: true,
});

const blankHoliday = () => ({
  resourceId: '',
  startDate: localDateValue(new Date()),
  endDate: localDateValue(new Date()),
  startTime: '',
  endTime: '',
  name: '',
});

const blankAppointment = () => ({
  serviceId: '',
  resourceId: '',
  customerId: '',
  customerName: '',
  customerPhone: '',
  startAt: '',
  depositAmount: 0,
  reminderMinutes: 60,
  deductSubscriptionCredit: true,
  notes: '',
});

function AppointmentsPage() {
  const { configuration } = useBusinessProfile();
  const isLawFirm = configuration?.profile?.key === 'law_firm';
  const resourceTypes = isLawFirm ? LAW_FIRM_RESOURCE_TYPES : GYM_RESOURCE_TYPES;
  const text = useCallback((gym, lawFirm) => (isLawFirm ? lawFirm : gym), [isLawFirm]);
  const tabs = isLawFirm ? [
    ['appointments', 'جدول الجلسات والاستشارات'],
    ['resources', 'المحامون وقاعات الجلسات'],
    ['services', 'أنواع الجلسات والخدمات القانونية'],
    ['holidays', 'أوقات عدم التوفر'],
  ] : [
    ['appointments', 'جدول حصص وتدريبات المشتركين'],
    ['resources', 'الكباتن والمدربين والصالات'],
    ['services', 'أنواع الحصص والجلسات'],
    ['holidays', 'مواعيد العمل وإجازات الكباتن'],
  ];
  const defaultResourceType = isLawFirm ? 'employee' : 'trainer';
  const [tab, setTab] = useState('appointments');
  const [resources, setResources] = useState([]);
  const [services, setServices] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(localDateValue(new Date()));

  // Active customer subscription info
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  
  const [resourceForm, setResourceForm] = useState(() => blankResource(defaultResourceType));
  const [serviceForm, setServiceForm] = useState(() => blankService(defaultResourceType));
  const [holidayForm, setHolidayForm] = useState(blankHoliday);
  const [appointmentForm, setAppointmentForm] = useState(blankAppointment);
  const [rescheduleForm, setRescheduleForm] = useState(null);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeResources = useMemo(() => resources.filter((r) => Boolean(r.is_active)), [resources]);
  const activeServices = useMemo(() => services.filter((s) => Boolean(s.is_active)), [services]);
  
  const selectedService = useMemo(() => (
    services.find((s) => String(s.id) === String(appointmentForm.serviceId))
  ), [services, appointmentForm.serviceId]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (!appointment || !appointment.start_at) return false;
      const appDateStr = appointment.start_at.slice(0, 10);
      if (appDateStr === selectedDate) return true;
      const parsed = new Date(appointment.start_at);
      return !isNaN(parsed.getTime()) && localDateValue(parsed) === selectedDate;
    });
  }, [appointments, selectedDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [resourceRows, serviceRows, holidayRows, appointmentRows, customerRows] = await Promise.all([
        window.electronAPI.getAppointmentResources ? window.electronAPI.getAppointmentResources() : [],
        window.electronAPI.getAppointmentServices ? window.electronAPI.getAppointmentServices() : [],
        window.electronAPI.getAppointmentHolidays ? window.electronAPI.getAppointmentHolidays() : [],
        window.electronAPI.getAppointments ? window.electronAPI.getAppointments() : [],
        window.electronAPI.getAllCustomersWithStats ? window.electronAPI.getAllCustomersWithStats() : [],
      ]);
      setResources(Array.isArray(resourceRows) ? resourceRows : []);
      setServices(Array.isArray(serviceRows) ? serviceRows : []);
      setHolidays(Array.isArray(holidayRows) ? holidayRows : []);
      setAppointments(Array.isArray(appointmentRows) ? appointmentRows : []);
      setCustomers(Array.isArray(customerRows) ? customerRows : []);
    } catch (loadError) {
      console.error(text('تعذر تحميل بيانات المواعيد والجيم:', 'تعذر تحميل بيانات المواعيد القانونية:'), loadError);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch active customer subscription when customer is selected
  useEffect(() => {
    async function checkSub() {
      if (isLawFirm || !appointmentForm.customerId) {
        setActiveSubscription(null);
        return;
      }
      setLoadingSubscription(true);
      try {
        if (window.electronAPI && window.electronAPI.getActiveSubscriptionByCustomer) {
          const sub = await window.electronAPI.getActiveSubscriptionByCustomer(Number(appointmentForm.customerId));
          setActiveSubscription(sub || null);
        }
      } catch (e) {
        console.error('فشل فحص اشتراك العميل:', e);
        setActiveSubscription(null);
      } finally {
        setLoadingSubscription(false);
      }
    }
    checkSub();
  }, [appointmentForm.customerId, isLawFirm]);

  async function runAction(action, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'تعذر تنفيذ العملية');
    } finally {
      setBusy(false);
    }
  }

  async function submitResource(event) {
    event.preventDefault();
    const workingHours = (resourceForm.workingHours || [])
      .filter((hours) => hours.enabled)
      .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }));
    
    await runAction(
      () => window.electronAPI.saveAppointmentResource({
        ...resourceForm,
        workingHours,
      }),
      resourceForm.id
        ? text('تم تحديث بيانات الكابتن وساعات عمله', 'تم تحديث بيانات المورد وأوقات عمله')
        : text('تمت إضافة الكابتن وساعات عمله بنجاح', 'تمت إضافة المورد وأوقات عمله بنجاح')
    );
    setResourceForm(blankResource(defaultResourceType));
  }

  async function submitService(event) {
    event.preventDefault();
    await runAction(
      () => window.electronAPI.saveAppointmentService(serviceForm),
      serviceForm.id
        ? text('تم تحديث الخدمة/الحصة بنجاح', 'تم تحديث الخدمة القانونية بنجاح')
        : text('تمت إضافة الحصة بنجاح', 'تمت إضافة الخدمة القانونية بنجاح')
    );
    setServiceForm(blankService(defaultResourceType));
  }

  async function submitHoliday(event) {
    event.preventDefault();
    await runAction(
      () => window.electronAPI.saveAppointmentHoliday(holidayForm),
      text('تم تسجيل إجازة الكابتن بنجاح', 'تم تسجيل وقت عدم التوفر بنجاح')
    );
    setHolidayForm(blankHoliday());
  }

  async function submitAppointment(event) {
    event.preventDefault();
    if (!appointmentForm.serviceId) return setError(text('الرجاء اختيار الخدمة/الحصة أولاً', 'الرجاء اختيار الجلسة أو الخدمة القانونية أولاً'));
    if (!appointmentForm.resourceId) return setError(text('الرجاء اختيار المدرب/الكابتن المسؤول', 'الرجاء اختيار المحامي أو المسؤول عن الموعد'));

    await runAction(
      async () => {
        // Create appointment in database
        const appt = await window.electronAPI.createAppointment({
          ...appointmentForm,
          serviceId: Number(appointmentForm.serviceId),
          resourceId: Number(appointmentForm.resourceId),
          customerId: appointmentForm.customerId ? Number(appointmentForm.customerId) : null,
          depositAmount: Number(appointmentForm.depositAmount || 0),
          reminderMinutes: Number(appointmentForm.reminderMinutes || 60),
        });

        // Deduct 1 credit from customer active subscription if selected
        if (!isLawFirm && appointmentForm.deductSubscriptionCredit && activeSubscription && activeSubscription.remaining_credits > 0) {
          try {
            await window.electronAPI.consumeSubscriptionCredit(
              activeSubscription.id,
              1,
              null,
              `خصم حصة لحجز ${selectedService?.name || 'حصة تدريب'} رقم #${appt.id}`
            );
          } catch (creditErr) {
            console.warn('تعذر خصم رصيد الاشتراك تلقائياً:', creditErr);
          }
        }
      },
      text('تم تأكيد حجز الحصة بنجاح وإشعار الكابتن والمشترك!', 'تم تأكيد الموعد وإشعار المحامي والموكل!'),
    );
    setAppointmentForm(blankAppointment());
    setActiveSubscription(null);
  }

  async function submitReschedule(event, appointmentId) {
    event.preventDefault();
    await runAction(
      () => window.electronAPI.rescheduleAppointment(appointmentId, {
        startAt: rescheduleForm.startAt,
        resourceId: Number(rescheduleForm.resourceId),
      }),
      text('تم تغيير وتأكيد موعد الحصة الجديد بنجاح', 'تم تعديل الموعد وتأكيده بنجاح'),
    );
    setRescheduleForm(null);
  }

  function beginReschedule(appointment) {
    const startAt = new Date(appointment.start_at);
    const pad = (v) => String(v).padStart(2, '0');
    setRescheduleForm({
      id: appointment.id,
      resourceId: String(appointment.resource_id),
      startAt: !isNaN(startAt.getTime())
        ? `${startAt.getFullYear()}-${pad(startAt.getMonth() + 1)}-${pad(startAt.getDate())}T${pad(startAt.getHours())}:${pad(startAt.getMinutes())}`
        : '',
    });
  }

  function editResource(resource) {
    if (!resource) return;
    const hoursList = Array.isArray(resource.workingHours) ? resource.workingHours : [];
    setResourceForm({
      id: resource.id,
      name: resource.name,
      resourceType: resource.resource_type || defaultResourceType,
      description: resource.description || '',
      isActive: Boolean(resource.is_active),
      workingHours: DAYS.map((_, weekday) => {
        const hours = hoursList.find((entry) => entry.weekday === weekday);
        return {
          weekday,
          enabled: Boolean(hours),
          startTime: hours?.start_time || '08:00',
          endTime: hours?.end_time || '22:00',
        };
      }),
    });
    setTab('resources');
  }

  const formatDateTime = (value) => {
    if (!value) return '';
    const dateObj = new Date(value);
    if (isNaN(dateObj.getTime())) return value;
    return dateObj.toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <section className={`appointments-page${isLawFirm ? ' law-firm-appointments' : ''}`} dir="rtl">
      {/* Header */}
      <header className="appointments-header">
        <div>
          <h1>
            {isLawFirm && <LegalIcon name="scale" size={22} />}
            {text('🏋️‍♂️ حجز الحصص والكباتن واشتراكات الجيم', 'المواعيد والجلسات القانونية')}
          </h1>
          <p>{text(
            'إدارة حصص التدريب الشخصي (PT)، الكلاسات الجماعية، وربطها المباشر بباقات واشتراكات الأعضاء.',
            'تنظيم جلسات المحاكم واستشارات الموكلين، وتحديد المحامي أو القاعة والوقت المناسب.'
          )}</p>
        </div>
        <button type="button" className="appointment-button secondary" onClick={loadData} disabled={busy}>
          {isLawFirm && <LegalIcon name="calendar" />}
          {isLawFirm ? 'تحديث الجدول' : '🔄 تحديث الجدول'}
        </button>
      </header>

      {/* Alerts */}
      {error && <div className="appointment-alert error" role="alert">{isLawFirm ? <LegalIcon name="alert" /> : '❌'} {error}</div>}
      {notice && <div className="appointment-alert success" role="status">{isLawFirm ? <LegalIcon name="check" /> : '✅'} {notice}</div>}

      {/* Navigation Tabs */}
      <nav className="appointments-tabs" aria-label={text('مواعيد الجيم والاشتراكات', 'المواعيد والجلسات القانونية')}>
      {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="appointment-empty">{text('جاري تحميل جدول الجيم والمشتركين...', 'جاري تحميل المواعيد والموكلين...')}</div>
      ) : (
        <>
          {/* TAB 1: APPOINTMENTS */}
          {tab === 'appointments' && (
            <div className="appointment-layout">
              {/* Create Appointment Form */}
              <form className="appointment-card" onSubmit={submitAppointment}>
                <h2>
                  {isLawFirm && <LegalIcon name="scale" />}
                  {text('🏋️ حجز حصة / سيشن للمشترك', 'تسجيل جلسة محكمة / استشارة موكّل')}
                </h2>
                
                {/* Select Customer */}
                <label>{text('المشترك / العميل', 'الموكل / العميل')}
                  <select
                    value={appointmentForm.customerId}
                    onChange={(e) => {
                      const custId = e.target.value;
                      const cust = customers.find(c => String(c.id) === String(custId));
                      setAppointmentForm(prev => ({
                        ...prev,
                        customerId: custId,
                        customerName: cust ? cust.name : prev.customerName,
                        customerPhone: cust ? (cust.phone || '') : prev.customerPhone
                      }));
                    }}
                  >
                    <option value="">{text('اختر مشترك مسجل في الجيم...', 'اختر موكلاً مسجلاً...')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Show Active Subscription Info Box if found */}
                {!isLawFirm && loadingSubscription && <div style={{ fontSize: '12px', color: '#3B82F6' }}>جاري جلب اشتراك العميل...</div>}
                
                {!isLawFirm && activeSubscription && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ fontWeight: 700 }}>💳 اشتراك نشط: {activeSubscription.package_name}</div>
                    <div>رصيد الحصص المتبقي: <strong>{activeSubscription.remaining_credits} حصة</strong> (من إجمالي {activeSubscription.total_credits})</div>
                    <div>ينتهي في: {activeSubscription.end_date}</div>
                    
                    {activeSubscription.remaining_credits > 0 && (
                      <label className="appointment-check" style={{ marginTop: '4px', color: isLawFirm ? '#475467' : '#FFF' }}>
                        <input
                          type="checkbox"
                          checked={appointmentForm.deductSubscriptionCredit}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, deductSubscriptionCredit: e.target.checked })}
                        />
                        خصم حصة واحدة من رصيد هذا الاشتراك تلقائياً عند الحجز
                      </label>
                    )}
                  </div>
                )}

                <label>{text('اسم المشترك', 'اسم الموكل')} *
                  <input
                    required
                    type="text"
                    placeholder={text('اسم المشترك', 'اسم الموكل')}
                    value={appointmentForm.customerName}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, customerName: event.target.value })}
                  />
                </label>

                <label>رقم الهاتف
                  <input
                    type="tel"
                    placeholder="010xxxxxxx"
                    value={appointmentForm.customerPhone}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, customerPhone: event.target.value })}
                  />
                </label>

                <label>{text('نوع الحصة / الخدمة', 'نوع الجلسة / الخدمة القانونية')} *
                  <select
                    required
                    value={appointmentForm.serviceId}
                    onChange={(event) => {
                      const newServiceId = event.target.value;
                      const svc = services.find(s => String(s.id) === String(newServiceId));
                      setAppointmentForm(prev => ({
                        ...prev,
                        serviceId: newServiceId,
                        resourceId: (svc?.resource_type && activeResources.find(r => r.id === Number(prev.resourceId))?.resource_type !== svc.resource_type)
                          ? '' : prev.resourceId
                      }));
                    }}
                  >
                    <option value="">{text('اختر الحصة (تدريب شخصي، كلاس، ريكفري...)', 'اختر الجلسة (استشارة، جلسة محكمة، متابعة ملف...)')}</option>
                    {activeServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} — ({service.duration_minutes || service.durationMinutes} دقيقة) — {Number(service.price).toFixed(2)} ج.م
                      </option>
                    ))}
                  </select>
                </label>

                <label>{text('الكابتن / المدرب / الصالة', 'المحامي / المسؤول / القاعة')} *
                  <select
                    required
                    value={appointmentForm.resourceId}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, resourceId: event.target.value })}
                  >
                    <option value="">{text('اختر المدرب أو الصالة...', 'اختر المحامي أو القاعة...')}</option>
                    {activeResources
                      .filter((resource) => !selectedService?.resource_type || resource.resource_type === selectedService.resource_type)
                      .map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name} ({resourceTypes.find(([val]) => val === resource.resource_type)?.[1] || resource.resource_type})
                        </option>
                      ))}
                  </select>
                </label>

                <label>{text('تاريخ ووقت الحصة', 'تاريخ ووقت الجلسة')} *
                  <input
                    type="datetime-local"
                    required
                    value={appointmentForm.startAt}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, startAt: event.target.value })}
                  />
                </label>

                <label>{text('العربون / المدفوع مقدماً (ج.م)', 'الأتعاب المدفوعة مقدماً (ج.م)')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={appointmentForm.depositAmount}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, depositAmount: event.target.value })}
                  />
                </label>

                <label>{text('تنبيه المشترك داخل التطبيق قبل الحصة (بالدقائق)', 'تذكير الموكل قبل الموعد (بالدقائق)')}
                  <input
                    type="number"
                    min="0"
                    max="10080"
                    value={appointmentForm.reminderMinutes}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, reminderMinutes: event.target.value })}
                  />
                </label>

                <label className="appointment-wide">{text('ملاحظات الحصة', 'ملاحظات الجلسة')}
                  <textarea
                    rows="2"
                    placeholder={text('تركيز التقديم، الإصابات، ملاحظات الكابتن...', 'رقم القضية، المحكمة، المستندات المطلوبة، أو تفاصيل الاستشارة...')}
                    value={appointmentForm.notes}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })}
                  />
                </label>

                <button className="appointment-button primary appointment-wide" type="submit" disabled={busy}>
                  {busy ? text('جاري الحجز...', 'جاري تسجيل الموعد...') : text('✅ تأكيد حجز الحصة', '✅ تأكيد حجز الموعد')}
                </button>
              </form>

              {/* Appointments List View */}
              <div className="appointment-card">
                <div className="appointment-card-heading">
                  <h2>{text('جدول الحصص اليومي', 'جدول الجلسات اليومي')}</h2>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    aria-label="تاريخ عرض المواعيد"
                  />
                </div>

                {!filteredAppointments.length ? (
                  <div className="appointment-empty">{text('لا توجد حصص محجوزة في هذا اليوم', 'لا توجد جلسات أو استشارات محجوزة في هذا اليوم')} ({selectedDate}).</div>
                ) : (
                  <div className="appointment-list">
                    {filteredAppointments.map((appointment) => (
                      <article className="appointment-item" key={appointment.id}>
                        <div className="appointment-item-title">
                          <strong>{isLawFirm && <LegalIcon name="briefcase" />}{!isLawFirm && '🏋️'} {appointment.service_name}</strong>
                          <span className={`appointment-status ${appointment.status}`}>
                            {isLawFirm && appointment.status === 'converted'
                              ? 'تم إصدار فاتورة أتعاب'
                              : (isLawFirm ? STATUS_LABELS : GYM_STATUS_LABELS)[appointment.status] || appointment.status}
                          </span>
                        </div>

                        <div>{isLawFirm ? <LegalIcon name="clock" /> : '🕒'} {formatDateTime(appointment.start_at)} — {new Date(appointment.end_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div>{isLawFirm ? <LegalIcon name="person" /> : '👤'} {text('المشترك:', 'الموكل:')} {appointment.customer_name} {appointment.customer_phone && `· ${isLawFirm ? '' : '📱 '}${appointment.customer_phone}`}</div>
                        <div>{isLawFirm ? <LegalIcon name="scale" /> : '🏋️'} {text('الكابتن / الصالة:', 'المحامي / القاعة:')} {appointment.resource_name} · {text('المدفوع:', 'الأتعاب المدفوعة:')} {Number(appointment.deposit_amount || 0).toFixed(2)} ج.م</div>

                        {appointment.converted_order_number && (
                          <div style={{ color: isLawFirm ? '#c84b08' : '#c084fc', fontWeight: 700 }}>
                            {!isLawFirm && '📑'} {text('رقم طلب الحصة:', 'رقم فاتورة الأتعاب:')} {appointment.converted_order_number}
                          </div>
                        )}

                        {['booked', 'confirmed'].includes(appointment.status) && (
                          <button
                            type="button"
                            className="appointment-button secondary"
                            style={{ alignSelf: 'flex-start' }}
                            onClick={() => beginReschedule(appointment)}
                          >
                            {text('✏️ تعديل موعد الحصة', 'تعديل موعد الجلسة')}
                          </button>
                        )}

                        {rescheduleForm?.id === appointment.id && (
                          <form className="appointment-reschedule" onSubmit={(event) => submitReschedule(event, appointment.id)}>
                            <label>{text('الكابتن', 'المحامي / المسؤول')}
                              <select
                                required
                                value={rescheduleForm.resourceId}
                                onChange={(event) => setRescheduleForm({ ...rescheduleForm, resourceId: event.target.value })}
                              >
                                {activeResources.map((resource) => (
                                  <option key={resource.id} value={resource.id}>{resource.name}</option>
                                ))}
                              </select>
                            </label>
                            <label>الموعد الجديد
                              <input
                                type="datetime-local"
                                required
                                value={rescheduleForm.startAt}
                                onChange={(event) => setRescheduleForm({ ...rescheduleForm, startAt: event.target.value })}
                              />
                            </label>
                            <button className="appointment-button primary" type="submit" disabled={busy}>حفظ الموعد</button>
                            <button className="appointment-button secondary" type="button" onClick={() => setRescheduleForm(null)}>إلغاء</button>
                          </form>
                        )}

                        <div className="appointment-item-actions">
                          {appointment.status === 'booked' && (
                            <button type="button" onClick={() => runAction(() => window.electronAPI.updateAppointmentStatus(appointment.id, 'confirmed'), text('تم تأكيد الحضور للحصة', 'تم تأكيد الموعد'))}>
                              {text('تأكيد الحضور', 'تأكيد الموعد')}
                            </button>
                          )}
                          {['booked', 'confirmed'].includes(appointment.status) && (
                            <button type="button" onClick={() => runAction(() => window.electronAPI.updateAppointmentStatus(appointment.id, 'completed'), text('تم إكمال الحصة', 'تم إكمال الجلسة'))}>
                              {text('إكمال الحصة', 'إكمال الجلسة')}
                            </button>
                          )}
                          {['booked', 'confirmed'].includes(appointment.status) && (
                            <button type="button" style={{ color: isLawFirm ? '#b42318' : '#f87171' }} onClick={() => runAction(
                              () => window.electronAPI.updateAppointmentStatus(appointment.id, 'cancelled'),
                              text('تم إلغاء الحجز', 'تم إلغاء الموعد')
                            )}>
                              إلغاء
                            </button>
                          )}
                          {['booked', 'confirmed', 'completed'].includes(appointment.status) && !appointment.converted_order_id && (
                            <button
                              type="button"
                              className="convert"
                              onClick={() => runAction(
                                () => window.electronAPI.convertAppointmentToServiceOrder(appointment.id),
                                text('تم تحويل الحصة إلى أمر عمل وفاتورة بنجاح!', 'تم تحويل الموعد إلى فاتورة بنجاح!'),
                              )}
                            >
                              {text('🚀 تحويل لفاتورة / أمر عمل', '🚀 إصدار فاتورة أتعاب')}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BOOKABLE RESOURCES */}
          {tab === 'resources' && (
            <div className="appointment-layout">
              <form className="appointment-card" onSubmit={submitResource}>
                <h2>{resourceForm.id
                  ? text('تعديل بيانات كابتن / صالة', 'تعديل بيانات المحامي / القاعة')
                  : text('إضافة كابتن / مدرب / صالة', 'إضافة محامٍ / موظف / قاعة')}</h2>
                <label>{text('اسم الكابتن أو المورد', 'اسم المحامي أو الموظف / القاعة')} *
                  <input required value={resourceForm.name} onChange={(event) => setResourceForm({ ...resourceForm, name: event.target.value })} placeholder={text('مثال: كابتن محمد علي / صالة زومبا A', 'مثال: الأستاذ محمد علي / قاعة الاجتماعات')} />
                </label>
                <label>{text('التخصص / النوع', 'التخصص / نوع المورد')} *
                  <select value={resourceForm.resourceType} onChange={(event) => setResourceForm({ ...resourceForm, resourceType: event.target.value })}>
                    {resourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>{text('الوصف والتخصص', 'الوصف / التخصص')}
                  <input value={resourceForm.description} onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })} placeholder={text('مدرب كمال أجسام / لياقة بدنية...', 'مثال: محامٍ مدني / قاعة اجتماعات الموكلين...')} />
                </label>
                <label className="appointment-check">
                  <input type="checkbox" checked={resourceForm.isActive} onChange={(event) => setResourceForm({ ...resourceForm, isActive: event.target.checked })} /> {text('كابتن نشط متاح للحجز', 'متاح لحجز المواعيد')}
                </label>

                <h3>{text('ساعات تواجد وعمل الكابتن الأسبوعية', 'أوقات التواجد والعمل الأسبوعية')}</h3>
                <div className="working-hours-list">
                  {resourceForm.workingHours.map((hours) => (
                    <div className="working-hours-row" key={hours.weekday}>
                      <label className="appointment-check">
                        <input
                          type="checkbox"
                          checked={hours.enabled}
                          onChange={(event) => setResourceForm({
                            ...resourceForm,
                            workingHours: resourceForm.workingHours.map((row) => row.weekday === hours.weekday ? { ...row, enabled: event.target.checked } : row),
                          })}
                        />
                        {DAYS[hours.weekday]}
                      </label>
                      <input
                        type="time"
                        disabled={!hours.enabled}
                        value={hours.startTime}
                        onChange={(event) => setResourceForm({
                          ...resourceForm,
                          workingHours: resourceForm.workingHours.map((row) => row.weekday === hours.weekday ? { ...row, startTime: event.target.value } : row),
                        })}
                      />
                      <span style={{ color: '#8B8B9E' }}>إلى</span>
                      <input
                        type="time"
                        disabled={!hours.enabled}
                        value={hours.endTime}
                        onChange={(event) => setResourceForm({
                          ...resourceForm,
                          workingHours: resourceForm.workingHours.map((row) => row.weekday === hours.weekday ? { ...row, endTime: event.target.value } : row),
                        })}
                      />
                    </div>
                  ))}
                </div>

                <div className="appointment-form-actions">
                  <button className="appointment-button primary" type="submit" disabled={busy}>
                    {resourceForm.id ? 'حفظ التعديلات' : text('إضافة الكابتن', 'إضافة المورد')}
                  </button>
                  {resourceForm.id && (
                    <button className="appointment-button secondary" type="button" onClick={() => setResourceForm(blankResource(defaultResourceType))}>
                      إلغاء التعديل
                    </button>
                  )}
                </div>
              </form>

              <div className="appointment-card">
                <h2>{text('الكباتن والمدربين والصالات المسجلة', 'المحامون والموظفون والقاعات المسجلة')}</h2>
                {!resources.length ? <div className="appointment-empty">{text('لا يوجد كباتن مسجلين بعد.', 'لا يوجد محامون أو موارد مسجلة بعد.')}</div> : (
                  resources.map((resource) => (
                    <article className="appointment-item" key={resource.id}>
                      <div className="appointment-item-title">
                        <strong>{isLawFirm && <LegalIcon name="scale" />}{!isLawFirm && '🏋️'} {resource.name}</strong>
                        <span>{resourceTypes.find(([value]) => value === resource.resource_type)?.[1] || resource.resource_type}</span>
                      </div>
                      <div>{resource.description || 'بدون وصف'} · {resource.working_days || 0} أيام عمل أسبوعياً · {isLawFirm
                        ? <span className={`appointment-status ${resource.is_active ? 'confirmed' : 'cancelled'}`}>{resource.is_active ? 'نشط' : 'متوقف'}</span>
                        : resource.is_active ? '🟢 نشط' : '🔴 متوقف'}</div>
                      <button
                        type="button"
                        className="appointment-button secondary"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={async () => {
                          try {
                            const fullResource = await window.electronAPI.getAppointmentResource(resource.id);
                            editResource(fullResource);
                          } catch (resourceError) {
                            setError(resourceError instanceof Error
                              ? resourceError.message
                              : text('تعذر فتح بيانات الكابتن', 'تعذر فتح بيانات المورد'));
                          }
                        }}
                      >
                        {text('✏️ تعديل وساعات العمل', 'تعديل البيانات وأوقات العمل')}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: BOOKABLE SERVICES */}
          {tab === 'services' && (
            <div className="appointment-layout">
              <form className="appointment-card" onSubmit={submitService}>
                <h2>{serviceForm.id
                  ? text('تعديل الحصة', 'تعديل الخدمة القانونية')
                  : text('إضافة نوع حصة / جلسة', 'إضافة نوع جلسة / خدمة قانونية')}</h2>
                <label>{text('اسم الحصة / السيشن', 'اسم الجلسة / الخدمة القانونية')} *
                  <input required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder={text('مثال: تدريب شخصي PT / كلاس زومبا', 'مثال: استشارة قانونية / جلسة محكمة')} />
                </label>
                <label>{text('مدة الحصة (بالدقائق)', 'مدة الموعد (بالدقائق)')} *
                  <input type="number" min="1" max="1440" required value={serviceForm.durationMinutes} onChange={(event) => setServiceForm({ ...serviceForm, durationMinutes: event.target.value })} />
                </label>
                <label>{text('وقت تجهيز بين الحصص (بالدقائق)', 'وقت فاصل بين المواعيد (بالدقائق)')}
                  <input type="number" min="0" value={serviceForm.bufferMinutes} onChange={(event) => setServiceForm({ ...serviceForm, bufferMinutes: event.target.value })} />
                </label>
                <label>{text('سعر الحصة التقديري (ج.م)', 'الأتعاب التقديرية للخدمة (ج.م)')} *
                  <input type="number" min="0" step="0.01" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} />
                </label>
                <label>{text('المكان أو المورد المخصص', 'المحامي أو المورد المخصص')}
                  <select value={serviceForm.resourceType} onChange={(event) => setServiceForm({ ...serviceForm, resourceType: event.target.value })}>
                    <option value="">{text('أي مدرب أو صالة', 'أي محامٍ أو قاعة')}</option>
                    {resourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>الوصف
                  <input value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} placeholder={text('تفاصيل الحصة...', 'تفاصيل الخدمة القانونية...')} />
                </label>
                <label className="appointment-check">
                  <input type="checkbox" checked={serviceForm.isActive} onChange={(event) => setServiceForm({ ...serviceForm, isActive: event.target.checked })} /> {text('حصة نشطة ومتاحة للحجز', 'خدمة نشطة ومتاحة للحجز')}
                </label>
                
                <div className="appointment-form-actions">
                  <button className="appointment-button primary" type="submit" disabled={busy}>
                    {serviceForm.id ? 'حفظ التعديلات' : text('إضافة الحصة', 'إضافة الخدمة')}
                  </button>
                  {serviceForm.id && (
                    <button className="appointment-button secondary" type="button" onClick={() => setServiceForm(blankService(defaultResourceType))}>
                      إلغاء التعديل
                    </button>
                  )}
                </div>
              </form>

              <div className="appointment-card">
                <h2>{text('قائمة الحصص والجلسات', 'قائمة الجلسات والخدمات القانونية')}</h2>
                {!services.length ? <div className="appointment-empty">{text('لا توجد حصص مسجلة بعد.', 'لا توجد خدمات قانونية مسجلة بعد.')}</div> : (
                  services.map((service) => (
                    <article className="appointment-item" key={service.id}>
                      <div className="appointment-item-title">
                        <strong>{isLawFirm && <LegalIcon name="briefcase" />}{!isLawFirm && '🧘'} {service.name}</strong>
                        <span className={isLawFirm ? `appointment-status ${service.is_active ? 'confirmed' : 'cancelled'}` : ''}>
                          {isLawFirm ? service.is_active ? 'نشطة' : 'متوقفة' : service.is_active ? '🟢 نشطة' : '🔴 متوقفة'}
                        </span>
                      </div>
                      <div>{text('المدة:', 'المدة:')} {service.duration_minutes || service.durationMinutes} دقيقة · {text('التجهيز:', 'الفاصل:')} {service.buffer_minutes || service.bufferMinutes || 0} دقيقة · السعر: {Number(service.price).toFixed(2)} ج.م</div>
                      <button
                        type="button"
                        className="appointment-button secondary"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => {
                          setServiceForm({
                            id: service.id,
                            name: service.name,
                            durationMinutes: service.duration_minutes || service.durationMinutes,
                            bufferMinutes: service.buffer_minutes || service.bufferMinutes || 0,
                            price: service.price,
                            resourceType: service.resource_type || '',
                            description: service.description || '',
                            isActive: Boolean(service.is_active),
                          });
                        }}
                      >
                        {text('✏️ تعديل الحصة', 'تعديل الخدمة')}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: HOLIDAYS */}
          {tab === 'holidays' && (
            <div className="appointment-layout">
              <form className="appointment-card" onSubmit={submitHoliday}>
                <h2>{text('إجازات الكباتن والصيانة الاستثنائية', 'أوقات عدم التوفر والاستثناءات')}</h2>
                <label>{text('الكابتن / الصالة', 'المحامي / القاعة')}
                  <select value={holidayForm.resourceId} onChange={(event) => setHolidayForm({ ...holidayForm, resourceId: event.target.value })}>
                    <option value="">{text('إجازة عامة للجيم بالكامل', 'عدم توفر عام للمكتب')}</option>
                    {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                  </select>
                </label>
                <label>من تاريخ *
                  <input type="date" required value={holidayForm.startDate} onChange={(event) => setHolidayForm({ ...holidayForm, startDate: event.target.value })} />
                </label>
                <label>إلى تاريخ *
                  <input type="date" min={holidayForm.startDate} required value={holidayForm.endDate} onChange={(event) => setHolidayForm({ ...holidayForm, endDate: event.target.value })} />
                </label>
                <label>من وقت (اتركه فارغاً ليوم كامل)
                  <input type="time" value={holidayForm.startTime} onChange={(event) => setHolidayForm({ ...holidayForm, startTime: event.target.value })} />
                </label>
                <label>إلى وقت
                  <input type="time" value={holidayForm.endTime} onChange={(event) => setHolidayForm({ ...holidayForm, endTime: event.target.value })} />
                </label>
                <label className="appointment-wide">{text('سبب الإجازة', 'سبب عدم التوفر')} *
                  <input required value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} placeholder={text('مثال: إجازة الكابتن السنوية / صيانة صالة السونا', 'مثال: إجازة المحامي / إغلاق المكتب')} />
                </label>
                <button className="appointment-button primary appointment-wide" type="submit" disabled={busy}>
                  {text('💾 حفظ وتسجيل الإجازة', '💾 حفظ وقت عدم التوفر')}
                </button>
              </form>

              <div className="appointment-card">
                <h2>{text('سجل الإجازات والأعطال', 'سجل أوقات عدم التوفر')}</h2>
                {!holidays.length ? <div className="appointment-empty">{text('لا توجد إجازات مسجلة حالياً.', 'لا توجد أوقات عدم توفر مسجلة حالياً.')}</div> : (
                  holidays.map((holiday) => (
                    <article className="appointment-item" key={holiday.id}>
                      <div className="appointment-item-title">
                        <strong>{isLawFirm && <LegalIcon name="calendar" />}{!isLawFirm && '🏖️'} {holiday.name}</strong>
                        <span>{holiday.resource_name || text('عامة لكل الجيم', 'عام للمكتب')}</span>
                      </div>
                      <div>من {holiday.start_date} إلى {holiday.end_date} {holiday.start_time && `· الوقت: ${holiday.start_time}–${holiday.endTime || holiday.end_time}`}</div>
                      <button
                        type="button"
                        style={{ color: isLawFirm ? '#b42318' : '#f87171', alignSelf: 'flex-start' }}
                        className="appointment-button secondary"
                        onClick={() => runAction(
                          () => window.electronAPI.removeAppointmentHoliday(holiday.id),
                          text('تم حذف الإجازة بنجاح', 'تم حذف وقت عدم التوفر بنجاح'),
                        )}
                      >
                        {text('🗑️ حذف الإجازة', 'حذف وقت عدم التوفر')}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default AppointmentsPage;
