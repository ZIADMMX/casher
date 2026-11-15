import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import GymReportsView from '../../src/components/reports/GymReportsView.jsx';
import SalesReportsView from '../../src/components/reports/SalesReportsView.jsx';
import * as reportsApi from '../../src/api/reports.js';
import * as customersApi from '../../src/api/customers.js';
import * as subscriptionsApi from '../../src/api/subscriptions.js';

vi.mock('../../src/api/reports.js', () => ({ getReports: vi.fn(), getReportInvoices: vi.fn() }));
vi.mock('../../src/api/importExport.js', () => ({ exportInvoices: vi.fn() }));
vi.mock('../../src/api/customers.js', () => ({ getAllCustomersWithStats: vi.fn() }));
vi.mock('../../src/api/subscriptions.js', () => ({ getAllSubscriptions: vi.fn(), getSubscriptionStats: vi.fn() }));

const DAY = 86400000;
const at = (days) => new Date(Date.now() + days * DAY).toISOString();

const REPORT = {
  startDate: '2026-11-15', endDate: '2026-11-15', prevStartDate: '2026-11-14', prevEndDate: '2026-11-14',
  invoicesPerDay: 6, returnRate: 0,
  kpis: { grossSales: 6000, netSales: 6000, profit: 6000, invoiceCount: 6, avgInvoice: 1000, margin: 100, returnCount: 0, discounts: 0, returnsTotal: 0 },
  prevKpis: { avgInvoice: 900 },
  growth: { sales: 12, profit: 12, invoices: 0, avgInvoice: 10 },
  trend: [{ day: '2026-11-15', total: 6000, invoiceCount: 6, prevTotal: 5000 }],
  payments: [{ method: 'cash', total: 4000, invoiceCount: 4, share: 66 }, { method: 'card', total: 2000, invoiceCount: 2, share: 34 }, { method: 'credit', total: 0, invoiceCount: 0, share: 0 }],
  credit: { total: 0, customers: 0 },
  topSelling: [{ productId: 1, productName: 'عبوة ماء', revenue: 200, qtySold: 10 }],
  topByQuantity: [{ productId: 1, productName: 'عبوة ماء', revenue: 200, qtySold: 10 }],
  staff: [{ userId: 1, name: 'admin', total: 6000, invoiceCount: 6, avgInvoice: 1000 }],
  staffOptions: [{ id: 1, name: 'admin' }],
};

const CUSTOMERS = [
  { id: 1, name: 'زياد', phone: '0128', debt: 2000, totalSpent: 5400, created_at: at(-1) },
  { id: 2, name: 'علي', phone: '0100', debt: 0, totalSpent: 900, created_at: at(-1) },
];
const SUBS = [
  { id: 3, customer_id: 1, status: 'active', end_date: at(92), package_name: 'كيك بوكس', package_price: 5400 },
  { id: 4, customer_id: 2, status: 'active', end_date: at(3), package_name: 'سباحة', package_price: 900 },
];

beforeEach(() => {
  reportsApi.getReports.mockReset().mockResolvedValue(REPORT);
  reportsApi.getReportInvoices.mockReset().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 6, pageCount: 0 });
  customersApi.getAllCustomersWithStats.mockReset().mockResolvedValue(CUSTOMERS);
  subscriptionsApi.getAllSubscriptions.mockReset().mockResolvedValue(SUBS);
  subscriptionsApi.getSubscriptionStats.mockReset().mockResolvedValue({ active_count: 2, frozen_count: 0, expired_count: 0 });
});

describe('gym reports wording', () => {
  it('uses gym terms, not the commercial ones', async () => {
    render(<GymReportsView onNavigate={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'تقارير النادي' })).toBeInTheDocument();
    for (const t of ['صافي دخل الاشتراكات', 'عدد التحصيلات', 'متوسط التحصيل', 'منحى الدخل', 'طرق التحصيل', 'أداء المدربين', 'أحدث التحصيلات']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    for (const t of ['صافي المبيعات', 'عدد الفواتير', 'متوسط الفاتورة', 'الأصناف الأعلى مبيعًا', 'أداء الموظفين']) {
      expect(screen.queryByText(t)).not.toBeInTheDocument();
    }
  });

  it('drops the POS top-products table (a gym sells subscriptions, not items)', async () => {
    render(<GymReportsView onNavigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'تقارير النادي' });
    expect(screen.queryByText('عبوة ماء')).not.toBeInTheDocument();
  });
});

describe('gym report extras', () => {
  it('shows subscription health, overdue members, expiring subs and revenue by package', async () => {
    render(<GymReportsView onNavigate={vi.fn()} />);

    const attention = await screen.findByLabelText('أعضاء يحتاجون انتباهك');
    expect(within(attention).getByText('زياد')).toBeInTheDocument();
    expect(within(attention).getByText('2,000 ج.م')).toBeInTheDocument();
    expect(within(attention).queryByText('علي')).not.toBeInTheDocument(); // no debt

    const expiring = screen.getByLabelText('اشتراكات تنتهي هذا الأسبوع');
    expect(within(expiring).getByText('علي')).toBeInTheDocument(); // ends in 3 days

    const packages = screen.getByLabelText('توزيع الإيراد على الباقات');
    expect(within(packages).getByText('كيك بوكس')).toBeInTheDocument();
    expect(within(packages).getByText('سباحة')).toBeInTheDocument();
    expect(within(packages).getByText('5,400 ج.م')).toBeInTheDocument();

    expect(screen.getByText('مديونيات متأخرة')).toBeInTheDocument();
  });
});

describe('other sectors are unchanged', () => {
  it('the default sales view keeps the commercial wording', async () => {
    render(<SalesReportsView onNavigate={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'التقارير والتحليلات' })).toBeInTheDocument();
    expect(screen.getByText('صافي المبيعات')).toBeInTheDocument();
    expect(screen.getByText('الأصناف الأعلى مبيعًا')).toBeInTheDocument();
    expect(screen.getByText('عبوة ماء')).toBeInTheDocument();
    expect(screen.queryByText('تقارير النادي')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('توزيع الإيراد على الباقات')).not.toBeInTheDocument();
  });
});
