const { db } = require('../database/db');
const { encryptSecret, decryptSecret } = require('../security/vault');

function formatChannelOutput(channel) {
  if (!channel) return null;
  return {
    ...channel,
    api_key: decryptSecret(channel.api_key),
    api_secret: decryptSecret(channel.api_secret),
  };
}

function getAllChannels() {
  const rows = db.prepare(`
    SELECT c.*, w.name as warehouse_name, b.name as branch_name,
      (SELECT COUNT(*) FROM channel_stock_allocations WHERE channel_id = c.id) as allocated_items_count,
      (SELECT COALESCE(SUM(allocated_quantity), 0) FROM channel_stock_allocations WHERE channel_id = c.id) as total_allocated_units
    FROM sales_channels c
    LEFT JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN branches b ON b.id = w.branch_id
    ORDER BY c.is_active DESC, c.id ASC
  `).all();
  return rows.map(formatChannelOutput);
}

function getChannelById(id) {
  const channel = db.prepare(`
    SELECT c.*, w.name as warehouse_name, b.name as branch_name
    FROM sales_channels c
    LEFT JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN branches b ON b.id = w.branch_id
    WHERE c.id = ?
  `).get(id);
  return formatChannelOutput(channel);
}

function createChannel({ name, channel_type, warehouse_id, sync_mode = 'auto', auto_deduct_stock = 1, is_active = 1, api_key = null, api_secret = null, webhook_url = null, stock_buffer_percentage = 0, settings_json = '{}' }) {
  const encryptedApiKey = encryptSecret(api_key);
  const encryptedApiSecret = encryptSecret(api_secret);
  const result = db.prepare(`
    INSERT INTO sales_channels (name, channel_type, warehouse_id, sync_mode, auto_deduct_stock, is_active, api_key, api_secret, webhook_url, stock_buffer_percentage, settings_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, channel_type, warehouse_id || null, sync_mode, auto_deduct_stock ? 1 : 0, is_active ? 1 : 0, encryptedApiKey, encryptedApiSecret, webhook_url, Number(stock_buffer_percentage) || 0, typeof settings_json === 'string' ? settings_json : JSON.stringify(settings_json));
  
  return getChannelById(result.lastInsertRowid);
}

function updateChannel(id, data) {
  const current = db.prepare('SELECT * FROM sales_channels WHERE id = ?').get(id);
  if (!current) throw new Error('القناة المحددة غير موجودة');

  const apiKeyToSave = data.api_key !== undefined ? encryptSecret(data.api_key) : current.api_key;
  const apiSecretToSave = data.api_secret !== undefined ? encryptSecret(data.api_secret) : current.api_secret;

  db.prepare(`
    UPDATE sales_channels
    SET name = ?,
        channel_type = ?,
        warehouse_id = ?,
        sync_mode = ?,
        auto_deduct_stock = ?,
        is_active = ?,
        api_key = ?,
        api_secret = ?,
        webhook_url = ?,
        stock_buffer_percentage = ?,
        settings_json = ?
    WHERE id = ?
  `).run(
    data.name !== undefined ? data.name : current.name,
    data.channel_type !== undefined ? data.channel_type : current.channel_type,
    data.warehouse_id !== undefined ? data.warehouse_id : current.warehouse_id,
    data.sync_mode !== undefined ? data.sync_mode : current.sync_mode,
    data.auto_deduct_stock !== undefined ? (data.auto_deduct_stock ? 1 : 0) : current.auto_deduct_stock,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active,
    apiKeyToSave,
    apiSecretToSave,
    data.webhook_url !== undefined ? data.webhook_url : current.webhook_url,
    data.stock_buffer_percentage !== undefined ? Number(data.stock_buffer_percentage) : current.stock_buffer_percentage,
    data.settings_json !== undefined ? (typeof data.settings_json === 'string' ? data.settings_json : JSON.stringify(data.settings_json)) : current.settings_json,
    id
  );

  return getChannelById(id);
}

function deleteChannel(id) {
  return db.prepare('DELETE FROM sales_channels WHERE id = ?').run(id);
}

function updateChannelLastSync(id) {
  return db.prepare("UPDATE sales_channels SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

function getChannelAllocations(channelId, filters = {}) {
  const channel = getChannelById(channelId);
  const warehouseId = channel?.warehouse_id || null;

  let query = `
    SELECT 
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.sku,
      pv.barcode,
      pv.selling_price as standard_price,
      COALESCE(ws.quantity, pv.stock_quantity) as warehouse_stock,
      COALESCE(csa.allocated_quantity, 0) as allocated_quantity,
      COALESCE(csa.reserved_quantity, 0) as reserved_quantity,
      COALESCE(csa.channel_price, pv.selling_price) as channel_price,
      COALESCE(csa.is_synced, 0) as is_synced,
      csa.last_synced_at
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN warehouse_stock ws ON ws.variant_id = pv.id ${warehouseId ? 'AND ws.warehouse_id = ' + Number(warehouseId) : ''}
    LEFT JOIN channel_stock_allocations csa ON csa.variant_id = pv.id AND csa.channel_id = ?
    WHERE 1=1
  `;

  const params = [channelId];

  if (filters.search) {
    query += ` AND (p.name LIKE ? OR pv.sku LIKE ? OR pv.barcode LIKE ?)`;
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }

  if (filters.syncedOnly) {
    query += ` AND csa.is_synced = 1`;
  }

  query += ` ORDER BY p.name ASC, pv.size ASC`;

  return db.prepare(query).all(...params);
}

function upsertChannelAllocation(channelId, variantId, { allocated_quantity, reserved_quantity = 0, channel_price = null, is_synced = 1 }) {
  const stmt = db.prepare(`
    INSERT INTO channel_stock_allocations (channel_id, variant_id, allocated_quantity, reserved_quantity, channel_price, is_synced, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(channel_id, variant_id) DO UPDATE SET
      allocated_quantity = excluded.allocated_quantity,
      reserved_quantity = excluded.reserved_quantity,
      channel_price = excluded.channel_price,
      is_synced = excluded.is_synced,
      last_synced_at = CURRENT_TIMESTAMP
  `);

  return stmt.run(channelId, variantId, Math.max(0, Number(allocated_quantity) || 0), Math.max(0, Number(reserved_quantity) || 0), channel_price != null ? Number(channel_price) : null, is_synced ? 1 : 0);
}

function bulkSyncAllStockToChannel(channelId, bufferPercentage = 0) {
  const channel = getChannelById(channelId);
  if (!channel) throw new Error('القناة غير موجودة');

  const warehouseId = channel.warehouse_id;
  const multiplier = Math.max(0, 1 - (Number(bufferPercentage || channel.stock_buffer_percentage || 0) / 100));

  const variants = db.prepare(`
    SELECT pv.id as variant_id, pv.selling_price, COALESCE(ws.quantity, pv.stock_quantity, 0) as stock
    FROM product_variants pv
    LEFT JOIN warehouse_stock ws ON ws.variant_id = pv.id ${warehouseId ? 'AND ws.warehouse_id = ' + Number(warehouseId) : ''}
  `).all();

  const syncTx = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO channel_stock_allocations (channel_id, variant_id, allocated_quantity, reserved_quantity, channel_price, is_synced, last_synced_at)
      VALUES (?, ?, ?, 0, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id, variant_id) DO UPDATE SET
        allocated_quantity = excluded.allocated_quantity,
        is_synced = 1,
        last_synced_at = CURRENT_TIMESTAMP
    `);

    for (const v of variants) {
      const calculatedQty = Math.floor(Math.max(0, v.stock) * multiplier);
      upsert.run(channelId, v.variant_id, calculatedQty, v.selling_price);
    }

    updateChannelLastSync(channelId);
    logSync(channelId, 'bulk_stock_sync', 'success', variants.length, JSON.stringify({ syncedVariants: variants.length, bufferApplied: `${(1 - multiplier) * 100}%` }));
  });

  syncTx();
  return { success: true, count: variants.length };
}

function logSync(channelId, syncAction, status, itemsCount = 0, detailsJson = '{}') {
  return db.prepare(`
    INSERT INTO channel_sync_logs (channel_id, sync_action, status, items_count, details_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(channelId, syncAction, status, itemsCount, detailsJson);
}

function getSyncLogs(channelId = null, limit = 50) {
  if (channelId) {
    return db.prepare(`
      SELECT l.*, c.name as channel_name, c.channel_type
      FROM channel_sync_logs l
      JOIN sales_channels c ON c.id = l.channel_id
      WHERE l.channel_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(channelId, limit);
  }
  return db.prepare(`
    SELECT l.*, c.name as channel_name, c.channel_type
    FROM channel_sync_logs l
    JOIN sales_channels c ON c.id = l.channel_id
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(limit);
}

function recordChannelSaleDeduction(channelId, variantId, quantity, externalOrderId = '') {
  const channel = getChannelById(channelId);
  if (!channel) throw new Error('القناة غير موجودة');

  const runTx = db.transaction(() => {
    // 1. خصم من جدول تخصيص القناة
    db.prepare(`
      UPDATE channel_stock_allocations
      SET allocated_quantity = MAX(0, allocated_quantity - ?),
          last_synced_at = CURRENT_TIMESTAMP
      WHERE channel_id = ? AND variant_id = ?
    `).run(quantity, channelId, variantId);

    // 2. إذا تم تفعيل auto_deduct_stock، يتم الخصم من المخزن المرتبط
    if (channel.auto_deduct_stock && channel.warehouse_id) {
      const inventoryRepo = require('./inventory.repository');
      const currentStock = inventoryRepo.getStockQuantity(channel.warehouse_id, variantId);
      const newStock = Math.max(0, currentStock - quantity);
      db.prepare(`
        UPDATE warehouse_stock
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE warehouse_id = ? AND variant_id = ?
      `).run(newStock, channel.warehouse_id, variantId);

      // تسجيل حركة مخزنية
      db.prepare(`
        INSERT INTO inventory_movements (warehouse_id, variant_id, movement_type, quantity_change, quantity_after, notes)
        VALUES (?, ?, 'sale', ?, ?, ?)
      `).run(channel.warehouse_id, variantId, -quantity, newStock, `مبيعات قناة إلكترونية: ${channel.name} ${externalOrderId ? '#' + externalOrderId : ''}`);
    }

    logSync(channelId, 'channel_order_deduct', 'success', 1, JSON.stringify({ variantId, quantity, externalOrderId }));
  });

  runTx();
  return { success: true };
}

module.exports = {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  updateChannelLastSync,
  getChannelAllocations,
  upsertChannelAllocation,
  bulkSyncAllStockToChannel,
  logSync,
  getSyncLogs,
  recordChannelSaleDeduction
};
