// Feature modules, business profiles and product attribute definitions.
const enterpriseRepo = require('../../repositories/enterprise.repository');
const { ALWAYS_ENABLED_PROFILE_MODULES, PROFILE_BASELINE_MODULES, PRESET_ATTRIBUTE_KEYS } = require('./defaults');

function getModules() {
  return enterpriseRepo.getModules();
}

function setModuleEnabled(key, isEnabled) {
  if (!isEnabled && ALWAYS_ENABLED_PROFILE_MODULES.includes(key)) {
    throw new Error('لا يمكن تعطيل وحدة أساسية مطلوبة لتشغيل النظام');
  }
  return enterpriseRepo.setModuleEnabled(key, isEnabled);
}

function getBusinessProfiles() {
  return enterpriseRepo.getBusinessProfiles();
}

function getActiveBusinessProfile() {
  return enterpriseRepo.getActiveBusinessProfile();
}

function setActiveBusinessProfile(profileKey) {
  const profile = enterpriseRepo.getBusinessProfiles().find((item) => item.key === profileKey);
  if (!profile) throw new Error('القالب التجاري المحدد غير موجود');
  const settings = parseProfileSettings(profile);
  const baselineModules = profileKey === 'crm'
    ? ['settings', 'enterprise', 'users']
    : PROFILE_BASELINE_MODULES;
  const enabledModules = new Set([
    ...baselineModules,
    ...(settings.enabled_modules || []),
  ]);
  return enterpriseRepo.setActiveBusinessProfile(profileKey, [...enabledModules]);
}

function getAttributeDefinitions(profileKey = null) {
  const profile = profileKey
    ? enterpriseRepo.getBusinessProfiles().find((item) => item.key === profileKey)
    : enterpriseRepo.getActiveBusinessProfile();
  const configuredKeys = profile ? parseProfileSettings(profile).attributes : null;
  const definitions = enterpriseRepo.getAttributeDefinitions(profile?.key || null);
  // An empty list means "no preset fields", not "every preset field".
  if (!profile) return definitions;
  const allowedKeys = new Set(configuredKeys || []);
  return definitions.filter((definition) =>
    allowedKeys.has(definition.attribute_key) ||
    definition.business_profile_key === profile?.key ||
    !PRESET_ATTRIBUTE_KEYS.has(definition.attribute_key)
  );
}

function parseProfileSettings(profile) {
  if (!profile?.settings_json) return {};
  const settings = typeof profile.settings_json === 'string'
    ? JSON.parse(profile.settings_json)
    : profile.settings_json;
  return {
    ...settings,
    attributes: settings.product_attributes || settings.attributes || [],
    terms: settings.terms || {
      order: settings.term_order,
      customer: settings.term_customer,
    },
  };
}

function getActiveBusinessConfiguration() {
  const profile = enterpriseRepo.getActiveBusinessProfile();
  const settings = parseProfileSettings(profile);
  return {
    profile: profile ? { key: profile.key, name: profile.name } : null,
    settings,
    modules: enterpriseRepo.getModules(),
    attributes: getAttributeDefinitions(profile?.key || null),
  };
}

function createAttributeDefinition(data) {
  if (!data.attribute_name || !data.attribute_key) {
    throw new Error('اسم ومفتاح الخاصية مطلوبان');
  }
  return enterpriseRepo.createAttributeDefinition(data);
}

function getVariantAttributeValues(variantId) {
  return enterpriseRepo.getVariantAttributeValues(variantId);
}

function getAllVariantAttributeValues() {
  return enterpriseRepo.getAllVariantAttributeValues();
}

function saveVariantAttributeValues(variantId, valuesMap) {
  if (!Number.isInteger(Number(variantId)) || Number(variantId) <= 0) {
    throw new Error('معرف متغير المنتج غير صالح');
  }
  const definitions = getAttributeDefinitions();
  const allowedIds = new Set(definitions.map((definition) => String(definition.id)));
  const values = valuesMap && typeof valuesMap === 'object' ? valuesMap : {};

  for (const definition of definitions) {
    const value = values[definition.id];
    if (definition.is_required && (value == null || String(value).trim() === '')) {
      throw new Error(`الحقل ${definition.attribute_name} مطلوب`);
    }
  }
  for (const key of Object.keys(values)) {
    if (!allowedIds.has(String(key))) {
      throw new Error('تحتوي خصائص المنتج على حقل غير مسموح به');
    }
  }
  const allowedValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => allowedIds.has(String(key)))
  );
  return enterpriseRepo.saveVariantAttributeValues(variantId, allowedValues, [...allowedIds]);
}

module.exports = {
  getModules,
  setModuleEnabled,
  getBusinessProfiles,
  getActiveBusinessProfile,
  setActiveBusinessProfile,
  getAttributeDefinitions,
  getActiveBusinessConfiguration,
  createAttributeDefinition,
  getVariantAttributeValues,
  getAllVariantAttributeValues,
  saveVariantAttributeValues,
};
