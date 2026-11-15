const eventBus = require('../../electron/services/eventBus.service');

describe('AppEventBus (Event-Driven Architecture)', () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  test('dispatches events and delivers payload to subscribers', () => {
    const received = [];
    eventBus.on('test:event', (payload) => {
      received.push(payload);
    });

    eventBus.emit('test:event', { id: 123, status: 'success' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ id: 123, status: 'success' });
  });

  test('survives listener exception without breaking other listeners', () => {
    const executed = [];

    eventBus.on('fault:test', () => {
      executed.push('first');
      throw new Error('Boom in listener 1');
    });

    eventBus.on('fault:test', () => {
      executed.push('second');
    });

    expect(() => {
      eventBus.emit('fault:test', {});
    }).not.toThrow();

    expect(executed).toEqual(['first', 'second']);
  });

  test('handles async listeners safely if promise rejects', async () => {
    let secondRan = false;

    eventBus.on('async:test', async () => {
      throw new Error('Async boom');
    });

    eventBus.on('async:test', () => {
      secondRan = true;
    });

    expect(() => {
      eventBus.emit('async:test', {});
    }).not.toThrow();

    expect(secondRan).toBe(true);
  });
});

