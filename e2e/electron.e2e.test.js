const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { _electron: electron } = require('playwright');

const appDirectory = path.resolve(__dirname, '..');

function launchWithUserData(userDataPath) {
  return electron.launch({
    args: [appDirectory],
    env: {
      ...process.env,
      FOX_E2E_USER_DATA_DIR: userDataPath,
      KASHIEAR_LICENSE_SECRET: 'e2e-test-license-secret',
      SESSION_SECRET: 'e2e-test-session-secret',
    },
    timeout: 60_000,
  });
}

async function registerAttendance(page) {
  await page.getByRole('button', { name: 'تسجيل الحضور' }).click();
  await page.getByRole('button', { name: 'تسجيل الانصراف' }).waitFor({ state: 'visible' });
}

async function dismissPageTutorial(page) {
  const tutorial = page.getByRole('dialog', { name: 'جولة سريعة' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: 'إغلاق' }).click();
  }
}

test('grocery inventory uses grocery labels and product icons', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-grocery-'));
  let electronApp;
  const pageErrors = [];

  try {
    electronApp = await launchWithUserData(isolatedAppData);
    let page = await electronApp.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.locator('#business-name').waitFor({ state: 'visible' });

    await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'grocery-admin',
        password: 'secure-password',
      });
      await window.electronAPI.login({
        username: 'grocery-admin',
        password: 'secure-password',
      });

      const result = await window.electronAPI.provisionOnboarding({
        sectorKey: 'grocery',
        storeName: 'متجر اختبار البقالة',
      });
      if (!result?.success) {
        throw new Error(result?.message || 'تعذر إعداد نشاط البقالة للاختبار');
      }
    });

    await page.reload();
    await page.getByRole('button', { name: 'المنتجات والمخزون' }).waitFor({ state: 'visible' });
    const tutorialCloseButton = page.getByRole('dialog', { name: 'جولة سريعة' }).getByRole('button', { name: 'إغلاق' });
    if (await tutorialCloseButton.isVisible()) {
      await tutorialCloseButton.click();
    }
    await page.getByRole('button', { name: 'المنتجات والمخزون' }).click();
    await page.getByRole('heading', { name: /إدارة .* والمخزون/ }).waitFor({ state: 'visible' });
    await dismissPageTutorial(page);

    const milkCard = page.locator('.fox-product-card').filter({ hasText: 'حليب كامل الدسم 1 لتر' });
    await milkCard.waitFor({ state: 'visible' });
    await milkCard.locator('.prod-placeholder-icon').getByText('🥛').waitFor({ state: 'visible' });
    const cardText = await milkCard.innerText();
    assert.match(cardText, /الوحدات والعبوات \(1\)/);
    assert.match(cardText, /إدارة الوحدات والعبوات والأسعار \(1\)/);
    assert.match(cardText, /50 وحدة/);
    assert.doesNotMatch(cardText, /المقاسات والألوان|إدارة المقاسات/);
    assert.deepEqual(pageErrors, [], `Unexpected renderer errors: ${pageErrors.join('; ')}`);
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('first launch displays setup and rejects mismatched passwords', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-'));
  let electronApp;

  try {
    electronApp = await launchWithUserData(isolatedAppData);

    const page = await electronApp.firstWindow();
    await page.locator('#business-name').waitFor({ state: 'visible' });

    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(
      path.resolve(userDataPath),
      path.resolve(isolatedAppData),
      'Electron must use the isolated E2E directory as its user data path'
    );

    await page.locator('#business-name').fill('متجر الاختبار');
    await page.locator('#owner-name').fill('مسؤول الاختبار');
    await page.locator('#admin-username').fill('e2e-admin');
    await page.locator('#admin-password').fill('secure-password');
    await page.locator('#admin-confirm-password').fill('different-password');
    await page.getByRole('button', { name: /Launch Business/ }).click();

    await page.getByText('كلمة المرور وتأكيدها غير متطابقين').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#business-name').inputValue(), 'متجر الاختبار');
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('login rejects invalid credentials and opens the app for valid credentials', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-login-'));
  let electronApp;

  try {
    electronApp = await launchWithUserData(isolatedAppData);

    let page = await electronApp.firstWindow();
    await page.locator('#business-name').waitFor({ state: 'visible' });

    await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'e2e-admin',
        password: 'secure-password',
      });
      await window.electronAPI.logout();
    });
    await page.reload();
    await page.locator('#login-username').waitFor({ state: 'visible' });

    await page.locator('#login-username').fill('e2e-admin');
    await page.locator('#login-password').fill('wrong-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.getByText('اسم المستخدم أو كلمة المرور غير صحيحة').waitFor({ state: 'visible' });

    await page.locator('#login-password').fill('secure-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.locator('#login-username').waitFor({ state: 'hidden' });
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('cashier completes a cash sale from the POS screen', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-sale-'));
  let electronApp;
  let variantId;

  try {
    electronApp = await launchWithUserData(isolatedAppData);

    const page = await electronApp.firstWindow();
    await page.locator('#business-name').waitFor({ state: 'visible' });

    variantId = await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'e2e-admin',
        password: 'secure-password',
      });
      const product = await window.electronAPI.addProductWithVariant({
        name: 'منتج اختبار البيع النقدي',
        categoryName: 'اختبار',
        size: 'واحد',
        purchasePrice: 50,
        sellingPrice: 125,
        stockQuantity: 5,
      });
      await window.electronAPI.logout();
      return product.variantId;
    });

    await page.reload();
    await page.locator('#login-username').waitFor({ state: 'visible' });
    await page.locator('#login-username').fill('e2e-admin');
    await page.locator('#login-password').fill('secure-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.locator('#barcode-search-input').waitFor({ state: 'visible' });

    await page.evaluate(async () => {
      window.print = () => {};
      await window.electronAPI.saveSettings({ thermal_printer_name: '__E2E_NO_PRINTER__' });
    });

    await page.getByRole('button', { name: 'تخطي' }).click();
    await registerAttendance(page);
    await page.getByRole('button', { name: /فتح وردية/ }).click();
    await page.getByRole('heading', { name: /استلام الدرج وبدء وردية جديدة/ }).waitFor({ state: 'visible' });
    await page.getByPlaceholder('500').fill('300');
    await page.getByRole('button', { name: /تأكيد استلام الدرج وبدء الوردية/ }).click();
    await page.locator('.shift-pos-pill.active').waitFor({ state: 'visible' });

    const productCard = page.locator('.pos-product-card').filter({ hasText: 'منتج اختبار البيع النقدي' });
    await page.locator('#barcode-search-input').fill('منتج اختبار البيع النقدي');
    await productCard.waitFor({ state: 'visible' });
    await productCard.getByRole('button', { name: /إضافة/ }).click();
    await page.getByPlaceholder('0.00').fill('125');
    await page.getByRole('button', { name: /إتمام عملية البيع وطباعة الفاتورة/ }).click();
    await page.locator('.pos-cart-item-card').waitFor({ state: 'detached' });

    const receiptText = await page.locator('.receipt-print').textContent();
    assert.match(receiptText, /منتج اختبار البيع النقدي/);
    assert.match(receiptText, /نقدي \(كاش\)/);

    const checkoutAttendanceButton = page.getByRole('button', { name: 'أغلق الوردية للانصراف' });
    await checkoutAttendanceButton.waitFor({ state: 'visible' });
    assert.equal(await checkoutAttendanceButton.isDisabled(), true);
    await page.locator('[title="إغلاق الوردية وإصدار Z-Report"]').click();
    await page.getByRole('heading', { name: /تقفيل الوردية وإصدار تقرير/ }).waitFor({ state: 'visible' });
    await page.getByPlaceholder('المبلغ الفعلي...').fill('425');
    await page.getByRole('button', { name: /تأكيد تقفيل الوردية وإصدار Z-Report/ }).click();
    await page.locator('.shift-pos-pill.active').waitFor({ state: 'detached' });
    const shiftReport = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /تقرير التقفيل النهائي/ }) });
    await shiftReport.getByRole('button', { name: 'إغلاق' }).click();

    await page.getByRole('button', { name: 'تسجيل الانصراف' }).click();
    await page.getByRole('button', { name: 'اكتمل حضور اليوم' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /فتح وردية/ }).click();
    await page.getByRole('heading', { name: /استلام الدرج وبدء وردية جديدة/ }).waitFor({ state: 'visible' });
    await page.getByPlaceholder('500').fill('300');
    await page.getByRole('button', { name: /تأكيد استلام الدرج وبدء الوردية/ }).click();
    const shiftOpenError = page.locator('.modal-box .form-error-banner');
    await shiftOpenError.waitFor({ state: 'visible' });
    assert.match(await shiftOpenError.textContent(), /سجّل حضورك أولاً/);

    await electronApp.close();
    electronApp = null;

    const database = new Database(path.join(isolatedAppData, 'shop.db'), { readonly: true });
    try {
      const sale = database.prepare(
        'SELECT id, total_amount, payment_method FROM sales ORDER BY id DESC LIMIT 1'
      ).get();
      assert.ok(sale, 'The cashier flow must persist a sale');
      assert.equal(sale.total_amount, 125);
      assert.equal(sale.payment_method, 'cash');

      const saleItem = database.prepare(
        'SELECT quantity, variant_id FROM sale_items WHERE sale_id = ?'
      ).get(sale.id);
      assert.equal(saleItem?.quantity, 1);
      assert.equal(saleItem?.variant_id, variantId);

      const variant = database.prepare(
        'SELECT stock_quantity FROM product_variants WHERE id = ?'
      ).get(variantId);
      assert.equal(variant?.stock_quantity, 4);

      const shift = database.prepare(
        'SELECT status, actual_cash, attendance_record_id FROM shifts ORDER BY id DESC LIMIT 1'
      ).get();
      assert.equal(shift?.status, 'closed');
      assert.equal(shift?.actual_cash, 425);
      assert.ok(shift?.attendance_record_id);
      const attendance = database.prepare(
        'SELECT check_in, check_out FROM attendance_records WHERE id = ?'
      ).get(shift.attendance_record_id);
      assert.ok(attendance?.check_in);
      assert.ok(attendance?.check_out);
    } finally {
      database.close();
    }
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('cashier cannot complete a cash sale when payment is below the total', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-underpayment-'));
  let electronApp;
  let variantId;

  try {
    electronApp = await launchWithUserData(isolatedAppData);

    const page = await electronApp.firstWindow();
    await page.locator('#business-name').waitFor({ state: 'visible' });

    variantId = await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'e2e-admin',
        password: 'secure-password',
      });
      const product = await window.electronAPI.addProductWithVariant({
        name: 'منتج اختبار البيع النقدي',
        categoryName: 'اختبار',
        size: 'واحد',
        purchasePrice: 50,
        sellingPrice: 125,
        stockQuantity: 5,
      });
      await window.electronAPI.logout();
      return product.variantId;
    });

    await page.reload();
    await page.locator('#login-username').waitFor({ state: 'visible' });
    await page.locator('#login-username').fill('e2e-admin');
    await page.locator('#login-password').fill('secure-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.locator('#barcode-search-input').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'تخطي' }).click();

    await registerAttendance(page);
    await page.getByRole('button', { name: /فتح وردية/ }).click();
    await page.getByRole('heading', { name: /استلام الدرج وبدء وردية جديدة/ }).waitFor({ state: 'visible' });
    await page.getByPlaceholder('500').fill('300');
    await page.getByRole('button', { name: /تأكيد استلام الدرج وبدء الوردية/ }).click();
    await page.locator('.shift-pos-pill.active').waitFor({ state: 'visible' });

    const productCard = page.locator('.pos-product-card').filter({ hasText: 'منتج اختبار البيع النقدي' });
    await page.locator('#barcode-search-input').fill('منتج اختبار البيع النقدي');
    await productCard.waitFor({ state: 'visible' });
    await productCard.getByRole('button', { name: /إضافة/ }).click();
    await page.getByPlaceholder('0.00').fill('124');

    const completeSaleButton = page.getByRole('button', { name: /إتمام عملية البيع وطباعة الفاتورة/ });
    assert.equal(await completeSaleButton.isDisabled(), true);

    await electronApp.close();
    electronApp = null;

    const database = new Database(path.join(isolatedAppData, 'shop.db'), { readonly: true });
    try {
      const saleCount = database.prepare('SELECT COUNT(*) AS count FROM sales').get().count;
      assert.equal(saleCount, 0, 'An underpaid sale must not be persisted');

      const variant = database.prepare(
        'SELECT stock_quantity FROM product_variants WHERE id = ?'
      ).get(variantId);
      assert.equal(variant?.stock_quantity, 5, 'Stock must remain unchanged when checkout is blocked');
    } finally {
      database.close();
    }
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('upgrades a legacy sale item foreign key without losing the history trigger', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-legacy-'));
  const databasePath = path.join(isolatedAppData, 'shop.db');
  const schemaPath = path.join(appDirectory, 'electron', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const saleItemsTable = schema.match(/CREATE TABLE IF NOT EXISTS sale_items \([\s\S]*?\n\);/);
  assert.ok(saleItemsTable, 'The current schema must define sale_items');

  const legacySaleItemsTable = saleItemsTable[0].replace(
    'FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL',
    'FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT'
  );
  assert.notEqual(legacySaleItemsTable, saleItemsTable[0]);

  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(schema.replace(saleItemsTable[0], legacySaleItemsTable));
  legacyDatabase.pragma('user_version = 1');
  legacyDatabase.close();

  let electronApp;
  try {
    electronApp = await launchWithUserData(isolatedAppData);
    const page = await electronApp.firstWindow();
    await page.locator('#business-name').waitFor({ state: 'visible' });

    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(userDataPath), path.resolve(isolatedAppData));

    await electronApp.close();
    electronApp = null;

    const migratedDatabase = new Database(databasePath, { readonly: true });
    try {
      const variantForeignKey = migratedDatabase
        .pragma('foreign_key_list(sale_items)')
        .find((foreignKey) => foreignKey.from === 'variant_id');
      assert.equal(variantForeignKey?.on_delete, 'SET NULL');
      assert.equal(migratedDatabase.pragma('user_version', { simple: true }), 5);
      assert.ok(migratedDatabase.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?"
      ).get('trg_restrict_variant_delete_with_history'));
    } finally {
      migratedDatabase.close();
    }
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('admin creates and moves a ticket through the Workflows Kanban UI', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-workflows-'));
  let electronApp;

  try {
    electronApp = await launchWithUserData(isolatedAppData);
    let page = await electronApp.firstWindow();
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1600, 1200);
    });
    await page.locator('#business-name').waitFor({ state: 'visible' });

    await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'workflow-admin',
        password: 'secure-password',
      });
      await window.electronAPI.logout();
    });
    await page.reload();
    await page.locator('#login-username').waitFor({ state: 'visible' });
    await page.locator('#login-username').fill('workflow-admin');
    await page.locator('#login-password').fill('secure-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.locator('#barcode-search-input').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'تخطي' }).click();

    await page.getByText('سير العمل ولوحة Kanban', { exact: true }).click();
    await page.getByRole('heading', { name: /إدارة سير العمل والتذاكر/ }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'تمام!' }).click();
    await page.getByRole('button', { name: /قائمة وقوالب المسارات/ }).click();
    await page.getByRole('button', { name: /إنشاء مسار عمل جديد/ }).click();
    await page.getByPlaceholder('مثال: سير عمل صيانة أجهزة الألعاب').fill('اختبار واجهة Kanban');
    await page.locator('.workflows-page select').last().selectOption('custom');
    await page.locator('.workflows-page textarea').fill('مسار اختبار الواجهة');
    await page.getByRole('button', { name: 'إنشاء', exact: true }).click();

    const workflowSelector = page.locator('.workflows-page select').first();
    await workflowSelector.waitFor({ state: 'visible' });
    await workflowSelector.selectOption({ label: 'اختبار واجهة Kanban (custom)' });
    await page.getByRole('button', { name: /محرر الحالات والانتقالات/ }).click();

    const addStatus = async (key, label) => {
      await page.getByRole('button', { name: 'إضافة حالة جديدة', exact: false }).click();
      await page.getByPlaceholder('مثال: ready_for_test').fill(key);
      await page.getByPlaceholder('مثال: جاهز للتجربة').fill(label);
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.getByText(label, { exact: true }).waitFor({ state: 'visible' });
    };

    await addStatus('received', 'تم الاستلام');
    await addStatus('processing', 'قيد التنفيذ');
    await addStatus('completed', 'مكتمل');

    const addTransition = async (fromKey, toKey) => {
      await page.getByRole('button', { name: /إضافة شرط انتقال وأتمتة/ }).click();
      await page.locator('.workflows-page select').nth(1).selectOption(fromKey);
      await page.locator('.workflows-page select').nth(2).selectOption(toKey);
      await page.getByText(/معاينة الانتقال/).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'حفظ الانتقال' }).click();
    };

    await addTransition('received', 'processing');
    await addTransition('processing', 'completed');
    await page.getByRole('button', { name: /لوحة كأنبان التفاعلية/ }).click();
    await page.getByRole('button', { name: /إضافة تذكرة \/ طلب جديد/ }).click();
    await page.getByPlaceholder('مثال: تغيير شاشة آيفون / طلب توصيل عاجل').fill('تذكرة اختبار واجهة');
    await page.getByRole('button', { name: 'حفظ وإضافة' }).click();

    const ticketCard = page.locator('.ticket-card').filter({ hasText: 'تذكرة اختبار واجهة' });
    await ticketCard.waitFor({ state: 'visible' });
    await ticketCard.getByRole('button', { name: /نقل المرحلة/ }).click();
    await page.getByRole('button', { name: /قيد التنفيذ/ }).click();
    await page.getByText(/تم تغيير حالة التذكرة بنجاح/).waitFor({ state: 'visible' });
    await page.locator('.kanban-column').nth(1).locator('.ticket-card').filter({ hasText: 'تذكرة اختبار واجهة' })
      .waitFor({ state: 'visible' });
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('core screens remain usable at different window sizes and customer/purchase forms validate', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-core-screens-'));
  let electronApp;
  const pageErrors = [];

  try {
    electronApp = await launchWithUserData(isolatedAppData);
    const page = await electronApp.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.locator('#business-name').waitFor({ state: 'visible' });

    await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'screens-admin',
        password: 'secure-password',
      });
      await window.electronAPI.login({
        username: 'screens-admin',
        password: 'secure-password',
      });
      const result = await window.electronAPI.provisionOnboarding({
        sectorKey: 'retail',
        storeName: 'متجر اختبار الواجهات',
      });
      if (!result?.success) {
        throw new Error(result?.message || 'تعذر إعداد نشاط التجزئة للاختبار');
      }
      await window.electronAPI.logout();
    });
    await page.reload();
    await page.locator('#login-username').fill('screens-admin');
    await page.locator('#login-password').fill('secure-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.locator('#barcode-search-input').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'تخطي' }).click();

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1024, 768);
    });
    await page.getByRole('button', { name: 'المنتجات والمخزون' }).click();
    await page.getByRole('heading', { name: /إدارة .* والمخزون/ }).waitFor({ state: 'visible' });
    await dismissPageTutorial(page);
    assert.ok(
      await page.evaluate(() => document.documentElement.clientWidth >= 1000),
      'The resized application should expose the expected desktop viewport'
    );

    await page.locator('.sidebar-nav-btn').filter({ hasText: /الديون|العملاء|الزبائن/ }).click();
    await page.getByRole('heading', { name: /مركز الاتصالات/ }).waitFor({ state: 'visible' });
    await dismissPageTutorial(page);
    await page.getByRole('button', { name: '+ إضافة عميل جديد' }).click();
    const customerName = page.getByPlaceholder('أدخل اسم العميل...');
    const customerEmail = page.locator('.customers-page-container input[type="email"]');
    await customerEmail.fill('not-an-email');
    assert.equal(await customerEmail.evaluate((input) => input.checkValidity()), false);
    await customerName.fill('عميل اختبار الواجهة');
    await customerEmail.fill('customer@example.test');
    await page.getByRole('button', { name: 'حفظ العميل' }).click();
    await page.getByPlaceholder('أدخل اسم العميل...').waitFor({ state: 'hidden' });
    await page.getByText('عميل اختبار الواجهة', { exact: true }).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: 'الموردين والمشتريات' }).click();
    await page.getByRole('heading', { name: 'الموردين والمشتريات والآجل' }).waitFor({ state: 'visible' });
    await dismissPageTutorial(page);
    await page.getByRole('button', { name: /مورد \/ مصنع جديد/ }).click();
    await page.getByPlaceholder('مثال: الحاج أحمد عبد الله').fill('مورد اختبار الواجهة');
    await page.getByRole('button', { name: 'إضافة المورد' }).click();
    await page.getByRole('heading', { name: 'إضافة مورد / مصنع جديد' }).waitFor({ state: 'hidden' });

    await page.getByRole('button', { name: /تسجيل فاتورة توريد جديدة/ }).click();
    const purchaseDialog = page.locator('.product-modal-dialog');
    await purchaseDialog.getByRole('heading', { name: /تسجيل فاتورة شراء/ }).waitFor({ state: 'visible' });
    const purchaseSupplier = purchaseDialog.locator('select').first();
    await purchaseSupplier.selectOption({ label: 'مورد اختبار الواجهة' });
    await purchaseDialog.getByPlaceholder('اسم المنتج...').fill('صنف مشتريات اختبار');
    await purchaseDialog.locator('tbody input[type="number"]').nth(0).fill('2');
    await purchaseDialog.locator('tbody input[type="number"]').nth(1).fill('20');
    await purchaseDialog.locator('tbody input[type="number"]').nth(2).fill('35');
    const purchaseSaved = new Promise((resolve) => {
      page.once('dialog', async (dialog) => {
        await dialog.accept();
        resolve();
      });
    });
    await purchaseDialog.getByRole('button', { name: /حفظ الفاتورة وتحديث المخزون/ }).click();
    await purchaseSaved;
    await purchaseDialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /فواتير الشراء والتوريد/ }).click();
    await page.getByText('مورد اختبار الواجهة', { exact: true }).waitFor({ state: 'visible' });

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1366, 900);
    });
    const sidebarText = await page.locator('.sidebar-links').innerText();
    assert.match(sidebarText, /الورديات/, `Shift navigation is missing from the sidebar: ${sidebarText}`);
    await page.locator('.sidebar-links button').filter({ hasText: /الورديات/ }).click();
    await page.getByRole('heading', { name: /إدارة الورديات وتقارير التقفيل/ }).waitFor({ state: 'visible' });
    await dismissPageTutorial(page);
    await page.locator('.sidebar-links button').filter({ hasText: /التقارير/ }).click();
    await page.getByRole('heading', { name: 'التقارير والتحليلات' }).waitFor({ state: 'visible' });
    await dismissPageTutorial(page);
    await page.getByRole('button', { name: 'آخر 7 أيام' }).click();

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1366, 900);
    });
    await page.getByRole('heading', { name: 'التقارير والتحليلات' }).waitFor({ state: 'visible' });
    assert.deepEqual(pageErrors, [], `Unexpected renderer errors: ${pageErrors.join('; ')}`);
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});

test('law firm appointments use legal terminology and supported resource types', async () => {
  const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'casher-e2e-law-appointments-'));
  let electronApp;

  try {
    electronApp = await launchWithUserData(isolatedAppData);
    const page = await electronApp.firstWindow();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.locator('#business-name').waitFor({ state: 'visible' });

    await page.evaluate(async () => {
      await window.electronAPI.createInitialAdmin({
        username: 'law-admin',
        password: 'secure-password',
      });
      await window.electronAPI.login({
        username: 'law-admin',
        password: 'secure-password',
      });
      const result = await window.electronAPI.provisionOnboarding({
        sectorKey: 'law_firm',
        storeName: 'مكتب اختبار قانوني',
      });
      if (!result?.success) {
        throw new Error(result?.message || 'تعذر إعداد مكتب المحاماة للاختبار');
      }
      await window.electronAPI.logout();
    });

    await page.reload();
    await page.locator('#login-username').fill('law-admin');
    await page.locator('#login-password').fill('secure-password');
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.locator('#barcode-search-input').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'تخطي' }).click();
    await page.locator('.sidebar-links button').filter({ hasText: /حجوزات المواعيد/ }).click();
    try {
      await page.getByRole('heading', { name: /المواعيد والجلسات القانونية/ }).waitFor({ state: 'visible', timeout: 10_000 });
    } catch (error) {
      const currentContent = await page.locator('body').innerText();
      throw new Error(`Legal appointments page did not render. Page errors: ${pageErrors.join('; ')}. UI: ${currentContent}`, { cause: error });
    }
    await dismissPageTutorial(page);

    const appointmentsPage = page.locator('.appointments-page');
    const appointmentText = await appointmentsPage.innerText();
    assert.match(appointmentText, /جلسات المحاكم واستشارات الموكلين/);
    assert.match(appointmentText, /جدول الجلسات والاستشارات/);
    assert.doesNotMatch(appointmentText, /الجيم|كابتن|مدرب|كلاسات|حصص تدريب/);

    await appointmentsPage.getByRole('button', { name: 'المحامون وقاعات الجلسات' }).click();
    assert.doesNotMatch(await appointmentsPage.innerText(), /الجيم|كابتن|مدرب|كلاسات|حصص تدريب/);
    const resourceType = appointmentsPage.locator('form select').first();
    assert.equal(await resourceType.inputValue(), 'employee');
    assert.match(await resourceType.innerText(), /محامٍ \/ مستشار قانوني/);
    await appointmentsPage.getByPlaceholder('مثال: الأستاذ محمد علي / قاعة الاجتماعات').fill('الأستاذ اختبار');
    await appointmentsPage.getByRole('button', { name: 'إضافة المورد' }).click();
    const resourceAlert = appointmentsPage.locator('.appointment-alert').first();
    await resourceAlert.waitFor({ state: 'visible' });
    assert.match(await resourceAlert.innerText(), /تمت إضافة المورد وأوقات عمله بنجاح/);
    await appointmentsPage.getByText(/الأستاذ اختبار/).waitFor({ state: 'visible' });

    await appointmentsPage.getByRole('button', { name: 'أنواع الجلسات والخدمات القانونية' }).click();
    assert.doesNotMatch(await appointmentsPage.innerText(), /الجيم|كابتن|مدرب|كلاسات|حصص تدريب/);
    const serviceForm = appointmentsPage.locator('form').first();
    assert.equal(await serviceForm.locator('select').inputValue(), 'employee');
    await serviceForm.getByPlaceholder('مثال: استشارة قانونية / جلسة محكمة').fill('استشارة قانونية');
    await serviceForm.getByRole('button', { name: 'إضافة الخدمة' }).click();
    await appointmentsPage.getByText(/استشارة قانونية/).waitFor({ state: 'visible' });
    await appointmentsPage.getByText(/تمت إضافة الخدمة القانونية بنجاح/).waitFor({ state: 'visible' });

    await appointmentsPage.getByRole('button', { name: 'أوقات عدم التوفر' }).click();
    const unavailableText = await appointmentsPage.innerText();
    assert.match(unavailableText, /عدم التوفر/);
    assert.doesNotMatch(unavailableText, /الجيم|كابتن|مدرب|كلاسات|حصص تدريب/);
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(isolatedAppData, { recursive: true, force: true });
  }
});
