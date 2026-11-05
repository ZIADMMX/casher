const channelsRepo = require('../repositories/channels.repository');
const { logError } = require('./logger.service');
const { getCurrentSession } = require('./auth.service');

function getAllChannels() {
  return channelsRepo.getAllChannels();
}

function getChannelById(id) {
  return channelsRepo.getChannelById(id);
}

function createChannel(data) {
  if (!data.name || !data.name.trim()) throw new Error('اسم القناة مطلوب');
  if (!data.channel_type) throw new Error('نوع القناة مطلوب');
  return channelsRepo.createChannel(data);
}

function updateChannel(id, data) {
  return channelsRepo.updateChannel(id, data);
}

function deleteChannel(id) {
  return channelsRepo.deleteChannel(id);
}

function getChannelAllocations(channelId, filters) {
  return channelsRepo.getChannelAllocations(channelId, filters);
}

function updateAllocation(channelId, variantId, allocationData) {
  return channelsRepo.upsertChannelAllocation(channelId, variantId, allocationData);
}

function syncChannelStock(channelId, bufferPercentage = 0) {
  try {
    return channelsRepo.bulkSyncAllStockToChannel(channelId, bufferPercentage);
  } catch (err) {
    logError('ChannelSyncService', err);
    channelsRepo.logSync(channelId, 'stock_sync_error', 'failed', 0, JSON.stringify({ error: err.message }));
    throw err;
  }
}

function getSyncLogs(channelId, limit) {
  return channelsRepo.getSyncLogs(channelId, limit);
}

const MAX_CHANNEL_ORDER_QUANTITY = 100000;

function positiveInteger(value, message) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(message);
  return number;
}

/**
 * Validates an external order before it touches stock. A negative or fractional
 * quantity used to *add* stock; duplicates are merged so one line can't be split
 * to dodge the checks.
 */
function normalizeChannelOrderItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('لا توجد أصناف في الطلب');
  const combined = new Map();
  for (const item of items) {
    const variantId = positiveInteger(item?.variantId, 'معرف الصنف في الطلب غير صالح');
    const quantity = positiveInteger(item?.quantity, 'كمية الصنف في الطلب يجب أن تكون عددًا صحيحًا موجبًا');
    const total = (combined.get(variantId) || 0) + quantity;
    if (total > MAX_CHANNEL_ORDER_QUANTITY) {
      throw new Error(`كمية الصنف في الطلب لا يمكن أن تتجاوز ${MAX_CHANNEL_ORDER_QUANTITY}`);
    }
    combined.set(variantId, total);
  }
  return [...combined].map(([variantId, quantity]) => ({ variantId, quantity }));
}

function processExternalChannelOrder(channelId, { orderNumber, items } = {}) {
  const id = positiveInteger(channelId, 'معرف القناة غير صالح');
  const normalizedItems = normalizeChannelOrderItems(items);
  const externalOrderId = String(orderNumber ?? '').trim().slice(0, 100);
  const userId = getCurrentSession()?.id || null;
  return channelsRepo.recordChannelOrderDeduction(id, normalizedItems, externalOrderId, userId);
}

module.exports = {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelAllocations,
  updateAllocation,
  syncChannelStock,
  getSyncLogs,
  processExternalChannelOrder,
};
