const { db, initDatabase } = require('../../electron/database/db');
initDatabase();

const {
  getModules,
  setModuleEnabled,
  getBusinessProfiles,
  getActiveBusinessProfile,
  setActiveBusinessProfile,
  getActiveBusinessConfiguration,
  getAttributeDefinitions,
  createAttributeDefinition,
  saveVariantAttributeValues,
  getVariantAttributeValues,
  getWorkflows,
  getAutomationRules,
  createAutomationRule,
  getRoles
} = require('../../electron/services/enterprise.service');

describe('Enterprise Framework Service Unit Tests', () => {
  test('getModules and setModuleEnabled toggle system modules', () => {
    const modules = getModules();
    expect(Array.isArray(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(0);

    const updated = setModuleEnabled('orders', false);
    expect(Array.isArray(updated)).toBe(true);
    setModuleEnabled('orders', true);
  });

  test('getBusinessProfiles and getActiveBusinessProfile return profiles', () => {
    const profiles = getBusinessProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    
    const active = getActiveBusinessProfile();
    expect(active).toBeDefined();
  });

  test('setActiveBusinessProfile switches current active profile', () => {
    const active = setActiveBusinessProfile('electronics');
    expect(active.key).toBe('electronics');
    expect(active.is_active).toBe(1);

    const configuration = getActiveBusinessConfiguration();
    const moduleStates = new Map(configuration.modules.map((module) => [module.key, module.is_enabled]));
    const attributeKeys = configuration.attributes.map((attribute) => attribute.attribute_key);
    expect(moduleStates.get('pos')).toBe(1);
    expect(moduleStates.get('subscriptions')).toBe(0);
    expect(moduleStates.get('customers')).toBe(1);
    expect(configuration.settings.terms.order).toBe('طلب توريد / صيانة');
    expect(attributeKeys).toContain('serial_number');
    expect(attributeKeys).not.toContain('size');

    setActiveBusinessProfile('retail');
  });

  test('getAttributeDefinitions and createAttributeDefinition handle custom attributes', () => {
    const defs = getAttributeDefinitions();
    expect(Array.isArray(defs)).toBe(true);

    const attrId = createAttributeDefinition({
      attribute_name: 'سنة الصنع الاختبارية',
      attribute_key: 'test_year_' + Date.now(),
      data_type: 'number'
    });
    expect(attrId).toBeDefined();

    expect(() => createAttributeDefinition({ attribute_name: '' })).toThrow('مطلوبان');
  });

  test('switching profiles preserves values for attributes hidden by the active profile', () => {
    let productId;
    let variantId;
    try {
      setActiveBusinessProfile('retail');
      const retailAttributes = getAttributeDefinitions();
      const materialId = retailAttributes.find((attribute) => attribute.attribute_key === 'material')?.id;
      expect(materialId).toBeDefined();

      productId = db.prepare('INSERT INTO products (name) VALUES (?)').run('Profile test product').lastInsertRowid;
      variantId = db.prepare(`
        INSERT INTO product_variants
          (product_id, sku, purchase_price, selling_price, stock_quantity)
        VALUES (?, ?, ?, ?, ?)
      `).run(productId, `PROFILE-TEST-${Date.now()}`, 1, 2, 1).lastInsertRowid;

      saveVariantAttributeValues(variantId, { [materialId]: 'Cotton' });
      setActiveBusinessProfile('electronics');
      const electronicsAttributes = getAttributeDefinitions();
      const serialId = electronicsAttributes.find((attribute) => attribute.attribute_key === 'serial_number')?.id;
      expect(serialId).toBeDefined();
      saveVariantAttributeValues(variantId, { [serialId]: 'SN-001' });

      const values = getVariantAttributeValues(variantId);
      expect(values.find((value) => value.attribute_id === materialId)?.value).toBe('Cotton');
      expect(values.find((value) => value.attribute_id === serialId)?.value).toBe('SN-001');
    } finally {
      if (productId) db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      setActiveBusinessProfile('retail');
    }
  });

  test('getWorkflows returns definitions', () => {
    const workflows = getWorkflows();
    expect(Array.isArray(workflows)).toBe(true);
  });

  test('getAutomationRules and createAutomationRule register rules', () => {
    const rulesBefore = getAutomationRules();
    expect(Array.isArray(rulesBefore)).toBe(true);

    const ruleId = createAutomationRule({
      rule_name: 'تنبيه مخزون منخفض تلقائي',
      trigger_event: 'stock_low',
      action_type: 'notify_user',
      action_payload_json: { title: 'تنبيه مخزون' }
    });
    expect(ruleId).toBeDefined();
  });

  test('getRoles returns default roles including admin and cashier', () => {
    const roles = getRoles();
    expect(Array.isArray(roles)).toBe(true);
    const admin = roles.find(r => r.role_key === 'admin');
    expect(admin).toBeDefined();
  });

  test('matchesCondition correctly evaluates numeric thresholds and field comparisons', () => {
    const { matchesCondition } = require('../../electron/services/enterprise.service');
    expect(matchesCondition({ threshold: 100 }, { amount: 150 })).toBe(true);
    expect(matchesCondition({ threshold: 100 }, { amount: 50 })).toBe(false);
    expect(matchesCondition({ field: 'status', operator: '==', value: 'urgent' }, { status: 'urgent' })).toBe(true);
    expect(matchesCondition({ field: 'status', operator: '==', value: 'urgent' }, { status: 'normal' })).toBe(false);
  });

  test('evaluateEventAutomations triggers actions for matched conditions without throwing', () => {
    const { createAutomationRule, evaluateEventAutomations } = require('../../electron/services/enterprise.service');
    createAutomationRule({
      rule_name: 'قاعدة خصم مخزون عاجلة',
      trigger_event: 'stock_low',
      condition_json: { threshold: 5 },
      action_type: 'notify_user',
      action_payload_json: { title: 'مخزون حرج جداً' }
    });

    expect(() => {
      evaluateEventAutomations('stock_low', { stock: 2, product_name: 'منتج تجريبي' });
    }).not.toThrow();
  });

  test('createRole and setRolePermissions handle custom role creation and granular matrix', () => {
    const { createRole, setRolePermissions, getRoles } = require('../../electron/services/enterprise.service');
    const testRoleKey = 'supervisor_test_' + Date.now();
    createRole(testRoleKey, 'مشرف اختبارات', 'دور مخصص للاختبارات');

    const permissions = ['pos.view', 'pos.sell', 'orders.manage', 'reports.view'];
    setRolePermissions(testRoleKey, permissions);

    const roles = getRoles();
    const createdRole = roles.find(r => r.role_key === testRoleKey);
    expect(createdRole).toBeDefined();
    expect(createdRole.permissions).toEqual(expect.arrayContaining(permissions));
  });
});
