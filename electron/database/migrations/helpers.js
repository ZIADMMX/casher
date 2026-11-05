const { db } = require('../connection');

function addColumnIfMissing(tableName, columnName, columnDefinition) {
  if (!tableName || !columnName || !columnDefinition) {
    return false;
  }

  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some((column) => column.name === columnName)) {
      return false;
    }

    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
    return true;
  } catch (err) {
    console.warn(`تعذر إضافة عمود ${columnName} إلى ${tableName}:`, err.message);
    return false;
  }
}

module.exports = { addColumnIfMissing };
