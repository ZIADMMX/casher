const { db } = require('../database/db');
const xlsx = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { logError } = require('./logger.service');

/**
 * دالة لاستيراد المنتجات
 * تتخطى الباركود المكرر لحماية البيانات.
 */
function importProducts(rows) {
  let imported = 0;
  let skipped = 0;

  const insertTransaction = db.transaction((items) => {
    const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');
    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');

    const getProd = db.prepare('SELECT id FROM products WHERE name = ? AND category_id = ?');
    const insertProd = db.prepare('INSERT INTO products (name, category_id) VALUES (?, ?)');

    const checkVariant = db.prepare('SELECT id FROM product_variants WHERE barcode = ?');
    const insertVariant = db.prepare(`
      INSERT INTO product_variants 
      (product_id, size, color, barcode, purchase_price, selling_price, stock_quantity) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      if (!item['اسم المنتج'] || item['سعر الشراء'] == null || item['سعر البيع'] == null) {
        skipped++;
        continue;
      }

      const barcode = item['الباركود'] ? String(item['الباركود']).trim() : null;
      if (barcode) {
        const exists = checkVariant.get(barcode);
        if (exists) {
          skipped++;
          continue; // تخطي لتجنب التكرار
        }
      }

      // معالجة التصنيف
      const catName = item['التصنيف'] ? String(item['التصنيف']).trim() : 'عام';
      let cat = getCat.get(catName);
      let catId = cat ? cat.id : insertCat.run(catName).lastInsertRowid;

      // معالجة المنتج الأب
      const prodName = String(item['اسم المنتج']).trim();
      let prod = getProd.get(prodName, catId);
      let prodId = prod ? prod.id : insertProd.run(prodName, catId).lastInsertRowid;

      // إدراج النسخة (Variant)
      insertVariant.run(
        prodId,
        item['المقاس'] ? String(item['المقاس']).trim() : null,
        item['اللون'] ? String(item['اللون']).trim() : null,
        barcode,
        Number(item['سعر الشراء']) || 0,
        Number(item['سعر البيع']) || 0,
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
    const insertCust = db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)');
    
    for (const item of items) {
      if (!item['الاسم']) {
        skipped++;
        continue;
      }
      insertCust.run(
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
    const insertSupp = db.prepare('INSERT INTO suppliers (name, phone, company, address, notes) VALUES (?, ?, ?, ?, ?)');
    
    for (const item of items) {
      if (!item['اسم المورد']) {
        skipped++;
        continue;
      }
      insertSupp.run(
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

/**
 * المعالج الرئيسي لاستيراد ملف الإكسل
 */
function processExcelFile(filePath, type) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('الملف غير موجود');
    }

    const workbook = xlsx.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // تحويل الشيت إلى مصفوفة بيانات JSON
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: null });
    
    if (!rows || rows.length === 0) {
      throw new Error('الملف فارغ أو لا يحتوي على بيانات صالحة');
    }

    let result = { imported: 0, skipped: 0 };

    if (type === 'products') {
      result = importProducts(rows);
    } else if (type === 'customers') {
      result = importCustomers(rows);
    } else if (type === 'suppliers') {
      result = importSuppliers(rows);
    } else {
      throw new Error('نوع الاستيراد غير مدعوم');
    }

    return { success: true, ...result, message: 'تم استيراد ' + result.imported + ' بنجاح، وتخطي ' + result.skipped + ' مكرر.' };
  } catch (error) {
    logError('ImportExcelFile', error);
    throw new Error('فشل معالجة الملف: ' + error.message);
  }
}

/**
 * إنشاء وحفظ قالب إكسل فارغ للمستخدم
 */
function createImportTemplate(type) {
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
    } else {
      throw new Error('نوع القالب غير معروف');
    }

    const ws = xlsx.utils.aoa_to_sheet([columns]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'البيانات');

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

    xlsx.writeFile(wb, finalPath);
    return { success: true, path: finalPath, message: 'تم حفظ القالب في التنزيلات:\n' + finalPath };
  } catch (error) {
    logError('CreateImportTemplate', error);
    throw new Error('فشل إنشاء القالب: ' + error.message);
  }
}

module.exports = {
  processExcelFile,
  createImportTemplate
};
