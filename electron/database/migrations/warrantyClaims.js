// Warranty claims on billed maintenance tickets: the customer comes back inside the warranty period.
// An accepted claim opens a new free ticket (claim_ticket_id); a rejected one keeps the shop's reason.
function ensureWarrantyClaims(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS warranty_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES workflow_tickets(id),
      claim_ticket_id INTEGER REFERENCES workflow_tickets(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
      decision_note TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_warranty_claims_ticket ON warranty_claims(ticket_id, status);
  `);
}

module.exports = { ensureWarrantyClaims };
