import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import ShiftsPage from '../../src/pages/ShiftsPage.jsx';
import * as shiftsApi from '../../src/api/shifts.js';
import * as authApi from '../../src/api/auth.js';

vi.mock('../../src/api/bridge.js', () => ({ isBridgeAvailable: () => true }));
vi.mock('../../src/api/shifts.js', () => ({
  getCurrentShift: Object.assign(vi.fn(), { isAvailable: () => true }),
  getAllShifts: Object.assign(vi.fn(), { isAvailable: () => true }),
  getShiftsKPIs: Object.assign(vi.fn(), { isAvailable: () => true }),
  getLastClosedShift: Object.assign(vi.fn(), { isAvailable: () => true }),
  openShift: Object.assign(vi.fn(), { isAvailable: () => true }),
  closeShift: Object.assign(vi.fn(), { isAvailable: () => true }),
  addShiftExpense: Object.assign(vi.fn(), { isAvailable: () => true }),
  getShiftXReport: Object.assign(vi.fn(), { isAvailable: () => true }),
  getShiftById: Object.assign(vi.fn(), { isAvailable: () => true }),
}));
vi.mock('../../src/api/auth.js', () => ({ getSession: Object.assign(vi.fn(), { isAvailable: () => true }) }));
vi.mock('../../src/components/ShiftReportPrint.jsx', () => ({ default: () => <div>تقرير مطبوع</div> }));

const OPEN_SHIFT = {
  id: 1, status: 'open', shift_type: 'morning', opening_cash: 500, start_time: '2026-11-14T08:42:00', cashier_username: 'admin',
  liveTotals: { cashSales: 200, totalExpenses: 50, cashExchangeNet: 0, expectedCash: 650 },
};

function setup({ role = 'admin', current = OPEN_SHIFT } = {}) {
  shiftsApi.getCurrentShift.mockResolvedValue(current);
  shiftsApi.getAllShifts.mockResolvedValue(current ? [{ ...current, total_cash_sales: 200, total_expenses: 50, expected_cash: 650 }] : []);
  shiftsApi.getShiftsKPIs.mockResolvedValue({ closedShiftsCount: 3, totalSalesVolume: 12000, totalShortage: 25, totalOverage: 0, totalExpensesAmount: 80 });
  shiftsApi.getLastClosedShift.mockResolvedValue(null);
  authApi.getSession.mockResolvedValue({ username: 'u', role });
  shiftsApi.closeShift.mockResolvedValue({ id: 1, status: 'closed' });
  return render(<ShiftsPage />);
}

const openCloseModal = async () => {
  fireEvent.click((await screen.findAllByRole('button', { name: /تقفيل الدرج|إغلاق الوردية/ }))[0]);
  return screen.findByRole('dialog');
};

beforeEach(() => vi.clearAllMocks());

test('the admin sees the KPIs and the expected cash of the open shift', async () => {
  setup();
  expect(await screen.findByText('مبيعات الورديات المغلقة')).toBeInTheDocument();
  expect(screen.getByText('النقدية المفترضة بالدرج (=)')).toBeInTheDocument();
  expect(screen.getAllByText(/650\.00/).length).toBeGreaterThan(0);
});

test('a cashier does not see KPIs or the expected cash (blind count)', async () => {
  setup({ role: 'cashier' });
  await screen.findByText(/الوردية الحالية نشطة/);
  expect(screen.queryByText('مبيعات الورديات المغلقة')).not.toBeInTheDocument();
  expect(screen.queryByText('النقدية المفترضة بالدرج (=)')).not.toBeInTheDocument();

  const dialog = await openCloseModal();
  expect(within(dialog).queryByText('المتوقع بالدرج')).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/عجز في الدرج|فائض في الدرج|الدرج مطابق/)).not.toBeInTheDocument();
  expect(within(dialog).getByText('النقدية الفعلية المعدودة')).toBeInTheDocument();
});

test('closing counts by denomination and shows the shortage live to the admin', async () => {
  setup();
  const dialog = await openCloseModal();
  expect(within(dialog).getByText('المتوقع بالدرج')).toBeInTheDocument();
  // nothing counted yet: shortage equals the whole expected cash
  expect(within(dialog).getByText('عجز في الدرج').nextSibling).toHaveTextContent('650.00');

  fireEvent.change(within(dialog).getByLabelText('عدد فئة 200 ج'), { target: { value: '3' } }); // 600
  fireEvent.change(within(dialog).getByLabelText('عدد فئة 50 ج'), { target: { value: '1' } }); // 50
  fireEvent.change(within(dialog).getByLabelText('عدد فئة 50 ق'), { target: { value: '2' } }); // 1
  expect(within(dialog).getByText('النقدية الفعلية المعدودة').nextSibling).toHaveTextContent('651.00');
  expect(within(dialog).getByText('فائض في الدرج').nextSibling).toHaveTextContent('+1.00');
});

test('confirming sends the counted total and the denomination breakdown', async () => {
  setup();
  const dialog = await openCloseModal();
  fireEvent.change(within(dialog).getByLabelText('عدد فئة 200 ج'), { target: { value: '3' } });
  fireEvent.change(within(dialog).getByLabelText('عدد فئة 50 ج'), { target: { value: '1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /تأكيد التقفيل وطباعة Z/ }));

  await waitFor(() => expect(shiftsApi.closeShift).toHaveBeenCalledTimes(1));
  const payload = shiftsApi.closeShift.mock.calls[0][0];
  expect(payload.actualCash).toBe(650);
  expect(payload.cashBreakdown).toMatchObject({ 200: '3', 50: '1' });
});

test('switching to a direct total uses the typed amount', async () => {
  setup();
  const dialog = await openCloseModal();
  fireEvent.click(within(dialog).getByRole('button', { name: 'إدخال الإجمالي مباشرة' }));
  fireEvent.change(within(dialog).getByLabelText(/النقدية الفعلية بالدرج/), { target: { value: '640' } });
  expect(within(dialog).getByText('عجز في الدرج').nextSibling).toHaveTextContent('10.00');
  fireEvent.click(within(dialog).getByRole('button', { name: /تأكيد التقفيل وطباعة Z/ }));
  await waitFor(() => expect(shiftsApi.closeShift).toHaveBeenCalledWith(expect.objectContaining({ actualCash: 640, cashBreakdown: null })));
});

test('with no open shift the page offers to open one', async () => {
  setup({ current: null });
  expect(await screen.findByText('الدرج مغلق حالياً ولا توجد وردية مفتوحة')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /فتح وردية/ }).length).toBeGreaterThan(0);
});

test('a server error while closing is shown in the dialog', async () => {
  setup();
  shiftsApi.closeShift.mockRejectedValue(new Error('لا يمكن إغلاق وردية مغلقة بالفعل'));
  const dialog = await openCloseModal();
  fireEvent.change(within(dialog).getByLabelText('عدد فئة 200 ج'), { target: { value: '1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /تأكيد التقفيل وطباعة Z/ }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('لا يمكن إغلاق وردية مغلقة بالفعل');
});
