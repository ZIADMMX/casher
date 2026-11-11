import { useEffect, useMemo, useState } from 'react';
import useUsers from '../hooks/useUsers.js';
import { formatProductImageUrl } from '../utils/media.js';
import * as auditApi from '../api/audit.js';
import { getActionMeta } from '../utils/auditActions.js';
import * as importExportApi from '../api/importExport.js';
import * as salesApi from '../api/sales.js';
import * as shiftsApi from '../api/shifts.js';
import * as usersApi from '../api/users.js';
import { HrHeader, HrStat } from '../components/hr/HrLayout.jsx';
import {
  AlertIcon, CalendarIcon, CheckIcon, DownloadIcon, PlusIcon, SearchIcon, ShieldIcon, UserIcon, UsersIcon,
} from '../components/icons/PosIcons.jsx';
import { countWithoutShift, employeeCountLabel, todayAttendanceLabel } from '../utils/hrStats.js';
import '../styles/users.css';

const EMPTY_CASHIER_FORM = {
  firstName: '',
  lastName: '',
  username: '',
  phone: '',
  email: '',
  specialty: '',
  workingHours: '',
  profileImage: '',
  jobTitle: 'كاشير',
  customJobTitle: '',
  systemRoleKey: 'cashier',
  payType: 'monthly',
  payAmount: '',
  commissionRate: '',
  password: '',
  isActive: true,
  notes: '',
};

const EMPLOYEE_WIZARD_STEPS = [
  'الملف الشخصي',
  'الدور الوظيفي',
  'نظام الأجر',
  'بيانات الدخول',
];

function formatAmount(value) {
  return `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

function formatDate(value) {
  if (!value) return '—';
  const dateValue = String(value);
  const date = new Date(dateValue.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? dateValue : date.toLocaleString('ar-EG');
}

function Metric({ label, value, note }) {
  return (
    <div className="user-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function getDisplayUsers(users) {
  return Array.isArray(users) ? users.filter((user) => user && typeof user.username === 'string') : [];
}

function isMissingIpcHandler(error) {
  return /no handler registered|UserManagementApiUnavailable/i.test(error?.message || '');
}

async function loadLegacyUserDetails(user) {
  if (!shiftsApi.getAllShifts.isAvailable()) {
    throw new Error('نسخة التطبيق قديمة. أغلق البرنامج وثبّت آخر تحديث لعرض سجل المستخدم.');
  }

  // استدعاء IPC واحد فقط لتجنب تجمد الواجهة وحلقة N+1
  const shifts = await shiftsApi.getAllShifts({
    userId: user.id,
    limit: 50,
    offset: 0,
  });
  if (!Array.isArray(shifts)) {
    throw new Error('نسخة التطبيق لا تدعم تحميل سجل الورديات. أغلق البرنامج وثبّت آخر تحديث.');
  }

  const totalSales = shifts.reduce((sum, s) => sum + Number(s.total_sales || 0), 0);
  const totalInvoices = shifts.reduce((sum, s) => sum + Number(s.sales_count || 0), 0);

  return {
    details: {
      user: {
        ...user,
        force_password_change: user.force_password_change || 0,
      },
      stats: {
        invoiceCount: totalInvoices,
        totalSales,
        averageInvoice: totalInvoices ? totalSales / totalInvoices : 0,
        totalDiscounts: 0,
        cashSales: 0,
        cardSales: 0,
        creditSales: 0,
        lastSaleAt: shifts[0]?.start_time || null,
        shiftCount: shifts.length,
        openShiftCount: shifts.filter((shift) => shift.status === 'open').length,
        closedShiftCount: shifts.filter((shift) => shift.status === 'closed').length,
        totalExpenses: shifts.reduce(
          (sum, shift) => sum + Number(shift.total_expenses || 0),
          0,
        ),
        totalShortage: shifts.reduce(
          (sum, shift) => sum + (Number(shift.cash_difference) < 0 ? Math.abs(Number(shift.cash_difference)) : 0),
          0,
        ),
        totalOverage: shifts.reduce(
          (sum, shift) => sum + (Number(shift.cash_difference) > 0 ? Number(shift.cash_difference) : 0),
          0,
        ),
        returnCount: 0,
        totalRefunds: 0,
      },
    },
    sales: [],
    shifts,
  };
}

function UsersPage({ currentUser, onNavigate }) {
  const { users, addCashier, removeUser, toggleActive, resetPassword, fetchUsers, loading, error } = useUsers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_CASHIER_FORM);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardError, setWizardError] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [details, setDetails] = useState(null);
  const [invoiceActivity, setInvoiceActivity] = useState([]);
  const [shiftActivity, setShiftActivity] = useState([]);
  const [invoiceOffset, setInvoiceOffset] = useState(0);
  const [shiftOffset, setShiftOffset] = useState(0);
  const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
  const [hasMoreShifts, setHasMoreShifts] = useState(false);
  const [activeTab, setActiveTab] = useState('audit'); // Default to audit tab for live monitoring
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [compatibilityWarning, setCompatibilityWarning] = useState('');
  const [legacySales, setLegacySales] = useState([]);
  const [legacyShifts, setLegacyShifts] = useState([]);
  const [password, setPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFileName, setTransferFileName] = useState('');
  const [transferResult, setTransferResult] = useState(null);
  const [transferError, setTransferError] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [hasMoreAudit, setHasMoreAudit] = useState(false);
  const [auditSummary, setAuditSummary] = useState(null);
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditLoading, setAuditLoading] = useState(false);

  const permissions = currentUser?.permissions || [];
  const canManageEmployees = currentUser?.role === 'admin'
    || permissions.includes('*')
    || permissions.includes('team.manage');
  const canImportEmployees = currentUser?.role === 'admin'
    || permissions.includes('*')
    || permissions.includes('team.import');
  const canExportEmployees = currentUser?.role === 'admin'
    || permissions.includes('*')
    || permissions.includes('team.export');

  useEffect(() => {
    if (!canManageEmployees || !usersApi.getEmployeeRoleOptions.isAvailable()) return;
    let active = true;
    usersApi.getEmployeeRoleOptions()
      .then((options) => {
        if (active && Array.isArray(options)) setRoleOptions(options.filter((role) => role.role_key !== 'admin'));
      })
      .catch((roleError) => {
        if (active) setWizardError(roleError.message || 'تعذر تحميل الأدوار الوظيفية');
      });
    return () => { active = false; };
  }, [canManageEmployees]);

  const displayUsers = useMemo(() => getDisplayUsers(users), [users]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return displayUsers.filter((user) => {
      const matchesSearch = !query
        || user.username.toLocaleLowerCase().includes(query)
        || (user.full_name || '').toLocaleLowerCase().includes(query)
        || (user.phone || '').toLocaleLowerCase().includes(query)
        || (user.specialty || '').toLocaleLowerCase().includes(query)
        || (user.job_title || '').toLocaleLowerCase().includes(query)
        || String(user.id).includes(query);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'present' && user.is_present)
        || (statusFilter === 'no_shift' && !(user.scheduled_start && user.scheduled_end))
        || (statusFilter === 'inactive' && !user.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [displayUsers, search, statusFilter]);

  const activeCount = displayUsers.filter((user) => user.is_active).length;
  const presentCount = displayUsers.filter((user) => user.is_present).length;
  const onLeaveCount = displayUsers.filter((user) => user.on_leave).length;
  const missingShiftCount = countWithoutShift(displayUsers);

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setWizardError('');
  }

  function closeAddEmployee() {
    if (addingUser) return;
    setShowForm(false);
    setForm(EMPTY_CASHIER_FORM);
    setWizardStep(0);
    setWizardError('');
  }

  function validateWizardStep(step) {
    if (step === 0) {
      if (!form.firstName.trim() || !form.lastName.trim()) return 'أدخل الاسم الأول واسم العائلة للمتابعة.';
      if (form.firstName.trim().length + form.lastName.trim().length + 1 > 120) {
        return 'الاسم الكامل يجب ألا يتجاوز 120 حرفًا.';
      }
      if (form.phone && !/^\d{7,12}$/.test(form.phone.replace(/\D/g, ''))) {
        return 'أدخل رقم هاتف صحيحًا بدون مفتاح الدولة.';
      }
    }
    if (step === 1 && form.jobTitle === 'أخرى' && !form.customJobTitle.trim()) {
      return 'اكتب المسمى الوظيفي للمتابعة.';
    }
    if (step === 1 && form.jobTitle !== 'مدير'
      && !roleOptions.some((role) => role.role_key === form.systemRoleKey)) {
      return 'اختر دورًا وظيفيًا صالحًا من قائمة الأدوار.';
    }
    if (step === 2) {
      const amount = Number(form.payAmount);
      if (!form.payAmount || !Number.isFinite(amount) || amount <= 0) {
        return 'أدخل مبلغًا أكبر من صفر للراتب أو الأجر بالساعة.';
      }
      if (form.commissionRate !== ''
        && (!Number.isFinite(Number(form.commissionRate))
          || Number(form.commissionRate) < 0
          || Number(form.commissionRate) > 100)) {
        return 'يجب أن تكون نسبة العمولة بين 0 و100%.';
      }
    }
    if (step === 3) {
      if (form.username.trim().length < 2) return 'اسم المستخدم يجب ألا يقل عن حرفين.';
      if (form.password.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
    }
    return '';
  }

  function goToWizardStep(nextStep) {
    const validationError = validateWizardStep(wizardStep);
    if (validationError) {
      setWizardError(validationError);
      return;
    }
    setWizardError('');
    setWizardStep(nextStep);
  }

  async function handlePickProfileImage() {
    try {
      const imagePath = await usersApi.selectUserImage();
      if (imagePath) updateForm('profileImage', imagePath);
    } catch (imageError) {
      setWizardError(imageError.message || 'تعذر اختيار صورة الموظف.');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (wizardStep < EMPLOYEE_WIZARD_STEPS.length - 1) {
      goToWizardStep(wizardStep + 1);
      return;
    }
    const validationError = validateWizardStep(3);
    if (validationError) {
      setWizardError(validationError);
      return;
    }

    setAddingUser(true);
    const phoneDigits = form.phone.replace(/\D/g, '').replace(/^0/, '');
    const jobTitle = form.jobTitle === 'أخرى' ? form.customJobTitle.trim() : form.jobTitle;
    const success = await addCashier({
      ...form,
      role: form.jobTitle === 'مدير' ? 'admin' : 'cashier',
      systemRoleKey: form.jobTitle === 'مدير' ? null : form.systemRoleKey,
      jobTitle,
      fullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      phone: phoneDigits ? `+20${phoneDigits}` : null,
      payAmount: Number(form.payAmount),
      commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate),
    });
    setAddingUser(false);
    if (success) {
      setShowForm(false);
      setForm(EMPTY_CASHIER_FORM);
      setWizardStep(0);
      setWizardError('');
    }
  }

  async function fetchAuditData(userId, filter = 'all', offset = 0) {
    if (!auditApi.getAuditLogs.isAvailable()) return { items: [], hasMore: false, total: 0 };
    return await auditApi.getAuditLogs({
      userId,
      actionType: filter === 'all' ? null : filter,
      limit: 30,
      offset,
    });
  }

  async function openDetails(user) {
    setSelectedUser(user);
    setDetails(null);
    setInvoiceActivity([]);
    setShiftActivity([]);
    setAuditLogs([]);
    setAuditOffset(0);
    setHasMoreAudit(false);
    setAuditSummary(null);
    setAuditActionFilter('all');
    setInvoiceOffset(0);
    setShiftOffset(0);
    setHasMoreInvoices(false);
    setHasMoreShifts(false);
    setActiveTab('audit');
    setDetailsError('');
    setCompatibilityWarning('');
    setLegacySales([]);
    setLegacyShifts([]);
    setPassword('');
    setPasswordMessage('');
    setSelectedSale(null);
    setSelectedShift(null);
    setDetailsLoading(true);

    try {
      const hasUserManagementApi = usersApi.getUserDetails.isAvailable()
        && usersApi.getUserActivity.isAvailable();
      try {
        if (!hasUserManagementApi) {
          throw new Error('UserManagementApiUnavailable');
        }
        const [userDetails, sales, shifts, auditRes, summaryRes] = await Promise.all([
          usersApi.getUserDetails(user.id),
          usersApi.getUserActivity({ userId: user.id, type: 'sales', offset: 0 }),
          usersApi.getUserActivity({ userId: user.id, type: 'shifts', offset: 0 }),
          fetchAuditData(user.id, 'all', 0).catch(() => ({ items: [], hasMore: false })),
          auditApi.getCashierAuditSummary.isAvailable() ? auditApi.getCashierAuditSummary(user.id).catch(() => null) : null,
        ]);
        if (!userDetails?.user || !userDetails?.stats
          || !Array.isArray(sales?.items) || !Array.isArray(shifts?.items)) {
          throw new Error('استجابة بيانات المستخدم غير مكتملة. أغلق الملف وحاول مرة أخرى.');
        }
        setDetails(userDetails);
        setInvoiceActivity(sales.items);
        setShiftActivity(shifts.items);
        setInvoiceOffset(sales.nextOffset);
        setShiftOffset(shifts.nextOffset);
        setHasMoreInvoices(sales.hasMore);
        setHasMoreShifts(shifts.hasMore);
        if (auditRes) {
          setAuditLogs(auditRes.items || []);
          setAuditOffset(auditRes.nextOffset || (auditRes.items || []).length);
          setHasMoreAudit(Boolean(auditRes.hasMore));
        }
        if (summaryRes) {
          setAuditSummary(summaryRes);
        }
      } catch (requestError) {
        if (!isMissingIpcHandler(requestError)) throw requestError;
        const legacy = await loadLegacyUserDetails(user);
        setDetails(legacy.details);
        setLegacySales(legacy.sales);
        setLegacyShifts(legacy.shifts);
        setInvoiceActivity(legacy.sales.slice(0, 20));
        setShiftActivity(legacy.shifts.slice(0, 20));
        setInvoiceOffset(Math.min(legacy.sales.length, 20));
        setShiftOffset(Math.min(legacy.shifts.length, 20));
        setHasMoreInvoices(legacy.sales.length > 20);
        setHasMoreShifts(legacy.shifts.length > 20);
        setCompatibilityWarning('نسخة Electron الحالية أقدم من الواجهة؛ تم عرض السجل من بيانات الورديات. حدّث التطبيق لتفعيل كل خصائص المستخدمين.');
      }
    } catch (requestError) {
      setDetailsError(requestError.message || 'تعذر تحميل بيانات المستخدم');
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleFilterAuditLogs(filterType) {
    if (!selectedUser || auditLoading) return;
    setAuditActionFilter(filterType);
    setAuditLoading(true);
    try {
      const res = await fetchAuditData(selectedUser.id, filterType, 0);
      setAuditLogs(res.items || []);
      setAuditOffset(res.nextOffset || (res.items || []).length);
      setHasMoreAudit(Boolean(res.hasMore));
    } catch (e) {
      console.error('فشل تحميل سجل التدقيق المفلتر:', e);
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadMoreAuditLogs() {
    if (!selectedUser || auditLoading || !hasMoreAudit) return;
    setAuditLoading(true);
    try {
      const res = await fetchAuditData(selectedUser.id, auditActionFilter, auditOffset);
      setAuditLogs((prev) => [...prev, ...(res.items || [])]);
      setAuditOffset(res.nextOffset || (auditOffset + (res.items || []).length));
      setHasMoreAudit(Boolean(res.hasMore));
    } catch (e) {
      console.error('فشل تحميل المزيد من سجل التدقيق:', e);
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadMoreActivity(type) {
    if (!selectedUser || activityLoading) return;
    const offset = type === 'sales' ? invoiceOffset : shiftOffset;
    setActivityLoading(true);
    setDetailsError('');
    try {
      if (compatibilityWarning) {
        const rows = type === 'sales' ? legacySales : legacyShifts;
        const page = rows.slice(offset, offset + 20);
        const nextOffset = offset + page.length;
        if (type === 'sales') {
          setInvoiceActivity((current) => [...current, ...page]);
          setInvoiceOffset(nextOffset);
          setHasMoreInvoices(nextOffset < rows.length);
        } else {
          setShiftActivity((current) => [...current, ...page]);
          setShiftOffset(nextOffset);
          setHasMoreShifts(nextOffset < rows.length);
        }
        return;
      }
      const result = await usersApi.getUserActivity({
        userId: selectedUser.id,
        type,
        offset,
      });
      if (!result || !Array.isArray(result.items) || typeof result.nextOffset !== 'number') {
        throw new Error('استجابة سجل المستخدم غير مكتملة. حاول مرة أخرى.');
      }
      if (type === 'sales') {
        setInvoiceActivity((current) => [...current, ...result.items]);
        setInvoiceOffset(result.nextOffset);
        setHasMoreInvoices(result.hasMore);
      } else {
        setShiftActivity((current) => [...current, ...result.items]);
        setShiftOffset(result.nextOffset);
        setHasMoreShifts(result.hasMore);
      }
    } catch (requestError) {
      setDetailsError(requestError.message || 'تعذر تحميل السجل');
    } finally {
      setActivityLoading(false);
    }
  }

  async function handleToggleActive(user) {
    const success = await toggleActive(user.id);
    if (success && selectedUser?.id === user.id) {
      setSelectedUser((current) => ({ ...current, is_active: user.is_active ? 0 : 1 }));
      setDetails((current) => current
        ? { ...current, user: { ...current.user, is_active: user.is_active ? 0 : 1 } }
        : current);
    }
  }

  async function handleRemove(user) {
    if (!window.confirm(`متأكد إنك عايز حذف نهائي لحساب "${user.username}"؟`)) return;
    const success = await removeUser(user.id);
    if (success && selectedUser?.id === user.id) closeDetails();
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    if (!selectedUser) return;
    setPasswordMessage('');
    if (compatibilityWarning) {
      setPasswordMessage('إعادة تعيين كلمة المرور تتطلب تحديث التطبيق إلى آخر إصدار.');
      return;
    }
    const success = await resetPassword({ userId: selectedUser.id, password });
    if (success) {
      setPassword('');
      setPasswordMessage('تم تحديث كلمة المرور. سيُطلب من المستخدم تغييرها عند تسجيل الدخول التالي.');
      setDetails((current) => current
        ? { ...current, user: { ...current.user, force_password_change: 1 } }
        : current);
    }
  }

  async function openSale(saleId) {
    setSelectedSale(null);
    setSelectedShift(null);
    setRecordLoading(true);
    setDetailsError('');
    try {
      const sale = await salesApi.getSaleById(saleId);
      if (!sale || !Array.isArray(sale.items)) {
        throw new Error('تعذر تحميل تفاصيل الفاتورة');
      }
      setSelectedSale(sale);
    } catch (requestError) {
      setDetailsError(requestError.message || 'تعذر تحميل الفاتورة');
    } finally {
      setRecordLoading(false);
    }
  }

  async function openShift(shiftId) {
    setSelectedSale(null);
    setSelectedShift(null);
    setRecordLoading(true);
    setDetailsError('');
    try {
      const shift = await shiftsApi.getShiftById(shiftId);
      if (!shift) throw new Error('تعذر تحميل تفاصيل الوردية');
      setSelectedShift(shift);
    } catch (requestError) {
      setDetailsError(requestError.message || 'تعذر تحميل الوردية');
    } finally {
      setRecordLoading(false);
    }
  }

  function closeDetails() {
    setSelectedUser(null);
    setDetails(null);
    setSelectedSale(null);
    setSelectedShift(null);
    setDetailsError('');
  }

  async function importEmployeeFile(filePath, fileName) {
    setTransferBusy(true);
    setTransferError('');
    setTransferResult(null);
    setTransferFileName(fileName || filePath);
    try {
      const result = await importExportApi.importExcel({ filePath, type: 'employees' });
      setTransferResult(result);
      await fetchUsers();
    } catch (importError) {
      setTransferError(importError.message || 'تعذر استيراد الموظفين');
    } finally {
      setTransferBusy(false);
    }
  }

  async function chooseEmployeeImportFile() {
    setTransferError('');
    try {
      const filePath = await importExportApi.selectImportFile();
      if (filePath) await importEmployeeFile(filePath, filePath.split(/[\\/]/).pop());
    } catch (dialogError) {
      setTransferError(dialogError.message || 'تعذر اختيار ملف الاستيراد');
    }
  }

  async function handleEmployeeFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setTransferError('اختر ملف Excel (xlsx) أو CSV فقط.');
      return;
    }
    try {
      const filePath = importExportApi.getDroppedImportFilePath(file);
      if (!filePath) throw new Error('تعذر قراءة مسار الملف المسحوب');
      await importEmployeeFile(filePath, file.name);
    } catch (dropError) {
      setTransferError(dropError.message || 'تعذر فتح الملف المسحوب');
    }
  }

  async function downloadEmployeesTemplate() {
    setTransferError('');
    try {
      const result = await importExportApi.downloadImportTemplate('employees');
      setTransferError(result?.message || 'تم حفظ القالب في مجلد التنزيلات.');
    } catch (templateError) {
      setTransferError(templateError.message || 'تعذر إنشاء القالب');
    }
  }

  async function exportEmployees() {
    setTransferBusy(true);
    setTransferError('');
    try {
      const result = await importExportApi.exportEmployees();
      if (!result?.canceled) setTransferError(`تم تصدير بيانات الموظفين إلى: ${result.path}`);
    } catch (exportError) {
      setTransferError(exportError.message || 'تعذر تصدير بيانات الموظفين');
    } finally {
      setTransferBusy(false);
    }
  }

  return (
    <div className="hr-page">
      <HrHeader
        active="users"
        onNavigate={onNavigate}
        title="فريق العمل"
        subtitle="كل موظف ودوره وحسابه وحالة دوامه في مكان واحد."
        actions={(
          <>
            {(canImportEmployees || canExportEmployees) && (
              <button type="button" className="hr-btn" onClick={() => { setShowTransferModal(true); setTransferError(''); setTransferResult(null); }}>
                <DownloadIcon size={18} /> استيراد / تصدير
              </button>
            )}
            {canManageEmployees && (
              <button type="button" className="hr-btn is-primary" onClick={() => { setShowForm(true); setWizardStep(0); setWizardError(''); }}>
                <PlusIcon size={18} /> إضافة موظف
              </button>
            )}
          </>
        )}
      />

      <div className="hr-body">
      <section className="hr-stats" aria-label="ملخص الفريق">
        <HrStat Icon={UsersIcon} tone="brand" label="إجمالي الموظفين" value={displayUsers.length} note={`${employeeCountLabel(displayUsers.length)} مسجّل`} />
        <HrStat Icon={UserIcon} tone="success" label="الحاضرون الآن" value={presentCount} total={displayUsers.length} note="حسب سجل حضور اليوم" />
        <HrStat Icon={CalendarIcon} tone="info" label="في إجازة" value={onLeaveCount} note={onLeaveCount ? 'إجازات معتمدة النهارده' : 'لا توجد إجازات مسجّلة'} />
        <HrStat
          Icon={ShieldIcon}
          tone="neutral"
          label="الحسابات النشطة"
          value={activeCount}
          total={displayUsers.length}
          note={activeCount === displayUsers.length ? 'لا توجد حسابات موقوفة' : `${displayUsers.length - activeCount} حساب موقوف`}
        />
      </section>

      {missingShiftCount > 0 && (
        <div className="hr-banner" role="status">
          <span className="hr-banner-icon"><AlertIcon size={22} /></span>
          <div>
            <strong>وردية غير محددة لـ {employeeCountLabel(missingShiftCount)}</strong>
            <p>من غير بداية ونهاية للوردية، النظام مش هيقدر يحسب التأخير ولا الوقت الإضافي.</p>
          </div>
          <button type="button" className="hr-btn is-warning is-sm" onClick={() => onNavigate?.('attendance')}>تحديد الورديات</button>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay users-wizard-overlay" onClick={closeAddEmployee}>
          <form
            className="users-wizard-modal"
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-wizard-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="users-wizard-header">
              <div>
                <span className="users-wizard-eyebrow">إدارة فريق العمل</span>
                <h2 id="employee-wizard-title">إضافة موظف جديد</h2>
                <p>أكمل الخطوات التالية لإنشاء الملف والحساب.</p>
              </div>
              <button type="button" className="users-wizard-close" onClick={closeAddEmployee} aria-label="إغلاق" disabled={addingUser}>
                ×
              </button>
            </header>

            <nav className="users-wizard-steps" aria-label="خطوات إضافة الموظف">
              {EMPLOYEE_WIZARD_STEPS.map((stepName, index) => (
                <button
                  type="button"
                  key={stepName}
                  className={`users-wizard-step${wizardStep === index ? ' is-current' : ''}${wizardStep > index ? ' is-complete' : ''}`}
                  onClick={() => index < wizardStep && setWizardStep(index)}
                  aria-current={wizardStep === index ? 'step' : undefined}
                  disabled={index > wizardStep || addingUser}
                >
                  <span>{wizardStep > index ? '✓' : index + 1}</span>
                  <small>{stepName}</small>
                </button>
              ))}
            </nav>

            <div className="users-wizard-content">
              {wizardStep === 0 && (
                <section className="users-wizard-panel">
                  <div className="users-profile-photo-row">
                    {form.profileImage ? (
                      <img src={formatProductImageUrl(form.profileImage)} alt="" className="users-profile-photo" />
                    ) : (
                      <div className="users-profile-photo users-profile-photo-placeholder" aria-hidden="true">
                        {(form.firstName || '؟').trim().charAt(0)}
                      </div>
                    )}
                    <div>
                      <strong>الصورة الشخصية</strong>
                      <p>اختر صورة PNG أو JPG أو WebP (حتى 5 ميجابايت).</p>
                      <button type="button" className="users-secondary-action" onClick={handlePickProfileImage}>
                        {form.profileImage ? 'تغيير الصورة' : 'اختيار صورة'}
                      </button>
                      {form.profileImage && (
                        <button type="button" className="users-text-action" onClick={() => updateForm('profileImage', '')}>
                          إزالة
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="users-wizard-fields">
                    <label className="users-form-field">
                      <span>الاسم الأول <b>*</b></span>
                      <input
                        autoFocus
                        type="text"
                        value={form.firstName}
                        onChange={(event) => updateForm('firstName', event.target.value)}
                        maxLength={60}
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="users-form-field">
                      <span>اسم العائلة <b>*</b></span>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(event) => updateForm('lastName', event.target.value)}
                        maxLength={60}
                        autoComplete="family-name"
                      />
                    </label>
                    <label className="users-form-field">
                      <span>رقم الهاتف</span>
                      <div className="users-phone-field">
                        <span>+20</span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder="10 1234 5678"
                          value={form.phone}
                          onChange={(event) => updateForm('phone', event.target.value.replace(/[^\d\s()-]/g, ''))}
                          maxLength={18}
                          autoComplete="tel-national"
                          dir="ltr"
                        />
                      </div>
                    </label>
                    <label className="users-form-field">
                      <span>البريد الإلكتروني</span>
                      <input
                        type="email"
                        placeholder="name@example.com"
                        value={form.email}
                        onChange={(event) => updateForm('email', event.target.value)}
                        maxLength={254}
                        autoComplete="email"
                        dir="ltr"
                      />
                    </label>
                    <label className="users-form-field users-wizard-field-wide">
                      <span>التخصص</span>
                      <input
                        type="text"
                        placeholder="مثال: المبيعات، صيانة الأجهزة"
                        value={form.specialty}
                        onChange={(event) => updateForm('specialty', event.target.value)}
                        maxLength={100}
                      />
                    </label>
                  </div>
                </section>
              )}

              {wizardStep === 1 && (
                <section className="users-wizard-panel">
                  <div className="users-wizard-section-title">
                    <h3>ما طبيعة عمل الموظف؟</h3>
                    <p>اربط الموظف بدور محفوظ لتُطبق صلاحياته عند تسجيل الدخول.</p>
                  </div>
                  <div className="users-job-options">
                    {['كاشير', 'مدير', 'فني', 'استشاري', 'أخرى'].map((title) => (
                      <button
                        type="button"
                        key={title}
                        className={`users-job-option${form.jobTitle === title ? ' is-selected' : ''}`}
                        onClick={() => updateForm('jobTitle', title)}
                        aria-pressed={form.jobTitle === title}
                      >
                        <span aria-hidden="true">{title === 'كاشير' ? '▣' : title === 'مدير' ? '♙' : title === 'فني' ? '⚙' : title === 'استشاري' ? '✦' : '+'}</span>
                        <strong>{title}</strong>
                      </button>
                    ))}
                  </div>
                  {form.jobTitle === 'أخرى' && (
                    <label className="users-form-field users-wizard-field-wide">
                      <span>المسمى الوظيفي <b>*</b></span>
                      <input
                        autoFocus
                        value={form.customJobTitle}
                        onChange={(event) => updateForm('customJobTitle', event.target.value)}
                        maxLength={100}
                        placeholder="اكتب المسمى الوظيفي"
                      />
                    </label>
                  )}
                  <label className="users-form-field users-wizard-field-wide">
                    <span>الدور والصلاحيات <b>*</b></span>
                    <select
                      value={form.jobTitle === 'مدير' ? 'admin' : form.systemRoleKey}
                      onChange={(event) => {
                        if (event.target.value === 'admin') updateForm('jobTitle', 'مدير');
                        else {
                          updateForm('systemRoleKey', event.target.value);
                          if (form.jobTitle === 'مدير') updateForm('jobTitle', 'كاشير');
                        }
                      }}
                      disabled={form.jobTitle === 'مدير'}
                    >
                      <option value="admin">مدير النظام — صلاحيات كاملة</option>
                      {roleOptions.map((role) => (
                        <option key={role.role_key} value={role.role_key}>{role.role_name}</option>
                      ))}
                    </select>
                    {form.jobTitle === 'مدير' && <small>اختيار مدير النظام يتيح جميع صلاحيات التطبيق.</small>}
                  </label>
                  <label className="users-form-field users-wizard-field-wide">
                    <span>ساعات العمل <small>(اختياري)</small></span>
                    <input
                      value={form.workingHours}
                      onChange={(event) => updateForm('workingHours', event.target.value)}
                      maxLength={100}
                      placeholder="مثال: 09:00 ص - 05:00 م"
                    />
                  </label>
                </section>
              )}

              {wizardStep === 2 && (
                <section className="users-wizard-panel">
                  <div className="users-wizard-section-title">
                    <h3>حدد آلية الأجر</h3>
                    <p>تُحفظ هذه التفاصيل في ملف الموظف للرجوع إليها.</p>
                  </div>
                  <div className="users-pay-options">
                    <button
                      type="button"
                      className={`users-pay-option${form.payType === 'monthly' ? ' is-selected' : ''}`}
                      onClick={() => updateForm('payType', 'monthly')}
                      aria-pressed={form.payType === 'monthly'}
                    >
                      <strong>راتب شهري</strong>
                      <span>مبلغ ثابت لكل شهر</span>
                    </button>
                    <button
                      type="button"
                      className={`users-pay-option${form.payType === 'hourly' ? ' is-selected' : ''}`}
                      onClick={() => updateForm('payType', 'hourly')}
                      aria-pressed={form.payType === 'hourly'}
                    >
                      <strong>أجر بالساعة</strong>
                      <span>مبلغ مقابل كل ساعة</span>
                    </button>
                  </div>
                  <div className="users-wizard-fields">
                    <label className="users-form-field">
                      <span>{form.payType === 'monthly' ? 'الراتب الشهري' : 'الأجر لكل ساعة'} <b>*</b></span>
                      <div className="users-money-field">
                        <input
                          autoFocus
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={form.payAmount}
                          onChange={(event) => updateForm('payAmount', event.target.value)}
                          placeholder="0.00"
                          dir="ltr"
                        />
                        <span>ج.م</span>
                      </div>
                    </label>
                    <label className="users-form-field">
                      <span>نسبة العمولة <small>(اختياري)</small></span>
                      <div className="users-money-field">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={form.commissionRate}
                          onChange={(event) => updateForm('commissionRate', event.target.value)}
                          placeholder="0"
                          dir="ltr"
                        />
                        <span>%</span>
                      </div>
                    </label>
                  </div>
                </section>
              )}

              {wizardStep === 3 && (
                <section className="users-wizard-panel">
                  <div className="users-wizard-section-title">
                    <h3>إنشاء بيانات الدخول</h3>
                    <p>سيُطلب من الموظف تغيير كلمة المرور المؤقتة بعد أول تسجيل دخول.</p>
                  </div>
                  <div className="users-wizard-fields">
                    <label className="users-form-field users-wizard-field-wide">
                      <span>اسم المستخدم <b>*</b></span>
                      <input
                        autoFocus
                        type="text"
                        value={form.username}
                        onChange={(event) => updateForm('username', event.target.value)}
                        minLength={2}
                        autoComplete="username"
                        required
                        dir="ltr"
                      />
                    </label>
                    <label className="users-form-field users-wizard-field-wide">
                      <span>كلمة المرور <b>*</b></span>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => updateForm('password', event.target.value)}
                        minLength={6}
                        autoComplete="new-password"
                        required
                        dir="ltr"
                      />
                      <small>6 أحرف على الأقل.</small>
                    </label>
                  </div>
                  <label className="users-account-status-control">
                    <span>
                      <strong>الحساب نشط</strong>
                      <small>{form.isActive ? 'يمكن للموظف تسجيل الدخول بعد إنشاء الحساب.' : 'سيُنشأ الحساب معطلاً ولن يتمكن من تسجيل الدخول.'}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => updateForm('isActive', event.target.checked)}
                    />
                    <i aria-hidden="true" />
                  </label>
                </section>
              )}

            </div>

            {(wizardError || error) && <p className="form-error users-wizard-error" role="alert">{wizardError || error}</p>}

            <footer className="users-wizard-footer">
              {wizardStep > 0 ? (
                <button type="button" className="users-wizard-back" onClick={() => { setWizardStep((step) => step - 1); setWizardError(''); }} disabled={addingUser}>
                  السابق
                </button>
              ) : (
                <button type="button" className="users-wizard-back" onClick={closeAddEmployee} disabled={addingUser}>
                  إلغاء
                </button>
              )}
              {wizardStep < EMPLOYEE_WIZARD_STEPS.length - 1 ? (
                <button type="button" className="primary-btn" onClick={() => goToWizardStep(wizardStep + 1)}>
                  التالي
                </button>
              ) : (
                <button type="submit" className="primary-btn" disabled={addingUser}>
                  {addingUser ? 'جارٍ إنشاء الحساب...' : 'إضافة الموظف'}
                </button>
              )}
            </footer>
          </form>
        </div>
      )}

      {showTransferModal && (
        <div className="modal-overlay users-transfer-overlay" onClick={() => !transferBusy && setShowTransferModal(false)}>
          <section
            className="users-transfer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-transfer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="employee-transfer-title">استيراد وتصدير الموظفين</h2>
                <p>يدعم الاستيراد ملفات Excel وCSV، ويستبعد كلمات المرور من التصدير.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowTransferModal(false)} disabled={transferBusy} aria-label="إغلاق">×</button>
            </header>
            {canImportEmployees && (
              <div
                className="users-import-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleEmployeeFileDrop}
              >
                <strong>اسحب ملف Excel أو CSV هنا</strong>
                <span>{transferFileName || 'أو اختر ملفًا من جهازك'}</span>
                <button type="button" className="secondary-btn" onClick={chooseEmployeeImportFile} disabled={transferBusy}>
                  اختيار ملف
                </button>
                <button type="button" className="users-text-action" onClick={downloadEmployeesTemplate} disabled={transferBusy}>
                  تحميل القالب النموذجي
                </button>
              </div>
            )}
            {canExportEmployees && (
              <button type="button" className="primary-btn" onClick={exportEmployees} disabled={transferBusy}>
                تصدير الموظفين إلى Excel / CSV
              </button>
            )}
            {transferBusy && <p role="status">جارٍ معالجة الملف...</p>}
            {transferError && <p className="users-transfer-message" role="status">{transferError}</p>}
            {transferResult && (
              <div className="users-import-result" role="status">
                <strong>تم استيراد {transferResult.imported} موظف وتخطي {transferResult.skipped}.</strong>
                {!!transferResult.errors?.length && (
                  <ul>
                    {transferResult.errors.map((item) => (
                      <li key={`${item.row}-${item.reason}`}>الصف {item.row}: {item.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {(error && !showForm) && <p className="hr-alert is-error" role="alert">{error}</p>}

      <section className="hr-card">
        <div className="hr-toolbar">
          <label className="hr-search">
            <SearchIcon size={18} />
            <input
              className="hr-input"
              type="search"
              placeholder="ابحث بالاسم أو الهاتف أو المسمى الوظيفي"
              aria-label="بحث في الموظفين"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span className="hr-toolbar-label">عرض</span>
          <select className="hr-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="تصفية الموظفين">
            <option value="all">كل الموظفين</option>
            <option value="present">الحاضرون الآن</option>
            <option value="no_shift">بدون وردية</option>
            <option value="inactive">حسابات موقوفة</option>
          </select>
          <span className="hr-count">عرض {filteredUsers.length} من {displayUsers.length}</span>
        </div>

        {loading ? (
          <p className="hr-loading">جاري تحميل الموظفين...</p>
        ) : filteredUsers.length ? (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>المسمى والصلاحية</th>
                  <th>الوردية</th>
                  <th>حضور اليوم</th>
                  <th>الحساب</th>
                  <th><span className="sr-only">الإجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const name = user.full_name || user.username;
                  const presence = todayAttendanceLabel(user);
                  const canManageRow = canManageEmployees && user.id !== currentUser?.id;
                  return (
                    <tr key={user.id} className={!user.is_active ? 'is-muted' : ''}>
                      <td>
                        <div className="hr-person">
                          {user.profile_image
                            ? <img className="hr-avatar" src={formatProductImageUrl(user.profile_image)} alt="" />
                            : <span className="hr-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>}
                          <span>
                            <strong>{name}</strong>
                            <small dir="auto">@{user.username}{user.phone ? ` · ${user.phone}` : ''}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="hr-stack">
                          <strong>{user.job_title || (user.role === 'admin' ? 'مدير النظام' : 'موظف')}</strong>
                          <small>{user.role === 'admin' ? 'كل الصلاحيات مفعّلة' : 'صلاحيات حسب الدور'}</small>
                        </div>
                      </td>
                      <td>
                        {user.scheduled_start && user.scheduled_end ? (
                          <span dir="ltr">{user.scheduled_start} – {user.scheduled_end}</span>
                        ) : (
                          <button type="button" className="hr-link" onClick={() => onNavigate?.('attendance')}>
                            <PlusIcon size={16} /> تحديد وردية
                          </button>
                        )}
                      </td>
                      <td><span className={`hr-pill is-dot is-${presence.tone}`}>{presence.label}</span></td>
                      <td>
                        {user.is_active
                          ? <span className="hr-pill is-success"><CheckIcon size={14} /> نشط</span>
                          : <span className="hr-pill is-danger">موقوف</span>}
                      </td>
                      <td className="hr-cell-end">
                        <div className="hr-row-actions">
                          <button type="button" className="hr-btn is-sm" onClick={() => openDetails(user)}>فتح الملف</button>
                          {canManageRow && (
                            <>
                              <button
                                type="button"
                                className="hr-btn is-sm is-icon"
                                popoverTarget={`hr-menu-${user.id}`}
                                style={{ anchorName: `--hr-menu-${user.id}` }}
                                aria-label={`إجراءات ${name}`}
                              >
                                …
                              </button>
                              {/* popover renders in the top layer, so the table scroller can't clip it */}
                              <div id={`hr-menu-${user.id}`} popover="auto" className="hr-menu-list" style={{ positionAnchor: `--hr-menu-${user.id}` }}>
                                <button type="button" popoverTarget={`hr-menu-${user.id}`} popoverTargetAction="hide" onClick={() => handleToggleActive(user)}>
                                  {user.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                                </button>
                                <button type="button" className="is-danger" popoverTarget={`hr-menu-${user.id}`} popoverTargetAction="hide" onClick={() => handleRemove(user)}>
                                  حذف الموظف
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hr-loading">{displayUsers.length ? 'مفيش موظفين مطابقين للبحث.' : 'لسه مفيش موظفين. ابدأ بإضافة أول موظف.'}</p>
        )}

        <p className="hr-card-foot">اضغط على <strong>فتح الملف</strong> لمراجعة مبيعات الموظف ووردياته وسجل حركاته.</p>
      </section>
      </div>

      {selectedUser && (
        <div className="modal-overlay users-detail-overlay" onClick={closeDetails}>
          <section className="modal-card users-detail-modal" role="dialog" aria-modal="true" aria-labelledby="user-details-title" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <div>
                <h3 id="user-details-title">ملف المستخدم: {selectedUser.username}</h3>
                <p className="users-detail-subtitle">
                  حساب #{selectedUser.id} · {selectedUser.job_title || (selectedUser.role === 'admin' ? 'مدير النظام' : 'موظف')}
                </p>
              </div>
              <button className="modal-close" onClick={closeDetails} aria-label="إغلاق">×</button>
            </header>

            {detailsLoading ? (
              <p className="users-empty-state">جاري تحميل البيانات...</p>
            ) : details ? (
              <div className="users-detail-content">
                {detailsError && <p className="form-error">{detailsError}</p>}
                <div className="users-account-strip">
                  <span>الحالة: <strong>{details.user.is_active ? 'نشط' : 'معطل'}</strong></span>
                  <span>تاريخ الإنشاء: <strong>{formatDate(details.user.created_at)}</strong></span>
                  <span>آخر عملية بيع: <strong>{formatDate(details.stats.lastSaleAt)}</strong></span>
                  {details.user.force_password_change === 1 && <span className="users-password-warning">مطلوب تغيير كلمة المرور</span>}
                </div>
                {(details.user.full_name || details.user.phone || details.user.email
                  || details.user.job_title || details.user.specialty || details.user.working_hours
                  || details.user.pay_amount != null || details.user.profile_image || details.user.notes) && (
                  <section className="users-contact-card" aria-label="بيانات الموظف">
                    <h4>بيانات الموظف</h4>
                    {details.user.profile_image && (
                      <img
                        src={formatProductImageUrl(details.user.profile_image)}
                        alt={`صورة ${details.user.full_name || details.user.username}`}
                        className="users-detail-profile-photo"
                      />
                    )}
                    <div className="users-contact-grid">
                      {details.user.full_name && <p><span>الاسم الكامل</span><strong>{details.user.full_name}</strong></p>}
                      {details.user.phone && <p><span>رقم الهاتف</span><strong dir="ltr">{details.user.phone}</strong></p>}
                      {details.user.email && <p><span>البريد الإلكتروني</span><strong dir="ltr">{details.user.email}</strong></p>}
                      {details.user.job_title && <p><span>المسمى الوظيفي</span><strong>{details.user.job_title}</strong></p>}
                      {details.user.specialty && <p><span>التخصص</span><strong>{details.user.specialty}</strong></p>}
                      {details.user.working_hours && <p><span>ساعات العمل</span><strong>{details.user.working_hours}</strong></p>}
                      {details.user.pay_amount != null && (
                        <p>
                          <span>{details.user.pay_type === 'hourly' ? 'الأجر لكل ساعة' : 'الراتب الشهري'}</span>
                          <strong>{formatAmount(details.user.pay_amount)}</strong>
                        </p>
                      )}
                      {details.user.commission_rate != null && (
                        <p><span>نسبة العمولة</span><strong>{details.user.commission_rate}%</strong></p>
                      )}
                      {details.user.notes && <p className="users-contact-notes"><span>ملاحظات</span><strong>{details.user.notes}</strong></p>}
                    </div>
                  </section>
                )}

                <div className="users-detail-metrics">
                  <Metric label="إجمالي المبيعات" value={formatAmount(details.stats.totalSales)} note={`${details.stats.invoiceCount} فاتورة`} />
                  <Metric label="متوسط الفاتورة" value={formatAmount(details.stats.averageInvoice)} />
                  <Metric label="الخصومات" value={formatAmount(details.stats.totalDiscounts)} />
                  <Metric label="الورديات" value={details.stats.shiftCount} note={`${details.stats.openShiftCount} مفتوحة`} />
                  <Metric label="مصروفات الورديات" value={formatAmount(details.stats.totalExpenses)} />
                  <Metric label="المرتجعات" value={details.stats.returnCount} note={formatAmount(details.stats.totalRefunds)} />
                </div>

                <div className="users-payment-breakdown">
                  <span>نقدي <strong>{formatAmount(details.stats.cashSales)}</strong></span>
                  <span>بطاقة <strong>{formatAmount(details.stats.cardSales)}</strong></span>
                  <span>آجل <strong>{formatAmount(details.stats.creditSales)}</strong></span>
                  <span>عجز الدرج <strong>{formatAmount(details.stats.totalShortage)}</strong></span>
                  <span>زيادة الدرج <strong>{formatAmount(details.stats.totalOverage)}</strong></span>
                </div>

                {compatibilityWarning && <p className="users-compatibility-warning" role="status">{compatibilityWarning}</p>}

                <div className="users-detail-tabs" role="tablist" aria-label="سجل المستخدم">
                  <button className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')}>
                    سجل الحركات والمدخلات 🕵️‍♂️ ({auditSummary?.total_actions || auditLogs.length})
                  </button>
                  <button className={activeTab === 'sales' ? 'active' : ''} onClick={() => setActiveTab('sales')}>
                    الفواتير ({details.stats.invoiceCount})
                  </button>
                  <button className={activeTab === 'shifts' ? 'active' : ''} onClick={() => setActiveTab('shifts')}>
                    الورديات ({details.stats.shiftCount})
                  </button>
                </div>

                {activeTab === 'audit' ? (
                  <div className="users-audit-container">
                    {/* Summary Quick Stats Banner */}
                    <div className="audit-summary-banner">
                      <div className="audit-summary-item">
                        <span>إجمالي الحركات</span>
                        <strong>{auditSummary?.total_actions ?? auditLogs.length}</strong>
                      </div>
                      <div className="audit-summary-item">
                        <span>أصناف محذوفة من السلة</span>
                        <strong style={{ color: '#EF4444' }}>{auditSummary?.voided_items_count ?? 0}</strong>
                      </div>
                      <div className="audit-summary-item">
                        <span>سلات تم تفريغها</span>
                        <strong style={{ color: '#DC2626' }}>{auditSummary?.cleared_carts_count ?? 0}</strong>
                      </div>
                      <div className="audit-summary-item">
                        <span>مرات تطبيق الخصم</span>
                        <strong style={{ color: '#F59E0B' }}>{auditSummary?.discounts_count ?? 0}</strong>
                      </div>
                      <div className="audit-summary-item">
                        <span>سحوبات المصروفات</span>
                        <strong style={{ color: '#F97316' }}>{auditSummary?.expenses_count ?? 0}</strong>
                      </div>
                    </div>

                    {/* Filter Bar Chips */}
                    <div className="audit-filter-bar">
                      {[
                        { id: 'all', label: '⚡ كل الحركات' },
                        { id: 'sale_created', label: '🛒 فواتير البيع' },
                        { id: 'discount_applied', label: '🏷️ الخصومات' },
                        { id: 'item_removed', label: '🗑️ حذف أصناف' },
                        { id: 'cart_cleared', label: '⚠️ تفريغ السلة' },
                        { id: 'expense_added', label: '💸 المصروفات' },
                        { id: 'return_processed', label: '↩️ المرتجعات' },
                        { id: 'shift_open', label: '🟢 فتح وردية' },
                        { id: 'shift_close', label: '🔒 تقفيل وردية' },
                        { id: 'login', label: '🔑 دخول / خروج' },
                      ].map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          className={`audit-filter-chip ${auditActionFilter === chip.id ? 'active' : ''}`}
                          onClick={() => handleFilterAuditLogs(chip.id)}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Audit Logs Timeline */}
                    <div className="audit-timeline">
                      {auditLoading && !auditLogs.length ? (
                        <p className="users-empty-state">جاري تحميل سجل الحركات...</p>
                      ) : auditLogs.length ? (
                        auditLogs.map((log) => {
                          const meta = getActionMeta(log.action_type);
                          return (
                            <div key={log.id} className={`audit-timeline-item severity-${log.severity || 'info'}`}>
                              <div className="audit-icon-box">{meta.icon}</div>
                              <div className="audit-item-body">
                                <div className="audit-item-header">
                                  <span className="audit-item-title">{log.title}</span>
                                  <span className="audit-item-time">{formatDate(log.created_at)}</span>
                                </div>
                                {log.details && (
                                  <div className="audit-item-details">{log.details}</div>
                                )}
                                <div className="audit-item-meta">
                                  <span className="audit-badge">{meta.label}</span>
                                  {log.shift_id && (
                                    <span className="audit-badge" style={{ background: '#EEF2FF', color: '#4338CA' }}>
                                      وردية #{log.shift_id}
                                    </span>
                                  )}
                                  {Number(log.amount) > 0 && (
                                    <span className="audit-amount-badge">
                                      {formatAmount(log.amount)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="users-empty-state">لا توجد حركات مسجلة مطابقة للفلتر المحدد.</p>
                      )}

                      {hasMoreAudit && (
                        <button
                          type="button"
                          className="secondary-btn users-load-more"
                          disabled={auditLoading}
                          onClick={loadMoreAuditLogs}
                        >
                          {auditLoading ? 'جاري التحميل...' : 'تحميل حركات أقدم'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : activeTab === 'sales' ? (
                  <div className="users-activity-list">
                    {invoiceActivity.length ? invoiceActivity.map((invoice) => (
                      <button className="users-activity-row" key={invoice.id} onClick={() => openSale(invoice.id)}>
                        <span><strong>فاتورة #{invoice.id}</strong><small>{invoice.customer_name || 'عميل نقدي سريع'} · {formatDate(invoice.created_at)}</small></span>
                        <span><strong>{formatAmount(invoice.total_amount)}</strong><small>{invoice.item_count} صنف · {invoice.payment_method || '—'}</small></span>
                      </button>
                    )) : <p className="users-empty-state">لا توجد فواتير مسجلة لهذا المستخدم.</p>}
                    {hasMoreInvoices && (
                      <button className="secondary-btn users-load-more" disabled={activityLoading} onClick={() => loadMoreActivity('sales')}>
                        {activityLoading ? 'جاري التحميل...' : 'تحميل فواتير أقدم'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="users-activity-list">
                    {shiftActivity.length ? shiftActivity.map((shift) => (
                      <button className="users-activity-row" key={shift.id} onClick={() => openShift(shift.id)}>
                        <span><strong>وردية #{shift.id} · {shift.shift_type === 'evening' ? 'مسائية' : 'صباحية'}</strong><small>{formatDate(shift.start_time)} · {shift.status === 'open' ? 'مفتوحة' : 'مغلقة'}</small></span>
                        <span><strong>{formatAmount(shift.total_sales)}</strong><small>{shift.sales_count} فاتورة · مصروفات {formatAmount(shift.total_expenses)}</small></span>
                      </button>
                    )) : <p className="users-empty-state">لا توجد ورديات مسجلة لهذا المستخدم.</p>}
                    {hasMoreShifts && (
                      <button className="secondary-btn users-load-more" disabled={activityLoading} onClick={() => loadMoreActivity('shifts')}>
                        {activityLoading ? 'جاري التحميل...' : 'تحميل ورديات أقدم'}
                      </button>
                    )}
                  </div>
                )}

                {canManageEmployees && selectedUser.id !== currentUser?.id && (
                  <form className="users-reset-password" onSubmit={handleResetPassword}>
                    <div>
                      <strong>إعادة تعيين كلمة المرور</strong>
                      <small>سيُطلب من المستخدم تغييرها بعد تسجيل الدخول التالي.</small>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={6}
                      placeholder="كلمة مرور مؤقتة (6 أحرف على الأقل)"
                      required
                    />
                    <button className="secondary-btn" type="submit">تعيين كلمة المرور</button>
                    {passwordMessage && <p className="users-success-message">{passwordMessage}</p>}
                    {error && <p className="form-error">{error}</p>}
                  </form>
                )}
              </div>
            ) : detailsError ? (
              <p className="form-error users-detail-load-error">{detailsError}</p>
            ) : null}
          </section>
        </div>
      )}

      {(selectedSale || selectedShift || recordLoading) && (
        <div className="modal-overlay users-record-overlay" onClick={() => {
          setSelectedSale(null);
          setSelectedShift(null);
        }}>
          <section className="modal-card users-record-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>{selectedSale ? `تفاصيل الفاتورة #${selectedSale.id}` : selectedShift ? `تفاصيل الوردية #${selectedShift.id}` : 'جاري تحميل التفاصيل...'}</h3>
              <button className="modal-close" onClick={() => {
                setSelectedSale(null);
                setSelectedShift(null);
              }} aria-label="إغلاق">×</button>
            </header>
            {recordLoading ? <p className="users-empty-state">جاري تحميل التفاصيل...</p> : selectedSale ? (
              <>
                <p className="users-record-summary">
                  {selectedSale.customer_name || 'عميل نقدي سريع'}
                  {selectedSale.customer_phone ? ` · ${selectedSale.customer_phone}` : ''}
                  {' · '}{formatDate(selectedSale.created_at)} · {selectedSale.payment_method || '—'}
                  {selectedSale.discount ? ` · خصم ${formatAmount(selectedSale.discount)}` : ''}
                </p>
                <div className="users-detail-table-wrap">
                  <table className="users-detail-table">
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                    <tbody>{selectedSale.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName || 'صنف محذوف'} {item.size ? `(${item.size})` : ''} {item.color || ''}</td>
                        <td>{item.quantity}</td>
                        <td>{formatAmount(item.unit_price)}</td>
                        <td>{formatAmount(item.quantity * item.unit_price)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="users-record-total">إجمالي الفاتورة: <strong>{formatAmount(selectedSale.total_amount)}</strong></div>
              </>
            ) : selectedShift && (
              <>
                <p className="users-record-summary">{formatDate(selectedShift.start_time)} · {selectedShift.status === 'open' ? 'مفتوحة' : `أُغلقت ${formatDate(selectedShift.end_time)}`}</p>
                <div className="users-detail-metrics">
                  <Metric label="العهدة الافتتاحية" value={formatAmount(selectedShift.opening_cash)} />
                  <Metric label="المبيعات" value={formatAmount(selectedShift.liveTotals?.totalSales)} note={`${selectedShift.liveTotals?.salesCount || 0} فاتورة`} />
                  <Metric label="مصروفات الوردية" value={formatAmount(selectedShift.liveTotals?.totalExpenses)} />
                  <Metric label="النقدية المتوقعة" value={formatAmount(selectedShift.liveTotals?.expectedCash)} />
                  <Metric label="النقدية الفعلية" value={formatAmount(selectedShift.actual_cash)} />
                  <Metric label="فرق الدرج" value={formatAmount(selectedShift.cash_difference)} />
                </div>
                {selectedShift.closing_notes && <p className="users-record-summary">ملاحظات الإغلاق: {selectedShift.closing_notes}</p>}
                {!!selectedShift.expenses?.length && (
                  <div className="users-shift-records">
                    <h4>مصروفات الوردية</h4>
                    {selectedShift.expenses.map((expense) => (
                      <div className="users-shift-record-row" key={expense.id}>
                        <span>{expense.category}{expense.notes ? ` · ${expense.notes}` : ''}</span>
                        <strong>{formatAmount(expense.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {!!selectedShift.customerPayments?.length && (
                  <div className="users-shift-records">
                    <h4>تحصيلات ديون العملاء</h4>
                    {selectedShift.customerPayments.map((payment) => (
                      <div className="users-shift-record-row" key={payment.id}>
                        <span>{payment.customer_name || 'عميل'} · {formatDate(payment.payment_date)}</span>
                        <strong>{formatAmount(payment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {!!selectedShift.returns?.length && (
                  <div className="users-shift-records">
                    <h4>المرتجعات</h4>
                    {selectedShift.returns.map((item) => (
                      <div className="users-shift-record-row" key={item.id}>
                        <span>{item.product_name || 'صنف'} · {item.reason || 'بدون سبب مسجل'}</span>
                        <strong>{formatAmount(item.refund_amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default UsersPage;
