// Case deposits, expenses and receipts.
const { db } = require('../../database/db');

function getFinancialsByCaseId(caseId) {
  return db.prepare(`
    SELECT 
      f.*,
      u.full_name as recorded_by_name
    FROM case_financials f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE f.case_id = ?
    ORDER BY f.date DESC
  `).all(caseId);
}

function getFinancialReceipt(financialId) {
  return db.prepare(`
    SELECT f.*, c.case_number, c.court_name, cust.name AS client_name,
           u.full_name AS recorded_by_name
    FROM case_financials f
    JOIN legal_cases c ON c.id = f.case_id
    LEFT JOIN customers cust ON cust.id = c.client_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.id = ?
  `).get(financialId) || null;
}

function createFinancial(data) {
  const stmt = db.prepare(`
    INSERT INTO case_financials (
      case_id, type, amount, date, description, paid_by_client, receipt_number, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const create = db.transaction(() => {
    const res = stmt.run(
      data.case_id,
      data.type,
      Number(data.amount),
      data.date || new Date().toISOString(),
      data.description || null,
      data.paid_by_client !== undefined ? (data.paid_by_client ? 1 : 0) : 1,
      data.receipt_number || null,
      data.user_id || null
    );

    if (data.type === 'fee_payment') {
      db.prepare(`
        UPDATE legal_cases
        SET paid_amount = paid_amount + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(Number(data.amount), data.case_id);
    }

    return db.prepare('SELECT * FROM case_financials WHERE id = ?').get(res.lastInsertRowid);
  });
  return create();
}

function updateFinancial(id, data) {
  const update = db.transaction(() => {
    const previous = db.prepare('SELECT * FROM case_financials WHERE id = ?').get(id);
    if (!previous) return null;

    const nextType = data.type ?? previous.type;
    const nextAmount = data.amount == null ? previous.amount : Number(data.amount);
    db.prepare(`
      UPDATE case_financials
      SET type = ?, amount = ?, date = ?, description = ?, paid_by_client = ?, receipt_number = ?
      WHERE id = ?
    `).run(
      nextType,
      nextAmount,
      data.date ?? previous.date,
      Object.hasOwn(data, 'description') ? data.description : previous.description,
      data.paid_by_client === undefined ? previous.paid_by_client : (data.paid_by_client ? 1 : 0),
      Object.hasOwn(data, 'receipt_number') ? data.receipt_number : previous.receipt_number,
      id
    );

    const previousFee = previous.type === 'fee_payment' ? Number(previous.amount) : 0;
    const nextFee = nextType === 'fee_payment' ? nextAmount : 0;
    const feeDifference = nextFee - previousFee;
    if (feeDifference) {
      db.prepare(`
        UPDATE legal_cases
        SET paid_amount = MAX(0, paid_amount + ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(feeDifference, previous.case_id);
    }

    return db.prepare('SELECT * FROM case_financials WHERE id = ?').get(id);
  });
  return update();
}

function deleteFinancial(id) {
  const remove = db.transaction(() => {
    const record = db.prepare('SELECT * FROM case_financials WHERE id = ?').get(id);
    if (!record) return { changes: 0 };
    if (record.type === 'fee_payment') {
      db.prepare(`
        UPDATE legal_cases
        SET paid_amount = MAX(0, paid_amount - ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(record.amount, record.case_id);
    }
    return db.prepare('DELETE FROM case_financials WHERE id = ?').run(id);
  });
  return remove();
}

module.exports = {
  getFinancialsByCaseId,
  getFinancialReceipt,
  createFinancial,
  updateFinancial,
  deleteFinancial,
};
