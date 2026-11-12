/**
 * @file workshop.ticket.test.js
 * @description تذكرة ورشة الصيانة بقت تتحصّل في الكاشير: سيريال الجهاز
 * والتكلفة والضمان، وربط التذكرة بالفاتورة مرة واحدة بس.
 */

const { db, initDatabase } = require('../../electron/database/db');
initDatabase();
// أعمدة التحصيل والضمان بتتضاف في الترقية 33، مش في schema الأساسي.
require('../../electron/database/migrations/workshop').ensureWorkshopTickets(db);

const enterpriseRepo = require('../../electron/repositories/enterprise.repository');
const {
  createWorkflow,
  addWorkflowStatus,
  createWorkflowTicket,
  getUnbilledTickets,
  warrantyUntilFor,
} = require('../../electron/services/enterprise.service');

let workflowId;
let statusKey;

beforeAll(() => {
  const workflow = createWorkflow({
    name: 'تذاكر صيانة (اختبار)',
    entity_type: 'maintenance_ticket',
    description: 'مسار اختبار',
  });
  workflowId = workflow.id;
  statusKey = `received_${workflowId}`;
  addWorkflowStatus(workflowId, {
    status_key: statusKey,
    status_label: 'استلام الجهاز',
    is_initial: 1,
    sort_order: 1,
  });
});

beforeEach(() => {
  db.prepare('DELETE FROM workflow_tickets WHERE workflow_id = ?').run(workflowId);
});

function newTicket(extra = {}) {
  return createWorkflowTicket({
    workflow_id: workflowId,
    entity_type: 'maintenance_ticket',
    title: 'تغيير شاشة موبايل',
    customer_name: 'أحمد',
    customer_phone: '01000000000',
    current_status_key: statusKey,
    device_serial: 'IMEI-123456',
    estimated_cost: 450,
    warranty_days: 30,
    ...extra,
  });
}

describe('تذكرة الورشة: بيانات الاستلام', () => {
  test('بتحفظ سيريال الجهاز والتكلفة المتوقعة ومدة الضمان', () => {
    const ticket = newTicket();
    expect(ticket.device_serial).toBe('IMEI-123456');
    expect(ticket.estimated_cost).toBe(450);
    expect(ticket.warranty_days).toBe(30);
    expect(ticket.sale_id).toBeNull();
  });

  test('القيم الناقصة أو السالبة بتترجع أصفار مش NULL', () => {
    const ticket = newTicket({ device_serial: '', estimated_cost: -10, warranty_days: -5 });
    expect(ticket.device_serial).toBeNull();
    expect(ticket.estimated_cost).toBe(0);
    expect(ticket.warranty_days).toBe(0);
  });
});

describe('تحصيل التذكرة في الكاشير', () => {
  test('التذاكر اللي لسه ما اتحصّلتش هي اللي بتظهر للكاشير', () => {
    const open = newTicket();
    const billed = newTicket({ title: 'جهاز اتسلّم' });
    enterpriseRepo.markTicketBilled(billed.id, 999, null);

    const ids = getUnbilledTickets().map((t) => t.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(billed.id);
  });

  test('الربط بالفاتورة بيحصل مرة واحدة بس', () => {
    const ticket = newTicket();
    expect(enterpriseRepo.markTicketBilled(ticket.id, 101, '2026-12-12')).toBe(1);
    // جهاز تاني بيحاول يحصّل نفس التذكرة: مفيش صف بيتغير، فالبيع بيقف.
    expect(enterpriseRepo.markTicketBilled(ticket.id, 102, '2026-12-12')).toBe(0);

    const stored = enterpriseRepo.getTicketById(ticket.id);
    expect(stored.sale_id).toBe(101);
    expect(stored.warranty_until).toBe('2026-12-12');
  });
});

describe('ضمان الإصلاح', () => {
  test('بيبدأ من يوم التحصيل مش يوم فتح التذكرة', () => {
    expect(warrantyUntilFor({ warranty_days: 30 }, new Date('2026-11-12T10:00:00Z'))).toBe('2026-12-12');
  });

  test('تذكرة من غير ضمان مالهاش تاريخ انتهاء', () => {
    expect(warrantyUntilFor({ warranty_days: 0 }, new Date('2026-11-12T10:00:00Z'))).toBeNull();
    expect(warrantyUntilFor({}, new Date('2026-11-12T10:00:00Z'))).toBeNull();
  });
});
