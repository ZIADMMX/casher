const { exportToExcel, exportToExcelOrCsv } = require('../services/export.service');
const customersService = require('../services/customers.service');
const reportsService = require('../services/reports.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const auditService = require('../services/audit.service');
const { reportPeriodSchema } = require('../validators/schema');
const usersRepo = require('../repositories/users.repository');
const enterpriseRepo = require('../repositories/enterprise.repository');

function registerExportHandlers() {
  safeHandle('export:customers', () => {
    authService.requireAdmin();
    const customers = customersService.getAllCustomersWithStats();
    const rows = customers.map((c) => ({
      'اسم العميل': c.name,
      'رقم الهاتف': c.phone || '',
      'البريد الإلكتروني': c.email || '',
      'إجمالي المشتريات': c.totalSpent,
      'عدد الفواتير': c.invoiceCount,
      'تاريخ الإضافة': c.created_at,
    }));
    return exportToExcel(rows, 'العملاء', 'عملاء-المحل.xlsx');
  });

  safeHandle('export:invoices', reportPeriodSchema, async (event, period) => {
    authService.requireAdmin();
    // The whole period, sales and returns, straight from the ledger.
    const ledger = reportsService.getLedgerForExport(period);
    const methodLabels = { cash: 'نقدي', card: 'بطاقة', credit: 'آجل', return: 'مرتجع' };
    const rows = ledger.rows.map((row) => ({
      'رقم المستند': row.code,
      'النوع': row.kind === 'return' ? 'مرتجع' : 'فاتورة',
      'العميل': row.customerName,
      'الموظف': row.staffName,
      'عدد الأصناف': row.itemCount,
      'طريقة الدفع': methodLabels[row.method] || row.method,
      'المبلغ': row.amount,
      'التاريخ': row.created_at,
    }));
    const fileName = `فواتير-${ledger.startDate}-إلى-${ledger.endDate}.xlsx`;
    const result = await exportToExcel(rows, 'الفواتير', fileName);
    if (!result?.canceled) {
      auditService.logAction({
        actionType: 'report_export',
        title: 'تصدير تقرير الفواتير',
        details: `${ledger.startDate} → ${ledger.endDate} (${rows.length} مستند)`,
      });
    }
    return result;
  });

  safeHandle('export:employees', () => {
    authService.requireAdmin();
    const roleNames = new Map(enterpriseRepo.getRoles().map((role) => [role.role_key, role.role_name]));
    const employees = usersRepo.getAll().map((employee) => ({
      'اسم المستخدم': employee.username,
      'الاسم الأول': employee.first_name || '',
      'اسم العائلة': employee.last_name || '',
      'المسمى الوظيفي': employee.job_title || '',
      'الدور الوظيفي': roleNames.get(employee.system_role_key) || (employee.role === 'admin' ? 'مدير النظام' : 'كاشير'),
      'مفتاح الدور': employee.system_role_key || employee.role,
      'التخصص': employee.specialty || '',
      'رقم الهاتف': employee.phone || '',
      'البريد الإلكتروني': employee.email || '',
      'ساعات العمل': employee.working_hours || '',
      'نوع الأجر': employee.pay_type || '',
      'قيمة الأجر': employee.pay_amount ?? '',
      'نسبة العمولة': employee.commission_rate ?? '',
      'حالة الحساب': employee.is_active ? 'نشط' : 'معطل',
      'ملاحظات': employee.notes || '',
      'تاريخ الإنشاء': employee.created_at,
    }));
    return exportToExcelOrCsv(employees, 'الموظفون', 'employees.xlsx');
  });
}

module.exports = { registerExportHandlers };