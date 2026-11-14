// Every member gets a different secret QR ("GM-<id>-<token>"); the card still shows "GM-<id>".
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const members = require('../../electron/services/gymMembers.service');
const gate = require('../../electron/services/gymGate.service');

describe('gym member QR codes', () => {
  let ahmed;
  let sara;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    ahmed = db.prepare("INSERT INTO customers (name, phone) VALUES ('أحمد', '01000000001')").run().lastInsertRowid;
    sara = db.prepare("INSERT INTO customers (name, phone) VALUES ('سارة', '01000000002')").run().lastInsertRowid;
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('gives each member a different QR that still contains the GM-<id> code, and keeps it stable', () => {
    const a = members.getMemberCode(ahmed);
    const s = members.getMemberCode(sara);
    expect(a.code).toBe(`GM-${ahmed}`);
    expect(a.qr).toMatch(new RegExp(`^GM-${ahmed}-[0-9a-f]{12}$`));
    expect(s.qr).not.toBe(a.qr);
    expect(members.getMemberCode(ahmed).qr).toBe(a.qr);
  });

  it('rejects an unknown member', () => {
    expect(() => members.getMemberCode(99999)).toThrow('العميل غير موجود');
    expect(() => members.getMemberCode('x')).toThrow();
  });

  it('the gate recognises the member by the QR, and refuses a wrong or borrowed token', () => {
    const a = members.getMemberCode(ahmed);
    const s = members.getMemberCode(sara);
    expect(gate.scan({ code: a.qr }).member).toMatchObject({ id: ahmed, code: `GM-${ahmed}` });
    expect(gate.scan({ code: `GM-${ahmed}-000000000000` }).member).toBeNull();
    expect(gate.scan({ code: `GM-${ahmed}-${s.qr.split('-')[2]}` }).member).toBeNull(); // sara's token on ahmed's id
    expect(gate.scan({ code: a.qr.toUpperCase() }).member).toMatchObject({ id: ahmed });
  });

  it('still accepts the plain GM-<id> cards printed before', () => {
    expect(gate.scan({ code: `GM-${sara}` }).member).toMatchObject({ id: sara });
  });

  it('a v36 database gets the codes table from the v37 step', () => {
    db.exec('DROP TABLE gym_member_codes');
    db.pragma('user_version = 36');
    runAllMigrations();
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'gym_member_codes'").get()).toBeTruthy();
    expect(members.getMemberCode(ahmed).qr).toMatch(/^GM-\d+-[0-9a-f]{12}$/);
  });
});
