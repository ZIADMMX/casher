// Automation rules and evaluating them when business events fire.
const enterpriseRepo = require('../../repositories/enterprise.repository');
const NotificationsService = require('../notifications.service');

function getAutomationRules() {
  return enterpriseRepo.getAutomationRules();
}

function createAutomationRule(data) {
  if (!data.rule_name || !data.trigger_event || !data.action_type) {
    throw new Error('بيانات قاعدة الأتمتة غير مكتملة');
  }
  return enterpriseRepo.createAutomationRule(data);
}

function setAutomationRuleEnabled(id, isEnabled) {
  return enterpriseRepo.setAutomationRuleEnabled(id, isEnabled);
}

/**
 * Helper to evaluate condition rule against event payload
 */
function matchesCondition(condition, payload) {
  if (!condition || Object.keys(condition).length === 0) return true;
  
  if (condition.threshold != null) {
    const val = payload.amount ?? payload.total_amount ?? payload.stock ?? payload.debt ?? 0;
    const op = condition.operator || '>';
    if (op === '>') return Number(val) > Number(condition.threshold);
    if (op === '>=') return Number(val) >= Number(condition.threshold);
    if (op === '<') return Number(val) < Number(condition.threshold);
    if (op === '<=') return Number(val) <= Number(condition.threshold);
    if (op === '==') return Number(val) === Number(condition.threshold);
  }

  if (condition.field) {
    const val = payload[condition.field];
    const target = condition.value;
    const op = condition.operator || '==';
    if (op === '>') return Number(val) > Number(target);
    if (op === '>=') return Number(val) >= Number(target);
    if (op === '<') return Number(val) < Number(target);
    if (op === '<=') return Number(val) <= Number(target);
    if (op === '==') return String(val) === String(target);
    if (op === '!=') return String(val) !== String(target);
  }

  return true;
}

/**
 * No-Code Automation Event Evaluator Engine
 */
function evaluateEventAutomations(triggerEvent, eventPayload = {}) {
  try {
    const rules = enterpriseRepo.getAutomationRules().filter(r => r.is_enabled === 1 && r.trigger_event === triggerEvent);
    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
      const conditionPayload = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json || '{}') : rule.condition_json;
      if (!matchesCondition(conditionPayload, eventPayload)) {
        continue;
      }

      const actionPayload = typeof rule.action_payload_json === 'string' ? JSON.parse(rule.action_payload_json || '{}') : rule.action_payload_json;
      
      switch (rule.action_type) {
        case 'notify_user':
          NotificationsService.notify({
            userId: actionPayload.user_id || null,
            type: actionPayload.type || 'info',
            title: actionPayload.title || `أتمتة: ${rule.rule_name}`,
            message: actionPayload.message || `تم تشغيل القاعدة التلقائية ${rule.rule_name}`,
            linkPage: actionPayload.linkPage || 'settings'
          });
          break;

        case 'grant_loyalty_points': {
          const points = Number(actionPayload.points || 10);
          NotificationsService.notify({
            userId: null,
            type: 'success',
            title: 'مكافأة نقاط ولاء 🎁',
            message: `تم منح العميل ${eventPayload.customer_name || ''} عدد ${points} نقطة ولاء تلقائياً (${rule.rule_name})`,
            linkPage: 'customers'
          });
          if (eventPayload.customer_id) {
            try {
              const crmService = require('../crm.service');
              crmService.addInteraction({
                customer_id: eventPayload.customer_id,
                type: 'offer',
                subject: `إضافة ${points} نقطة ولاء عبر محرك الأتمتة`,
                notes: `مكافأة تلقائية بموجب القاعدة: ${rule.rule_name}`
              });
            } catch (e) {
              console.warn('[AutomationEngine] addInteraction warning:', e.message);
            }
          }
          break;
        }

        case 'add_customer_note': {
          if (eventPayload.customer_id) {
            try {
              const crmService = require('../crm.service');
              crmService.addInteraction({
                customer_id: eventPayload.customer_id,
                type: 'note',
                subject: actionPayload.title || `ملاحظة أتمتة: ${rule.rule_name}`,
                notes: actionPayload.message || `ملاحظة تم إنشاؤها تلقائياً عند حدوث ${triggerEvent}`
              });
            } catch (e) {
              console.warn('[AutomationEngine] addCustomerNote warning:', e.message);
            }
          }
          NotificationsService.notify({
            userId: null,
            type: 'info',
            title: actionPayload.title || 'ملاحظة عميل جديدة 📝',
            message: actionPayload.message || `تم إضافة ملاحظة تلقائية للعميل بواسطة الأتمتة`,
            linkPage: 'customers'
          });
          break;
        }

        default:
          break;
      }
    }
  } catch (err) {
    console.warn('[AutomationEngine] Evaluation warning:', err.message);
  }
}

module.exports = {
  getAutomationRules,
  createAutomationRule,
  setAutomationRuleEnabled,
  matchesCondition,
  evaluateEventAutomations,
};
