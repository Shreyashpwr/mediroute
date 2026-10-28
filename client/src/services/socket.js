/**
 * MediRoute Client-Side Socket.IO Service.
 *
 * Provides a managed real-time connection with:
 * - JWT authentication handshake.
 * - Reactive connection state tracking ('connected' | 'reconnecting' | 'disconnected').
 * - Subscription management with automatic listener cleanup functions.
 * - Controlled reconnect/resync triggers to prevent stale state.
 */

import { io } from 'socket.io-client';
import { SOCKET_BASE_URL, REALTIME_EVENTS } from '../utils/constants.js';

class SocketService {
  constructor() {
    this.socket = null;
    this.connectionState = 'disconnected'; // 'connected' | 'reconnecting' | 'disconnected'
    this.stateListeners = new Set();
    this.activeRooms = new Set();
    this.reconnectCallbacks = new Set();
  }

  /**
   * Returns current connection state
   */
  getState() {
    return this.connectionState;
  }

  /**
   * Subscribe to connection state changes
   * @param {function(string): void} callback
   * @returns {function(): void} unsubscribe function
   */
  onStateChange(callback) {
    if (typeof callback !== 'function') return () => {};
    this.stateListeners.add(callback);
    callback(this.connectionState); // immediate invocation
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Register a callback to fire upon successful reconnection (for data resync)
   */
  onReconnect(callback) {
    if (typeof callback !== 'function') return () => {};
    this.reconnectCallbacks.add(callback);
    return () => this.reconnectCallbacks.delete(callback);
  }

  _setState(newState) {
    if (this.connectionState === newState) return;
    this.connectionState = newState;
    this.stateListeners.forEach((listener) => {
      try {
        listener(newState);
      } catch (err) {
        console.error('[SocketService] Error in state listener:', err);
      }
    });
  }

  /**
   * Connects to the Socket.IO server using the stored JWT token.
   * Safe to call multiple times; will not create duplicate connections.
   */
  connect() {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('mediroute_token') : null;
    if (!token) {
      this._setState('disconnected');
      return;
    }

    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.auth = { token };
        this.socket.connect();
      }
      return;
    }

    this._setState('reconnecting');

    this.socket = io(SOCKET_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      this._setState('connected');
      // Re-join active rooms
      this.activeRooms.forEach((room) => {
        this.socket.emit('subscribe:room', { room });
      });
      // Trigger resync callbacks
      this.reconnectCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.error('[SocketService] Error in reconnect callback:', err);
        }
      });
    });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        this._setState('disconnected');
      } else {
        this._setState('reconnecting');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[SocketService] Connection error:', error.message);
      if (error.message && error.message.includes('Authentication failed')) {
        this._setState('disconnected');
      } else {
        this._setState('reconnecting');
      }
    });

    this.socket.on('reconnect', () => {
      this._setState('connected');
    });

    this.socket.on('reconnect_attempt', () => {
      this._setState('reconnecting');
    });

    this.socket.on('reconnect_failed', () => {
      this._setState('disconnected');
    });
  }

  /**
   * Cleanly disconnects the socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this._setState('disconnected');
  }

  /**
   * Request to join a specific room (e.g. 'facility:123')
   */
  joinRoom(room) {
    if (!room) return;
    this.activeRooms.add(room);
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe:room', { room });
    }
  }

  /**
   * Request to leave a specific room
   */
  leaveRoom(room) {
    if (!room) return;
    this.activeRooms.delete(room);
    if (this.socket && this.socket.connected) {
      this.socket.emit('unsubscribe:room', { room });
    }
  }

  /**
   * Subscribes to a real-time event.
   * Returns a cleanup function that automatically unsubscribes the listener when unmounting.
   *
   * @param {string} eventName
   * @param {function(any): void} handler
   * @returns {function(): void} Unsubscribe cleanup function
   */
  subscribe(eventName, handler) {
    if (!eventName || typeof handler !== 'function') return () => {};

    // Ensure socket is initialized and connected
    this.connect();

    const listener = (envelope) => {
      try {
        // Envelopes contain { eventId, eventType, timestamp, data, isSimulatedData }
        const data = envelope?.data !== undefined ? envelope.data : envelope;
        handler(data, envelope);
      } catch (err) {
        console.error(`[SocketService] Error processing event '${eventName}':`, err);
      }
    };

    if (this.socket) {
      this.socket.on(eventName, listener);
    }

    return () => {
      if (this.socket) {
        this.socket.off(eventName, listener);
      }
    };
  }
}

export const socketService = new SocketService();
export { REALTIME_EVENTS };
export default socketService;
