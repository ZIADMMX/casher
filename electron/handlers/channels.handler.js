const { safeHandle } = require('./safeHandle');
const channelsService = require('../services/channels.service');

// The renderer never receives the stored keys, only whether they are set.
const hideKeys = (channel) => channel && { ...channel, api_key: undefined, api_secret: undefined, has_api_key: Boolean(channel.api_key), has_api_secret: Boolean(channel.api_secret) };

function registerChannelsHandlers() {
  safeHandle('channels:getAll', () => {
    return channelsService.getAllChannels().map(hideKeys);
  });

  safeHandle('channels:getById', (event, id) => {
    return hideKeys(channelsService.getChannelById(id));
  });

  safeHandle('channels:create', (event, data) => {
    return hideKeys(channelsService.createChannel(data));
  });

  safeHandle('channels:update', (event, { id, data }) => {
    return hideKeys(channelsService.updateChannel(id, data));
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
