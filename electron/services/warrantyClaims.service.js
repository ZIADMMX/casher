/**
 * ورش الصيانة: لوحة الورشة ومطالبات الضمان.
 * التذكرة المتحصّلة (sale_id) وليها warranty_until لسه ما فاتتش بتقبل مطالبة. قبول المطالبة بيفتح تذكرة جديدة
 * ببلاش (تكلفتها صفر) على نفس المسار، ورفضها بيحفظ السبب.
 */
const { db } = require('../database/db');
const enterpriseRepo = require('../repositories/enterprise.repository');
const { requireAuth, getCurrentSession } = require('./auth.service');

const LATE_AFTER_HOURS = 48;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

function coverageOf(ticket, now = today()) {
  const covered = Boolean(ticket.sale_id && ticket.warranty_until && ticket.warranty_until >= now);
  const days = covered ? Math.ceil((new Date(`${ticket.warranty_until}T00:00:00Z`) - new Date(`${now}T00:00:00Z`)) / 86_400_000) : 0;
  return { covered, until: ticket.warranty_until || null, days_left: days };
}

const ticketOrThrow = (id) => {
  const ticket = enterpriseRepo.getTicketById(Number(id));
  if (!ticket) throw new Error('التذكرة غير موجودة');
  return ticket;
};

/** The workshop screen: every maintenance ticket with its status, warranty cover and claims, plus the numbers on top. */
function getMaintenanceBoard() {
  requireAuth();
  const now = today();
  const tickets = db.prepare(`
    SELECT t.id, t.ticket_number, t.title, t.customer_name, t.customer_phone, t.device_serial, t.estimated_cost, t.sale_id, t.warranty_until,
      t.assigned_user, t.current_status_key, t.entered_current_status_at, s.status_label, s.badge_color, COALESCE(s.is_final, 0) AS is_final
    FROM workflow_tickets t
    LEFT JOIN workflow_statuses s ON s.workflow_id = t.workflow_id AND s.status_key = t.current_status_key
    WHERE t.entity_type = 'maintenance_ticket'
    ORDER BY t.id DESC LIMIT 300`).all();
  const openClaims = new Map(db.prepare("SELECT ticket_id, id FROM warranty_claims WHERE status = 'open'").all().map((c) => [c.ticket_id, c.id]));
  const lateBefore = Date.now() - LATE_AFTER_HOURS * 3_600_000;

  const rows = tickets.map((t) => {
    const entered = t.entered_current_status_at ? new Date(`${String(t.entered_current_status_at).replace(' ', 'T')}Z`).getTime() : null;
    return { ...t, is_final: Boolean(t.is_final), warranty: coverageOf(t, now), open_claim_id: openClaims.get(t.id) || null, late: !t.is_final && entered !== null && entered < lateBefore };
  });
  return {
    summary: {
      open: rows.filter((t) => !t.is_final).length,
      late: rows.filter((t) => t.late).length,
      in_warranty: rows.filter((t) => t.warranty.covered).length,
      open_claims: openClaims.size,
    },
    tickets: rows,
  };
}

function getClaims(status) {
  requireAuth();
  const rows = db.prepare(`SELECT c.*, t.ticket_number, t.title, t.customer_name, t.customer_phone, t.warranty_until, ct.ticket_number AS claim_ticket_number
    FROM warranty_claims c JOIN workflow_tickets t ON t.id = c.ticket_id LEFT JOIN workflow_tickets ct ON ct.id = c.claim_ticket_id
    WHERE (? IS NULL OR c.status = ?) ORDER BY c.id DESC LIMIT 200`);
  return status ? rows.all(String(status), String(status)) : rows.all(null, null);
}

function openClaim(ticketId, reason) {
  requireAuth();
  const ticket = ticketOrThrow(ticketId);
  const why = text(reason, 300);
  if (!why) throw new Error('اكتب سبب مطالبة الضمان');
  if (!ticket.sale_id) throw new Error('التذكرة لسه ما اتحصّلتش، مفيش ضمان عليها');
  if (!coverageOf(ticket).covered) throw new Error('مدة الضمان على التذكرة دي خلصت');
  if (db.prepare("SELECT 1 FROM warranty_claims WHERE ticket_id = ? AND status = 'open'").get(ticket.id)) throw new Error('فيه مطالبة مفتوحة على التذكرة دي بالفعل');
  const id = Number(db.prepare('INSERT INTO warranty_claims (ticket_id, reason, created_by) VALUES (?, ?, ?)').run(ticket.id, why, getCurrentSession()?.id ?? null).lastInsertRowid);
  return getClaims().find((c) => c.id === id);
}

function decideClaim(claimId, decision, note) {
  requireAuth();
  const claim = db.prepare('SELECT * FROM warranty_claims WHERE id = ?').get(Number(claimId));
  if (!claim) throw new Error('المطالبة غير موجودة');
  if (claim.status !== 'open') throw new Error('المطالبة دي اتقرر فيها قبل كده');
  if (!['accepted', 'rejected'].includes(decision)) throw new Error('القرار غير صالح');
  const reason = text(note, 300);
  if (decision === 'rejected' && !reason) throw new Error('اكتب سبب الرفض');

  return db.transaction(() => {
    let claimTicketId = null;
    if (decision === 'accepted') {
      const original = ticketOrThrow(claim.ticket_id);
      // the covered period can end while the claim waits: the decision is checked at the date it was made
      if (!coverageOf(original).covered) throw new Error('مدة الضمان خلصت قبل قبول المطالبة');
      const workflow = enterpriseRepo.getWorkflowById(original.workflow_id);
      const initial = workflow?.statuses?.find((s) => s.is_initial) || workflow?.statuses?.[0];
      if (!initial) throw new Error('مسار التذكرة مش متاح');
      claimTicketId = enterpriseRepo.createWorkflowTicket({
        ticket_number: `${original.ticket_number}-W${claim.id}`, // unique by construction: one number per claim
        workflow_id: original.workflow_id, entity_type: original.entity_type, current_status_key: initial.status_key,
        title: `ضمان: ${original.title}`, customer_name: original.customer_name, customer_phone: original.customer_phone,
        device_serial: original.device_serial, estimated_cost: 0, warranty_days: 0,
        assigned_role: original.assigned_role, assigned_user: original.assigned_user,
        notes: `ضمان على التذكرة ${original.ticket_number}: ${claim.reason}`,
      }).id;
    }
    db.prepare("UPDATE warranty_claims SET status = ?, decision_note = ?, claim_ticket_id = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(decision, reason || null, claimTicketId, claim.id);
    return getClaims().find((c) => c.id === claim.id);
  })();
}

module.exports = { coverageOf, getMaintenanceBoard, getClaims, openClaim, decideClaim };
