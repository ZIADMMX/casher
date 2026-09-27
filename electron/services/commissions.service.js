const commissionsRepo = require('../repositories/commissions.repository');
const commissionsCache = require('./commissions.cache');
const NotificationsService = require('./notifications.service');

/**
 * Commissions & Incentives Service
 * Business Logic, Automated Evaluation Engine, Caching, and Notifications
 */

const ALLOWED_TARGET_TYPES = ['all_sales', 'product', 'category', 'employee', 'debt_collection', 'net_profit', 'sales_target'];
const ALLOWED_CALC_TYPES = ['percentage', 'fixed_amount', 'lump_sum_bonus'];

// --- RULES MANAGEMENT ---

function createRule(ruleData) {
  if (!ruleData.title || !ruleData.title.trim()) {
    throw new Error('عنوان القاعدة مطلوب');
  }
  if (!ALLOWED_TARGET_TYPES.includes(ruleData.target_type)) {
    throw new Error('نوع الهدف غير صحيح');
  }
  if (!ALLOWED_CALC_TYPES.includes(ruleData.calculation_type)) {
    throw new Error('طريقة الحساب غير صحيحة');
  }
  if (ruleData.rate_value <= 0) {
    throw new Error('قيمة النسبة أو المبلغ الثابت يجب أن تكون أكبر من الصفر');
  }

  const ruleId = commissionsRepo.createRule(ruleData);
  commissionsCache.invalidate();
  return commissionsRepo.getRuleById(ruleId);
}

function getAllRules() {
  const cacheKey = 'all_commission_rules';
  const cached = commissionsCache.get(cacheKey);
  if (cached) return cached;

  const rules = commissionsRepo.getAllRules();
  commissionsCache.set(cacheKey, rules, 15000);
  return rules;
}

function updateRule(id, ruleData) {
  if (!id) throw new Error('معرف القاعدة مطلوب');
  const updated = commissionsRepo.updateRule(id, ruleData);
  commissionsCache.invalidate();
  return updated;
}

function toggleRuleActive(id) {
  if (!id) throw new Error('معرف القاعدة مطلوب');
  const updated = commissionsRepo.toggleRuleActive(id);
  commissionsCache.invalidate();
  return updated;
}

function deleteRule(id) {
  if (!id) throw new Error('معرف القاعدة مطلوب');
  const result = commissionsRepo.deleteRule(id);
  commissionsCache.invalidate();
  return result;
}

// --- AUTOMATED EVALUATION ENGINE ---

/**
 * Evaluates active commission rules automatically for a newly created sale
 */
function evaluateSaleCommissions(saleData, saleId, userId) {
  if (!userId || !saleId || !saleData) return;

  try {
    const activeRules = commissionsRepo.getActiveRules();
    if (!activeRules || activeRules.length === 0) return;

    const items = saleData.items || [];
    let totalAmount = saleData.totalAmount || saleData.total_amount || 0;
    if (!totalAmount && items.length > 0) {
      totalAmount = items.reduce((sum, it) => sum + (it.quantity || 1) * (it.unitPrice || it.price || it.unit_price || 0), 0) - Number(saleData.discount || 0);
    }

    for (const rule of activeRules) {
      let commissionEarned = 0;
      let baseAmount = totalAmount;

      // Check min threshold
      if (rule.min_sales_threshold > 0 && totalAmount < rule.min_sales_threshold) {
        continue;
      }

      switch (rule.target_type) {
        case 'all_sales': {
          if (rule.calculation_type === 'percentage') {
            commissionEarned = (totalAmount * rule.rate_value) / 100;
          } else if (rule.calculation_type === 'fixed_amount') {
            commissionEarned = rule.rate_value;
          }
          break;
        }

        case 'employee': {
          if (rule.target_id === userId) {
            if (rule.calculation_type === 'percentage') {
              commissionEarned = (totalAmount * rule.rate_value) / 100;
            } else if (rule.calculation_type === 'fixed_amount') {
              commissionEarned = rule.rate_value;
            }
          }
          break;
        }

        case 'product': {
          // Check items matching product_id or variant_id
          const matchingItems = items.filter(it => it.product_id === rule.target_id || it.productId === rule.target_id);
          for (const item of matchingItems) {
            const itemTotal = (item.quantity || 1) * (item.price || item.unit_price || 0);
            if (rule.calculation_type === 'percentage') {
              commissionEarned += (itemTotal * rule.rate_value) / 100;
            } else if (rule.calculation_type === 'fixed_amount') {
              commissionEarned += (item.quantity || 1) * rule.rate_value;
            }
          }
          break;
        }

        case 'category': {
          const matchingItems = items.filter(it => it.category_id === rule.target_id || it.categoryId === rule.target_id);
          for (const item of matchingItems) {
            const itemTotal = (item.quantity || 1) * (item.price || item.unit_price || 0);
            if (rule.calculation_type === 'percentage') {
              commissionEarned += (itemTotal * rule.rate_value) / 100;
            } else if (rule.calculation_type === 'fixed_amount') {
              commissionEarned += (item.quantity || 1) * rule.rate_value;
            }
          }
          break;
        }

        default:
          break;
      }

      if (commissionEarned > 0) {
        commissionsRepo.recordEarning({
          user_id: userId,
          rule_id: rule.id,
          sale_id: saleId,
          base_amount: baseAmount,
          commission_amount: commissionEarned,
          status: 'pending'
        });
      }
    }

    commissionsCache.invalidate();
  } catch (err) {
    console.error('خطأ أثناء تقييم عمولات الفاتورة:', err.message);
  }
}

/**
 * Evaluates commission on debt collection payment
 */
function evaluateDebtCollectionCommission(paymentAmount, paymentId, userId) {
  if (!userId || !paymentId || paymentAmount <= 0) return;

  try {
    const activeRules = commissionsRepo.getActiveRules().filter(r => r.target_type === 'debt_collection');
    for (const rule of activeRules) {
      let commissionEarned = 0;
      if (rule.calculation_type === 'percentage') {
        commissionEarned = (paymentAmount * rule.rate_value) / 100;
      } else if (rule.calculation_type === 'fixed_amount') {
        commissionEarned = rule.rate_value;
      }

      if (commissionEarned > 0) {
        commissionsRepo.recordEarning({
          user_id: userId,
          rule_id: rule.id,
          payment_id: paymentId,
          base_amount: paymentAmount,
          commission_amount: commissionEarned,
          status: 'pending'
        });
      }
    }
    commissionsCache.invalidate();
  } catch (err) {
    console.error('خطأ أثناء تقييم عمولة تحصيل الدين:', err.message);
  }
}

function cancelSaleCommissions(saleId) {
  if (!saleId) return;
  commissionsRepo.cancelEarningsBySaleId(saleId);
  commissionsCache.invalidate();
}

// --- PAYOUT SETTLEMENTS ---

function payoutEarnings(userId, amount, paymentMethod = 'cash', notes = null, userSession = {}) {
  if (!userId) throw new Error('يرجى تحديد الموظف لصرف العمولات');

  const paidByUserId = userSession?.id || null;
  const payoutId = commissionsRepo.createPayout(userId, amount, paymentMethod, notes, paidByUserId);
  commissionsCache.invalidate();

  NotificationsService.notify({
    userId,
    type: 'success',
    title: 'صرف عمولات',
    message: `تم تسوية وصرف مبلغ ${amount} ج.م عمولات لحسابك بنجاح`,
    linkPage: 'commissions'
  });

  return payoutId;
}

function getAllEarnings(filters = {}) {
  const cacheKey = `earnings_list_${JSON.stringify(filters)}`;
  const cached = commissionsCache.get(cacheKey);
  if (cached) return cached;

  const result = commissionsRepo.getAllEarnings(filters);
  commissionsCache.set(cacheKey, result, 10000);
  return result;
}

function getSummaryKPIs() {
  const cacheKey = 'commissions_summary_kpis';
  const cached = commissionsCache.get(cacheKey);
  if (cached) return cached;

  const summary = commissionsRepo.getSummaryKPIs();
  commissionsCache.set(cacheKey, summary, 10000);
  return summary;
}

module.exports = {
  createRule,
  getAllRules,
  updateRule,
  toggleRuleActive,
  deleteRule,
  evaluateSaleCommissions,
  evaluateDebtCollectionCommission,
  cancelSaleCommissions,
  payoutEarnings,
  getAllEarnings,
  getSummaryKPIs
};
