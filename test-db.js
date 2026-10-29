const { Pool } = require('pg');

async function testConnection(password) {
  const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'kashiear_pos',
    password: password,
    port: 5432,
  });

  try {
    const res = await pool.query('SELECT count(*) FROM branches;');
    console.log('SUCCESS: Connected to PostgreSQL! Branches count:', res.rows[0].count);
    await pool.end();
    return true;
  } catch (err) {
    console.error('Connection failed with password:', password ? '***' : '(empty)', err.message);
    await pool.end();
    return false;
  }
}

// test with common/default passwords or process.env.PGPASSWORD
const pwd = process.env.PGPASSWORD || 'postgres';
testConnection(pwd);
