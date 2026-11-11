const { db } = require('../database/db');

function recordAudit(entityType, entityId, action, changes, userId) {
  const tableExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'crm_audit_log'"
  ).get();
  if (!tableExists) return;
  db.prepare(`
    INSERT INTO crm_audit_log (entity_type, entity_id, action, changes_json, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(entityType, entityId, action, JSON.stringify(changes || {}), userId || null);
}

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
  recordAudit('customer', customer_id, 'interaction_created', { interaction_id: Number(result.lastInsertRowid), type }, user_id);

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
  const pipelineStage = db.prepare(`
    SELECT id, probability FROM crm_pipeline_stages WHERE stage_key = ?
  `).get(stage);

  const result = db.prepare(`
    INSERT INTO crm_opportunities
      (customer_id, user_id, title, expected_value, stage, expected_close_date, notes,
       pipeline_stage_id, probability, last_stage_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    customer_id, user_id || null, title, expected_value, stage, expected_close_date || null,
    notes || null, pipelineStage?.id || null, pipelineStage?.probability || 10
  );

  recordAudit('opportunity', Number(result.lastInsertRowid), 'created', {
    customer_id, stage, expected_value
  }, user_id);
  return result.lastInsertRowid;
}

function getAllOpportunities(filters = {}) {
  const { stage, customer_id, user_id } = filters;

  let query = `
    SELECT opp.*, c.name as customer_name, c.phone as customer_phone, u.username as assigned_username,
      stage.label AS pipeline_stage_label
    FROM crm_opportunities opp
    JOIN customers c ON opp.customer_id = c.id
    LEFT JOIN users u ON opp.user_id = u.id
    LEFT JOIN crm_pipeline_stages stage ON stage.id = opp.pipeline_stage_id
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

function updateOpportunityStage(id, stage, userId) {
  const pipelineStage = db.prepare(`
    SELECT id, probability FROM crm_pipeline_stages WHERE stage_key = ?
  `).get(stage);
  db.prepare(`
    UPDATE crm_opportunities
    SET stage = ?, pipeline_stage_id = ?, probability = ?, last_stage_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP,
        closed_at = CASE WHEN ? IN ('won', 'lost') THEN CURRENT_TIMESTAMP ELSE NULL END,
        stage_stale_reminded_at = NULL
    WHERE id = ?
  `).run(stage, pipelineStage?.id || null, pipelineStage?.probability ?? 10, stage, id);
  recordAudit('opportunity', id, 'stage_changed', { stage }, userId);
  return db.prepare("SELECT * FROM crm_opportunities WHERE id = ?").get(id);
}

// --- CUSTOMER RATING & TIER ---

function updateCustomerRatingAndTier(customerId, rating, tier) {
  db.prepare("UPDATE customers SET rating = ?, tier = ? WHERE id = ?").run(rating || 5, tier || 'Regular', customerId);
  recordAudit('customer', customerId, 'rating_updated', { rating: rating || 5, tier: tier || 'Regular' }, null);
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
}

// --- UNIFIED TIMELINE AGGREGATOR ---

function getRawTimelineElementsForCustomer(customerId) {
  // 1. Sales
  const sales = db.prepare(`
    SELECT 
      'sale' as kind,
      'sale' as timeline_type,
      id as reference_id,
      id,
      'sale' as type,
      created_at,
      total_amount as amount,
      payment_method as details,
      payment_method as detail_meta,
      'فاتورة بيع رقم #' || id as title
    FROM sales
    WHERE customer_id = ?
  `).all(customerId);

  // 2. Returns
  const returns = db.prepare(`
    SELECT 
      'return' as kind,
      'return' as timeline_type,
      r.id as reference_id,
      r.id,
      'return' as type,
      r.created_at,
      r.refund_amount as amount,
      r.reason as detail_meta,
      r.reason as details,
      'مرتجع من فاتورة #' || r.sale_id as title
    FROM returns r
    JOIN sales s ON r.sale_id = s.id
    WHERE s.customer_id = ?
  `).all(customerId);

  // 3. Debt Payments
  const payments = db.prepare(`
    SELECT 
      'payment' as kind,
      'payment' as timeline_type,
      id as reference_id,
      id,
      'payment' as type,
      payment_date as created_at,
      amount,
      payment_method as detail_meta,
      payment_method as details,
      'سداد مديونية / دفعة حساب' as title
    FROM customer_payments
    WHERE customer_id = ?
  `).all(customerId);

  // 4. CRM Interactions (Calls, Notes, Complaints, Messages)
  const interactions = db.prepare(`
    SELECT 
      'interaction' as kind,
      'interaction' as timeline_type,
      id as reference_id,
      id,
      created_at,
      0 as amount,
      type || ': ' || COALESCE(details, '') as detail_meta,
      details,
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
      'opportunity' as kind,
      'opportunity' as timeline_type,
      id as reference_id,
      id,
      'opportunity' as type,
      created_at,
      expected_value as amount,
      'مرحلة: ' || COALESCE((SELECT label FROM crm_pipeline_stages ps WHERE ps.id = crm_opportunities.pipeline_stage_id), stage) as detail_meta,
      'مرحلة: ' || COALESCE((SELECT label FROM crm_pipeline_stages ps WHERE ps.id = crm_opportunities.pipeline_stage_id), stage) as details,
      'فرصة بيع: ' || title as title
    FROM crm_opportunities
    WHERE customer_id = ?
  `).all(customerId);

  const activities = db.prepare(`
    SELECT 'activity' AS kind, 'activity' AS timeline_type, activity.id AS reference_id,
      activity.id, activity.activity_type AS type, activity.created_at, 0 AS amount,
      activity.details, activity.title, activity.status, activity.due_at AS follow_up_date,
      users.username AS creator_name
    FROM crm_activities activity
    LEFT JOIN users ON users.id = activity.created_by
    WHERE activity.record_type = 'customer' AND activity.record_id = ?
  `).all(customerId);

  const notes = db.prepare(`
    SELECT 'note' AS kind, 'note' AS timeline_type, note.id AS reference_id,
      note.id, 'note' AS type, note.created_at, 0 AS amount, note.body AS details,
      'ملاحظة CRM' AS title, users.username AS creator_name
    FROM crm_notes note
    LEFT JOIN users ON users.id = note.user_id
    WHERE note.record_type = 'customer' AND note.record_id = ?
  `).all(customerId);

  const attachments = db.prepare(`
    SELECT 'attachment' AS kind, 'attachment' AS timeline_type, file.id AS reference_id,
      file.id, 'attachment' AS type, file.created_at, 0 AS amount,
      file.file_name AS details, 'ملف مرفق' AS title, users.username AS creator_name
    FROM crm_attachments file
    LEFT JOIN users ON users.id = file.user_id
    WHERE file.record_type = 'customer' AND file.record_id = ?
  `).all(customerId);

  return [...sales, ...returns, ...payments, ...interactions, ...opportunities, ...activities, ...notes, ...attachments];
}

function getDueReminders() {
  return db.prepare(`
    SELECT ci.*, c.name as customer_name, c.phone as customer_phone
    FROM crm_interactions ci
    JOIN customers c ON ci.customer_id = c.id
    WHERE ci.status = 'open'
      AND ci.follow_up_date IS NOT NULL
      AND ci.follow_up_date <= CURRENT_TIMESTAMP
      AND ci.reminder_sent_at IS NULL
    ORDER BY ci.follow_up_date ASC
  `).all();
}

function markReminderSent(interactionId) {
  return db.prepare(`
    UPDATE crm_interactions
    SET reminder_sent_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent_at IS NULL
  `).run(interactionId);
}

function createCampaign({ name, targetCriteria, discountPercentage }) {
  const result = db.prepare(`
    INSERT INTO crm_campaigns (name, target_criteria, discount_percentage)
    VALUES (?, ?, ?)
  `).run(name, JSON.stringify(targetCriteria), discountPercentage);
  return result.lastInsertRowid;
}

function getAllCampaigns() {
  return db.prepare(`
    SELECT campaign.*,
      (SELECT COUNT(*) FROM crm_interactions ci WHERE ci.campaign_id = campaign.id) AS reminders_created
    FROM crm_campaigns campaign
    ORDER BY campaign.created_at DESC, campaign.id DESC
  `).all();
}

function getCampaignById(campaignId) {
  return db.prepare('SELECT * FROM crm_campaigns WHERE id = ?').get(campaignId);
}

function getCampaignAudience(criteria, campaignId) {
  const cutoff = `-${criteria.months_since_purchase} months`;
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.email,
      c.rating,
      c.tier,
      MAX(s.created_at) AS last_matching_purchase_at,
      EXISTS (
        SELECT 1 FROM crm_interactions ci
        WHERE ci.campaign_id = ? AND ci.customer_id = c.id
      ) AS reminder_created
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    JOIN sale_items si ON si.sale_id = s.id
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE p.name LIKE ? COLLATE NOCASE
    GROUP BY c.id
    HAVING datetime(MAX(s.created_at)) <= datetime('now', ?)
    ORDER BY last_matching_purchase_at ASC, c.name COLLATE NOCASE
  `).all(campaignId, `%${criteria.product_keyword}%`, cutoff);
}

function createCampaignReminders(campaign, criteria) {
  const campaignId = campaign.id;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO crm_interactions (
      customer_id, campaign_id, user_id, type, subject, details, status, follow_up_date
    )
    VALUES (?, ?, ?, 'offer', ?, ?, 'open', datetime('now', ?))
  `);
  const updateLastContact = db.prepare(`
    UPDATE customers SET last_interaction_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  const followUpModifier = `+${criteria.follow_up_days} days`;
  const details = [
    criteria.offer_details,
    criteria.discount_percentage > 0 ? `خصم ${criteria.discount_percentage}%` : null,
    `حملة #${campaignId}: ${campaign.name}`
  ].filter(Boolean).join('\n');

  const createReminders = db.transaction(() => {
    const customers = getCampaignAudience(criteria, campaignId);
    let createdCount = 0;
    for (const customer of customers) {
      const result = insert.run(
        customer.id,
        campaignId,
        null,
        criteria.offer_title,
        details,
        followUpModifier
      );
      if (result.changes) {
        updateLastContact.run(customer.id);
        createdCount += 1;
      }
    }
    return createdCount;
  });

  return createReminders();
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
  getDueReminders,
  markReminderSent,
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  getCampaignAudience,
  createCampaignReminders
};
