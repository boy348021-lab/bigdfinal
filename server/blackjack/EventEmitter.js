/**
 * EventEmitter - Decoupled Event System
 * Emits state snapshot events for UI and logging without modifying DOM or game logic.
 */
export default class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        try {
          callback(data);
        } catch (err) {
          console.error(`EventEmitter error on event '${event}':`, err);
        }
      }
    }
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}
