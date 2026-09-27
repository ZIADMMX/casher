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

// --- DYNAMIC WORKFLOWS & STATUSES ---

function getWorkflows() {
  const workflows = db.prepare("SELECT * FROM workflow_definitions ORDER BY id ASC").all();
  return workflows.map(wf => ({
    ...wf,
    statuses: db.prepare("SELECT * FROM workflow_statuses WHERE workflow_id = ? ORDER BY step_order ASC").all(wf.id)
  }));
}

function createWorkflow(moduleKey, name, description) {
  const stmt = db.prepare("INSERT INTO workflow_definitions (module_key, name, description) VALUES (?, ?, ?)");
  const info = stmt.run(moduleKey, name, description || null);
  return info.lastInsertRowid;
}

function addWorkflowStatus(workflowId, statusData) {
  const stmt = db.prepare(`
    INSERT INTO workflow_statuses (workflow_id, status_key, status_label, badge_color, step_order, is_initial, is_final, allowed_next_statuses_json)
    VALUES (@workflow_id, @status_key, @status_label, @badge_color, @step_order, @is_initial, @is_final, @allowed_next_statuses_json)
  `);
  const info = stmt.run({
    workflow_id: workflowId,
    status_key: statusData.status_key,
    status_label: statusData.status_label,
    badge_color: statusData.badge_color || '#3b82f6',
    step_order: statusData.step_order || 0,
    is_initial: statusData.is_initial ? 1 : 0,
    is_final: statusData.is_final ? 1 : 0,
    allowed_next_statuses_json: typeof statusData.allowed_next_statuses_json === 'string' ? statusData.allowed_next_statuses_json : JSON.stringify(statusData.allowed_next_statuses_json || [])
  });
  return info.lastInsertRowid;
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
  createWorkflow,
  addWorkflowStatus,
  getAutomationRules,
  createAutomationRule,
  setAutomationRuleEnabled,
  getRoles,
  createRole,
  setRolePermissions
};
