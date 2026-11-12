const { addColumnIfMissing } = require('./helpers');

// ورش الصيانة: التذكرة كانت متابعة بس — بتتفتح وبتتنقل بين المراحل ومحدش
// بيحصّلها. الأعمدة دي بتربط التذكرة بفاتورة الكاشير وبتحمل اللي الإيصال
// والضمان محتاجينه: سيريال الجهاز، التكلفة المتوقعة، ومدة الضمان على الإصلاح.
// sale_id = الفاتورة اللي اتحصّلت بيها التذكرة (NULL يعني لسه ما اتحصّلتش).
function ensureWorkshopTickets(dbInstance) {
  addColumnIfMissing('workflow_tickets', 'device_serial', 'TEXT', dbInstance);
  addColumnIfMissing('workflow_tickets', 'estimated_cost', 'REAL NOT NULL DEFAULT 0', dbInstance);
  addColumnIfMissing('workflow_tickets', 'warranty_days', 'INTEGER NOT NULL DEFAULT 0', dbInstance);
  addColumnIfMissing('workflow_tickets', 'sale_id', 'INTEGER', dbInstance);
  addColumnIfMissing('workflow_tickets', 'warranty_until', 'TEXT', dbInstance);
  dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_workflow_tickets_sale ON workflow_tickets(sale_id);');
}

module.exports = { ensureWorkshopTickets };
