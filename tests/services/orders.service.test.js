jest.mock('../../electron/repositories/orders.repository', () => ({
  createOrder: jest.fn(() => 101),
  getOrderById: jest.fn((id) => ({ id, order_number: 'ORD-101', status: 'pending', priority: 'high' })),
  getAllOrders: jest.fn(() => [{ id: 101, order_number: 'ORD-101' }]),
  updateOrderStatus: jest.fn(() => ({ id: 101, status: 'in_progress' })),
  assignOrder: jest.fn(() => true),
  addComment: jest.fn(() => 1),
  addAttachment: jest.fn(() => 1),
  getOrderStats: jest.fn(() => ({ total: 1, pending: 1, completed: 0 }))
}));

jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));

const ordersRepo = require('../../electron/repositories/orders.repository');
const ordersService = require('../../electron/services/orders.service');

describe('Orders Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createOrder creates order and returns order details', () => {
    const orderData = { customer_name: 'أحمد علي', order_type: 'online', priority: 'high' };
    const items = [{ title: 'منتج تجريبي', quantity: 2, unit_price: 150 }];
    
    const result = ordersService.createOrder(orderData, items);
    
    expect(ordersRepo.createOrder).toHaveBeenCalled();
    expect(result.id).toBe(101);
    expect(result.status).toBe('pending');
  });

  test('updateOrderStatus validates allowed status values', () => {
    const updated = ordersService.updateOrderStatus(101, 'in_progress', { id: 1 }, 'بدء التنفيذ');
    expect(ordersRepo.updateOrderStatus).toHaveBeenCalledWith(101, 'in_progress', 1, 'بدء التنفيذ');
    expect(updated.status).toBe('in_progress');

    expect(() => ordersService.updateOrderStatus(101, 'invalid_status')).toThrow('حالة الطلب غير صالحة');
  });

  test('getOrderStats returns stats object', () => {
    const stats = ordersService.getOrderStats();
    expect(stats.total).toBe(1);
    expect(ordersRepo.getOrderStats).toHaveBeenCalled();
  });
});
