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
      assert.equal(migratedDatabase.pragma('user_version', { simple: true }), 2);
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
