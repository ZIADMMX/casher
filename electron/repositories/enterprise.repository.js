const { db } = require('../database/db');

/**
 * Enterprise Framework Repository
 * Data access layer for Modules, Business Profiles, Attributes, Workflows, Automations & Dynamic RBAC
 */

// --- MODULES ---

function getModules() {
  return db.prepare("SELECT * FROM system_modules ORDER BY display_order ASC").all();
}

function setModuleEnabled(key, isEnabled) {
  db.prepare("UPDATE system_modules SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?")
    .run(isEnabled ? 1 : 0, key);
  return getModules();
}

function upsertModule(data) {
  const stmt = db.prepare(`
    INSERT INTO system_modules (key, name, description, is_enabled, display_order, config_json)
    VALUES (@key, @name, @description, @is_enabled, @display_order, @config_json)
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      is_enabled = excluded.is_enabled,
      display_order = excluded.display_order,
      config_json = excluded.config_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run({
    key: data.key,
    name: data.name,
    description: data.description || null,
    is_enabled: data.is_enabled ?? 1,
    display_order: data.display_order ?? 0,
    config_json: typeof data.config_json === 'string' ? data.config_json : JSON.stringify(data.config_json || {})
  });
}

// --- BUSINESS PROFILES ---

function getBusinessProfiles() {
  return db.prepare("SELECT * FROM business_profiles ORDER BY name ASC").all();
}

function getActiveBusinessProfile() {
  try {
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'business_type'").get();
    if (setting?.value) {
      const matchingProfile = db.prepare("SELECT * FROM business_profiles WHERE key = ?").get(setting.value);
      if (matchingProfile) {
        if (!matchingProfile.is_active) {
          db.prepare("UPDATE business_profiles SET is_active = 0").run();
          db.prepare("UPDATE business_profiles SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE key = ?").run(setting.value);
          matchingProfile.is_active = 1;
        }
        return matchingProfile;
      }
    }
  } catch {}

  return db.prepare("SELECT * FROM business_profiles WHERE is_active = 1 LIMIT 1").get();
}

function setActiveBusinessProfile(profileKey, enabledModuleKeys = null) {
  const runTx = db.transaction(() => {
    const profile = db.prepare("SELECT key FROM business_profiles WHERE key = ?").get(profileKey);
    if (!profile) throw new Error('القالب التجاري المحدد غير موجود');

    db.prepare("UPDATE business_profiles SET is_active = 0").run();
    db.prepare("UPDATE business_profiles SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE key = ?").run(profileKey);

    if (Array.isArray(enabledModuleKeys)) {
      const enabledKeys = new Set(enabledModuleKeys);
      const updateModule = db.prepare(
        "UPDATE system_modules SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?"
      );
      for (const module of db.prepare("SELECT key FROM system_modules").all()) {
        updateModule.run(enabledKeys.has(module.key) ? 1 : 0, module.key);
      }
    }
  });
  runTx();
  return getActiveBusinessProfile();
}

function upsertBusinessProfile(data) {
  const stmt = db.prepare(`
    INSERT INTO business_profiles (key, name, is_active, settings_json)
    VALUES (@key, @name, @is_active, @settings_json)
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      settings_json = excluded.settings_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run({
    key: data.key,
    name: data.name,
    is_active: data.is_active ? 1 : 0,
    settings_json: typeof data.settings_json === 'string' ? data.settings_json : JSON.stringify(data.settings_json || {})
  });
}

// --- DYNAMIC ATTRIBUTES ---

function getAttributeDefinitions(profileKey = null) {
  if (profileKey) {
    return db.prepare("SELECT * FROM product_attribute_definitions WHERE business_profile_key = ? OR business_profile_key IS NULL ORDER BY attribute_name ASC").all(profileKey);
  }
  return db.prepare("SELECT * FROM product_attribute_definitions ORDER BY attribute_name ASC").all();
}

function createAttributeDefinition(data) {
  const stmt = db.prepare(`
    INSERT INTO product_attribute_definitions (attribute_name, attribute_key, data_type, options_json, is_required, business_profile_key)
    VALUES (@attribute_name, @attribute_key, @data_type, @options_json, @is_required, @business_profile_key)
  `);
  const info = stmt.run({
    attribute_name: data.attribute_name,
    attribute_key: data.attribute_key,
    data_type: data.data_type || 'text',
    options_json: typeof data.options_json === 'string' ? data.options_json : JSON.stringify(data.options_json || []),
    is_required: data.is_required ? 1 : 0,
    business_profile_key: data.business_profile_key || null
  });
  return info.lastInsertRowid;
}

function getVariantAttributeValues(variantId) {
  return db.prepare(`
    SELECT v.*, d.attribute_name, d.attribute_key, d.data_type
    FROM product_attribute_values v
    JOIN product_attribute_definitions d ON v.attribute_id = d.id
    WHERE v.variant_id = ?
  `).all(variantId);
}

function getAllVariantAttributeValues() {
  return db.prepare(`
    SELECT v.*, d.attribute_name, d.attribute_key, d.data_type
    FROM product_attribute_values v
    JOIN product_attribute_definitions d ON v.attribute_id = d.id
    ORDER BY v.variant_id, d.attribute_name
  `).all();
}

function saveVariantAttributeValues(variantId, valuesMap = {}, replaceAttributeIds = Object.keys(valuesMap)) {
  const runTx = db.transaction(() => {
    if (replaceAttributeIds.length > 0) {
      const placeholders = replaceAttributeIds.map(() => '?').join(', ');
      db.prepare(
        `DELETE FROM product_attribute_values WHERE variant_id = ? AND attribute_id IN (${placeholders})`
      ).run(variantId, ...replaceAttributeIds);
    }
    const stmt = db.prepare(`
      INSERT INTO product_attribute_values (variant_id, attribute_id, value)
      VALUES (?, ?, ?)
    `);
    for (const [attrId, val] of Object.entries(valuesMap)) {
      if (val != null && String(val).trim() !== '') {
        stmt.run(variantId, attrId, String(val));
      }
    }
  });
  runTx();
  return getVariantAttributeValues(variantId);
}

// --- DYNAMIC WORKFLOWS, STATUSES, TRANSITIONS & KANBAN TICKETS ---

function getWorkflows() {
  const workflows = db.prepare("SELECT * FROM workflow_definitions ORDER BY id ASC").all();
  return workflows.map(wf => {
    const statuses = db.prepare("SELECT * FROM workflow_statuses WHERE workflow_id = ? ORDER BY step_order ASC").all(wf.id);
    const transitions = db.prepare("SELECT * FROM workflow_transitions WHERE workflow_id = ?").all(wf.id);
    const ticketsCount = db.prepare("SELECT COUNT(*) as count FROM workflow_tickets WHERE workflow_id = ?").get(wf.id)?.count || 0;
    return {
      ...wf,
      statuses,
      transitions,
      ticketsCount
    };
  });
}

function getWorkflowById(id) {
  return getWorkflows().find(w => w.id === id) || null;
}

function getWorkflowTicketById(ticketId, workflowId) {
  return db.prepare("SELECT * FROM workflow_tickets WHERE id = ? AND workflow_id = ?").get(ticketId, workflowId) || null;
}

function createWorkflow(data) {
  const stmt = db.prepare(`
    INSERT INTO workflow_definitions (module_key, entity_type, name, description, business_profile_key, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    data.module_key || 'general',
    data.entity_type || 'maintenance_ticket',
    data.name,
    data.description || null,
    data.business_profile_key || null,
    data.is_active ?? 1
  );
  return info.lastInsertRowid;
}

function updateWorkflow(id, data) {
  const stmt = db.prepare(`
    UPDATE workflow_definitions
    SET name = COALESCE(?, name),
        entity_type = COALESCE(?, entity_type),
        description = COALESCE(?, description),
        is_active = COALESCE(?, is_active)
    WHERE id = ?
  `);
  stmt.run(data.name || null, data.entity_type || null, data.description || null, data.is_active != null ? (data.is_active ? 1 : 0) : null, id);
  return getWorkflows().find(w => w.id === id);
}

function deleteWorkflow(id) {
  db.prepare("DELETE FROM workflow_definitions WHERE id = ?").run(id);
  return true;
}

function addWorkflowStatus(workflowId, statusData) {
  const workflow = getWorkflowById(workflowId);
  if (!workflow) {
    throw new Error('مسار العمل غير موجود');
  }

  const normalizedKey = String(statusData.status_key || '').trim();
  const existingStatus = workflow.statuses?.find((status) => status.status_key === normalizedKey);
  if (existingStatus) {
    throw new Error(`الحالة "${normalizedKey}" موجودة بالفعل في هذا المسار`);
  }

  const stmt = db.prepare(`
    INSERT INTO workflow_statuses (workflow_id, status_key, status_label, badge_color, step_order, is_initial, is_final, allowed_next_statuses_json, sla_hours)
    VALUES (@workflow_id, @status_key, @status_label, @badge_color, @step_order, @is_initial, @is_final, @allowed_next_statuses_json, @sla_hours)
  `);
  const info = stmt.run({
    workflow_id: workflowId,
    status_key: normalizedKey,
    status_label: statusData.status_label,
    badge_color: statusData.badge_color || '#3b82f6',
    step_order: statusData.step_order || 0,
    is_initial: statusData.is_initial ? 1 : 0,
    is_final: statusData.is_final ? 1 : 0,
    allowed_next_statuses_json: typeof statusData.allowed_next_statuses_json === 'string'
      ? statusData.allowed_next_statuses_json
      : JSON.stringify(statusData.allowed_next_statuses_json || []),
    sla_hours: statusData.sla_hours || 0
  });
  return info.lastInsertRowid;
}

function updateWorkflowStatus(statusId, statusData) {
  const stmt = db.prepare(`
    UPDATE workflow_statuses
    SET status_label = COALESCE(@status_label, status_label),
        badge_color = COALESCE(@badge_color, badge_color),
        step_order = COALESCE(@step_order, step_order),
        is_initial = COALESCE(@is_initial, is_initial),
        is_final = COALESCE(@is_final, is_final),
        allowed_next_statuses_json = COALESCE(@allowed_next_statuses_json, allowed_next_statuses_json),
        sla_hours = COALESCE(@sla_hours, sla_hours)
    WHERE id = @id
  `);
  stmt.run({
    id: statusId,
    status_label: statusData.status_label || null,
    badge_color: statusData.badge_color || null,
    step_order: statusData.step_order != null ? statusData.step_order : null,
    is_initial: statusData.is_initial != null ? (statusData.is_initial ? 1 : 0) : null,
    is_final: statusData.is_final != null ? (statusData.is_final ? 1 : 0) : null,
    allowed_next_statuses_json: statusData.allowed_next_statuses_json
      ? (typeof statusData.allowed_next_statuses_json === 'string' ? statusData.allowed_next_statuses_json : JSON.stringify(statusData.allowed_next_statuses_json))
      : null,
    sla_hours: statusData.sla_hours != null ? statusData.sla_hours : null
  });
  return db.prepare("SELECT * FROM workflow_statuses WHERE id = ?").get(statusId);
}

function deleteWorkflowStatus(statusId) {
  db.prepare("DELETE FROM workflow_statuses WHERE id = ?").run(statusId);
  return true;
}

function saveWorkflowTransitions(workflowId, transitionsArray) {
  const deleteStmt = db.prepare("DELETE FROM workflow_transitions WHERE workflow_id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO workflow_transitions (workflow_id, from_status_key, to_status_key, allowed_roles_json, auto_action_type, auto_action_payload_json, sla_limit_hours, sla_alert_message)
    VALUES (@workflow_id, @from_status_key, @to_status_key, @allowed_roles_json, @auto_action_type, @auto_action_payload_json, @sla_limit_hours, @sla_alert_message)
  `);

  const runTx = db.transaction((list) => {
    deleteStmt.run(workflowId);
    for (const t of list) {
      insertStmt.run({
        workflow_id: workflowId,
        from_status_key: t.from_status_key,
        to_status_key: t.to_status_key,
        allowed_roles_json: typeof t.allowed_roles_json === 'string' ? t.allowed_roles_json : JSON.stringify(t.allowed_roles_json || ['admin', 'manager', 'cashier']),
        auto_action_type: t.auto_action_type || 'none',
        auto_action_payload_json: typeof t.auto_action_payload_json === 'string' ? t.auto_action_payload_json : JSON.stringify(t.auto_action_payload_json || {}),
        sla_limit_hours: t.sla_limit_hours || 0,
        sla_alert_message: t.sla_alert_message || 'تنبيه تجاوز فترة SLA المحددة'
      });
    }
  });

  runTx(transitionsArray || []);
  return db.prepare("SELECT * FROM workflow_transitions WHERE workflow_id = ?").all(workflowId);
}

function getWorkflowTickets(workflowId, statusKey = null) {
  if (statusKey) {
    return db.prepare("SELECT * FROM workflow_tickets WHERE workflow_id = ? AND current_status_key = ? ORDER BY id DESC").all(workflowId, statusKey);
  }
  return db.prepare("SELECT * FROM workflow_tickets WHERE workflow_id = ? ORDER BY id DESC").all(workflowId);
}

function createWorkflowTicket(data) {
  const workflow = getWorkflowById(data.workflow_id);
  if (!workflow) {
    throw new Error('مسار العمل غير موجود');
  }

  const statusExists = workflow.statuses?.some((status) => status.status_key === data.current_status_key);
  if (!statusExists) {
    throw new Error(`الحالة الحالية "${data.current_status_key}" غير موجودة في هذا المسار`);
  }

  const stmt = db.prepare(`
    INSERT INTO workflow_tickets (ticket_number, workflow_id, entity_type, title, customer_name, customer_phone, current_status_key, assigned_role, assigned_user, notes, entered_current_status_at)
    VALUES (@ticket_number, @workflow_id, @entity_type, @title, @customer_name, @customer_phone, @current_status_key, @assigned_role, @assigned_user, @notes, CURRENT_TIMESTAMP)
  `);
  const ticketNumber = data.ticket_number || `TK-${Date.now().toString().slice(-6)}`;
  const info = stmt.run({
    ticket_number: ticketNumber,
    workflow_id: data.workflow_id,
    entity_type: data.entity_type || 'general',
    title: data.title,
    customer_name: data.customer_name || null,
    customer_phone: data.customer_phone || null,
    current_status_key: data.current_status_key,
    assigned_role: data.assigned_role || 'admin',
    assigned_user: data.assigned_user || null,
    notes: data.notes || null
  });
  return db.prepare("SELECT * FROM workflow_tickets WHERE id = ?").get(info.lastInsertRowid);
}

function updateTicketStatus(ticketId, workflowId, newStatusKey) {
  const stmt = db.prepare(`
    UPDATE workflow_tickets
    SET current_status_key = ?,
        entered_current_status_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND workflow_id = ?
  `);
  stmt.run(newStatusKey, ticketId, workflowId);
  return getWorkflowTicketById(ticketId, workflowId);
}

function deleteWorkflowTicket(ticketId) {
  db.prepare("DELETE FROM workflow_tickets WHERE id = ?").run(ticketId);
  return true;
}

// --- NO-CODE AUTOMATION ---

function getAutomationRules() {
  return db.prepare("SELECT * FROM automation_rules ORDER BY id DESC").all();
}

function createAutomationRule(data) {
  const stmt = db.prepare(`
    INSERT INTO automation_rules (rule_name, trigger_event, condition_json, action_type, action_payload_json, is_enabled)
    VALUES (@rule_name, @trigger_event, @condition_json, @action_type, @action_payload_json, @is_enabled)
  `);
  const info = stmt.run({
    rule_name: data.rule_name,
    trigger_event: data.trigger_event,
    condition_json: typeof data.condition_json === 'string' ? data.condition_json : JSON.stringify(data.condition_json || {}),
    action_type: data.action_type,
    action_payload_json: typeof data.action_payload_json === 'string' ? data.action_payload_json : JSON.stringify(data.action_payload_json || {}),
    is_enabled: data.is_enabled ?? 1
  });
  return info.lastInsertRowid;
}

function setAutomationRuleEnabled(id, isEnabled) {
  db.prepare("UPDATE automation_rules SET is_enabled = ? WHERE id = ?").run(isEnabled ? 1 : 0, id);
  return getAutomationRules();
}

// --- DYNAMIC ROLES & RBAC ---

function getRoles() {
  const roles = db.prepare("SELECT * FROM system_roles ORDER BY id ASC").all();
  return roles.map(r => ({
    ...r,
    permissions: db.prepare("SELECT permission_key FROM role_permissions WHERE role_key = ?").all(r.role_key).map(p => p.permission_key)
  }));
}

function getRolePermissions(roleKey) {
  return db.prepare(
    'SELECT permission_key FROM role_permissions WHERE role_key = ?'
  ).all(roleKey).map((permission) => permission.permission_key);
}

function createRole(roleKey, roleName, description, isSystem = 0) {
  const stmt = db.prepare("INSERT INTO system_roles (role_key, role_name, description, is_system) VALUES (?, ?, ?, ?)");
  const info = stmt.run(roleKey, roleName, description || null, isSystem ? 1 : 0);
  return info.lastInsertRowid;
}

function setRolePermissions(roleKey, permissionKeys = []) {
  const runTx = db.transaction(() => {
    db.prepare("DELETE FROM role_permissions WHERE role_key = ?").run(roleKey);
    const stmt = db.prepare("INSERT INTO role_permissions (role_key, permission_key) VALUES (?, ?)");
    for (const key of permissionKeys) {
      stmt.run(roleKey, key);
    }
  });
  runTx();
  return getRoles();
}

module.exports = {
  getModules,
  setModuleEnabled,
  upsertModule,
  getBusinessProfiles,
  getActiveBusinessProfile,
  setActiveBusinessProfile,
  upsertBusinessProfile,
  getAttributeDefinitions,
  createAttributeDefinition,
  getVariantAttributeValues,
  getAllVariantAttributeValues,
  saveVariantAttributeValues,
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  addWorkflowStatus,
  updateWorkflowStatus,
  deleteWorkflowStatus,
  saveWorkflowTransitions,
  getWorkflowTickets,
  getWorkflowTicketById,
  createWorkflowTicket,
  updateTicketStatus,
  deleteWorkflowTicket,
  getAutomationRules,
  createAutomationRule,
  setAutomationRuleEnabled,
  getRoles,
  getRolePermissions,
  createRole,
  setRolePermissions
};
