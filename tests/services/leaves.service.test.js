jest.mock('../../electron/repositories/leaves.repository', () => ({
  getAll: jest.fn(),
  getEmployee: jest.fn(),
  create: jest.fn(),
  hasApprovedOverlap: jest.fn(),
  getRequest: jest.fn(),
  decide: jest.fn(),
}));

jest.mock('../../electron/services/auth.service', () => ({
  requireAdmin: jest.fn(() => ({ id: 1, role: 'admin' })),
}));

const leavesRepo = require('../../electron/repositories/leaves.repository');
const leavesService = require('../../electron/services/leaves.service');

describe('leaves.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    leavesRepo.getEmployee.mockReturnValue({ id: 2, is_active: 1 });
    leavesRepo.hasApprovedOverlap.mockReturnValue(false);
  });

  test('creates a pending request unless automatic approval is selected', () => {
    expect(leavesService.createLeaveRequest({
      userId: 2,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      reason: 'Family matter',
      autoApprove: false,
    })).toEqual({ success: true });

    expect(leavesRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2,
      status: 'pending',
      requestedByUserId: 1,
      reason: 'Family matter',
    }));
  });

  test('auto-approves new requests and prevents approved date overlaps', () => {
    leavesService.createLeaveRequest({
      userId: 2,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      reason: 'Annual leave',
      autoApprove: true,
    });
    expect(leavesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));

    leavesRepo.hasApprovedOverlap.mockReturnValue(true);
    expect(() => leavesService.createLeaveRequest({
      userId: 2,
      startDate: '2026-10-09',
      endDate: '2026-10-11',
      reason: 'Overlapping leave',
      autoApprove: true,
    })).toThrow('تتداخل هذه الإجازة مع إجازة معتمدة أخرى للموظف');
  });

  test('rejects invalid ranges and inactive or missing employees', () => {
    expect(() => leavesService.createLeaveRequest({
      userId: 2,
      startDate: '2026-02-30',
      endDate: '2026-03-01',
      reason: 'Invalid dates',
      autoApprove: false,
    })).toThrow('تاريخ الإجازة غير صالح');

    expect(() => leavesService.createLeaveRequest({
      userId: 2,
      startDate: '2026-10-10',
      endDate: '2026-10-08',
      reason: 'Invalid range',
      autoApprove: false,
    })).toThrow('تاريخ نهاية الإجازة');

    leavesRepo.getEmployee.mockReturnValue({ id: 2, is_active: 0 });
    expect(() => leavesService.createLeaveRequest({
      userId: 2,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      reason: 'Inactive',
      autoApprove: false,
    })).toThrow('حسابه معطل');
  });

  test('accepts or rejects pending requests and rejects an overlapping approval', () => {
    leavesRepo.getRequest.mockReturnValue({
      id: 4,
      user_id: 2,
      start_date: '2026-10-08',
      end_date: '2026-10-10',
      status: 'pending',
    });
    leavesRepo.decide.mockReturnValue({ changes: 1 });
    expect(leavesService.decideLeaveRequest({ requestId: 4, decision: 'rejected' }))
      .toEqual({ success: true });
    expect(leavesRepo.decide).toHaveBeenCalledWith(4, 'rejected', 1);

    leavesRepo.hasApprovedOverlap.mockReturnValue(true);
    expect(() => leavesService.decideLeaveRequest({ requestId: 4, decision: 'approved' }))
      .toThrow('يتداخل الطلب مع إجازة معتمدة أخرى للموظف');
  });
});
