const { safeHandle } = require('./safeHandle');
const channelsService = require('../services/channels.service');

function registerChannelsHandlers() {
  safeHandle('channels:getAll', () => {
    return channelsService.getAllChannels();
  });

  safeHandle('channels:getById', (event, id) => {
    return channelsService.getChannelById(id);
  });

  safeHandle('channels:create', (event, data) => {
    return channelsService.createChannel(data);
  });

  safeHandle('channels:update', (event, { id, data }) => {
    return channelsService.updateChannel(id, data);
  });

  safeHandle('channels:delete', (event, id) => {
    return channelsService.deleteChannel(id);
  });

  safeHandle('channels:getAllocations', (event, { channelId, filters }) => {
    return channelsService.getChannelAllocations(channelId, filters);
  });

  safeHandle('channels:updateAllocation', (event, { channelId, variantId, allocationData }) => {
    return channelsService.updateAllocation(channelId, variantId, allocationData);
  });

  safeHandle('channels:syncStock', (event, { channelId, bufferPercentage }) => {
    return channelsService.syncChannelStock(channelId, bufferPercentage);
  });

  safeHandle('channels:getSyncLogs', (event, { channelId, limit }) => {
    return channelsService.getSyncLogs(channelId, limit);
  });

  safeHandle('channels:processOrder', (event, { channelId, orderData }) => {
    return channelsService.processExternalChannelOrder(channelId, orderData);
  });
}

module.exports = { registerChannelsHandlers };
