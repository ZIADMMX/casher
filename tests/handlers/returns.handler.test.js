const mockRegisteredHandlers = new Map();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockRegisteredHandlers.set(channel, handler)),
  },
}));

jest.mock('../../electron/services/returns.service', () => ({
  findSale: jest.fn(),
  processReturn: jest.fn(),
  getRecentReturns: jest.fn(),
}));

jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 9, role: 'admin' })),
  runWithSession: jest.fn((session, callback) => callback()),
  runWithPermission: jest.fn((perm, cb) => cb()),
  requirePermission: jest.fn(),
}));

const returnsService = require('../../electron/services/returns.service');
const { registerReturnsHandlers } = require('../../electron/handlers/returns.handler');

describe('returns IPC handlers', () => {
  beforeEach(() => {
    mockRegisteredHandlers.clear();
    jest.clearAllMocks();
    registerReturnsHandlers();
  });

  test.each([0, -1, 1.5, Number.NaN, 'not-an-id'])(
    'rejects invalid sale IDs before searching (%s)',
    async (saleId) => {
      await expect(mockRegisteredHandlers.get('returns:findSale')({}, saleId)).rejects.toThrow();
      expect(returnsService.findSale).not.toHaveBeenCalled();
    }
  );

  test('accepts a valid sale ID and returns the matching sale', async () => {
    const sale = { id: 12 };
    returnsService.findSale.mockReturnValue(sale);

    await expect(mockRegisteredHandlers.get('returns:findSale')({ sender: { id: 9 } }, 12)).resolves.toBe(sale);
    expect(returnsService.findSale).toHaveBeenCalledWith(12);
  });
});
