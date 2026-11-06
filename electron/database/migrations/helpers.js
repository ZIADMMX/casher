const { db } = require('../connection');

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Add a column during a schema upgrade if it is not there yet.
 *
 * Returns true when the column was added and false when it already existed.
 * Any other failure throws: a silently skipped column leaves the app running
 * against a schema it does not expect ("no such column" on the first sale),
 * while a thrown error stops the upgrade before user_version moves on, so the
 * user sees the startup error and the pre-upgrade backup is still there.
 */
function addColumnIfMissing(tableName, columnName, columnDefinition, database = db) {
  if (!IDENTIFIER.test(String(tableName)) || !IDENTIFIER.test(String(columnName)) || !columnDefinition) {
    throw new Error(`addColumnIfMissing: invalid table or column (${tableName}.${columnName})`);
  }

  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.length === 0) {
    throw new Error(`فشل ترقية قاعدة البيانات: الجدول ${tableName} غير موجود (عند إضافة ${columnName})`);
  }
  if (columns.some((column) => column.name === columnName)) {
    return false;
  }

  try {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
  } catch (err) {
    if (/duplicate column name/i.test(err.message)) return false;
    err.message = `فشل ترقية قاعدة البيانات: تعذر إضافة العمود ${columnName} إلى ${tableName}: ${err.message}`;
    throw err;
  }
  return true;
}

/**
 * Foreign-key violations per table ({ table -> count }). PRAGMA foreign_key_check
 * works whether or not foreign_keys is on, so it can verify a table rebuild that
 * ran with foreign keys switched off.
 */
function foreignKeyViolationCounts(database = db) {
  const counts = new Map();
  for (const row of database.prepare('PRAGMA foreign_key_check').all()) {
    counts.set(row.table, (counts.get(row.table) || 0) + 1);
  }
  return counts;
}

/**
 * Call inside the rebuild's transaction, before it commits, with the counts
 * taken before the rebuild. Throws (so the transaction rolls back) if the
 * rebuild broke any link. Links that were already broken before the upgrade
 * (say, a sale whose customer was deleted long ago) are only logged: refusing
 * the upgrade over them would lock the shop out of an app it cannot repair.
 */
function assertNoNewForeignKeyViolations(before, label, database = db) {
  const after = foreignKeyViolationCounts(database);
  const worse = [...after].filter(([table, count]) => count > (before.get(table) || 0));
  if (worse.length > 0) {
    const detail = worse.map(([table, count]) => `${table}: ${before.get(table) || 0} → ${count}`).join(', ');
    throw new Error(`فشل ترقية قاعدة البيانات (${label}): إعادة بناء الجداول كسرت روابط بين السجلات (${detail})`);
  }
  if (after.size > 0) {
    console.warn(`[DB] روابط مفقودة موجودة من قبل الترقية (${label}):`, Object.fromEntries(after));
  }
}

module.exports = { addColumnIfMissing, foreignKeyViolationCounts, assertNoNewForeignKeyViolations };
