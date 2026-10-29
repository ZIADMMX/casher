const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb }));

const salonService = require('../../electron/services/salon.service');
const salonRepo = require('../../electron/repositories/salon.repository');

describe('Salon Service and Repository Unit Tests', () => {
  let chairId;
  let serviceId;
  let barberUserId;

  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    mockDb.exec(fs.readFileSync(schemaPath, 'utf8'));

    // Create a user as barber
    const userRes = mockDb.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, job_title, pay_type, commission_rate, is_active)
      VALUES ('barber1', 'hash', 'كابتن أحمد حامد', 'cashier', 'حلاق محترف', 'commission_only', 20, 1)
    `).run();
    barberUserId = userRes.lastInsertRowid;

    // Create a chair
    const chair = salonService.createChair({
      name: 'كرسي 1 - حلاقة رجالي',
      station_type: 'barber_chair',
      default_stylist_id: barberUserId,
      notes: 'كرسي رئيسي',
    });
    chairId = chair.id;

    // Create a service
    const srv = salonService.createService({
      name: 'قص وتصفيف شعر',
      category: 'قص وتصفيف',
      duration_minutes: 30,
      price: 200,
      commission_type: 'percentage',
      commission_value: 20,
    });
    serviceId = srv.id;
  });

  afterAll(() => {
    mockDb.close();
  });

  test('1. Seat customer on chair and verify live occupied state', () => {
    const seated = salonService.seatCustomerOnChair({
      chairId,
      customerName: 'محمد أحمد',
      customerPhone: '01012345678',
      stylistId: barberUserId,
      stylistName: 'كابتن أحمد حامد',
      serviceId,
      serviceName: 'قص وتصفيف شعر',
      servicePrice: 200,
    });

    expect(seated.status).toBe('occupied');
    expect(seated.current_customer_name).toBe('محمد أحمد');
    expect(seated.current_stylist_name).toBe('كابتن أحمد حامد');
    expect(seated.current_service_name).toBe('قص وتصفيف شعر');
    expect(seated.current_service_price).toBe(200);
    expect(seated.service_started_at).toBeDefined();
  });

  test('2. Coupons engine: create, validate, and apply coupon', () => {
    const coupon = salonService.createCoupon({
      code: 'EID2026',
      title: 'خصم العيد',
      discount_type: 'percentage',
      discount_value: 10,
      min_spend: 100,
    });

    expect(coupon.code).toBe('EID2026');
    expect(coupon.discount_value).toBe(10);

    const applied = salonService.applyCoupon('EID2026', 200);
    expect(applied.discountAmount).toBe(20);
    expect(applied.netAmount).toBe(180);
  });

  test('3. Complete chair service with discount and tip to stylist', () => {
    const result = salonService.completeChairService({
      chairId,
      paymentMethod: 'cash',
      discountAmount: 20,
      tipAmount: 30,
      tipRecipient: 'stylist',
      couponCode: 'EID2026',
      notes: 'عميل مميز',
      userId: barberUserId,
    });

    expect(result.finalPrice).toBe(180);
    expect(result.discount).toBe(20);
    expect(result.tip).toBe(30);
    expect(result.totalReceived).toBe(210);
    // 20% commission on 180 = 36
    expect(result.earnedCommission).toBe(36);

    // Chair must now be vacated & available
    const chair = salonRepo.getChairById(chairId);
    expect(chair.status).toBe('available');
    expect(chair.current_customer_name).toBeNull();
  });

  test('4. Barbers with stats reflects completed service, commission, and tips', () => {
    const barbers = salonService.getBarbersWithStats();
    const barber = barbers.find((b) => b.id === barberUserId);

    expect(barber).toBeDefined();
    expect(barber.servicesCount).toBe(1);
    expect(barber.totalCommission).toBe(36);
    expect(barber.totalTips).toBe(30);
  });

  test('5. Tip pool summary tracks shared team tips', () => {
    // Seat again and complete with pooled tip
    salonService.seatCustomerOnChair({
      chairId,
      customerName: 'محمود حسن',
      serviceId,
      serviceName: 'قص وتصفيف شعر',
      servicePrice: 150,
      stylistId: barberUserId,
    });

    salonService.completeChairService({
      chairId,
      paymentMethod: 'cash',
      tipAmount: 50,
      tipRecipient: 'pool',
      userId: barberUserId,
    });

    const pool = salonService.getTipPoolSummary();
    expect(pool.total_tip_pool).toBe(50);
    expect(pool.service_count).toBe(1);
  });

  test('6. Stylist detailed ledger records history of services', () => {
    const ledger = salonService.getStylistDetailedLedger(barberUserId);
    expect(ledger.length).toBe(2);
    expect(ledger[0].service_name).toBe('قص وتصفيف شعر');
  });
});
