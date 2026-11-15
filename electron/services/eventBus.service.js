const EventEmitter = require('node:events');
const { logError } = require('./logger.service');

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Safely dispatch an event to all registered listeners.
   * If a listener throws or rejects, catch and log it so that
   * other listeners and callers continue uninterrupted.
   */
  emit(event, ...args) {
    const listeners = this.listeners(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }

    for (const listener of listeners) {
      try {
        const result = listener(...args);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            logError(`EventBus:${String(event)}`, err);
          });
        }
      } catch (err) {
        logError(`EventBus:${String(event)}`, err);
      }
    }
    return true;
  }
}

const eventBus = new AppEventBus();

module.exports = eventBus;

