const { exportToExcel } = require('../services/export.service');
const customersService = require('../services/customers.service');
const reportsService = require('../services/reports.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

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
}

module.exports = { registerExportHandlers };