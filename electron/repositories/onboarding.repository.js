const { db } = require('../database/db');

/**
 * Onboarding Repository
 * مسؤول عن قوالب الأنشطة الجاهزة وإدارة حالة الإعداد والإنشاء الذاتي لبيانات المتجر (Provisioning)
 */

function getPresets() {
  const rows = db.prepare('SELECT * FROM onboarding_presets ORDER BY id ASC').all();
  return rows.map(parsePresetRow);
}

function getPresetByKey(sectorKey) {
  const row = db.prepare('SELECT * FROM onboarding_presets WHERE sector_key = ?').get(sectorKey);
  return row ? parsePresetRow(row) : null;
}

function parsePresetRow(row) {
  return {
    ...row,
    terminology: safeJsonParse(row.terminology_json, {}),
    enabled_modules: safeJsonParse(row.enabled_modules_json, []),
    default_units: safeJsonParse(row.default_units_json, []),
    starter_working_hours: safeJsonParse(row.starter_working_hours_json, null),
    starter_categories: safeJsonParse(row.starter_categories_json, []),
    starter_addons: safeJsonParse(row.starter_addons_json, []),
    starter_products: safeJsonParse(row.starter_products_json, []),
    starter_stations: safeJsonParse(row.starter_stations_json, []),
  };
}

function safeJsonParse(val, fallback) {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function upsertPreset(preset) {
  const stmt = db.prepare(`
    INSERT INTO onboarding_presets (
      sector_key, sector_name, sector_tagline, icon,
      primary_action_title, primary_action_route,
      terminology_json, enabled_modules_json, default_units_json,
      starter_working_hours_json, starter_categories_json,
      starter_addons_json, starter_products_json, starter_stations_json
    ) VALUES (
      @sector_key, @sector_name, @sector_tagline, @icon,
      @primary_action_title, @primary_action_route,
      @terminology_json, @enabled_modules_json, @default_units_json,
      @starter_working_hours_json, @starter_categories_json,
      @starter_addons_json, @starter_products_json, @starter_stations_json
    )
    ON CONFLICT(sector_key) DO UPDATE SET
      sector_name = excluded.sector_name,
      sector_tagline = excluded.sector_tagline,
      icon = excluded.icon,
      primary_action_title = excluded.primary_action_title,
      primary_action_route = excluded.primary_action_route,
      terminology_json = excluded.terminology_json,
      enabled_modules_json = excluded.enabled_modules_json,
      default_units_json = excluded.default_units_json,
      starter_working_hours_json = excluded.starter_working_hours_json,
      starter_categories_json = excluded.starter_categories_json,
      starter_addons_json = excluded.starter_addons_json,
      starter_products_json = excluded.starter_products_json,
      starter_stations_json = excluded.starter_stations_json
  `);

  stmt.run({
    sector_key: preset.sector_key,
    sector_name: preset.sector_name,
    sector_tagline: preset.sector_tagline || '',
    icon: preset.icon || 'store',
    primary_action_title: preset.primary_action_title,
    primary_action_route: preset.primary_action_route,
    terminology_json: JSON.stringify(preset.terminology || {}),
    enabled_modules_json: JSON.stringify(preset.enabled_modules || []),
    default_units_json: JSON.stringify(preset.default_units || []),
    starter_working_hours_json: JSON.stringify(preset.starter_working_hours || null),
    starter_categories_json: JSON.stringify(preset.starter_categories || []),
    starter_addons_json: JSON.stringify(preset.starter_addons || []),
    starter_products_json: JSON.stringify(preset.starter_products || []),
    starter_stations_json: JSON.stringify(preset.starter_stations || []),
  });
}

function getOnboardingState() {
  const row = db.prepare('SELECT * FROM onboarding_state WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO onboarding_state (id, is_completed, current_step) VALUES (1, 0, 1)').run();
    return {
      id: 1,
      is_completed: 0,
      current_step: 1,
      selected_sector: null,
      custom_sector_name: null,
      setup_summary: {},
      completed_at: null,
    };
  }
  return {
    ...row,
    setup_summary: safeJsonParse(row.setup_summary_json, {}),
  };
}

function updateOnboardingState(data) {
  const stmt = db.prepare(`
    UPDATE onboarding_state SET
      is_completed = COALESCE(@is_completed, is_completed),
      current_step = COALESCE(@current_step, current_step),
      selected_sector = COALESCE(@selected_sector, selected_sector),
      custom_sector_name = COALESCE(@custom_sector_name, custom_sector_name),
      setup_summary_json = COALESCE(@setup_summary_json, setup_summary_json),
      completed_at = COALESCE(@completed_at, completed_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `);

  stmt.run({
    is_completed: data.is_completed !== undefined ? (data.is_completed ? 1 : 0) : null,
    current_step: data.current_step !== undefined ? data.current_step : null,
    selected_sector: data.selected_sector !== undefined ? data.selected_sector : null,
    custom_sector_name: data.custom_sector_name !== undefined ? data.custom_sector_name : null,
    setup_summary_json: data.setup_summary ? JSON.stringify(data.setup_summary) : null,
    completed_at: data.completed_at !== undefined ? data.completed_at : null,
  });

  return getOnboardingState();
}

function activatePreset({ preset, storeName, customSectorName }) {
  const runTx = db.transaction(() => {
    const setting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    setting.run('business_type', preset.sector_key);
    setting.run('onboarding_sector', preset.sector_key);
    if (storeName) setting.run('store_name', storeName.trim());
    setting.run('custom_sector_name', customSectorName || '');

    const profile = db.prepare('SELECT settings_json FROM business_profiles WHERE key = ?').get(preset.sector_key);
    const existingSettings = profile?.settings_json ? JSON.parse(profile.settings_json) : {};
    const baselineModules = preset.sector_key === 'crm'
      ? ['settings', 'enterprise', 'users']
      : ['pos', 'settings', 'enterprise', 'returns', 'shifts', 'users'];
    const moduleKeys = [...new Set([
      ...baselineModules,
      ...(preset.enabled_modules || []),
    ])];
    const terms = preset.terminology || {};
    const settings = {
      ...existingSettings,
      terms,
      default_units: preset.default_units || [],
      enabled_modules: moduleKeys,
      term_order: terms.order,
      term_customer: terms.customer,
    };

    db.prepare('UPDATE business_profiles SET is_active = 0').run();
    db.prepare(`
      INSERT INTO business_profiles (key, name, is_active, settings_json)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        name = excluded.name,
        is_active = 1,
        settings_json = excluded.settings_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      preset.sector_key,
      customSectorName || preset.sector_name,
      JSON.stringify(settings)
    );

    const enabledSet = new Set(moduleKeys);
    const updateModule = db.prepare(
      'UPDATE system_modules SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?'
    );
    for (const module of db.prepare('SELECT key FROM system_modules').all()) {
      updateModule.run(enabledSet.has(module.key) ? 1 : 0, module.key);
    }

    updateOnboardingState({
      is_completed: 1,
      current_step: 4,
      selected_sector: preset.sector_key,
      custom_sector_name: customSectorName || '',
      completed_at: new Date().toISOString(),
    });
  });

  runTx();
  return {
    sector_key: preset.sector_key,
    sector_name: customSectorName || preset.sector_name,
    terminology: preset.terminology || {},
    default_units: preset.default_units || [],
  };
}

/**
 * دالة الإنشاء الفوري والتلقائي لبيانات النشاط بالكامل (Provisioning)
 * تُنفذ كعملية ذرية واحدة (Transaction) لضمان سلامة قاعدة البيانات
 */
function provisionSectorData({
  sectorKey,
  storeName,
  storeLogo,
  storePhone,
  storeAddress,
  categories = [],
  products = [],
  addons = [],
  stations = [],
  workingHours = null,
  terminology = {},
  customSectorName = null,
  userId = null,
  username = 'admin',
}) {
  const runTx = db.transaction(() => {
    // 1. تحديث جدول الإعدادات العامة settings
    const saveSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    if (storeName) saveSetting.run('store_name', String(storeName).trim());
    if (storeLogo) saveSetting.run('store_logo', String(storeLogo));
    if (storePhone) saveSetting.run('store_phone', String(storePhone).trim());
    if (storeAddress) saveSetting.run('store_address', String(storeAddress).trim());
    saveSetting.run('business_type', sectorKey);
    saveSetting.run('onboarding_completed', '1');
    saveSetting.run('onboarding_sector', sectorKey);
    if (customSectorName) saveSetting.run('custom_sector_name', customSectorName);

    // حفظ مواعيد العمل والإضافات ومحطات التحضير في الإعدادات
    if (workingHours) {
      saveSetting.run('working_hours', typeof workingHours === 'string' ? workingHours : JSON.stringify(workingHours));
    }
    if (Array.isArray(addons) && addons.length > 0) {
      saveSetting.run('sector_addons', JSON.stringify(addons));
    }
    if (Array.isArray(stations) && stations.length > 0) {
      saveSetting.run('kitchen_stations', JSON.stringify(stations));
    }

    // 2. تفعيل القالب التجاري والموديولات
    const preset = getPresetByKey(sectorKey);
    if (preset) {
      // تنشيط القالب التجاري
      db.prepare('UPDATE business_profiles SET is_active = 0').run();
      const profileExists = db.prepare('SELECT key FROM business_profiles WHERE key = ?').get(sectorKey);
      if (profileExists) {
        db.prepare('UPDATE business_profiles SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(sectorKey);
      } else {
        db.prepare(`
          INSERT INTO business_profiles (key, name, is_active, settings_json)
          VALUES (?, ?, 1, ?)
        `).run(sectorKey, preset.sector_name, JSON.stringify({
          term_order: terminology?.order || preset.terminology?.order || 'طلب',
          term_customer: terminology?.customer || preset.terminology?.customer || 'عميل',
          enabled_modules: preset.enabled_modules,
        }));
      }

      // تفعيل الموديولات الخاصة بالنشاط
      if (Array.isArray(preset.enabled_modules) && preset.enabled_modules.length > 0) {
        const enabledModules = preset.sector_key === 'crm'
          ? [...new Set(['crm', 'reports', 'settings', 'users', 'enterprise'])]
          : preset.enabled_modules;
        const enabledSet = new Set(enabledModules);
        const updateModule = db.prepare('UPDATE system_modules SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
        for (const mod of db.prepare('SELECT key FROM system_modules').all()) {
          updateModule.run(enabledSet.has(mod.key) ? 1 : 0, mod.key);
        }
      }
    }

    // 3. تحديد الفرع والمخزن الافتراضي لإيداع البضاعة
    let branch = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
    if (!branch) {
      const res = db.prepare('INSERT INTO branches (name) VALUES (?)').run(storeName || 'الفرع الرئيسي');
      branch = { id: res.lastInsertRowid };
    }

    let warehouse = db.prepare('SELECT id FROM warehouses WHERE branch_id = ? AND is_default = 1 ORDER BY id LIMIT 1').get(branch.id);
    if (!warehouse) {
      const res = db.prepare('INSERT INTO warehouses (branch_id, name, is_default) VALUES (?, ?, 1)').run(branch.id, 'المستودع الرئيسي');
      warehouse = { id: res.lastInsertRowid };
    }

    // 4. إنشاء الأقسام (Categories)
    const categoryMap = new Map(); // name -> id
    const existingCats = db.prepare('SELECT id, name FROM categories').all();
    for (const cat of existingCats) {
      categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
    }

    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const finalCategories = categories.length > 0 ? categories : (preset?.starter_categories || []);

    for (const cat of finalCategories) {
      const catName = typeof cat === 'string' ? cat.trim() : cat.name?.trim();
      if (!catName) continue;
      const key = catName.toLowerCase();
      if (!categoryMap.has(key)) {
        const res = insertCat.run(catName);
        categoryMap.set(key, res.lastInsertRowid);
      }
    }

    // 5. إنشاء المنتجات والمتغيرات والأرصدة
    const finalProducts = products.length > 0 ? products : (preset?.starter_products || []);
    const insertProduct = db.prepare(`
      INSERT INTO products (name, description, category_id, image_path, is_service)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertVariant = db.prepare(`
      INSERT INTO product_variants (
        product_id, size, color, sku, barcode, purchase_price, selling_price, stock_quantity, low_stock_threshold
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStock = db.prepare(`
      INSERT OR REPLACE INTO warehouse_stock (warehouse_id, variant_id, quantity, reorder_level)
      VALUES (?, ?, ?, ?)
    `);

    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements (
        warehouse_id, variant_id, movement_type, quantity_change, quantity_after, notes
      ) VALUES (?, ?, 'opening', ?, ?, 'رصيد افتتاحي لمعالج التهيئة الأولى')
    `);

    let createdProductsCount = 0;
    const timestampCode = Date.now().toString().slice(-6);

    for (let i = 0; i < finalProducts.length; i++) {
      const p = finalProducts[i];
      if (!p.name) continue;

      const catId = p.category_name && categoryMap.has(p.category_name.trim().toLowerCase())
        ? categoryMap.get(p.category_name.trim().toLowerCase())
        : (categoryMap.values().next().value || null);

      const prodRes = insertProduct.run(
        p.name.trim(),
        p.description || '',
        catId,
        p.image_path || null,
        p.is_service ? 1 : 0
      );
      const productId = prodRes.lastInsertRowid;
      createdProductsCount++;

      // معالجة المتغيرات (Variants) أو متغير أساسي واحد
      const variantsList = Array.isArray(p.variants) && p.variants.length > 0
        ? p.variants
        : [{
            size: p.size || null,
            color: p.color || null,
            purchase_price: Number(p.purchase_price) || 0,
            selling_price: Number(p.selling_price) || 0,
            stock_quantity: p.is_service ? 0 : Number(p.stock_quantity ?? 10),
            low_stock_threshold: p.is_service ? 0 : Number(p.low_stock_threshold ?? 3),
            sku: p.sku || `SKU-${timestampCode}-${i + 1}`,
            barcode: p.is_service ? null : (p.barcode || `200${timestampCode}${String(i + 1).padStart(3, '0')}`),
          }];

      for (let vIdx = 0; vIdx < variantsList.length; vIdx++) {
        const v = variantsList[vIdx];
        const sku = v.sku || `SKU-${timestampCode}-${i + 1}-${vIdx + 1}`;
        const isService = p.is_service || v.is_service;
        const barcode = isService ? null : (v.barcode || `200${timestampCode}${String(i + 1).padStart(2, '0')}${vIdx + 1}`);
        const purchasePrice = Number(v.purchase_price) || Number(p.purchase_price) || 0;
        const sellingPrice = Number(v.selling_price) || Number(p.selling_price) || 0;
        const stockQty = isService ? 0 : (Number(v.stock_quantity) >= 0 ? Number(v.stock_quantity) : 10);
        const minStock = isService ? 0 : Number(v.low_stock_threshold ?? 3);

        const vRes = insertVariant.run(
          productId,
          v.size || null,
          v.color || null,
          sku,
          barcode,
          purchasePrice,
          sellingPrice,
          stockQty,
          minStock
        );
        const variantId = vRes.lastInsertRowid;

        insertStock.run(warehouse.id, variantId, stockQty, minStock);
        if (stockQty > 0) {
          insertMovement.run(warehouse.id, variantId, stockQty, stockQty);
        }
      }
    }

    // 6. إنشاء باقات الاشتراكات إذا كان النشاط صالة رياضية أو اشتراكات
    if (sectorKey === 'subscriptions_gym') {
      try {
        const hasSubTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subscription_plans'").get();
        if (hasSubTable) {
          const insertPlan = db.prepare(`
            INSERT OR IGNORE INTO subscription_plans (name, price, duration_days, session_count, freeze_limit_days, description)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          insertPlan.run('عضوية شهرية لياقة', 450, 30, 0, 7, 'دخول مفتوح لصالة اللياقة البدنية والحديد');
          insertPlan.run('باقة 3 شهور بريميوم', 1100, 90, 0, 15, 'شامل اللياقة والساونا وجاكوزي');
          insertPlan.run('باقة 12 حصة تدريب خاص PT', 1500, 45, 12, 10, 'مع كابتن خاص ومتابعة قياسات');
        }
      } catch {}
    }

    // 7. تسجيل سجل تدقيق أمني (Audit Log)
    try {
      const hasAuditTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cashier_audit_logs'").get();
      if (hasAuditTable) {
        db.prepare(`
          INSERT INTO cashier_audit_logs (user_id, username, action_type, title, details, amount, severity)
          VALUES (?, ?, 'onboarding_provision', 'تهيئة وإطلاق النشاط التجاري', ?, 0, 'success')
        `).run(
          userId || null,
          username || 'admin',
          `تم إطلاق النشاط بنجاح: ${storeName} (${sectorKey}) بـ ${categoryMap.size} أقسام و ${createdProductsCount} صنفاً`
        );
      }
    } catch {}

    // 8. إرسال إشعار ترحيبي
    try {
      db.prepare(`
        INSERT INTO notifications (type, title, message, link_page)
        VALUES ('success', '🎉 أهلاً بك في FOX.CLOUD! تم تجهيز نشاطك بنجاح', ?, ?)
      `).run(
        `تم إعداد ${categoryMap.size} أقسام و ${createdProductsCount} صنفاً جاهزاً للبدء فوراً.`,
        preset?.primary_action_route || 'pos'
      );
    } catch {}

    // 9. تحديث حالة الـ Onboarding إلى منجز (Completed)
    const summary = {
      sector_key: sectorKey,
      sector_name: preset?.sector_name || sectorKey,
      store_name: storeName,
      categories_count: categoryMap.size,
      products_count: createdProductsCount,
      addons_count: Array.isArray(addons) ? addons.length : 0,
      stations_count: Array.isArray(stations) ? stations.length : 0,
      primary_action_title: preset?.primary_action_title || 'استقبل أول طلب',
      primary_action_route: preset?.primary_action_route || 'pos',
    };

    updateOnboardingState({
      is_completed: 1,
      current_step: 4,
      selected_sector: sectorKey,
      custom_sector_name: customSectorName,
      setup_summary: summary,
      completed_at: new Date().toISOString(),
    });

    return summary;
  });

  return runTx();
}

module.exports = {
  getPresets,
  getPresetByKey,
  upsertPreset,
  getOnboardingState,
  updateOnboardingState,
  activatePreset,
  provisionSectorData,
};
