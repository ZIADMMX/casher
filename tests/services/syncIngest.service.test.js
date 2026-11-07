// Cloud sync, server side: what a device may push and how it is stored.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { SYNC_TABLES: LOCAL_TABLES } = require('../../electron/database/migrations/syncMetadata');
const { closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const sync = require('../../electron/services/syncIngest.service');

const UUID_A = '11111111-1111-4111-8111-111111111111';
const record = (over = {}) => ({ table: 'sales', uuid: UUID_A, updated_at: '2026-01-01T00:00:00.000Z', data: { id: 1 }, ...over });

afterAll(() => closeDatabase());

test('server accepts exactly the tables the desktop syncs', () => {
  expect(sync.SYNC_TABLES).toEqual(LOCAL_TABLES);
});

describe('validateBatch', () => {
  test.each([
    ['empty batch', { records: [] }],
    ['too many rows', { records: Array(sync.MAX_RECORDS + 1).fill(record()) }],
    ['unknown table', { records: [record({ table: 'users' })] }],
    ['bad uuid', { records: [record({ uuid: '1; DROP TABLE x' })] }],
    ['bad timestamp', { records: [record({ updated_at: 'yesterday' })] }],
    ['data not an object', { records: [record({ data: [1] })] }],
  ])('rejects %s with 400', (_name, body) => {
    expect(() => sync.validateBatch(body)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test('keeps only the newest copy of a row sent twice', () => {
    const rows = sync.validateBatch({ records: [
      record({ updated_at: '2026-01-02T00:00:00Z', data: { v: 2 } }),
      record({ updated_at: '2026-01-01T00:00:00Z', data: { v: 1 } }),
    ] });
    expect(rows).toEqual([expect.objectContaining({ data: { v: 2 }, updated_at: '2026-01-02T00:00:00.000Z' })]);
  });

  test('pulls a timestamp from the future back to the server clock', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const [row] = sync.validateBatch({ records: [record({ updated_at: '2030-01-01T00:00:00Z' })] }, now);
    expect(Date.parse(row.updated_at)).toBe(now + 5 * 60 * 1000);
  });
});

test('readDeviceKey only accepts a well-formed device key', () => {
  const key = sync.newDeviceKey();
  expect(sync.readDeviceKey({ headers: { authorization: `Bearer ${key}` } })).toBe(key);
  expect(sync.readDeviceKey({ headers: { authorization: 'Bearer eyJhbGciOi.jwt.token' } })).toBeNull();
  expect(sync.readDeviceKey({ headers: {} })).toBeNull();
});

test('findDevice looks the key up by hash, never in plain text', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ id: 3, branch_id: 2 }] });
  const key = sync.newDeviceKey();
  await expect(sync.findDevice(query, key)).resolves.toEqual({ id: 3, branch_id: 2 });
  expect(query.mock.calls[0][1]).toEqual([sync.hashKey(key)]);
  expect(JSON.stringify(query.mock.calls)).not.toContain(key);
});

test('ingest writes rows under the pushing device and branch only', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const rows = sync.validateBatch({ records: [record()] });
  await expect(sync.ingest(query, { id: 3, branch_id: 2 }, rows)).resolves.toEqual({ accepted: 1 });
  const [sql, params] = query.mock.calls[0];
  expect(sql).toContain('WHERE sync_records.updated_at <= EXCLUDED.updated_at');
  expect(params.slice(0, 5)).toEqual([3, 2, ['sales'], [UUID_A], ['2026-01-01T00:00:00.000Z']]);
  expect(params[5]).toEqual(['{"id":1}']);
});
