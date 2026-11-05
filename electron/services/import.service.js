const { db } = require('../database/db');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { logError } = require('./logger.service');
const { readTableFile, writeXlsxFile } = require('./excel.util');
const inventoryRepo = require('../repositories/inventory.repository');
const { requireAdmin, getCurrentSession } = require('./auth.service');
const authService = require('./auth.service');
const usersRepo = require('../repositories/users.repository');
const enterpriseRepo = require('../repositories/enterprise.repository');
const importRepo = require('../repositories/import.repository');

/**
 * دالة لاستيراد المنتجات
 * تتخطى الباركود المكرر لحماية البيانات.
 */
function importProducts(rows) {
  requireAdmin();
  let imported = 0;
  let skipped = 0;

  const insertTransaction = db.transaction((items) => {
    const session = getCurrentSession();
    const defaultWarehouseId = session?.centralRequest && session.warehouseId
      ? session.warehouseId
      : inventoryRepo.getDefaultWarehouseId();
    const stmts = importRepo.prepareProductImport();

    for (const item of items) {
      if (!item['اسم المنتج'] || item['سعر الشراء'] == null || item['سعر البيع'] == null) {
        skipped++;
        continue;
      }

      const barcode = item['الباركود'] ? String(item['الباركود']).trim() : null;
      if (barcode) {
        const exists = stmts.findVariantByBarcode(barcode);
        if (exists) {
          skipped++;
          continue; // تخطي لتجنب التكرار
        }
      }

      // معالجة التصنيف
      const catName = item['التصنيف'] ? String(item['التصنيف']).trim() : 'عام';
      let cat = stmts.findCategory(catName);
      let catId = cat ? cat.id : stmts.insertCategory(catName).lastInsertRowid;

      // معالجة المنتج الأب
      const prodName = String(item['اسم المنتج']).trim();
      let prod = stmts.findProduct(prodName, catId);
      let prodId = prod ? prod.id : stmts.insertProduct(prodName, catId).lastInsertRowid;

      // إدراج النسخة (Variant)
      const result = stmts.insertVariant(
        prodId,
        item['المقاس'] ? String(item['المقاس']).trim() : null,
        item['اللون'] ? String(item['اللون']).trim() : null,
        barcode,
        Number(item['سعر الشراء']) || 0,
        Number(item['سعر البيع']) || 0,
        Number(item['الكمية']) || 0
      );
      inventoryRepo.initializeVariantStock(
        defaultWarehouseId,
        Number(result.lastInsertRowid),
        Number(item['الكمية']) || 0
      );
      
      imported++;
    }
  });

  insertTransaction(rows);
  return { imported, skipped };
}

/**
 * دالة لاستيراد العملاء
 */
function importCustomers(rows) {
  let imported = 0;
  let skipped = 0;

  const insertTransaction = db.transaction((items) => {
    const insertCust = importRepo.prepareCustomerInsert();
    
    for (const item of items) {
      if (!item['الاسم']) {
        skipped++;
        continue;
      }
      insertCust(
        String(item['الاسم']).trim(),
        item['رقم الهاتف'] ? String(item['رقم الهاتف']).trim() : null,
        item['البريد الإلكتروني'] ? String(item['البريد الإلكتروني']).trim() : null
      );
      imported++;
    }
  });

  insertTransaction(rows);
  return { imported, skipped };
}

/**
 * دالة لاستيراد الموردين
 */
function importSuppliers(rows) {
  let imported = 0;
  let skipped = 0;

  const insertTransaction = db.transaction((items) => {
    const insertSupp = importRepo.prepareSupplierInsert();
    
    for (const item of items) {
      if (!item['اسم المورد']) {
        skipped++;
        continue;
      }
      insertSupp(
        String(item['اسم المورد']).trim(),
        item['رقم الهاتف'] ? String(item['رقم الهاتف']).trim() : null,
        item['الشركة'] ? String(item['الشركة']).trim() : null,
        item['العنوان'] ? String(item['العنوان']).trim() : null,
        item['ملاحظات'] ? String(item['ملاحظات']).trim() : null
      );
      imported++;
    }
  });

  insertTransaction(rows);
  return { imported, skipped };
}

function importEmployees(rows) {
  requireAdmin();
  const availableRoles = new Set(
    enterpriseRepo.getRoles().map((role) => role.role_key).filter((roleKey) => roleKey !== 'admin')
  );
  const seenUsernames = new Set();
  const errors = [];
  let imported = 0;
  let skipped = 0;
  const validStatus = (value) => {
    if (value == null || value === '') return true;
    return ['1', '0', 'true', 'false', 'yes', 'no', 'نشط', 'معطل', 'مفعل', 'غير مفعل']
      .includes(String(value).trim().toLowerCase());
  };

  rows.forEach((item, index) => {
    const rowNumber = index + 2;
    const username = String(item['اسم المستخدم'] || '').trim();
    const password = String(item['كلمة المرور المؤقتة'] || '');
    const firstName = String(item['الاسم الأول'] || '').trim();
    const lastName = String(item['اسم العائلة'] || '').trim();
    const roleKey = String(item['مفتاح الدور'] || 'cashier').trim().toLowerCase();
    const phone = String(item['رقم الهاتف'] || '').trim();
    const email = String(item['البريد الإلكتروني'] || '').trim();
    const payAmount = item['قيمة الأجر'] === '' || item['قيمة الأجر'] == null
      ? null
      : Number(item['قيمة الأجر']);
    const commissionRate = item['نسبة العمولة'] === '' || item['نسبة العمولة'] == null
      ? null
      : Number(item['نسبة العمولة']);
    const payType = String(item['نوع الأجر'] || '').trim().toLowerCase();
    const isActiveValue = String(item['حالة الحساب'] ?? 'نشط').trim().toLowerCase();
    const rowError = !username || username.length < 2
      ? 'اسم المستخدم مطلوب ويجب ألا يقل عن حرفين'
      : !password || password.length < 6
        ? 'كلمة المرور المؤقتة مطلوبة ويجب ألا تقل عن 6 أحرف'
        : !firstName || !lastName
          ? 'الاسم الأول واسم العائلة مطلوبان'
          : !availableRoles.has(roleKey)
            ? 'مفتاح الدور غير موجود أو غير مسموح'
            : seenUsernames.has(username.toLowerCase()) || usersRepo.getByUsername(username)
              ? 'اسم المستخدم مكرر'
              : !['monthly', 'hourly'].includes(payType) || !Number.isFinite(payAmount) || payAmount <= 0
                ? 'نوع الأجر وقيمته غير صالحين'
                : (commissionRate !== null && (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100))
                  ? 'نسبة العمولة يجب أن تكون بين 0 و100'
                  : phone.length > 30
                    ? 'رقم الهاتف أطول من الحد المسموح'
                    : (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
                      ? 'البريد الإلكتروني غير صالح'
                      : !validStatus(item['حالة الحساب'])
                        ? 'حالة الحساب غير معروفة'
                        : null;

    if (rowError) {
      skipped++;
      errors.push({ row: rowNumber, reason: rowError });
      return;
    }

    seenUsernames.add(username.toLowerCase());
    const accountIsActive = !['0', 'false', 'no', 'معطل', 'غير مفعل'].includes(isActiveValue);
    try {
      authService.addCashier({
        username,
        password,
        role: 'cashier',
        systemRoleKey: roleKey,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        phone: phone || null,
        email: email || null,
        jobTitle: String(item['المسمى الوظيفي'] || '').trim() || null,
        specialty: String(item['التخصص'] || '').trim() || null,
        workingHours: String(item['ساعات العمل'] || '').trim() || null,
        payType,
        payAmount,
        commissionRate,
        isActive: accountIsActive,
        notes: String(item['ملاحظات'] || '').trim() || null,
      });
      imported++;
    } catch (error) {
      skipped++;
      errors.push({ row: rowNumber, reason: error.message || 'تعذر حفظ الموظف' });
    }
  });

  return { success: true, imported, skipped, errors };
}

/**
 * تصفية صفوف الإكسل لحماية التطبيق من هجمات Prototype Pollution
 */
function sanitizeImportRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
  return rawRows.map((row) => {
    if (!row || typeof row !== 'object') return {};
    const cleanRow = {};
    for (const key of Object.keys(row)) {
      if (dangerousKeys.has(key)) continue;
      cleanRow[key] = row[key];
    }
    return cleanRow;
  });
}

/**
 * المعالج الرئيسي لاستيراد ملف الإكسل
 */
async function processExcelFile(filePath, type) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('الملف غير موجود');
    }
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.xls') {
      throw new Error('صيغة .xls القديمة غير مدعومة؛ احفظ الملف كـ xlsx أو csv');
    }
    if (!['.xlsx', '.csv'].includes(extension)) {
      throw new Error('صيغة الملف غير مدعومة؛ استخدم Excel أو CSV');
    }
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > 25 * 1024 * 1024) {
      throw new Error('حجم الملف غير صالح أو يتجاوز 25 ميجابايت');
    }

    // قراءة الجدول عبر exceljs ثم تعقيم المفاتيح لمنع ثغرات Prototype Pollution
    const rawRows = await readTableFile(filePath);
    const rows = sanitizeImportRows(rawRows);
    
    if (!rows || rows.length === 0) {
      throw new Error('الملف فارغ أو لا يحتوي على بيانات صالحة');
    }
    if (type === 'employees' && rows.length > 5000) {
      throw new Error('لا يمكن استيراد أكثر من 5000 موظف في ملف واحد');
    }

    let result = { imported: 0, skipped: 0 };

    if (type === 'products') {
      result = importProducts(rows);
    } else if (type === 'customers') {
      result = importCustomers(rows);
    } else if (type === 'suppliers') {
      result = importSuppliers(rows);
    } else if (type === 'employees') {
      result = importEmployees(rows);
    } else {
      throw new Error('نوع الاستيراد غير مدعوم');
    }

    return {
      success: true,
      ...result,
      message: `تم استيراد ${result.imported} بنجاح، وتخطي ${result.skipped} صف.`,
    };
  } catch (error) {
    logError('ImportExcelFile', error);
    throw new Error('فشل معالجة الملف: ' + error.message);
  }
}

/**
 * إنشاء وحفظ قالب إكسل فارغ للمستخدم
 */
async function createImportTemplate(type) {
  try {
    let columns = [];
    let fileName = 'template.xlsx';

    if (type === 'products') {
      columns = ['التصنيف', 'اسم المنتج', 'المقاس', 'اللون', 'الباركود', 'سعر الشراء', 'سعر البيع', 'الكمية'];
      fileName = 'products_template.xlsx';
    } else if (type === 'customers') {
      columns = ['الاسم', 'رقم الهاتف', 'البريد الإلكتروني'];
      fileName = 'customers_template.xlsx';
    } else if (type === 'suppliers') {
      columns = ['اسم المورد', 'رقم الهاتف', 'الشركة', 'العنوان', 'ملاحظات'];
      fileName = 'suppliers_template.xlsx';
    } else if (type === 'employees') {
      columns = [
        'اسم المستخدم', 'كلمة المرور المؤقتة', 'الاسم الأول', 'اسم العائلة', 'مفتاح الدور',
        'المسمى الوظيفي', 'التخصص', 'رقم الهاتف', 'البريد الإلكتروني', 'ساعات العمل',
        'نوع الأجر', 'قيمة الأجر', 'نسبة العمولة', 'حالة الحساب', 'ملاحظات',
      ];
      fileName = 'employees_template.xlsx';
    } else {
      throw new Error('نوع القالب غير معروف');
    }

    const downloadsPath = app.getPath('downloads');
    const targetPath = path.join(downloadsPath, fileName);
    
    let finalPath = targetPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      finalPath = path.join(downloadsPath, base + '_' + counter + ext);
      counter++;
    }

    await writeXlsxFile(finalPath, 'البيانات', columns);
    return { success: true, path: finalPath, message: 'تم حفظ القالب في التنزيلات:\n' + finalPath };
  } catch (error) {
    logError('CreateImportTemplate', error);
    throw new Error('فشل إنشاء القالب: ' + error.message);
  }
}

module.exports = {
  processExcelFile,
  createImportTemplate,
  importEmployees,
  sanitizeImportRows,
};
