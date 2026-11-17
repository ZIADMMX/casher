// The assistant's tools. Each one wraps an existing repository/service and returns small, phone-free JSON.
//   permission: checked per user before the tool is offered or run
//   sectors:    business_type keys the tool is limited to (null = every sector)
//   write:      true = never runs from the model; it becomes a proposal the user confirms
// Repositories are required lazily so the manifest can be read without opening the database.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

function date(value, fallback) {
  const v = value == null || value === '' ? fallback : String(value);
  if (!DATE.test(v)) throw new Error('التاريخ لازم يكون بصيغة YYYY-MM-DD');
  return v;
}

function text(value, label) {
  const v = String(value ?? '').trim();
  if (v.length < 2 || v.length > 60) throw new Error(`${label} لازم يكون من حرفين إلى 60 حرف`);
  return v;
}

const noArgs = { type: 'object', properties: {} };

const TOOLS = [
  {
    name: 'getSalesSummary',
    description: 'إجمالي المبيعات وعدد الفواتير والخصومات لفترة. افتراضياً اليوم.',
    parameters: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } } },
    permission: 'reports.view',
    sectors: null,
    run: ({ from, to } = {}) => require('../../repositories/ai.repository').getSalesKpis(date(from, today()), date(to, today())),
  },
  {
    name: 'getTopProducts',
    description: 'أعلى 5 أصناف مبيعاً (بالكمية) منذ تاريخ. افتراضياً من أول الشهر.',
    parameters: { type: 'object', properties: { since: { type: 'string', description: 'YYYY-MM-DD' } } },
    permission: 'reports.view',
    sectors: null,
    run: ({ since } = {}) => require('../../repositories/ai.repository').getTopProductsSince(date(since, monthStart())),
  },
  {
    name: 'getLowStock',
    description: 'الأصناف المهددة بالنفاد (خطر حرج أو تحذير) مع الأيام المتبقية. أول 15 صنف.',
    parameters: noArgs,
    permission: 'inventory.view',
    sectors: null,
    run: () => {
      const r = require('../ai/inventoryInsights').predictStockouts({ daysWindow: 30 });
      return {
        criticalCount: r.criticalCount,
        warningCount: r.warningCount,
        items: r.items.slice(0, 15).map((i) => ({
          variantId: i.variantId, productName: i.productName, size: i.size, color: i.color,
          currentStock: i.currentStock, daysRemaining: i.daysRemaining, riskLevel: i.riskLevel, purchasePrice: i.purchasePrice,
        })),
      };
    },
  },
  {
    name: 'searchProducts',
    description: 'بحث عن صنف بالاسم أو الكود أو الباركود: السعر والكمية المتاحة.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    permission: 'products.view',
    sectors: null,
    run: ({ query } = {}) => require('../../repositories/ai.repository').searchVariants(text(query, 'نص البحث'), 10),
  },
  {
    name: 'getCustomerBalance',
    description: 'مديونية عميل (آجل ناقص المدفوع) بالاسم. بترجع حتى 5 عملاء مطابقين.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    permission: 'customers.view',
    sectors: null,
    run: ({ name } = {}) => {
      const customers = require('../../repositories/customers.repository');
      return require('../../repositories/ai.repository').findCustomersByName(text(name, 'اسم العميل'), 5)
        .map((c) => ({ id: c.id, name: c.name, balance: customers.getBalance(c.id) }));
    },
  },
  {
    name: 'getSuppliers',
    description: 'الموردين مع المبلغ المتبقي لكل مورد وعدد الفواتير غير المسددة (الأعلى مديونية أولاً، حتى 10).',
    parameters: noArgs,
    permission: 'suppliers.view',
    sectors: null,
    run: () => require('../../repositories/suppliers.repository').getAllWithStats().slice(0, 10).map((s) => ({
      id: s.id, name: s.name, remaining: s.total_remaining, unpaidInvoices: s.unpaid_invoices_count,
    })),
  },
  {
    name: 'getCurrentShift',
    description: 'حالة الوردية المفتوحة الآن وإجمالي مبيعاتها (كاش وكارت وآجل).',
    parameters: noArgs,
    permission: 'shifts.view',
    sectors: null,
    run: () => {
      const shifts = require('../../repositories/shifts.repository');
      const shift = shifts.getCurrentOpenShift();
      if (!shift) return { open: false };
      const t = shifts.getShiftLiveTotals(shift.id) || {};
      return { open: true, cashier: shift.cashier_username, openedAt: shift.start_time, totals: t };
    },
  },
  {
    name: 'createPurchaseDraft',
    description: 'يجهّز مسودة فاتورة شراء غير مدفوعة لمورد. لا تُنفَّذ إلا بعد تأكيد المستخدم. استخدم variantId و purchasePrice من نتائج الأدوات الأخرى.',
    parameters: {
      type: 'object',
      properties: {
        supplierId: { type: 'integer' },
        items: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              variantId: { type: 'integer' },
              productName: { type: 'string' },
              suggestedQuantity: { type: 'number' },
              unitPurchasePrice: { type: 'number' },
            },
            required: ['variantId', 'productName', 'suggestedQuantity', 'unitPurchasePrice'],
          },
        },
      },
      required: ['supplierId', 'items'],
    },
    permission: 'purchases.manage',
    sectors: null,
    write: true,
    // Throws on bad input; returns the cleaned args that the proposal will carry.
    validate: ({ supplierId, items } = {}) => {
      if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error('supplierId مطلوب');
      if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('الأصناف من 1 إلى 50');
      const clean = items.map((i) => {
        const q = Number(i?.suggestedQuantity);
        const p = Number(i?.unitPurchasePrice);
        if (!Number.isInteger(i?.variantId) || !(q > 0) || !(p >= 0)) throw new Error('صنف غير صالح (variantId أو كمية أو سعر)');
        return { variantId: i.variantId, productName: String(i.productName || 'صنف').slice(0, 120), suggestedQuantity: q, unitPurchasePrice: p };
      });
      return { supplierId, items: clean };
    },
    summarize: ({ items }) => {
      const total = items.reduce((s, i) => s + i.suggestedQuantity * i.unitPurchasePrice, 0);
      return `مسودة شراء: ${items.length} صنف بإجمالي ${Math.round(total * 100) / 100}`;
    },
    run: ({ supplierId, items }) => require('../ai/purchaseDraft').createPurchaseDraftFromSuggestions(
      items, supplierId, 'مسودة جهّزها المساعد الذكي وأكّدها المستخدم',
    ),
  },
];

const manifest = (tools = TOOLS) => tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

module.exports = { TOOLS, manifest };
