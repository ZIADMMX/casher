const channelsRepo = require('../repositories/channels.repository');
const { logError } = require('./logger.service');

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

function processExternalChannelOrder(channelId, { orderNumber, items }) {
  if (!items || !items.length) throw new Error('لا توجد أصناف في الطلب');
  const results = [];
  for (const item of items) {
    const res = channelsRepo.recordChannelSaleDeduction(channelId, item.variantId, item.quantity, orderNumber);
    results.push(res);
  }
  return { success: true, processedItems: results.length };
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
