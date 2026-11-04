jest.mock('../../electron/repositories/reports.repository', () => ({}));
jest.mock('../../electron/repositories/cases.repository', () => ({
  getLawFirmReport: jest.fn(() => ({ financialMovements: [] })),
}));
jest.mock('../../electron/services/auth.service', () => ({
  requireAdmin: jest.fn(),
}));

const casesRepository = require('../../electron/repositories/cases.repository');
const reportsService = require('../../electron/services/reports.service');

describe('reports.service.getLegalCaseReport', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects invalid calendar dates before querying report data', () => {
    expect(() => reportsService.getLegalCaseReport({
      startDate: '2026-02-30',
      endDate: '2026-03-01',
    })).toThrow('تاريخ فترة التقرير غير صالح');
    expect(casesRepository.getLawFirmReport).not.toHaveBeenCalled();
  });

  test('rejects a reversed date range', () => {
    expect(() => reportsService.getLegalCaseReport({
      startDate: '2026-11-03',
      endDate: '2026-11-02',
    })).toThrow('بداية فترة التقرير يجب أن تسبق نهايتها');
    expect(casesRepository.getLawFirmReport).not.toHaveBeenCalled();
  });

  test('loads the report for a valid custom date range', () => {
    const report = reportsService.getLegalCaseReport({
      startDate: '2026-11-02',
      endDate: '2026-11-08',
    });

    expect(report).toEqual({ financialMovements: [] });
    expect(casesRepository.getLawFirmReport).toHaveBeenCalledWith('2026-11-02', '2026-11-08');
  });
});
