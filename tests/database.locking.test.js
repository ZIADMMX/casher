describe('database locking configuration', () => {
  test('applies WAL and busy timeout before writing to SQLite', () => {
    const { configureDatabaseConnection } = require('../electron/database/db');
    const fakeDb = { pragma: jest.fn() };

    configureDatabaseConnection(fakeDb);

    expect(fakeDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
    expect(fakeDb.pragma).toHaveBeenCalledWith('busy_timeout = 30000');
    expect(fakeDb.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
  });
});
