const { db } = require('../database/db');

/**
 * CRM Repository
 * SQL Queries for Customer Interactions, Opportunities, Campaigns, and Unified Timeline Gathering
 */

// --- INTERACTIONS ---

function addInteraction(data) {
  const { customer_id, user_id, type, subject, details, status = 'open', follow_up_date } = data;

  const result = db.prepare(`
    INSERT INTO crm_interactions (customer_id, user_id, type, subject, details, status, follow_up_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(customer_id, user_id || null, type, subject, details || null, status, follow_up_date || null);

  // Update customer last_interaction_at
  db.prepare("UPDATE customers SET last_interaction_at = CURRENT_TIMESTAMP WHERE id = ?").run(customer_id);

  return result.lastInsertRowid;
}

function getInteractionsByCustomer(customerId) {
  return db.prepare(`
    SELECT ci.*, u.username
    FROM crm_interactions ci
    LEFT JOIN users u ON ci.user_id = u.id
    WHERE ci.customer_id = ?
    ORDER BY ci.created_at DESC
  `).all(customerId);
}

function updateInteractionStatus(id, status) {
  db.prepare("UPDATE crm_interactions SET status = ? WHERE id = ?").run(status, id);
  return db.prepare("SELECT * FROM crm_interactions WHERE id = ?").get(id);
}

// --- OPPORTUNITIES ---

function createOpportunity(data) {
  const { customer_id, user_id, title, expected_value = 0, stage = 'lead', expected_close_date, notes } = data;

  const result = db.prepare(`
    INSERT INTO crm_opportunities (customer_id, user_id, title, expected_value, stage, expected_close_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(customer_id, user_id || null, title, expected_value, stage, expected_close_date || null, notes || null);

  return result.lastInsertRowid;
}

function getAllOpportunities(filters = {}) {
  const { stage, customer_id, user_id } = filters;

  let query = `
    SELECT opp.*, c.name as customer_name, c.phone as customer_phone, u.username as assigned_username
    FROM crm_opportunities opp
    JOIN customers c ON opp.customer_id = c.id
    LEFT JOIN users u ON opp.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (stage) {
    query += ` AND opp.stage = ?`;
    params.push(stage);
  }
  if (customer_id) {
    query += ` AND opp.customer_id = ?`;
    params.push(customer_id);
  }
  if (user_id) {
    query += ` AND opp.user_id = ?`;
    params.push(user_id);
  }

  query += ` ORDER BY opp.created_at DESC`;
  return db.prepare(query).all(...params);
}

function updateOpportunityStage(id, stage) {
  db.prepare("UPDATE crm_opportunities SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(stage, id);
  return db.prepare("SELECT * FROM crm_opportunities WHERE id = ?").get(id);
}

// --- CUSTOMER RATING & TIER ---

function updateCustomerRatingAndTier(customerId, rating, tier) {
  db.prepare("UPDATE customers SET rating = ?, tier = ? WHERE id = ?").run(rating || 5, tier || 'Regular', customerId);
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
}

// --- UNIFIED TIMELINE AGGREGATOR ---

function getRawTimelineElementsForCustomer(customerId) {
  // 1. Sales
  const sales = db.prepare(`
    SELECT 
      'sale' as timeline_type,
      id as reference_id,
      created_at,
      total_amount as amount,
      payment_method as detail_meta,
      'فاتورة بيع رقم #' || id as title
    FROM sales
    WHERE customer_id = ?
  `).all(customerId);

  // 2. Returns
  const returns = db.prepare(`
    SELECT 
      'return' as timeline_type,
      r.id as reference_id,
      r.created_at,
      r.refund_amount as amount,
      r.reason as detail_meta,
      'مرتجع من فاتورة #' || r.sale_id as title
    FROM returns r
    JOIN sales s ON r.sale_id = s.id
    WHERE s.customer_id = ?
  `).all(customerId);

  // 3. Debt Payments
  const payments = db.prepare(`
    SELECT 
      'payment' as timeline_type,
      id as reference_id,
      payment_date as created_at,
      amount,
      payment_method as detail_meta,
      'سداد مديونية / دفعة حساب' as title
    FROM customer_payments
    WHERE customer_id = ?
  `).all(customerId);

  // 4. CRM Interactions (Calls, Notes, Complaints, Messages)
  const interactions = db.prepare(`
    SELECT 
      'interaction' as timeline_type,
      id as reference_id,
      created_at,
      0 as amount,
      type || ': ' || details as detail_meta,
      subject as title,
      type,
      status,
      follow_up_date
    FROM crm_interactions
    WHERE customer_id = ?
  `).all(customerId);

  // 5. CRM Opportunities
  const opportunities = db.prepare(`
    SELECT 
      'opportunity' as timeline_type,
      id as reference_id,
      created_at,
      expected_value as amount,
      'مرحلة: ' || stage as detail_meta,
      'فرصة بيع: ' || title as title
    FROM crm_opportunities
    WHERE customer_id = ?
  `).all(customerId);

  return [...sales, ...returns, ...payments, ...interactions, ...opportunities];
}

function getDueReminders() {
  return db.prepare(`
    SELECT ci.*, c.name as customer_name, c.phone as customer_phone
    FROM crm_interactions ci
    JOIN customers c ON ci.customer_id = c.id
    WHERE ci.status = 'open' AND ci.follow_up_date IS NOT NULL AND ci.follow_up_date <= CURRENT_TIMESTAMP
    ORDER BY ci.follow_up_date ASC
  `).all();
}

module.exports = {
  addInteraction,
  getInteractionsByCustomer,
  updateInteractionStatus,
  createOpportunity,
  getAllOpportunities,
  updateOpportunityStage,
  updateCustomerRatingAndTier,
  getRawTimelineElementsForCustomer,
  getDueReminders
};
