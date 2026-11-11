const crmRepo = require('../repositories/crm.repository');
const advancedCRMRepo = require('../repositories/crmAdvanced.repository');
const crmCache = require('./crm.cache');
const NotificationsService = require('./notifications.service');

/**
 * CRM & Customer Communications Service
 * Business Logic, Unified Timeline Aggregator Engine, Caching, and Reminders
 */

const ALLOWED_INTERACTION_TYPES = ['call', 'note', 'message', 'complaint', 'offer'];
const ALLOWED_OPP_STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'];

function addInteraction(data, userSession = {}) {
  if (!data.customer_id) throw new Error('معرف العميل مطلوب');
  if (!data.subject || !data.subject.trim()) throw new Error('موضوع التواصل مطلوب');
  if (!ALLOWED_INTERACTION_TYPES.includes(data.type)) throw new Error('نوع التواصل غير صحيح');

  const payload = {
    ...data,
    user_id: userSession?.id || data.user_id || null
  };

  crmRepo.addInteraction(payload);
  crmCache.invalidate();

  if (payload.follow_up_date) {
    NotificationsService.notify({
      userId: userSession?.id || null,
      type: 'info',
      title: 'تذكير متابعة جديد',
      message: `تم جدولة تذكير متابعة للعميل يوم ${new Date(payload.follow_up_date).toLocaleDateString('ar-EG')}`,
      linkPage: 'customers'
    });
  }

  return crmRepo.getInteractionsByCustomer(data.customer_id);
}

function getUnifiedTimeline(customerId) {
  if (!customerId) return [];

  const cacheKey = `crm_timeline_cust_${customerId}`;
  const cached = crmCache.get(cacheKey);
  if (cached) return cached;

  const rawElements = crmRepo.getRawTimelineElementsForCustomer(customerId);

  // Sort descending by created_at
  const sortedTimeline = rawElements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  crmCache.set(cacheKey, sortedTimeline, 15000);
  return sortedTimeline;
}

function createOpportunity(data, userSession = {}) {
  if (!data.customer_id || !data.title || !data.title.trim()) {
    throw new Error('بيانات صفقة البيع غير مكتملة');
  }

  const payload = {
    ...data,
    user_id: userSession?.id || data.user_id || null
  };

  const id = crmRepo.createOpportunity(payload);
  crmCache.invalidate();

  NotificationsService.notify({
    userId: payload.user_id,
    type: 'info',
    title: 'فرصة بيع جديدة 💼',
    message: `تم تسجيل صفقة جديدة بقيمة ${data.expected_value || 0} ج.م`,
    linkPage: 'customers'
  });

  return id;
}

function getAllOpportunities(filters = {}) {
  const cacheKey = `crm_opps_${JSON.stringify(filters)}`;
  const cached = crmCache.get(cacheKey);
  if (cached) return cached;

  const list = crmRepo.getAllOpportunities(filters);
  crmCache.set(cacheKey, list, 15000);
  return list;
}

function updateOpportunityStage(id, stage, userId) {
  if (!ALLOWED_OPP_STAGES.includes(stage)) throw new Error('مرحلة الصفقة غير صحيحة');
  const updated = userId == null
    ? crmRepo.updateOpportunityStage(id, stage)
    : crmRepo.updateOpportunityStage(id, stage, userId);
  crmCache.invalidate();
  return updated;
}

function updateCustomerRatingAndTier(customerId, rating, tier) {
  if (!customerId) throw new Error('معرف العميل مطلوب');
  const updated = crmRepo.updateCustomerRatingAndTier(customerId, rating, tier);
  crmCache.invalidate();
  return updated;
}

function checkDueReminders() {
  const due = crmRepo.getDueReminders();
  if (due && due.length > 0) {
    for (const item of due) {
      const notification = NotificationsService.notify({
        userId: item.user_id || null,
        type: 'warning',
        title: 'تذكير متابعة مستحق الآن! ⏰',
        message: `مطلوب التواصل مع العميل ${item.customer_name} (${item.customer_phone || ''}) - موضوع: ${item.subject}`,
        linkPage: 'customers'
      });
      if (notification) crmRepo.markReminderSent(item.id);
    }
  }
  const dueActivities = advancedCRMRepo.getDueActivities();
  for (const activity of dueActivities) {
    const notification = NotificationsService.notify({
      userId: activity.owner_user_id || null,
      type: 'warning',
      title: 'تذكير CRM مستحق الآن',
      message: `${activity.title}${activity.details ? ` — ${activity.details}` : ''}`,
      linkPage: 'crm',
      desktop: true
    });
    if (notification) advancedCRMRepo.markActivityReminderSent(activity.id);
  }
  const staleOpportunities = advancedCRMRepo.getStaleOpportunities();
  for (const opportunity of staleOpportunities) {
    const notification = NotificationsService.notify({
      userId: opportunity.user_id || null,
      type: 'warning',
      title: 'صفقة تحتاج إلى متابعة',
      message: `الصفقة "${opportunity.title}" مع ${opportunity.customer_name} متوقفة منذ ${opportunity.stale_days} أيام.`,
      linkPage: 'crm',
      desktop: true
    });
    if (notification) advancedCRMRepo.markOpportunityStaleReminderSent(opportunity.id);
  }
  return due;
}

function parseCampaign(campaign) {
  if (!campaign) return null;
  let targetCriteria;
  try {
    targetCriteria = JSON.parse(campaign.target_criteria);
  } catch (error) {
    throw new Error(`تعذر قراءة إعدادات الحملة رقم ${campaign.id}: ${error.message}`);
  }
  return { ...campaign, target_criteria: targetCriteria };
}

function validateCampaign(data) {
  const name = String(data?.name || '').trim();
  const productKeyword = String(data?.product_keyword || '').trim();
  const offerTitle = String(data?.offer_title || '').trim();
  const monthsSincePurchase = Number(data?.months_since_purchase);
  const followUpDays = Number(data?.follow_up_days);
  const discountPercentage = Number(data?.discount_percentage || 0);

  if (!name || !productKeyword || !offerTitle) {
    throw new Error('اسم الحملة والمنتج والعرض مطلوبة');
  }
  if (!Number.isInteger(monthsSincePurchase) || monthsSincePurchase < 1 || monthsSincePurchase > 120) {
    throw new Error('مدة الشراء السابقة يجب أن تكون بين شهر و120 شهرًا');
  }
  if (!Number.isInteger(followUpDays) || followUpDays < 0 || followUpDays > 365) {
    throw new Error('مدة المتابعة يجب أن تكون بين 0 و365 يومًا');
  }
  if (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
    throw new Error('نسبة الخصم يجب أن تكون بين 0 و100');
  }

  return {
    name,
    discountPercentage,
    targetCriteria: {
      product_keyword: productKeyword,
      months_since_purchase: monthsSincePurchase,
      follow_up_days: followUpDays,
      offer_title: offerTitle,
      offer_details: String(data.offer_details || '').trim(),
      discount_percentage: discountPercentage
    }
  };
}

function getAllCampaigns() {
  return crmRepo.getAllCampaigns().map(parseCampaign);
}

function createCampaign(data) {
  const campaign = validateCampaign(data);
  const campaignId = crmRepo.createCampaign(campaign);
  crmCache.invalidate();
  return parseCampaign(crmRepo.getCampaignById(campaignId));
}

function getCampaignAudience(campaignId) {
  if (!Number.isInteger(Number(campaignId)) || Number(campaignId) < 1) {
    throw new Error('معرف الحملة غير صحيح');
  }
  const campaign = parseCampaign(crmRepo.getCampaignById(Number(campaignId)));
  if (!campaign) throw new Error('الحملة غير موجودة');
  return crmRepo.getCampaignAudience(campaign.target_criteria, campaign.id);
}

function createCampaignReminders(campaignId) {
  if (!Number.isInteger(Number(campaignId)) || Number(campaignId) < 1) {
    throw new Error('معرف الحملة غير صحيح');
  }
  const campaign = parseCampaign(crmRepo.getCampaignById(Number(campaignId)));
  if (!campaign) throw new Error('الحملة غير موجودة');
  const createdCount = crmRepo.createCampaignReminders(campaign, campaign.target_criteria);
  if (createdCount > 0) {
    crmCache.invalidate();
    NotificationsService.notify({
      type: 'info',
      title: 'تم إعداد تذكيرات الحملة',
      message: `تم إنشاء ${createdCount} تذكير عرض لحملة "${campaign.name}"`,
      linkPage: 'customers'
    });
  }
  return { createdCount };
}

module.exports = {
  addInteraction,
  getUnifiedTimeline,
  createOpportunity,
  getAllOpportunities,
  updateOpportunityStage,
  updateCustomerRatingAndTier,
  checkDueReminders,
  getAllCampaigns,
  createCampaign,
  getCampaignAudience,
  createCampaignReminders
};
