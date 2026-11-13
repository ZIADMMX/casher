// One "activity" notification after every successful save/edit/delete over IPC.
// Visible to admins only (see notifications.repository), bell only — no pop-up toast.

const RESOURCE_NAMES = {
  sales: 'المبيعات', returns: 'المرتجعات', products: 'المنتجات', variants: 'المنتجات',
  categories: 'التصنيفات', inventory: 'المخزون', branches: 'الفروع', customers: 'العملاء',
  crm: 'إدارة العملاء', suppliers: 'الموردين', purchases: 'المشتريات', subscriptions: 'الاشتراكات',
  packages: 'الباقات', commissions: 'العمولات', settings: 'الإعدادات', enterprise: 'إدارة النظام',
  shifts: 'الورديات', appointments: 'المواعيد', cases: 'القضايا', courts: 'المحاكم', salon: 'الصالون',
  tables: 'الطاولات', promotions: 'العروض', users: 'المستخدمين', expenses: 'المصروفات',
  salaries: 'الرواتب', backup: 'النسخ الاحتياطي', einvoice: 'الفاتورة الإلكترونية',
};

const VERBS = [
  [/^(add|create|import|record|open|checkIn|clockIn)/i, 'إضافة'],
  [/^(delete|remove|void|archive|cancel|clear|anonymize)/i, 'حذف / إلغاء'],
  [/^(update|save|set|change|adjust|toggle|assign|move|reorder|reschedule|convert|transfer)/i, 'تعديل'],
];

// Reading/marking notifications must not create more notifications.
const SKIP_RESOURCES = new Set(['notifications']);

function recordActivity(channel, session) {
  try {
    const [resource, action = ''] = channel.split(':');
    if (SKIP_RESOURCES.has(resource)) return;
    const verb = VERBS.find(([pattern]) => pattern.test(action))?.[1] || 'عملية';
    const area = RESOURCE_NAMES[resource] || resource;
    require('./notifications.service').notify({
      type: 'activity',
      title: `${verb} في ${area}`,
      message: `${session?.username || 'النظام'} نفّذ: ${action} (${channel})`,
    });
  } catch {
    // An activity note must never break the action that just succeeded.
  }
}

module.exports = { recordActivity };
