const crypto = require('node:crypto');
const { getDeviceId } = require('../security/deviceId');
const { logError } = require('./logger.service');
const { db } = require('../database/db');
const Settings = require('../repositories/settings.repository');
const { guardedFetch } = require('./circuitBreaker.service');

// What this copy proves it owns its cloud store with. Once activated that is the licence key,
// which the Worker verifies against this machine. Before activation there is no licence, so a
// key made here claims the device instead; activating later overrides the claim.
function syncKey() {
  const read = (name) => {
    try { return String(Settings.get(name) || '').trim(); } catch { return ''; }
  };
  const license = read('license_key');
  if (license) return license;

  let key = read('cloud_customer_sync_key');
  if (!key) {
    key = crypto.randomBytes(32).toString('hex');
    Settings.set('cloud_customer_sync_key', key);
  }
  return key;
}

function syncHeaders(withBody = false) {
  const headers = { Authorization: `Bearer ${syncKey()}` };
  if (withBody) headers['Content-Type'] = 'application/json';
  return headers;
}

function getSyncEndpoint() {
  if (process.env.FOX_CUSTOMER_SYNC_URL) {
    return process.env.FOX_CUSTOMER_SYNC_URL;
  }
  const licenseUrl = process.env.FOX_LICENSE_TIME_URL;
  if (licenseUrl && licenseUrl.includes('/api/license/time')) {
    return licenseUrl.replace('/api/license/time', '/api/sync/customers');
  }
  return 'https://foxcloud-license.foxcloud-pos.workers.dev/api/sync/customers';
}

/**
 * Push all local customers to Cloudflare D1
 */
async function pushCustomersToCloud(options = {}) {
  const onlyUnsynced = options.onlyUnsynced ?? false;
  try {
    const device = getDeviceId();
    if (!device) {
      throw new Error('Device hardware ID is unavailable');
    }

    let query = `
      SELECT id, uuid, name, phone, email, loyalty_points, is_active, updated_at
      FROM customers
    `;
    if (onlyUnsynced) {
      query += ` WHERE is_synced = 0 OR is_synced IS NULL`;
    }
    const localCustomers = db.prepare(query).all();

    if (!localCustomers || localCustomers.length === 0) {
      return { success: true, count: 0, message: 'لا توجد بيانات عملاء جديدة للرفع' };
    }

    const batchSize = 200;
    let totalSynced = 0;

    for (let i = 0; i < localCustomers.length; i += batchSize) {
      const slice = localCustomers.slice(i, i + batchSize);
      const payload = {
        device,
        customers: slice.map((c) => ({
          uuid: c.uuid || `cust-${c.id}`,
          name: c.name,
          phone: c.phone || null,
          email: c.email || null,
          loyalty_points: Number(c.loyalty_points) || 0,
          is_active: c.is_active === 0 ? 0 : 1,
          tier: null,
          rating: 5,
          updated_at: c.updated_at ? new Date(c.updated_at).getTime() : Date.now(),
        })),
      };

      const response = await guardedFetch(getSyncEndpoint(), {
        method: 'POST',
        headers: syncHeaders(true),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare sync error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'فشلت المزامنة السحابية');
      }

      const markSynced = db.prepare(`
        UPDATE customers
        SET is_synced = 1, synced_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      db.transaction(() => {
        for (const c of slice) {
          markSynced.run(c.id);
        }
      })();

      totalSynced += slice.length;
    }

    return {
      success: true,
      count: totalSynced,
      message: `تم رفع وتأمين ${totalSynced} عميل على السحابة بنجاح`,
    };
  } catch (error) {
    logError('CloudCustomerSync:push', error);
    return { success: false, error: error.message };
  }
}

/**
 * Pull customers from Cloudflare D1 into local SQLite database
 */
async function pullCustomersFromCloud() {
  try {
    const device = getDeviceId();
    if (!device) {
      throw new Error('Device hardware ID is unavailable');
    }

    const url = `${getSyncEndpoint()}?device=${encodeURIComponent(device)}&since=0`;
    const response = await guardedFetch(url, { method: 'GET', headers: syncHeaders() });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare pull error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.customers)) {
      throw new Error(data.error || 'تعذر جلب بيانات العملاء من السحابة');
    }

    const cloudList = data.customers;
    if (cloudList.length === 0) {
      return { success: true, count: 0, message: 'لا توجد بيانات عملاء مخزنة على السحابة لهذا الجهاز' };
    }

    let inserted = 0;
    let updated = 0;

    const findByUuid = db.prepare('SELECT id FROM customers WHERE uuid = ?');
    const insertCustomer = db.prepare(`
      INSERT INTO customers (
        uuid, name, phone, email, loyalty_points, is_active, is_synced, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `);
    const updateCustomer = db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, email = ?, loyalty_points = ?, is_active = ?, is_synced = 1, synced_at = CURRENT_TIMESTAMP
      WHERE uuid = ?
    `);

    db.transaction(() => {
      for (const c of cloudList) {
        const existing = findByUuid.get(c.uuid);
        if (existing) {
          updateCustomer.run(
            c.name,
            c.phone || null,
            c.email || null,
            Number(c.loyalty_points) || 0,
            c.is_active === 0 ? 0 : 1,
            c.uuid
          );
          updated++;
        } else {
          insertCustomer.run(
            c.uuid,
            c.name,
            c.phone || null,
            c.email || null,
            Number(c.loyalty_points) || 0,
            c.is_active === 0 ? 0 : 1
          );
          inserted++;
        }
      }
    })();

    return {
      success: true,
      inserted,
      updated,
      total: cloudList.length,
      message: `تم استرجاع ${cloudList.length} عميل من السحابة (${inserted} جديد، ${updated} تم تحديثه)`,
    };
  } catch (error) {
    logError('CloudCustomerSync:pull', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync a single customer immediately (called on create/update)
 */
async function syncSingleCustomer(customerId) {
  try {
    const customer = db.prepare(`
      SELECT id, uuid, name, phone, email, loyalty_points, is_active, updated_at
      FROM customers
      WHERE id = ?
    `).get(customerId);

    if (!customer) return false;

    const device = getDeviceId();
    if (!device) return false;

    const payload = {
      device,
      customers: [{
        uuid: customer.uuid || `cust-${customer.id}`,
        name: customer.name,
        phone: customer.phone || null,
        email: customer.email || null,
        loyalty_points: Number(customer.loyalty_points) || 0,
        is_active: customer.is_active === 0 ? 0 : 1,
        tier: null,
        rating: 5,
        updated_at: customer.updated_at ? new Date(customer.updated_at).getTime() : Date.now(),
      }],
    };

    const response = await guardedFetch(getSyncEndpoint(), {
      method: 'POST',
      headers: syncHeaders(true),
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      db.prepare(`
        UPDATE customers SET is_synced = 1, synced_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(customerId);
      return true;
    }
    return false;
  } catch (error) {
    // Non-blocking fail in background
    logError('CloudCustomerSync:single', error);
    return false;
  }
}

module.exports = {
  pushCustomersToCloud,
  pullCustomersFromCloud,
  syncSingleCustomer,
  getSyncEndpoint,
};
