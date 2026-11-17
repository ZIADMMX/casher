import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CRMReportsPage from '../../src/pages/CRMReportsPage.jsx';
import { num } from '../../src/components/crm/crmFormat.js';

const api = vi.hoisted(() => ({
  getAllCustomersWithStats: vi.fn(),
  getAllCRMOpportunities: vi.fn(),
  getCRMLeads: vi.fn(),
  getCRMPipelineStages: vi.fn(),
}));
vi.mock('../../src/api/customers.js', () => ({ getAllCustomersWithStats: (...a) => api.getAllCustomersWithStats(...a) }));
vi.mock('../../src/api/crm.js', () => ({
  getAllCRMOpportunities: (...a) => api.getAllCRMOpportunities(...a),
  getCRMLeads: (...a) => api.getCRMLeads(...a),
  getCRMPipelineStages: (...a) => api.getCRMPipelineStages(...a),
}));

const money = (v) => `${Number(v).toLocaleString('ar-EG')} ج.م`;
const stages = [
  { id: 1, stage_key: 'negotiation', label: 'تفاوض' },
  { id: 2, stage_key: 'won', label: 'رابحة', outcome: 'won' },
  { id: 3, stage_key: 'lost', label: 'خاسرة', outcome: 'lost' },
];
const opportunities = [
  { id: 1, stage: 'won', pipeline_stage_id: 2, expected_value: 10_000, assigned_username: 'منى' },
  { id: 2, stage: 'won', pipeline_stage_id: 2, expected_value: 5_000, assigned_username: 'كريم' },
  { id: 3, stage: 'lost', pipeline_stage_id: 3, expected_value: 8_000, lost_reason: 'السعر', assigned_username: 'منى' },
  { id: 4, stage: 'negotiation', pipeline_stage_id: 1, expected_value: 20_000, probability: 50, assigned_username: 'كريم' },
];
const leads = [
  { id: 1, source: 'واتساب', status: 'new' },
  { id: 2, source: 'واتساب', status: 'contacted' },
  { id: 3, source: 'فيسبوك', status: 'converted' },
];

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getAllCustomersWithStats.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
  api.getAllCRMOpportunities.mockResolvedValue(opportunities);
  api.getCRMLeads.mockResolvedValue(leads);
  api.getCRMPipelineStages.mockResolvedValue(stages);
});

const card = (label) => screen.getByText(label).closest('article');

describe('CRM reports page', () => {
  test('conversion rate is won over closed deals, and the forecast weighs open deals by probability', async () => {
    render(<CRMReportsPage />);
    await waitFor(() => expect(within(card('معدل نجاح الإغلاق')).getByText(`${num(67)}٪`)).toBeInTheDocument()); // 2 won of 3 closed
    expect(within(card('معدل نجاح الإغلاق')).getByText(`${money(15_000)} قيمة الصفقات الرابحة`)).toBeInTheDocument();
    expect(within(card('التوقع المرجّح')).getByText(money(10_000))).toBeInTheDocument(); // 20,000 x 50%
    expect(within(card('الصفقات المفتوحة')).getByText(num(1))).toBeInTheDocument();
    expect(within(card('الصفقات المفتوحة')).getByText(`${money(20_000)} قيمة متوقعة`)).toBeInTheDocument();
  });

  test('counts contacts and only the leads that still need follow-up', async () => {
    render(<CRMReportsPage />);
    await waitFor(() => expect(within(card('إجمالي جهات الاتصال')).getByText(num(4))).toBeInTheDocument());
    expect(within(card('عملاء محتملون نشطون')).getByText(num(2))).toBeInTheDocument(); // the converted one is not active
  });

  test('shows lead sources, the loss reason and the sales team ranked by won value', async () => {
    render(<CRMReportsPage />);
    expect(await screen.findByText('واتساب')).toBeInTheDocument();
    expect(screen.getByText('فيسبوك')).toBeInTheDocument();
    expect(screen.getByText('السعر')).toBeInTheDocument();
    const team = screen.getByText('أداء فريق المبيعات').closest('article');
    const names = within(team).getAllByText(/منى|كريم/).map((n) => n.textContent);
    expect(names[0]).toBe('منى'); // 10,000 won beats 5,000
  });

  test('a rate of zero when nothing is closed yet, and an error with a retry', async () => {
    api.getAllCRMOpportunities.mockResolvedValue([{ id: 9, stage: 'negotiation', pipeline_stage_id: 1, expected_value: 1000, probability: 10 }]);
    const { unmount } = render(<CRMReportsPage />);
    await waitFor(() => expect(within(card('معدل نجاح الإغلاق')).getByText(`${num(0)}٪`)).toBeInTheDocument());
    unmount();

    api.getAllCRMOpportunities.mockRejectedValue(new Error('تعذر الاتصال'));
    render(<CRMReportsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر الاتصال');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });
});
