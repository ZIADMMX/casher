jest.mock('../../electron/repositories/orders.repository', () => ({
  createOrder: jest.fn(() => 101),
  getOrderById: jest.fn((id) => ({ id, order_number: 'ORD-101', status: 'pending', priority: 'high' })),
  getOrderForCheckout: jest.fn(),
  addOrderItem: jest.fn(),
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

  test('creates automotive spare-part requests with vehicle and customer details', () => {
    ordersService.createOrder({
      order_type: 'online',
      customer_name: 'أحمد علي',
      customer_phone: '01000000000',
      requested_part: 'تيل فرامل أمامي',
      requested_quantity: 2,
      vehicle_make: 'تويوتا',
      vehicle_model: 'كورولا',
    });

    expect(ordersRepo.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        requested_part: 'تيل فرامل أمامي',
        requested_quantity: 2,
        vehicle_make: 'تويوتا',
        vehicle_model: 'كورولا',
      }),
      []
    );
  });

  test('validates required spare-part request details', () => {
    expect(() => ordersService.createOrder({
      order_type: 'online',
      customer_name: 'أحمد علي',
      customer_phone: '01000000000',
      requested_part: 'تيل فرامل أمامي',
      requested_quantity: 1,
      vehicle_make: 'تويوتا',
    })).toThrow('ماركة السيارة وموديلها مطلوبان لطلب قطعة الغيار');
  });

  test('updateOrderStatus validates allowed status values', () => {
    const updated = ordersService.updateOrderStatus(101, 'in_progress', { id: 1 }, 'بدء التنفيذ');
    expect(ordersRepo.updateOrderStatus).toHaveBeenCalledWith(101, 'in_progress', 1, 'بدء التنفيذ');
    expect(updated.status).toBe('in_progress');

    expect(() => ordersService.updateOrderStatus(101, 'invalid_status')).toThrow('حالة الطلب غير صالحة');
  });

  test('does not mark a repair order delivered before its sale is linked', () => {
    ordersRepo.getOrderForCheckout.mockReturnValue({
      id: 101,
      order_type: 'maintenance',
      sale_id: null,
    });

    expect(() => ordersService.updateOrderStatus(101, 'delivered')).toThrow(
      'يجب إصدار فاتورة أمر الشغل من نقطة البيع قبل تسجيل التسليم'
    );
    expect(ordersRepo.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('keeps an invoiced repair order delivered', () => {
    ordersRepo.getOrderForCheckout.mockReturnValue({
      id: 101,
      order_type: 'maintenance',
      sale_id: 45,
      status: 'delivered',
    });

    expect(() => ordersService.updateOrderStatus(101, 'cancelled')).toThrow(
      'لا يمكن تغيير حالة أمر الشغل بعد إصدار فاتورته'
    );
    expect(ordersRepo.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('requires vehicle plate and fault description when creating a vehicle repair order', () => {
    expect(() => ordersService.createOrder({
      order_type: 'maintenance',
      vehicle_plate: 'ABC-123',
    })).toThrow('رقم لوحة السيارة ووصف العطل مطلوبان');
  });

  test('adds catalog parts and labor to an existing work order', () => {
    ordersRepo.getOrderById.mockReturnValue({ id: 101, items: [{ id: 1 }] });
    const updated = ordersService.addOrderItem(101, {
      variantId: 5,
      quantity: 2,
      unitPrice: 125,
    }, { id: 7 });

    expect(ordersRepo.addOrderItem).toHaveBeenCalledWith(101, {
      variantId: 5,
      quantity: 2,
    }, 7);
    expect(updated.items).toHaveLength(1);
  });

  test('getOrderStats returns stats object', () => {
    const stats = ordersService.getOrderStats();
    expect(stats.total).toBe(1);
    expect(ordersRepo.getOrderStats).toHaveBeenCalled();
  });
});
