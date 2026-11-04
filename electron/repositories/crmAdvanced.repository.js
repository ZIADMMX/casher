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

function getCompanies() {
  return db.prepare(`
    SELECT company.*, parent.name AS parent_company_name, users.username AS owner_username
    FROM crm_companies company
    LEFT JOIN crm_companies parent ON parent.id = company.parent_company_id
    LEFT JOIN users ON users.id = company.owner_user_id
    ORDER BY company.name COLLATE NOCASE
  `).all();
}

function getCRMUsers() {
  return db.prepare(`
    SELECT id, username, first_name, last_name, job_title
    FROM users WHERE is_active = 1
    ORDER BY first_name, last_name, username
  `).all();
}

function isActiveUser(userId) {
  return Boolean(db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(userId));
}

function updateCompany(data, userId) {
  db.prepare(`
    UPDATE crm_companies
    SET name = ?, parent_company_id = ?, industry = ?, website = ?, phone = ?, email = ?,
        address = ?, notes = ?, owner_user_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.name, data.parent_company_id || null, data.industry || null, data.website || null,
    data.phone || null, data.email || null, data.address || null, data.notes || null,
    data.owner_user_id || null, data.id
  );
  recordAudit('company', data.id, 'updated', { name: data.name, parent_company_id: data.parent_company_id }, userId);
  return db.prepare('SELECT * FROM crm_companies WHERE id = ?').get(data.id);
}

function createCompany(data, userId) {
  const result = db.prepare(`
    INSERT INTO crm_companies
      (name, parent_company_id, industry, website, phone, email, address, notes, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name, data.parent_company_id || null, data.industry || null, data.website || null,
    data.phone || null, data.email || null, data.address || null, data.notes || null,
    data.owner_user_id || userId || null
  );
  const id = Number(result.lastInsertRowid);
  recordAudit('company', id, 'created', { name: data.name, industry: data.industry }, userId);
  return id;
}

function createLead(data, userId) {
  const result = db.prepare(`
    INSERT INTO crm_leads (name, phone, email, company_id, source, status, owner_user_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name, data.phone || null, data.email || null, data.company_id || null,
    data.source || null, data.status || 'new', data.owner_user_id || userId || null, data.notes || null
  );
  const id = Number(result.lastInsertRowid);
  recordAudit('lead', id, 'created', { source: data.source, status: data.status }, userId);
  return id;
}

function updateLead(data, userId) {
  const existing = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(data.id);
  if (!existing) throw new Error('العميل المحتمل غير موجود');
  if (existing.customer_id || existing.status === 'converted') {
    throw new Error('لا يمكن تعديل عميل محتمل تم تحويله');
  }
  db.prepare(`
    UPDATE crm_leads
    SET name = ?, phone = ?, email = ?, company_id = ?, source = ?, status = ?,
        owner_user_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.name, data.phone, data.email, data.company_id, data.source, data.status,
    data.owner_user_id, data.notes, data.id
  );
  recordAudit('lead', data.id, 'updated', { name: data.name, status: data.status }, userId);
  return db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(data.id);
}

function getLeadById(leadId) {
  return db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
}

function deleteLead(leadId, userId) {
  const remove = db.transaction(() => {
    const lead = db.prepare('SELECT id, name, customer_id, status FROM crm_leads WHERE id = ?').get(leadId);
    if (!lead) throw new Error('العميل المحتمل غير موجود');
    if (lead.customer_id || lead.status === 'converted') {
      throw new Error('لا يمكن حذف عميل محتمل تم تحويله');
    }

    recordAudit('lead', lead.id, 'deleted', { name: lead.name }, userId);
    db.prepare("DELETE FROM crm_activities WHERE record_type = 'lead' AND record_id = ?").run(lead.id);
    db.prepare("DELETE FROM crm_notes WHERE record_type = 'lead' AND record_id = ?").run(lead.id);
    db.prepare("DELETE FROM crm_record_tags WHERE record_type = 'lead' AND record_id = ?").run(lead.id);
    db.prepare(`
      DELETE FROM crm_custom_field_values
      WHERE record_id = ? AND field_id IN (
        SELECT id FROM crm_custom_fields WHERE entity_type = 'lead'
      )
    `).run(lead.id);
    db.prepare("DELETE FROM crm_attachments WHERE record_type = 'lead' AND record_id = ?").run(lead.id);
    db.prepare('DELETE FROM crm_leads WHERE id = ?').run(lead.id);
    return { deleted: true };
  });
  return remove();
}

function createLeads(data, userId) {
  const insertLeads = db.transaction((leads) => leads.map((lead) => {
    const result = db.prepare(`
      INSERT INTO crm_leads (name, phone, email, company_id, source, status, owner_user_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lead.name, lead.phone || null, lead.email || null, lead.company_id || null,
      lead.source || null, lead.status || 'new', lead.owner_user_id || userId || null, lead.notes || null
    );
    const id = Number(result.lastInsertRowid);
    recordAudit('lead', id, 'created', { source: lead.source, status: lead.status }, userId);
    return id;
  }));
  return insertLeads(data);
}

function getLeads(filters = {}) {
  let query = `
    SELECT lead.*, company.name AS company_name, users.username AS owner_username
    FROM crm_leads lead
    LEFT JOIN crm_companies company ON company.id = lead.company_id
    LEFT JOIN users ON users.id = lead.owner_user_id
    WHERE 1 = 1
  `;
  const params = [];
  if (filters.status) {
    query += ' AND lead.status = ?';
    params.push(filters.status);
  }
  if (filters.search) {
    query += ` AND (lead.name LIKE ? OR lead.phone LIKE ? OR lead.email LIKE ? OR lead.source LIKE ? OR company.name LIKE ?)`;
    const search = `%${filters.search}%`;
    params.push(search, search, search, search, search);
  }
  query += ' ORDER BY lead.created_at DESC';
  return db.prepare(query).all(...params);
}

function updateLeadStatus(leadId, status, userId) {
  const result = db.prepare(`
    UPDATE crm_leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, leadId);
  if (!result.changes) throw new Error('العميل المحتمل غير موجود');
  recordAudit('lead', leadId, 'status_changed', { status }, userId);
  return db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
}

function convertLead(leadId, userId) {
  const convert = db.transaction(() => {
    const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
    if (!lead) throw new Error('العميل المحتمل غير موجود');
    if (lead.customer_id) return lead.customer_id;

    const customer = db.prepare(`
      INSERT INTO customers (name, phone, email, company_id, lead_source)
      VALUES (?, ?, ?, ?, ?)
    `).run(lead.name, lead.phone, lead.email, lead.company_id, lead.source);
    const customerId = Number(customer.lastInsertRowid);
    db.prepare(`
      UPDATE crm_leads
      SET customer_id = ?, status = 'converted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customerId, leadId);
    recordAudit('lead', leadId, 'converted', { customer_id: customerId }, userId);
    recordAudit('customer', customerId, 'created_from_lead', { lead_id: leadId }, userId);
    return customerId;
  });
  return convert();
}

function getPipelineStages() {
  return db.prepare(`
    SELECT stage.*, COUNT(opportunity.id) AS opportunity_count
    FROM crm_pipeline_stages stage
    LEFT JOIN crm_opportunities opportunity ON opportunity.pipeline_stage_id = stage.id
    GROUP BY stage.id
    ORDER BY stage.display_order, stage.id
  `).all();
}

function createPipelineStage(data, userId) {
  const key = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const result = db.prepare(`
    INSERT INTO crm_pipeline_stages (stage_key, label, outcome, probability, display_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, data.label, data.outcome, data.probability, data.display_order);
  const id = Number(result.lastInsertRowid);
  recordAudit('pipeline_stage', id, 'created', data, userId);
  return id;
}

function updatePipelineStage(data, userId) {
  db.prepare(`
    UPDATE crm_pipeline_stages
    SET label = ?, outcome = ?, probability = ?, display_order = ?, is_active = ?
    WHERE id = ?
  `).run(data.label, data.outcome, data.probability, data.display_order, data.is_active ? 1 : 0, data.id);
  db.prepare(`
    UPDATE crm_opportunities
    SET stage = ?, probability = ?, closed_at = CASE WHEN ? IN ('won', 'lost') THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE pipeline_stage_id = ?
  `).run(
    data.outcome === 'open' ? 'proposal' : data.outcome,
    data.probability,
    data.outcome,
    data.id
  );
  recordAudit('pipeline_stage', data.id, 'updated', data, userId);
  return db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ?').get(data.id);
}

function createOpportunity(data, userId) {
  const stage = db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ? AND is_active = 1').get(data.pipeline_stage_id);
  if (!stage) throw new Error('مرحلة الصفقة غير موجودة أو غير مفعّلة');
  const result = db.prepare(`
    INSERT INTO crm_opportunities
      (customer_id, company_id, lead_id, user_id, title, expected_value, stage,
       expected_close_date, notes, probability, pipeline_stage_id, last_stage_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    data.customer_id, data.company_id || null, data.lead_id || null,
    data.user_id || userId || null, data.title, data.expected_value,
    stage.outcome === 'open' ? 'proposal' : stage.outcome,
    data.expected_close_date || null, data.notes || null,
    data.probability ?? stage.probability, stage.id
  );
  const id = Number(result.lastInsertRowid);
  recordAudit('opportunity', id, 'created', {
    customer_id: data.customer_id,
    company_id: data.company_id || null,
    pipeline_stage_id: data.pipeline_stage_id,
    expected_value: data.expected_value,
  }, userId);
  return id;
}

function moveOpportunity(data, userId) {
  const stage = db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ? AND is_active = 1').get(data.stageId);
  if (!stage) throw new Error('مرحلة الصفقة غير موجودة أو غير مفعّلة');
  db.prepare(`
    UPDATE crm_opportunities
    SET stage = ?, pipeline_stage_id = ?, probability = ?, last_stage_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP, updated_by = ?,
        closed_at = CASE WHEN ? IN ('won', 'lost') THEN CURRENT_TIMESTAMP ELSE NULL END,
        stage_stale_reminded_at = NULL
    WHERE id = ?
  `).run(
    stage.outcome === 'open' ? 'proposal' : stage.outcome,
    stage.id,
    stage.probability,
    userId || null,
    stage.outcome,
    data.opportunityId
  );
  recordAudit('opportunity', data.opportunityId, 'stage_changed', { pipeline_stage_id: stage.id }, userId);
  return db.prepare(`
    SELECT opportunity.*, stage.label AS pipeline_stage_label, stage.probability AS stage_probability
    FROM crm_opportunities opportunity
    LEFT JOIN crm_pipeline_stages stage ON stage.id = opportunity.pipeline_stage_id
    WHERE opportunity.id = ?
  `).get(data.opportunityId);
}

function assignOpportunity(data, userId) {
  const result = db.prepare(`
    UPDATE crm_opportunities
    SET user_id = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
    WHERE id = ?
  `).run(data.owner_user_id || null, userId || null, data.opportunity_id);
  if (!result.changes) throw new Error('الصفقة غير موجودة');
  recordAudit('opportunity', data.opportunity_id, 'owner_changed', {
    owner_user_id: data.owner_user_id || null,
  }, userId);
  return db.prepare('SELECT * FROM crm_opportunities WHERE id = ?').get(data.opportunity_id);
}

function getStaleOpportunities() {
  const rule = db.prepare(`
    SELECT config_json FROM crm_automation_rules
    WHERE trigger_type = 'opportunity_stale' AND is_enabled = 1
    ORDER BY id LIMIT 1
  `).get();
  if (!rule) return [];
  let config;
  try {
    config = JSON.parse(rule.config_json);
  } catch (error) {
    throw new Error(`تعذر قراءة قاعدة التذكير: ${error.message}`);
  }
  const days = Number(config.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('إعداد مدة تنبيه الصفقات غير صالح');
  }
  return db.prepare(`
    SELECT opportunity.id, opportunity.title, opportunity.user_id, opportunity.expected_value,
      customer.name AS customer_name, opportunity.last_stage_changed_at
    FROM crm_opportunities opportunity
    JOIN customers customer ON customer.id = opportunity.customer_id
    WHERE opportunity.stage NOT IN ('won', 'lost')
      AND opportunity.last_stage_changed_at <= datetime('now', ?)
      AND opportunity.stage_stale_reminded_at IS NULL
  `).all(`-${days} days`);
}

function markOpportunityStaleReminderSent(id) {
  return db.prepare(`
    UPDATE crm_opportunities
    SET stage_stale_reminded_at = CURRENT_TIMESTAMP
    WHERE id = ? AND stage_stale_reminded_at IS NULL
  `).run(id);
}

function getAutomationRules() {
  return db.prepare(`
    SELECT id, name, trigger_type, is_enabled, config_json, created_at
    FROM crm_automation_rules ORDER BY id
  `).all().map((rule) => {
    let config;
    try {
      config = JSON.parse(rule.config_json);
    } catch (error) {
      throw new Error(`تعذر قراءة قاعدة الأتمتة رقم ${rule.id}: ${error.message}`);
    }
    return { ...rule, config };
  });
}

function saveStaleOpportunityRule(data, userId) {
  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO crm_automation_rules (name, trigger_type, is_enabled, config_json, created_by)
      VALUES ('تنبيه الصفقات المتوقفة', 'opportunity_stale', ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        config_json = excluded.config_json,
        created_by = excluded.created_by
    `).run(data.is_enabled ? 1 : 0, JSON.stringify({ days: data.days }), userId || null);
    const rule = db.prepare(`
      SELECT id FROM crm_automation_rules WHERE name = 'تنبيه الصفقات المتوقفة'
    `).get();
    db.prepare(`
      UPDATE crm_opportunities SET stage_stale_reminded_at = NULL
      WHERE stage NOT IN ('won', 'lost')
    `).run();
    recordAudit('automation_rule', rule.id, 'updated', {
      enabled: data.is_enabled,
      idle_days: data.days,
    }, userId);
    return rule.id;
  });
  return save();
}

function createActivity(data, userId) {
  const result = db.prepare(`
    INSERT INTO crm_activities
      (record_type, record_id, activity_type, title, details, due_at, owner_user_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.record_type, data.record_id, data.activity_type, data.title,
    data.details || null, data.due_at || null, data.owner_user_id || userId || null, userId || null
  );
  const id = Number(result.lastInsertRowid);
  recordAudit(data.record_type, data.record_id, 'activity_created', { activity_id: id }, userId);
  return id;
}

function getActivities(filters = {}) {
  let query = `
    SELECT activity.*, users.username AS owner_username
    FROM crm_activities activity
    LEFT JOIN users ON users.id = activity.owner_user_id
    WHERE 1 = 1
  `;
  const params = [];
  if (filters.status) {
    query += ' AND activity.status = ?';
    params.push(filters.status);
  }
  if (filters.from) {
    query += ' AND (activity.due_at IS NULL OR activity.due_at >= ?)';
    params.push(filters.from);
  }
  if (filters.to) {
    query += ' AND activity.due_at <= ?';
    params.push(filters.to);
  }
  query += ' ORDER BY activity.due_at IS NULL, activity.due_at, activity.id DESC';
  return db.prepare(query).all(...params);
}

function getDueActivities() {
  return db.prepare(`
    SELECT * FROM crm_activities
    WHERE status = 'open' AND due_at IS NOT NULL
      AND julianday(due_at) <= julianday('now')
      AND reminder_sent_at IS NULL
    ORDER BY due_at, id
  `).all();
}

function markActivityReminderSent(id) {
  return db.prepare(`
    UPDATE crm_activities SET reminder_sent_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent_at IS NULL
  `).run(id);
}

function completeActivity(id, userId) {
  const activity = db.prepare('SELECT * FROM crm_activities WHERE id = ?').get(id);
  if (!activity) throw new Error('النشاط غير موجود');
  db.prepare(`
    UPDATE crm_activities SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);
  recordAudit(activity.record_type, activity.record_id, 'activity_completed', { activity_id: id }, userId);
  return db.prepare('SELECT * FROM crm_activities WHERE id = ?').get(id);
}

function getNotes(recordType, recordId) {
  return db.prepare(`
    SELECT note.*, users.username FROM crm_notes note
    LEFT JOIN users ON users.id = note.user_id
    WHERE note.record_type = ? AND note.record_id = ?
    ORDER BY note.created_at DESC
  `).all(recordType, recordId);
}

function createNote(data, userId) {
  const result = db.prepare(`
    INSERT INTO crm_notes (record_type, record_id, body, user_id) VALUES (?, ?, ?, ?)
  `).run(data.record_type, data.record_id, data.body, userId || null);
  const id = Number(result.lastInsertRowid);
  recordAudit(data.record_type, data.record_id, 'note_created', { note_id: id }, userId);
  return id;
}

function saveAttachment(data, userId) {
  const result = db.prepare(`
    INSERT INTO crm_attachments
      (record_type, record_id, file_name, file_path, mime_type, size_bytes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.record_type, data.record_id, data.file_name, data.file_path,
    data.mime_type || null, data.size_bytes, userId || null
  );
  const id = Number(result.lastInsertRowid);
  recordAudit(data.record_type, data.record_id, 'attachment_added', { attachment_id: id }, userId);
  return id;
}

function getAttachments(recordType, recordId) {
  return db.prepare(`
    SELECT id, record_type, record_id, file_name, mime_type, size_bytes, user_id, created_at
    FROM crm_attachments WHERE record_type = ? AND record_id = ?
    ORDER BY created_at DESC
  `).all(recordType, recordId);
}

function getAttachmentById(id) {
  return db.prepare('SELECT * FROM crm_attachments WHERE id = ?').get(id);
}

function removeAttachments(recordType, recordId) {
  const remove = db.transaction(() => {
    const files = db.prepare(`
      SELECT id, file_path FROM crm_attachments WHERE record_type = ? AND record_id = ?
    `).all(recordType, recordId);
    db.prepare('DELETE FROM crm_attachments WHERE record_type = ? AND record_id = ?')
      .run(recordType, recordId);
    return files;
  });
  return remove();
}

function getTags(recordType, recordId) {
  return db.prepare(`
    SELECT tag.* FROM crm_tags tag
    JOIN crm_record_tags link ON link.tag_id = tag.id
    WHERE link.record_type = ? AND link.record_id = ?
    ORDER BY tag.name COLLATE NOCASE
  `).all(recordType, recordId);
}

function setTags(data, userId) {
  const update = db.transaction(() => {
    const tagIds = data.tags.map((tagName) => {
      const name = tagName.trim();
      db.prepare('INSERT OR IGNORE INTO crm_tags (name) VALUES (?)').run(name);
      return db.prepare('SELECT id FROM crm_tags WHERE name = ? COLLATE NOCASE').get(name).id;
    });
    db.prepare('DELETE FROM crm_record_tags WHERE record_type = ? AND record_id = ?')
      .run(data.record_type, data.record_id);
    const insert = db.prepare('INSERT INTO crm_record_tags (tag_id, record_type, record_id) VALUES (?, ?, ?)');
    tagIds.forEach((tagId) => insert.run(tagId, data.record_type, data.record_id));
    recordAudit(data.record_type, data.record_id, 'tags_updated', { tags: data.tags }, userId);
    return getTags(data.record_type, data.record_id);
  });
  return update();
}

function saveFilter(data, userId) {
  db.prepare(`
    INSERT INTO crm_saved_filters (name, entity_type, filters_json, user_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, entity_type, name)
    DO UPDATE SET filters_json = excluded.filters_json
  `).run(data.name, data.entity_type, JSON.stringify(data.filters), userId || null);
  return Number(db.prepare(`
    SELECT id FROM crm_saved_filters WHERE user_id IS ? AND entity_type = ? AND name = ?
  `).get(userId || null, data.entity_type, data.name).id);
}

function getSavedFilters(entityType, userId) {
  return db.prepare(`
    SELECT * FROM crm_saved_filters WHERE entity_type = ? AND (user_id = ? OR user_id IS NULL)
    ORDER BY name
  `).all(entityType, userId || null).map((filter) => ({
    ...filter,
    filters: JSON.parse(filter.filters_json),
  }));
}

function getAuditLog(entityType, entityId) {
  return db.prepare(`
    SELECT audit.*, users.username
    FROM crm_audit_log audit
    LEFT JOIN users ON users.id = audit.user_id
    WHERE audit.entity_type = ? AND audit.entity_id = ?
    ORDER BY audit.created_at DESC, audit.id DESC
  `).all(entityType, entityId).map((entry) => ({
    ...entry,
    changes: JSON.parse(entry.changes_json),
  }));
}

function setConsent(customerId, data, userId) {
  db.prepare(`
    UPDATE customers
    SET email_consent = ?, sms_consent = ?, consent_updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(data.email_consent ? 1 : 0, data.sms_consent ? 1 : 0, customerId);
  recordAudit('customer', customerId, 'consent_updated', data, userId);
  return db.prepare(`
    SELECT id, email_consent, sms_consent, consent_updated_at FROM customers WHERE id = ?
  `).get(customerId);
}

function getCustomerRelationships(customerId) {
  return db.prepare(`
    SELECT relationship.id, relationship.relationship_type, relationship.created_at,
      CASE WHEN relationship.from_customer_id = ? THEN target.id ELSE source.id END AS related_customer_id,
      CASE WHEN relationship.from_customer_id = ? THEN target.name ELSE source.name END AS related_customer_name,
      CASE WHEN relationship.from_customer_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction
    FROM crm_relationships relationship
    JOIN customers source ON source.id = relationship.from_customer_id
    JOIN customers target ON target.id = relationship.to_customer_id
    WHERE relationship.from_customer_id = ? OR relationship.to_customer_id = ?
    ORDER BY relationship.created_at DESC
  `).all(customerId, customerId, customerId, customerId, customerId);
}

function createCustomerRelationship(data, userId) {
  const result = db.prepare(`
    INSERT INTO crm_relationships (from_customer_id, to_customer_id, relationship_type)
    VALUES (?, ?, ?)
  `).run(data.from_customer_id, data.to_customer_id, data.relationship_type);
  recordAudit('customer', data.from_customer_id, 'relationship_created', {
    related_customer_id: data.to_customer_id,
    relationship_type: data.relationship_type,
  }, userId);
  return Number(result.lastInsertRowid);
}

function anonymizeCustomer(customerId, userId) {
  const anonymize = db.transaction(() => {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND is_active = 1').get(customerId);
    if (!customer) throw new Error('العميل غير موجود أو محذوف مسبقًا');
    db.prepare(`
      UPDATE sales
      SET customer_name = ?, customer_phone = NULL, notes = NULL
      WHERE customer_id = ?
    `).run(`محذوف-${customerId}`, customerId);
    db.prepare('UPDATE customer_payments SET notes = NULL WHERE customer_id = ?').run(customerId);
    db.prepare(`
      UPDATE crm_interactions
      SET subject = 'سجل تواصل محذوف', details = NULL
      WHERE customer_id = ?
    `).run(customerId);
    db.prepare(`
      UPDATE crm_leads
      SET name = 'عميل محتمل محذوف', phone = NULL, email = NULL, notes = NULL
      WHERE customer_id = ?
    `).run(customerId);
    db.prepare(`
      UPDATE crm_notes SET body = 'تم حذف محتوى الملاحظة بموجب طلب الخصوصية'
      WHERE record_type = 'customer' AND record_id = ?
    `).run(customerId);
    db.prepare(`
      UPDATE crm_activities SET title = 'نشاط محذوف', details = NULL
      WHERE record_type = 'customer' AND record_id = ?
    `).run(customerId);
    db.prepare(`
      UPDATE crm_opportunities SET title = 'صفقة محذوفة', notes = NULL
      WHERE customer_id = ?
    `).run(customerId);
    db.prepare('DELETE FROM crm_record_tags WHERE record_type = \'customer\' AND record_id = ?')
      .run(customerId);
    db.prepare(`
      DELETE FROM crm_relationships
      WHERE from_customer_id = ? OR to_customer_id = ?
    `).run(customerId, customerId);
    db.prepare(`
      UPDATE crm_audit_log SET changes_json = '{}'
      WHERE entity_type = 'customer' AND entity_id = ?
    `).run(customerId);
    db.prepare(`
      DELETE FROM crm_custom_field_values
      WHERE record_id = ? AND field_id IN (
        SELECT id FROM crm_custom_fields WHERE entity_type = 'customer'
      )
    `).run(customerId);
    db.prepare(`
      UPDATE customers
      SET name = ?, phone = NULL, email = NULL, address = NULL, notes = NULL,
          email_consent = 0, sms_consent = 0, consent_updated_at = CURRENT_TIMESTAMP,
          gdpr_deleted_at = CURRENT_TIMESTAMP, is_active = 0
      WHERE id = ?
    `).run(`محذوف-${customerId}`, customerId);
    recordAudit('customer', customerId, 'gdpr_anonymized', {}, userId);
  });
  anonymize();
  return { deleted: true };
}

function createCustomField(data) {
  const result = db.prepare(`
    INSERT INTO crm_custom_fields (entity_type, field_key, label, field_type, is_required)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.entity_type, data.field_key, data.label, data.field_type, data.is_required ? 1 : 0);
  return Number(result.lastInsertRowid);
}

function getCustomFields(entityType) {
  return db.prepare(`
    SELECT * FROM crm_custom_fields WHERE entity_type = ? ORDER BY id
  `).all(entityType);
}

function setCustomFieldValues(entityType, recordId, values, userId) {
  const fields = getCustomFields(entityType);
  const fieldByKey = new Map(fields.map((field) => [field.field_key, field]));
  const update = db.transaction(() => {
    const save = db.prepare(`
      INSERT INTO crm_custom_field_values (field_id, record_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(field_id, record_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    Object.entries(values).forEach(([key, value]) => {
      const field = fieldByKey.get(key);
      if (!field) throw new Error(`الحقل المخصص "${key}" غير معروف`);
      save.run(field.id, recordId, value == null ? null : String(value));
    });
    recordAudit(entityType, recordId, 'custom_fields_updated', {}, userId);
  });
  update();
}

function getCustomFieldValues(entityType, recordId) {
  return db.prepare(`
    SELECT field.field_key, value.value
    FROM crm_custom_fields field
    LEFT JOIN crm_custom_field_values value ON value.field_id = field.id AND value.record_id = ?
    WHERE field.entity_type = ?
  `).all(recordId, entityType).reduce((values, entry) => {
    values[entry.field_key] = entry.value;
    return values;
  }, {});
}

function recordExists(recordType, recordId) {
  const tables = {
    customer: 'customers',
    company: 'crm_companies',
    lead: 'crm_leads',
    opportunity: 'crm_opportunities',
  };
  const table = tables[recordType];
  if (!table) return false;
  return Boolean(db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(recordId));
}

module.exports = {
  getCompanies,
  getCRMUsers,
  isActiveUser,
  createCompany,
  updateCompany,
  createLead,
  updateLead,
  getLeadById,
  deleteLead,
  createLeads,
  getLeads,
  updateLeadStatus,
  convertLead,
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  createOpportunity,
  moveOpportunity,
  assignOpportunity,
  getStaleOpportunities,
  markOpportunityStaleReminderSent,
  getAutomationRules,
  saveStaleOpportunityRule,
  createActivity,
  getActivities,
  getDueActivities,
  markActivityReminderSent,
  completeActivity,
  getNotes,
  createNote,
  saveAttachment,
  getAttachments,
  getAttachmentById,
  removeAttachments,
  getTags,
  setTags,
  saveFilter,
  getSavedFilters,
  getAuditLog,
  setConsent,
  getCustomerRelationships,
  createCustomerRelationship,
  anonymizeCustomer,
  createCustomField,
  getCustomFields,
  setCustomFieldValues,
  getCustomFieldValues,
  recordExists,
  recordAudit,
};
