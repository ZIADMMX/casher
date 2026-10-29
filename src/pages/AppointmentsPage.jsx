import { useCallback, useEffect, useMemo, useState } from 'react';
import '../styles/appointments.css';

const RESOURCE_TYPES = [
  ['trainer', '🏋️‍♂️ كابتن / مدرب شخصي (PT)'],
  ['class_hall', '🧘 صالة كلاسات جماعية'],
  ['sauna_spa', '🧖‍♂️ منطقة سونا وسبا / ريكفري'],
  ['inbody_room', '📊 غرفة قياسات InBody وتغذية'],
  ['court_field', '⚽ ملعب / صالة مخصصة'],
  ['device_zone', '🏋️ منطقة أجهزة مخصصة'],
  ['other', 'أخرى'],
];

const STATUS_LABELS = {
  booked: 'محجوز',
  confirmed: 'مؤكد 🟢',
  completed: 'مكتمل ✅',
  cancelled: 'ملغي ❌',
  no_show: 'لم يحضر ⚠️',
  converted: 'محول لطلب خدمة 📑',
};

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const TABS = [
  ['appointments', 'جدول حصص وتدريبات المشتركين'],
  ['resources', 'الكباتن والمدربين والصالات'],
  ['services', 'أنواع الحصص والجلسات'],
  ['holidays', 'مواعيد العمل وإجازات الكباتن'],
];

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

const blankResource = () => ({
  id: null,
  name: '',
  resourceType: 'trainer',
  description: '',
  isActive: true,
  workingHours: defaultHours(),
});

const blankService = () => ({
  id: null,
  name: '',
  durationMinutes: 45,
  bufferMinutes: 15,
  price: 150,
  resourceType: 'trainer',
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
  
  const [resourceForm, setResourceForm] = useState(blankResource);
  const [serviceForm, setServiceForm] = useState(blankService);
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
      console.error('تعذر تحميل بيانات المواعيد والجيم:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch active customer subscription when customer is selected
  useEffect(() => {
    async function checkSub() {
      if (!appointmentForm.customerId) {
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
  }, [appointmentForm.customerId]);

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
      resourceForm.id ? 'تم تحديث بيانات الكابتن وساعات عمله' : 'تمت إضافة الكابتن وساعات عمله بنجاح'
    );
    setResourceForm(blankResource());
  }

  async function submitService(event) {
    event.preventDefault();
    await runAction(
      () => window.electronAPI.saveAppointmentService(serviceForm),
      serviceForm.id ? 'تم تحديث الخدمة/الحصة بنجاح' : 'تمت إضافة الحصة بنجاح'
    );
    setServiceForm(blankService());
  }

  async function submitHoliday(event) {
    event.preventDefault();
    await runAction(
      () => window.electronAPI.saveAppointmentHoliday(holidayForm),
      'تم تسجيل إجازة الكابتن بنجاح'
    );
    setHolidayForm(blankHoliday());
  }

  async function submitAppointment(event) {
    event.preventDefault();
    if (!appointmentForm.serviceId) return setError('الرجاء اختيار الخدمة/الحصة أولاً');
    if (!appointmentForm.resourceId) return setError('الرجاء اختيار المدرب/الكابتن المسؤول');

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
        if (appointmentForm.deductSubscriptionCredit && activeSubscription && activeSubscription.remaining_credits > 0) {
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
      'تم تأكيد حجز الحصة بنجاح وإشعار الكابتن والمشترك!',
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
      'تم تغيير وتأكيد موعد الحصة الجديد بنجاح',
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
      resourceType: resource.resource_type || 'trainer',
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
    <section className="appointments-page" dir="rtl">
      {/* Header */}
      <header className="appointments-header">
        <div>
          <h1>🏋️‍♂️ حجز الحصص والكباتن واشتراكات الجيم</h1>
          <p>إدارة حصص التدريب الشخصي (PT)، الكلاسات الجماعية، وربطها المباشر بباقات واشتراكات الأعضاء.</p>
        </div>
        <button type="button" className="appointment-button secondary" onClick={loadData} disabled={busy}>
          🔄 تحديث الجدول
        </button>
      </header>

      {/* Alerts */}
      {error && <div className="appointment-alert error" role="alert">❌ {error}</div>}
      {notice && <div className="appointment-alert success" role="status">✅ {notice}</div>}

      {/* Navigation Tabs */}
      <nav className="appointments-tabs" aria-label="Gym appointments and subscriptions">
        {TABS.map(([key, label]) => (
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
        <div className="appointment-empty">جاري تحميل جدول الجيم والمشتركين...</div>
      ) : (
        <>
          {/* TAB 1: APPOINTMENTS */}
          {tab === 'appointments' && (
            <div className="appointment-layout">
              {/* Create Appointment Form */}
              <form className="appointment-card" onSubmit={submitAppointment}>
                <h2>🏋️ حجز حصة / سيشن للمشترك</h2>
                
                {/* Select Customer */}
                <label>المشترك / العميل
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
                    <option value="">اختر مشترك مسجل في الجيم...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Show Active Subscription Info Box if found */}
                {loadingSubscription && <div style={{ fontSize: '12px', color: '#3B82F6' }}>جاري جلب اشتراك العميل...</div>}
                
                {activeSubscription && (
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
                      <label className="appointment-check" style={{ marginTop: '4px', color: '#FFF' }}>
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

                <label>اسم المشترك *
                  <input
                    required
                    type="text"
                    placeholder="اسم المشترك"
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

                <label>نوع الحصة / الخدمة *
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
                    <option value="">اختر الحصة (تدريب شخصي، كلاس، ريكفري...)</option>
                    {activeServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} — ({service.duration_minutes || service.durationMinutes} دقيقة) — {Number(service.price).toFixed(2)} ج.م
                      </option>
                    ))}
                  </select>
                </label>

                <label>الكابتن / المدرب / الصالة *
                  <select
                    required
                    value={appointmentForm.resourceId}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, resourceId: event.target.value })}
                  >
                    <option value="">اختر المدرب أو الصالة...</option>
                    {activeResources
                      .filter((resource) => !selectedService?.resource_type || resource.resource_type === selectedService.resource_type)
                      .map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name} ({RESOURCE_TYPES.find(([val]) => val === resource.resource_type)?.[1] || resource.resource_type})
                        </option>
                      ))}
                  </select>
                </label>

                <label>تاريخ ووقت الحصة *
                  <input
                    type="datetime-local"
                    required
                    value={appointmentForm.startAt}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, startAt: event.target.value })}
                  />
                </label>

                <label>العربون / المدفوع مقدماً (ج.م)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={appointmentForm.depositAmount}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, depositAmount: event.target.value })}
                  />
                </label>

                <label>تنبيه المشترك داخل التطبيق قبل الحصة (بالدقائق)
                  <input
                    type="number"
                    min="0"
                    max="10080"
                    value={appointmentForm.reminderMinutes}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, reminderMinutes: event.target.value })}
                  />
                </label>

                <label className="appointment-wide">ملاحظات الحصة
                  <textarea
                    rows="2"
                    placeholder="تركيز التقديم، الإصابات، ملاحظات الكابتن..."
                    value={appointmentForm.notes}
                    onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })}
                  />
                </label>

                <button className="appointment-button primary appointment-wide" type="submit" disabled={busy}>
                  {busy ? 'جاري الحجز...' : '✅ تأكيد حجز الحصة'}
                </button>
              </form>

              {/* Appointments List View */}
              <div className="appointment-card">
                <div className="appointment-card-heading">
                  <h2>جدول الحصص اليومي</h2>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    aria-label="تاريخ عرض المواعيد"
                  />
                </div>

                {!filteredAppointments.length ? (
                  <div className="appointment-empty">لا توجد حصص محجوزة في هذا اليوم ({selectedDate}).</div>
                ) : (
                  <div className="appointment-list">
                    {filteredAppointments.map((appointment) => (
                      <article className="appointment-item" key={appointment.id}>
                        <div className="appointment-item-title">
                          <strong>🏋️ {appointment.service_name}</strong>
                          <span className={`appointment-status ${appointment.status}`}>
                            {STATUS_LABELS[appointment.status] || appointment.status}
                          </span>
                        </div>

                        <div>🕒 {formatDateTime(appointment.start_at)} — {new Date(appointment.end_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div>👤 المشترك: {appointment.customer_name} {appointment.customer_phone && `· 📱 ${appointment.customer_phone}`}</div>
                        <div>🏋️ الكابتن / الصالة: {appointment.resource_name} · المدفوع: {Number(appointment.deposit_amount || 0).toFixed(2)} ج.م</div>

                        {appointment.converted_order_number && (
                          <div style={{ color: '#c084fc', fontWeight: 700 }}>
                            📑 رقم طلب الحصة: {appointment.converted_order_number}
                          </div>
                        )}

                        {['booked', 'confirmed'].includes(appointment.status) && (
                          <button
                            type="button"
                            className="appointment-button secondary"
                            style={{ alignSelf: 'flex-start' }}
                            onClick={() => beginReschedule(appointment)}
                          >
                            ✏️ تعديل موعد الحصة
                          </button>
                        )}

                        {rescheduleForm?.id === appointment.id && (
                          <form className="appointment-reschedule" onSubmit={(event) => submitReschedule(event, appointment.id)}>
                            <label>الكابتن
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
                            <button type="button" onClick={() => runAction(() => window.electronAPI.updateAppointmentStatus(appointment.id, 'confirmed'), 'تم تأكيد الحضور للحصة')}>
                              تأكيد الحضور
                            </button>
                          )}
                          {['booked', 'confirmed'].includes(appointment.status) && (
                            <button type="button" onClick={() => runAction(() => window.electronAPI.updateAppointmentStatus(appointment.id, 'completed'), 'تم إكمال الحصة')}>
                              إكمال الحصة
                            </button>
                          )}
                          {['booked', 'confirmed'].includes(appointment.status) && (
                            <button type="button" style={{ color: '#f87171' }} onClick={() => runAction(() => window.electronAPI.updateAppointmentStatus(appointment.id, 'cancelled'), 'تم إلغاء الحجز')}>
                              إلغاء
                            </button>
                          )}
                          {['booked', 'confirmed', 'completed'].includes(appointment.status) && !appointment.converted_order_id && (
                            <button
                              type="button"
                              className="convert"
                              onClick={() => runAction(
                                () => window.electronAPI.convertAppointmentToServiceOrder(appointment.id),
                                'تم تحويل الحصة إلى أمر عمل وفاتورة بنجاح!',
                              )}
                            >
                              🚀 تحويل لفاتورة / أمر عمل
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

          {/* TAB 2: RESOURCES (TRAINERS / ROOMS) */}
          {tab === 'resources' && (
            <div className="appointment-layout">
              <form className="appointment-card" onSubmit={submitResource}>
                <h2>{resourceForm.id ? 'تعديل بيانات كابتن / صالة' : 'إضافة كابتن / مدرب / صالة'}</h2>
                <label>اسم الكابتن أو المورد *
                  <input required value={resourceForm.name} onChange={(event) => setResourceForm({ ...resourceForm, name: event.target.value })} placeholder="مثال: كابتن محمد علي / صالة زومبا A" />
                </label>
                <label>التخصص / النوع *
                  <select value={resourceForm.resourceType} onChange={(event) => setResourceForm({ ...resourceForm, resourceType: event.target.value })}>
                    {RESOURCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>الوصف والتخصص
                  <input value={resourceForm.description} onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })} placeholder="مدرب كمال أجسام / لياقة بدنية..." />
                </label>
                <label className="appointment-check">
                  <input type="checkbox" checked={resourceForm.isActive} onChange={(event) => setResourceForm({ ...resourceForm, isActive: event.target.checked })} /> كابتن نشط متاح للحجز
                </label>

                <h3>ساعات تواجد وعمل الكابتن الأسبوعية</h3>
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
                    {resourceForm.id ? 'حفظ التعديلات' : 'إضافة الكابتن'}
                  </button>
                  {resourceForm.id && (
                    <button className="appointment-button secondary" type="button" onClick={() => setResourceForm(blankResource())}>
                      إلغاء التعديل
                    </button>
                  )}
                </div>
              </form>

              <div className="appointment-card">
                <h2>الكباتن والمدربين والصالات المسجلة</h2>
                {!resources.length ? <div className="appointment-empty">لا يوجد كباتن مسجلين بعد.</div> : (
                  resources.map((resource) => (
                    <article className="appointment-item" key={resource.id}>
                      <div className="appointment-item-title">
                        <strong>🏋️ {resource.name}</strong>
                        <span>{RESOURCE_TYPES.find(([value]) => value === resource.resource_type)?.[1] || resource.resource_type}</span>
                      </div>
                      <div>{resource.description || 'بدون وصف'} · {resource.working_days || 0} أيام عمل أسبوعياً · {resource.is_active ? '🟢 نشط' : '🔴 متوقف'}</div>
                      <button
                        type="button"
                        className="appointment-button secondary"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={async () => {
                          try {
                            const fullResource = await window.electronAPI.getAppointmentResource(resource.id);
                            editResource(fullResource);
                          } catch (resourceError) {
                            setError(resourceError instanceof Error ? resourceError.message : 'تعذر فتح الكابتن');
                          }
                        }}
                      >
                        ✏️ تعديل وساعات العمل
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SERVICES (CLASSES / SESSIONS) */}
          {tab === 'services' && (
            <div className="appointment-layout">
              <form className="appointment-card" onSubmit={submitService}>
                <h2>{serviceForm.id ? 'تعديل الحصة' : 'إضافة نوع حصة / جلسة'}</h2>
                <label>اسم الحصة / السيشن *
                  <input required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder="مثال: تدريب شخصي PT / كلاس زومبا" />
                </label>
                <label>مدة الحصة (بالدقائق) *
                  <input type="number" min="1" max="1440" required value={serviceForm.durationMinutes} onChange={(event) => setServiceForm({ ...serviceForm, durationMinutes: event.target.value })} />
                </label>
                <label>وقت تجهيز بين الحصص (بالدقائق)
                  <input type="number" min="0" value={serviceForm.bufferMinutes} onChange={(event) => setServiceForm({ ...serviceForm, bufferMinutes: event.target.value })} />
                </label>
                <label>سعر الحصة التقديري (ج.م) *
                  <input type="number" min="0" step="0.01" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} />
                </label>
                <label>المكان أو المورد المخصص
                  <select value={serviceForm.resourceType} onChange={(event) => setServiceForm({ ...serviceForm, resourceType: event.target.value })}>
                    <option value="">أي مدرب أو صالة</option>
                    {RESOURCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>الوصف
                  <input value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} placeholder="تفاصيل الحصة..." />
                </label>
                <label className="appointment-check">
                  <input type="checkbox" checked={serviceForm.isActive} onChange={(event) => setServiceForm({ ...serviceForm, isActive: event.target.checked })} /> حصة نشطة ومتاحة للحجز
                </label>
                
                <div className="appointment-form-actions">
                  <button className="appointment-button primary" type="submit" disabled={busy}>
                    {serviceForm.id ? 'حفظ التعديلات' : 'إضافة الحصة'}
                  </button>
                  {serviceForm.id && (
                    <button className="appointment-button secondary" type="button" onClick={() => setServiceForm(blankService())}>
                      إلغاء التعديل
                    </button>
                  )}
                </div>
              </form>

              <div className="appointment-card">
                <h2>قائمة الحصص والجلسات</h2>
                {!services.length ? <div className="appointment-empty">لا توجد حصص مسجلة بعد.</div> : (
                  services.map((service) => (
                    <article className="appointment-item" key={service.id}>
                      <div className="appointment-item-title">
                        <strong>🧘 {service.name}</strong>
                        <span>{service.is_active ? '🟢 نشطة' : '🔴 متوقفة'}</span>
                      </div>
                      <div>المدة: {service.duration_minutes || service.durationMinutes} دقيقة · التجهيز: {service.buffer_minutes || service.bufferMinutes || 0} دقيقة · السعر: {Number(service.price).toFixed(2)} ج.م</div>
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
                        ✏️ تعديل الحصة
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
                <h2>إجازات الكباتن والصيانة الاستثنائية</h2>
                <label>الكابتن / الصالة
                  <select value={holidayForm.resourceId} onChange={(event) => setHolidayForm({ ...holidayForm, resourceId: event.target.value })}>
                    <option value="">إجازة عامة للجيم بالكامل</option>
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
                <label className="appointment-wide">سبب الإجازة *
                  <input required value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} placeholder="مثال: إجازة الكابتن السنوية / صيانة صالة السونا" />
                </label>
                <button className="appointment-button primary appointment-wide" type="submit" disabled={busy}>
                  💾 حفظ وتسجيل الإجازة
                </button>
              </form>

              <div className="appointment-card">
                <h2>سجل الإجازات والأعطال</h2>
                {!holidays.length ? <div className="appointment-empty">لا توجد إجازات مسجلة حالياً.</div> : (
                  holidays.map((holiday) => (
                    <article className="appointment-item" key={holiday.id}>
                      <div className="appointment-item-title">
                        <strong>🏖️ {holiday.name}</strong>
                        <span>{holiday.resource_name || 'عامة لكل الجيم'}</span>
                      </div>
                      <div>من {holiday.start_date} إلى {holiday.end_date} {holiday.start_time && `· الوقت: ${holiday.start_time}–${holiday.endTime || holiday.end_time}`}</div>
                      <button
                        type="button"
                        style={{ color: '#f87171', alignSelf: 'flex-start' }}
                        className="appointment-button secondary"
                        onClick={() => runAction(
                          () => window.electronAPI.removeAppointmentHoliday(holiday.id),
                          'تم حذف الإجازة بنجاح',
                        )}
                      >
                        🗑️ حذف الإجازة
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
