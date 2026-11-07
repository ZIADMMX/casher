const { db, initDatabase, migrateCRMTables } = require('../../electron/database/db');
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
  createWorkflow,
  deleteWorkflow,
  addWorkflowStatus,
  saveWorkflowTransitions,
  createWorkflowTicket,
  updateTicketStatus,
  getAutomationRules,
  createAutomationRule,
  seedEnterpriseDefaults,
  getRoles
} = require('../../electron/services/enterprise.service');

seedEnterpriseDefaults();

describe('Enterprise Framework Service Unit Tests', () => {
  test('seeds defaults after the database schema is initialized', () => {
    expect(getModules().length).toBeGreaterThan(0);
    expect(getActiveBusinessProfile()?.key).toBeDefined();
  });

  test('reenables the team module for an existing active business profile', () => {
    setActiveBusinessProfile('retail');
    setModuleEnabled('users', false);

    seedEnterpriseDefaults();

    expect(getActiveBusinessProfile()?.key).toBe('retail');
    expect(getModules().find((module) => module.key === 'users')?.is_enabled).toBe(1);
  });

  test('CRM migration restores last_interaction_at on older customer schemas', () => {
    db.exec('ALTER TABLE customers DROP COLUMN last_interaction_at');

    expect(() => migrateCRMTables()).not.toThrow();
    expect(
      db.prepare('PRAGMA table_info(customers)').all()
        .some((column) => column.name === 'last_interaction_at')
    ).toBe(true);
  });

  test('getModules and setModuleEnabled toggle system modules', () => {
    const modules = getModules();
    expect(Array.isArray(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(0);

    const updated = setModuleEnabled('commissions', false);
    expect(Array.isArray(updated)).toBe(true);
    setModuleEnabled('commissions', true);
  });

  test('smoke: creates a workflow', () => {
    const workflow = createWorkflow({
      name: 'Smoke workflow creation',
      entity_type: 'custom',
      description: 'Workflow smoke test',
    });

    try {
      expect(workflow.id).toBeDefined();
      expect(getWorkflows().some((item) => item.id === workflow.id)).toBe(true);
    } finally {
      deleteWorkflow(workflow.id);
    }
  });

  test('smoke: adds and reads three workflow statuses', () => {
    const workflow = createWorkflow({ name: 'Smoke status setup', entity_type: 'custom' });
    const statusKeys = ['received', 'processing', 'completed'];

    try {
      statusKeys.forEach((statusKey, index) => {
        addWorkflowStatus(workflow.id, {
          status_key: statusKey,
          status_label: `Status ${index + 1}`,
          step_order: index + 1,
          is_initial: index === 0,
          is_final: index === statusKeys.length - 1,
        });
      });

      const savedWorkflow = getWorkflows().find((item) => item.id === workflow.id);
      expect(savedWorkflow.statuses.map((status) => status.status_key)).toEqual(statusKeys);
    } finally {
      deleteWorkflow(workflow.id);
    }
  });

  test('smoke: creates a ticket and moves it through workflow stages', () => {
    const workflow = createWorkflow({ name: 'Smoke ticket lifecycle', entity_type: 'custom' });

    try {
      ['received', 'processing', 'completed'].forEach((statusKey, index) => {
        addWorkflowStatus(workflow.id, {
          status_key: statusKey,
          status_label: statusKey,
          step_order: index + 1,
          is_initial: index === 0,
          is_final: index === 2,
        });
      });
      saveWorkflowTransitions(workflow.id, [
        { from_status_key: 'received', to_status_key: 'processing', allowed_roles_json: ['manager'] },
        { from_status_key: 'processing', to_status_key: 'completed', allowed_roles_json: ['manager'] },
      ]);

      const ticket = createWorkflowTicket({
        workflow_id: workflow.id,
        entity_type: 'custom',
        title: 'Smoke ticket',
        current_status_key: 'received',
      });

      expect(updateTicketStatus(ticket.id, workflow.id, 'processing', 'manager').current_status_key)
        .toBe('processing');
      expect(updateTicketStatus(ticket.id, workflow.id, 'completed', 'manager').current_status_key)
        .toBe('completed');
    } finally {
      deleteWorkflow(workflow.id);
    }
  });

  test('ticket moves require a valid configured transition and an allowed role', () => {
    const workflow = createWorkflow({ name: 'Ticket move validation test', entity_type: 'custom' });
    let ticket;

    try {
      addWorkflowStatus(workflow.id, { status_key: 'queued', status_label: 'Queued', is_initial: 1 });
      addWorkflowStatus(workflow.id, { status_key: 'approved', status_label: 'Approved' });
      addWorkflowStatus(workflow.id, { status_key: 'rejected', status_label: 'Rejected' });
      saveWorkflowTransitions(workflow.id, [{
        from_status_key: 'queued',
        to_status_key: 'approved',
        allowed_roles_json: ['manager'],
      }]);
      ticket = createWorkflowTicket({
        workflow_id: workflow.id,
        entity_type: 'custom',
        title: 'Ticket move test',
        current_status_key: 'queued',
      });

      expect(() => updateTicketStatus(ticket.id, workflow.id, 'approved', 'cashier'))
        .toThrow('غير مصرح له');
      expect(() => updateTicketStatus(ticket.id, workflow.id, 'missing', 'manager'))
        .toThrow('غير موجودة');
      expect(() => updateTicketStatus(ticket.id, workflow.id, 'rejected', 'manager'))
        .toThrow('لا توجد صلاحية انتقال');

      expect(updateTicketStatus(ticket.id, workflow.id, 'approved', 'manager').current_status_key)
        .toBe('approved');
    } finally {
      deleteWorkflow(workflow.id);
    }
  });

  test('workflow transitions reject unknown statuses, self moves, and duplicate edges', () => {
    const workflow = createWorkflow({ name: 'Transition validation test', entity_type: 'custom' });

    try {
      addWorkflowStatus(workflow.id, { status_key: 'open', status_label: 'Open' });
      addWorkflowStatus(workflow.id, { status_key: 'closed', status_label: 'Closed' });

      expect(() => saveWorkflowTransitions(workflow.id, [{
        from_status_key: 'missing',
        to_status_key: 'closed',
        allowed_roles_json: ['manager'],
      }])).toThrow('غير موجودة');

      expect(() => saveWorkflowTransitions(workflow.id, [{
        from_status_key: 'open',
        to_status_key: 'open',
        allowed_roles_json: ['manager'],
      }])).toThrow('نفسها');

      expect(() => saveWorkflowTransitions(workflow.id, [
        { from_status_key: 'open', to_status_key: 'closed', allowed_roles_json: ['manager'] },
        { from_status_key: 'open', to_status_key: 'closed', allowed_roles_json: ['admin'] },
      ])).toThrow('تكرار');
    } finally {
      deleteWorkflow(workflow.id);
    }
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
    expect(moduleStates.get('crm')).toBe(1);
    expect(moduleStates.get('customers')).toBe(0);
    expect(moduleStates.get('returns')).toBe(1);
    expect(moduleStates.get('shifts')).toBe(1);
    expect(configuration.settings.terms.order).toBe('طلب توريد / صيانة');
    expect(attributeKeys).toContain('serial_number');
    expect(attributeKeys).not.toContain('size');

    setActiveBusinessProfile('retail');
  });

  test('CRM business profile enables CRM without point-of-sale or inventory modules', () => {
    try {
      const active = setActiveBusinessProfile('crm');
      expect(active.key).toBe('crm');

      const moduleStates = new Map(
        getActiveBusinessConfiguration().modules.map((module) => [module.key, module.is_enabled])
      );
      expect(moduleStates.get('crm')).toBe(1);
      expect(moduleStates.get('reports')).toBe(1);
      expect(moduleStates.get('pos')).toBe(0);
      expect(moduleStates.get('inventory')).toBe(0);
      expect(moduleStates.get('subscriptions')).toBe(0);
    } finally {
      setActiveBusinessProfile('retail');
    }
  });

  test('business profiles enable only their configured feature modules plus shared operations', () => {
    const sharedModules = ['pos', 'settings', 'enterprise', 'returns', 'shifts', 'users'];
    const readModuleStates = () => new Map(
      getActiveBusinessConfiguration().modules.map((module) => [module.key, module.is_enabled])
    );

    try {
      setActiveBusinessProfile('retail');
      let states = readModuleStates();
      expect(states.get('subscriptions')).toBe(0);

      setActiveBusinessProfile('grocery');
      states = readModuleStates();
      expect(states.get('inventory')).toBe(1);
      expect(states.get('purchases')).toBe(1);
      expect(states.get('crm')).toBe(0);
      expect(states.get('subscriptions')).toBe(0);
      expect(states.get('commissions')).toBe(0);
      sharedModules.forEach((moduleKey) => expect(states.get(moduleKey)).toBe(1));

      setActiveBusinessProfile('subscriptions_gym');
      states = readModuleStates();
      expect(states.get('subscriptions')).toBe(1);
      expect(states.get('crm')).toBe(1);
      expect(states.get('inventory')).toBe(0);
      expect(states.has('orders')).toBe(false);
      sharedModules.forEach((moduleKey) => expect(states.get(moduleKey)).toBe(1));

      setActiveBusinessProfile('maintenance');
      states = readModuleStates();
      expect(states.get('crm')).toBe(1);
      expect(states.get('purchases')).toBe(0);
      expect(states.get('subscriptions')).toBe(0);

      setActiveBusinessProfile('auto_workshop');
      const autoWorkshop = getActiveBusinessConfiguration();
      states = new Map(autoWorkshop.modules.map((module) => [module.key, module.is_enabled]));
      const autoAttributes = autoWorkshop.attributes.map((attribute) => attribute.attribute_key);
      expect(states.get('inventory')).toBe(1);
      expect(autoAttributes).toEqual(expect.arrayContaining([
        'car_make',
        'car_model',
        'year',
        'vehicle_plate',
        'odometer',
        'fault_description',
      ]));
    } finally {
      setActiveBusinessProfile('retail');
    }
  });

  test('getAttributeDefinitions and createAttributeDefinition handle custom attributes', () => {
    const defs = getAttributeDefinitions();
    expect(Array.isArray(defs)).toBe(true);

    const attrKey = 'test_year_' + Date.now();
    let attrId;
    try {
      attrId = createAttributeDefinition({
        attribute_name: 'سنة الصنع الاختبارية',
        attribute_key: attrKey,
        data_type: 'number'
      });
      expect(attrId).toBeDefined();

      expect(() => createAttributeDefinition({ attribute_name: '' })).toThrow('مطلوبان');
    } finally {
      if (attrId) {
        db.prepare('DELETE FROM product_attribute_definitions WHERE id = ?').run(attrId);
      }
    }
  });

  test('the cafe profile adds no preset product fields (no milk type or sugar level)', () => {
    try {
      setActiveBusinessProfile('cafe_restaurant');
      const keys = getAttributeDefinitions().map((attribute) => attribute.attribute_key);
      expect(keys).not.toEqual(expect.arrayContaining(['milk_type']));
      expect(keys).not.toContain('sweetness_level');
      expect(keys).not.toContain('car_make');
    } finally {
      setActiveBusinessProfile('retail');
    }
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
      if (productId) db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(productId);
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

    let ruleId;
    try {
      ruleId = createAutomationRule({
        rule_name: 'تنبيه مخزون منخفض تلقائي',
        trigger_event: 'stock_low',
        action_type: 'notify_user',
        action_payload_json: { title: 'تنبيه مخزون' }
      });
      expect(ruleId).toBeDefined();
    } finally {
      if (ruleId) {
        db.prepare('DELETE FROM automation_rules WHERE id = ?').run(ruleId);
      }
    }
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
    let ruleId;
    try {
      ruleId = createAutomationRule({
        rule_name: 'قاعدة خصم مخزون عاجلة',
        trigger_event: 'stock_low',
        condition_json: { threshold: 5 },
        action_type: 'notify_user',
        action_payload_json: { title: 'مخزون حرج جداً' }
      });

      expect(() => {
        evaluateEventAutomations('stock_low', { stock: 2, product_name: 'منتج تجريبي' });
      }).not.toThrow();
    } finally {
      if (ruleId) {
        db.prepare('DELETE FROM automation_rules WHERE id = ?').run(ruleId);
      }
    }
  });

  test('createRole and setRolePermissions handle custom role creation and granular matrix', () => {
    const { createRole, setRolePermissions, getRoles } = require('../../electron/services/enterprise.service');
    const testRoleKey = 'supervisor_test_' + Date.now();
    // setRolePermissions checks who is granting; act as the main admin.
    const requireAuthSpy = jest.spyOn(require('../../electron/services/auth.service'), 'requireAuth')
      .mockReturnValue({ id: 1 });
    const getByIdSpy = jest.spyOn(require('../../electron/repositories/users.repository'), 'getById')
      .mockReturnValue({ id: 1, role: 'admin', system_role_key: null });
    try {
      createRole(testRoleKey, 'مشرف اختبارات', 'دور مخصص للاختبارات');

      const permissions = ['pos.view', 'pos.sell', 'customers.view', 'reports.view'];
      setRolePermissions(testRoleKey, permissions);

      const roles = getRoles();
      const createdRole = roles.find(r => r.role_key === testRoleKey);
      expect(createdRole).toBeDefined();
      expect(createdRole.permissions).toEqual(expect.arrayContaining(permissions));
    } finally {
      requireAuthSpy.mockRestore();
      getByIdSpy.mockRestore();
      db.prepare('DELETE FROM system_roles WHERE role_key = ?').run(testRoleKey);
      db.prepare('DELETE FROM role_permissions WHERE role_key = ?').run(testRoleKey);
    }
  });
});
