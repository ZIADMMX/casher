const jwt = require('jsonwebtoken');
const sessionService = require('../../electron/services/session.service');

describe('session.service', () => {
  test('generates and verifies a token with a unique token id', () => {
    const token = sessionService.generateToken({ id: 1, username: 'admin', role: 'admin' });
    const decoded = sessionService.verifyToken(token);

    expect(decoded).toEqual(expect.objectContaining({
      id: 1,
      username: 'admin',
      role: 'admin',
    }));
    expect(decoded.jti).toEqual(expect.any(String));
    expect(sessionService.getTokenTTL(token)).toBeGreaterThan(0);
  });

  test('rejects a token after it is invalidated', () => {
    const token = sessionService.generateToken({ id: 2, username: 'cashier', role: 'cashier' });

    sessionService.invalidateToken(token);

    expect(() => sessionService.verifyToken(token)).toThrow('TokenRevoked');
  });

  test('refreshes a valid token without copying JWT internal claims', () => {
    const token = sessionService.generateToken({ id: 3, username: 'owner', role: 'admin' });
    const refreshed = sessionService.refreshToken(token);
    const originalClaims = jwt.decode(token);
    const refreshedClaims = sessionService.verifyToken(refreshed);

    expect(refreshed).not.toBe(token);
    expect(refreshedClaims).toEqual(expect.objectContaining({
      id: 3,
      username: 'owner',
      role: 'admin',
    }));
    expect(refreshedClaims.jti).not.toBe(originalClaims.jti);
    expect(refreshedClaims.iat).toBeGreaterThanOrEqual(originalClaims.iat);
  });

  test('does not refresh an invalidated token', () => {
    const token = sessionService.generateToken({ id: 4, username: 'cashier', role: 'cashier' });
    sessionService.invalidateToken(token);

    expect(() => sessionService.refreshToken(token)).toThrow('TokenRevoked');
  });
});

describe('one live login per user', () => {
  const login = (userId, owner) => {
    sessionService.assertUserFree(userId, owner);
    const token = sessionService.generateToken({ id: userId, username: `u${userId}`, role: 'cashier' });
    sessionService.bindUser(userId, token, owner);
    return token;
  };

  test('a second device is refused while the first is signed in, and allowed after logout', () => {
    const first = login(101, 'device:A');
    expect(() => sessionService.assertUserFree(101, 'device:B')).toThrow('مسجّل دخوله حاليًا');
    sessionService.invalidateToken(first);
    expect(() => sessionService.assertUserFree(101, 'device:B')).not.toThrow();
  });

  test('the same device can sign in again and the old token stops working', () => {
    const first = login(102, 'device:A');
    const second = login(102, 'device:A');
    expect(() => sessionService.verifyToken(first)).toThrow('TokenRevoked');
    expect(sessionService.verifyToken(second).id).toBe(102);
  });

  test('a refreshed token keeps the account claimed by the same device', () => {
    const first = login(103, 'device:A');
    const refreshed = sessionService.refreshToken(first);
    expect(() => sessionService.assertUserFree(103, 'device:B')).toThrow('مسجّل دخوله حاليًا');
    sessionService.invalidateToken(refreshed);
    expect(() => sessionService.assertUserFree(103, 'device:B')).not.toThrow();
  });

  test('an account nobody has used for ten minutes is free again', () => {
    login(104, 'device:A');
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
    try {
      expect(() => sessionService.assertUserFree(104, 'device:B')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
