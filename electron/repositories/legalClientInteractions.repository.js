const { db } = require('../database/db');

function getByCustomerId(customerId) {
  return db.prepare(`
    SELECT interaction.*, user.username AS created_by_name
    FROM legal_client_interactions interaction
    LEFT JOIN users user ON user.id = interaction.created_by
    WHERE interaction.customer_id = ?
    ORDER BY interaction.created_at DESC, interaction.id DESC
  `).all(customerId);
}

function create(data) {
  const result = db.prepare(`
    INSERT INTO legal_client_interactions
      (customer_id, created_by, type, subject, details, follow_up_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.customer_id,
    data.created_by || null,
    data.type,
    data.subject,
    data.details || null,
    data.follow_up_date || null
  );
  return db.prepare(`
    SELECT interaction.*, user.username AS created_by_name
    FROM legal_client_interactions interaction
    LEFT JOIN users user ON user.id = interaction.created_by
    WHERE interaction.id = ?
  `).get(result.lastInsertRowid);
}

module.exports = { getByCustomerId, create };
