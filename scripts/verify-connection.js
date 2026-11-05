const { checkHealth, queryRead } = require('../electron/database/dbPool');

async function run() {
  console.log('🔄 جاري فحص الاتصال بقواعد البيانات (Master & Replica)...');
  const health = await checkHealth();
  console.log('📊 تقرير حالة الاتصال:', JSON.stringify(health, null, 2));

  if (health.primary.status === 'OK') {
    const branches = await queryRead('SELECT COUNT(*) as count FROM branches');
    console.log(`✅ تم الاتصال بنجاح! عدد الفروع المسجلة: ${branches.rows[0].count}`);
  } else {
    console.log('❌ تعذر الاتصال بـ Primary DB. يرجى التأكد من كلمة المرور في ملف .env');
  }
}

run().catch(console.error);
