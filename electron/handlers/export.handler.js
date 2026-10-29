const { exportToExcel, exportToExcelOrCsv } = require('../services/export.service');
const customersService = require('../services/customers.service');
const reportsService = require('../services/reports.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
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

  safeHandle('export:invoices', (event, period) => {
    authService.requireAdmin();
    const report = reportsService.getFullReport(period);
    const rows = report.recentInvoices.map((inv) => ({
      'رقم الفاتورة': `INV-${String(inv.id).padStart(4, '0')}`,
      'العميل': inv.customerName,
      'عدد الأصناف': inv.itemCount,
      'الإجمالي': inv.total_amount,
      'طريقة الدفع': inv.payment_method === 'cash' ? 'نقدي' : inv.payment_method === 'card' ? 'بطاقة' : 'آجل',
      'التاريخ': inv.created_at,
    }));
    const fileName = `فواتير-${report.startDate}-إلى-${report.endDate}.xlsx`;
    return exportToExcel(rows, 'الفواتير', fileName);
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