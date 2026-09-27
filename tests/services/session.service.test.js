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
