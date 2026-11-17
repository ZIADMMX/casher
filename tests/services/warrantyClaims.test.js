/**
 * @file warrantyClaims.test.js
 * @description ورش الصيانة: لوحة الورشة ومطالبات الضمان (فتح، قبول بتذكرة مجانية، رفض، انتهاء المدة).
 */
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: jest.fn(() => ({ id: 1 })),
  getCurrentSession: jest.fn(() => ({ id: 1 })),
}));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
const enterpriseRepo = require('../../electron/repositories/enterprise.repository');
const warranty = require('../../electron/services/warrantyClaims.service');

const addDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let workflow;
let seq = 0;

function ticket(extra = {}) {
  const t = enterpriseRepo.createWorkflowTicket({
    ticket_number: `TKW-${Date.now()}-${++seq}`, workflow_id: workflow.id, entity_type: 'maintenance_ticket', current_status_key: 'received', title: 'شاشة لابتوب', customer_name: 'منى',
    customer_phone: '01033334444', device_serial: 'SN-1', estimated_cost: 450, warranty_days: 30, ...extra,
  });
  return t;
}
// a ticket that was collected at the till: billed, with a warranty end date
const billed = (t, until = addDays(20)) => {
  db.prepare('UPDATE workflow_tickets SET sale_id = 9001, warranty_until = ? WHERE id = ?').run(until, t.id);
  return t;
};

beforeAll(() => {
  const created = enterpriseRepo.createWorkflow({ module_key: 'general', entity_type: 'maintenance_ticket', name: 'صيانة اختبار ضمان', business_profile_key: 'maintenance', is_active: 1 });
  const id = typeof created === 'object' ? created.id : created;
  enterpriseRepo.addWorkflowStatus(id, { status_key: 'received', status_label: 'استلام', badge_color: '#999', step_order: 1, is_initial: 1 });
  enterpriseRepo.addWorkflowStatus(id, { status_key: 'delivered', status_label: 'تم التسليم', badge_color: '#0a0', step_order: 2, is_final: 1 });
  workflow = enterpriseRepo.getWorkflowById(id);
});
afterAll(() => {
  db.exec(`DELETE FROM warranty_claims; DELETE FROM workflow_tickets WHERE workflow_id = ${workflow.id}`);
  enterpriseRepo.deleteWorkflow?.(workflow.id);
});
beforeEach(() => db.exec(`DELETE FROM warranty_claims; DELETE FROM workflow_tickets WHERE workflow_id = ${workflow.id}`));

describe('warranty cover', () => {
  test('only a billed ticket with an unexpired warranty is covered', () => {
    expect(warranty.coverageOf({ sale_id: 5, warranty_until: addDays(10) })).toMatchObject({ covered: true, days_left: 10 });
    expect(warranty.coverageOf({ sale_id: 5, warranty_until: addDays(-1) }).covered).toBe(false);
    expect(warranty.coverageOf({ sale_id: null, warranty_until: addDays(10) }).covered).toBe(false);
    expect(warranty.coverageOf({ sale_id: 5, warranty_until: null }).covered).toBe(false);
  });
});

describe('opening a claim', () => {
  test('is allowed inside the warranty, once at a time, with a reason', () => {
    const t = billed(ticket());
    expect(() => warranty.openClaim(t.id, ' ')).toThrow('سبب');
    const claim = warranty.openClaim(t.id, 'الشاشة بتومض تاني');
    expect(claim).toMatchObject({ ticket_id: t.id, status: 'open', ticket_number: t.ticket_number });
    expect(() => warranty.openClaim(t.id, 'مرة تانية')).toThrow('مفتوحة');
  });

  test('is refused for an unbilled ticket, an expired warranty, or a missing ticket', () => {
    expect(() => warranty.openClaim(ticket().id, 'عطل')).toThrow('ما اتحصّلتش');
    expect(() => warranty.openClaim(billed(ticket(), addDays(-2)).id, 'عطل')).toThrow('خلصت');
    expect(() => warranty.openClaim(99999999, 'عطل')).toThrow('غير موجودة');
  });
});

describe('deciding a claim', () => {
  test('accepting opens a new free ticket on the same workflow and links it', () => {
    const original = billed(ticket());
    const claim = warranty.openClaim(original.id, 'نفس العطل');
    const done = warranty.decideClaim(claim.id, 'accepted');
    expect(done).toMatchObject({ status: 'accepted' });
    const fresh = db.prepare('SELECT * FROM workflow_tickets WHERE id = ?').get(done.claim_ticket_id);
    expect(fresh).toMatchObject({ workflow_id: workflow.id, current_status_key: 'received', estimated_cost: 0, customer_name: 'منى', device_serial: 'SN-1' });
    expect(fresh.title).toContain('ضمان');
    expect(fresh.notes).toContain(original.ticket_number);
    expect(() => warranty.decideClaim(claim.id, 'rejected', 'x')).toThrow('اتقرر');
  });

  test('rejecting needs a reason and opens nothing', () => {
    const claim = warranty.openClaim(billed(ticket()).id, 'عطل جديد');
    expect(() => warranty.decideClaim(claim.id, 'rejected', '')).toThrow('سبب');
    const done = warranty.decideClaim(claim.id, 'rejected', 'كسر من العميل');
    expect(done).toMatchObject({ status: 'rejected', decision_note: 'كسر من العميل', claim_ticket_id: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM workflow_tickets WHERE workflow_id = ?').get(workflow.id).n).toBe(1);
  });

  test('a claim cannot be accepted after the warranty has run out', () => {
    const t = billed(ticket());
    const claim = warranty.openClaim(t.id, 'عطل');
    db.prepare('UPDATE workflow_tickets SET warranty_until = ? WHERE id = ?').run(addDays(-1), t.id);
    expect(() => warranty.decideClaim(claim.id, 'accepted')).toThrow('خلصت');
    expect(db.prepare('SELECT status FROM warranty_claims WHERE id = ?').get(claim.id).status).toBe('open');
  });

  test('rejects an unknown decision or claim', () => {
    const claim = warranty.openClaim(billed(ticket()).id, 'عطل');
    expect(() => warranty.decideClaim(claim.id, 'maybe')).toThrow('القرار');
    expect(() => warranty.decideClaim(99999999, 'accepted')).toThrow('غير موجودة');
  });
});

describe('the workshop board', () => {
  test('lists maintenance tickets with cover, claims and the numbers on top', () => {
    const covered = billed(ticket({ title: 'مغطّاة' }));
    ticket({ title: 'مفتوحة' });
    const late = ticket({ title: 'متأخرة' });
    db.prepare("UPDATE workflow_tickets SET entered_current_status_at = datetime('now', '-3 days') WHERE id = ?").run(late.id);
    const done = ticket({ title: 'مقفولة', current_status_key: 'delivered' });
    warranty.openClaim(covered.id, 'عطل');

    const board = warranty.getMaintenanceBoard();
    const ours = board.tickets.filter((t) => [covered.id, late.id, done.id].includes(t.id) || t.title === 'مفتوحة');
    expect(ours.find((t) => t.id === covered.id)).toMatchObject({ warranty: { covered: true }, open_claim_id: expect.any(Number) });
    expect(ours.find((t) => t.id === late.id).late).toBe(true);
    expect(ours.find((t) => t.id === done.id)).toMatchObject({ is_final: true, status_label: 'تم التسليم' });
    expect(board.summary.open).toBeGreaterThanOrEqual(3);
    expect(board.summary).toMatchObject({ in_warranty: expect.any(Number), late: expect.any(Number), open_claims: 1 });
  });

  test('claims can be listed by status', () => {
    const a = warranty.openClaim(billed(ticket()).id, 'أ');
    warranty.decideClaim(a.id, 'rejected', 'لا');
    warranty.openClaim(billed(ticket()).id, 'ب');
    expect(warranty.getClaims('open')).toHaveLength(1);
    expect(warranty.getClaims().length).toBe(2);
  });
});
