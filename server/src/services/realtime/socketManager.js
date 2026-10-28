/**
 * MediRoute Real-Time Socket.IO Manager.
 *
 * Implements:
 * 1. Secure JWT authentication middleware on socket handshake.
 * 2. Role-based room management (operations, facility, driver, patient).
 * 3. Schema-validated sanitized event emitters.
 * 4. PII isolation: patients only receive their own incident status without fleet or other patient data.
 */

import { verifyToken } from '../../utils/token.js';
import User from '../../models/User.js';
import logger from '../../utils/logger.js';
import {
  REALTIME_EVENTS,
  createEventEnvelope,
  validateAmbulanceLocationPayload,
  validateAmbulanceStatusPayload,
  validateDispatchCreatedPayload,
  validateDispatchAssignedPayload,
  validateDispatchStatusPayload,
  validateHospitalPreAlertPayload,
  validateFacilityCapacityPayload,
  validateRoadNetworkPayload,
} from './eventSchemas.js';

let io = null;

export const setIO = (ioInstance) => {
  io = ioInstance;
};

export const getIO = () => io;

/**
 * Socket.io Authentication Middleware.
 * Rejects unauthenticated connections and extracts user identity from JWT.
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication failed: valid JWT token required for real-time connection.'));
    }

    const decoded = verifyToken(token);
    const userId = typeof decoded?.id === 'object' && decoded.id !== null
      ? (decoded.id.id || decoded.id._id)
      : decoded?.id;
    if (!userId) {
      return next(new Error('Authentication failed: token payload invalid.'));
    }

    const user = await User.findById(userId).select('name email role approvalStatus isActive');
    if (!user) {
      return next(new Error('Authentication failed: user belonging to token no longer exists.'));
    }

    if (!user.isActive) {
      return next(new Error('Authentication failed: user account is deactivated.'));
    }

    if (user.approvalStatus !== 'approved') {
      return next(new Error('Authentication failed: user account is awaiting administrator approval.'));
    }

    socket.user = {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    logger.warn(`[Socket.io Auth] Authentication rejected for socket ${socket.id}: ${err.message}`);
    next(new Error(`Authentication failed: ${err.message}`));
  }
};

/**
 * Initializes Socket.io server with authentication, room segmentation, and lifecycle listeners.
 * @param {import('socket.io').Server} ioServer
 */
export const initSocketManager = (ioServer) => {
  setIO(ioServer);

  // 1. Register JWT Authentication Middleware
  ioServer.use(socketAuthMiddleware);

  // 2. Handle Connected Sockets
  ioServer.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`[Socket.io] Authenticated user connected: ${user.name} (${user.role}) [socket: ${socket.id}]`);

    // Automatic Room Assignment based on Role & Permissions
    if (['admin', 'dispatcher', 'medical_staff'].includes(user.role)) {
      socket.join('operations');
      logger.info(`[Socket.io] Socket ${socket.id} joined 'operations' room`);
    }

    if (['driver', 'transport_operator'].includes(user.role)) {
      socket.join(`driver:${user._id}`);
      socket.join('fleet');
      logger.info(`[Socket.io] Driver socket ${socket.id} joined room 'driver:${user._id}'`);
    }

    if (user.role === 'patient') {
      socket.join(`patient:${user._id}`);
      logger.info(`[Socket.io] Patient socket ${socket.id} joined room 'patient:${user._id}'`);
    }

    // Client-side room subscription requests (with permission checks)
    socket.on('subscribe:room', ({ room }) => {
      if (!room || typeof room !== 'string') return;

      // Patients cannot join operations or fleet rooms
      if (user.role === 'patient' && (room === 'operations' || room === 'fleet')) {
        socket.emit('error', { message: 'Unauthorized: patients cannot access operational telemetry rooms' });
        return;
      }

      socket.join(room);
      socket.emit('subscribed', { room, success: true });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket.io] User ${user.name} disconnected (${reason})`);
    });
  });

  return ioServer;
};

// ============================================================================
// SANITIZED EMITTER HELPERS
// ============================================================================

/**
 * Broadcasts ambulance location update to authorized operations & fleet rooms.
 */
export const emitAmbulanceLocationUpdate = (payload) => {
  if (!io) return;
  try {
    const coords = payload.coordinates || payload.location?.coordinates;
    const ambulanceId = payload._id || payload.ambulanceId;
    const ambulanceIdTag = payload.ambulanceIdTag || (typeof payload.ambulanceId === 'string' ? payload.ambulanceId : 'AMB');
    const address = payload.address || (typeof payload.location?.address === 'string' ? payload.location.address : 'In Transit');
    const validated = validateAmbulanceLocationPayload({
      ambulanceId,
      ambulanceIdTag,
      coordinates: coords,
      address,
      heading: payload.heading,
      speedKmH: payload.speedKmH,
    });
    const envelope = createEventEnvelope(REALTIME_EVENTS.AMBULANCE_LOCATION, validated);
    io.to('operations').to('fleet').emit(REALTIME_EVENTS.AMBULANCE_LOCATION, envelope);
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit ambulance location: ${err.message}`);
  }
};

/**
 * Broadcasts ambulance status change.
 */
export const emitAmbulanceStatusChange = (payload) => {
  if (!io) return;
  try {
    const ambulanceId = payload._id || payload.ambulanceId;
    const ambulanceIdTag = payload.ambulanceIdTag || (typeof payload.ambulanceId === 'string' ? payload.ambulanceId : 'AMB');
    const validated = validateAmbulanceStatusPayload({
      ambulanceId,
      ambulanceIdTag,
      status: payload.status,
      currentDispatchId: payload.currentDispatch?._id || payload.currentDispatch || payload.currentDispatchId,
      destinationFacilityId: payload.destinationFacility?._id || payload.destinationFacility || payload.destinationFacilityId,
      destinationFacilityName: payload.destinationFacility?.name || payload.destinationFacilityName,
    });
    const envelope = createEventEnvelope(REALTIME_EVENTS.AMBULANCE_STATUS, validated);
    io.to('operations').to('fleet').emit(REALTIME_EVENTS.AMBULANCE_STATUS, envelope);
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit ambulance status: ${err.message}`);
  }
};

/**
 * Broadcasts dispatch created event to dispatchers & operations.
 */
export const emitDispatchCreated = (dispatch) => {
  if (!io) return;
  try {
    const validated = validateDispatchCreatedPayload({
      dispatchId: dispatch._id || dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      triageLevel: dispatch.triageLevel,
      status: dispatch.status,
      pickupLocation: dispatch.pickupLocation,
      symptoms: dispatch.symptoms,
      patientName: dispatch.patientName,
    });
    const envelope = createEventEnvelope(REALTIME_EVENTS.DISPATCH_CREATED, validated);
    io.to('operations').emit(REALTIME_EVENTS.DISPATCH_CREATED, envelope);
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit dispatch created: ${err.message}`);
  }
};

/**
 * Broadcasts confirmed dispatch assignment to operations, driver, and destination hospital.
 */
export const emitDispatchAssigned = (dispatch) => {
  if (!io) return;
  try {
    const validated = validateDispatchAssignedPayload({
      dispatchId: dispatch._id || dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      assignedAmbulanceId: dispatch.assignedAmbulance?._id || dispatch.assignedAmbulance,
      assignedAmbulanceTag: dispatch.assignedAmbulance?.ambulanceId || '',
      assignedDriverId: dispatch.assignedDriver?._id || dispatch.assignedDriver,
      destinationFacilityId: dispatch.destinationFacility?._id || dispatch.destinationFacility,
      destinationFacilityName: dispatch.destinationFacility?.name || '',
      status: dispatch.status,
      triageLevel: dispatch.triageLevel,
      confirmedByUserId: dispatch.allocationAudit?.confirmedBy || null,
      allocationAudit: dispatch.allocationAudit || null,
    });
    const envelope = createEventEnvelope(REALTIME_EVENTS.DISPATCH_ASSIGNED, validated);

    // Broadcast to operations
    io.to('operations').emit(REALTIME_EVENTS.DISPATCH_ASSIGNED, envelope);

    // Notify assigned driver room specifically
    if (validated.assignedDriverId) {
      io.to(`driver:${validated.assignedDriverId}`).emit(REALTIME_EVENTS.DISPATCH_ASSIGNED, envelope);
    }

    // Notify receiving hospital room
    if (validated.destinationFacilityId) {
      io.to(`facility:${validated.destinationFacilityId}`).emit(REALTIME_EVENTS.DISPATCH_ASSIGNED, envelope);
    }
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit dispatch assigned: ${err.message}`);
  }
};

/**
 * Broadcasts dispatch status transition.
 */
export const emitDispatchStatusChange = (dispatch) => {
  if (!io) return;
  try {
    const validated = validateDispatchStatusPayload({
      dispatchId: dispatch._id || dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      status: dispatch.status,
      patientId: dispatch.patient?._id || dispatch.patient,
      assignedDriverId: dispatch.assignedDriver?._id || dispatch.assignedDriver,
      destinationFacilityId: dispatch.destinationFacility?._id || dispatch.destinationFacility,
    });
    const envelope = createEventEnvelope(REALTIME_EVENTS.DISPATCH_STATUS, validated);

    // Operations room receives full update
    io.to('operations').emit(REALTIME_EVENTS.DISPATCH_STATUS, envelope);

    // Driver receives status update
    if (validated.assignedDriverId) {
      io.to(`driver:${validated.assignedDriverId}`).emit(REALTIME_EVENTS.DISPATCH_STATUS, envelope);
    }

    // Patient receives sanitized status update (without sensitive fleet data)
    if (validated.patientId) {
      const patientEnvelope = createEventEnvelope(REALTIME_EVENTS.DISPATCH_STATUS, {
        dispatchId: validated.dispatchId,
        dispatchNumber: validated.dispatchNumber,
        status: validated.status,
      });
      io.to(`patient:${validated.patientId}`).emit(REALTIME_EVENTS.DISPATCH_STATUS, patientEnvelope);
    }
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit dispatch status: ${err.message}`);
  }
};

/**
 * Broadcasts emergency pre-alert to receiving hospital.
 */
export const emitHospitalPreAlert = (payload) => {
  if (!io) return;
  try {
    const validated = validateHospitalPreAlertPayload(payload);
    const envelope = createEventEnvelope(REALTIME_EVENTS.HOSPITAL_PRE_ALERT, validated);

    io.to('operations')
      .to(`facility:${validated.facilityId}`)
      .emit(REALTIME_EVENTS.HOSPITAL_PRE_ALERT, envelope);
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit hospital pre-alert: ${err.message}`);
  }
};

/**
 * Broadcasts facility capacity update to operations & facility rooms.
 */
export const emitFacilityCapacityUpdate = (payload) => {
  if (!io) return;
  try {
    const validated = validateFacilityCapacityPayload(payload);
    const envelope = createEventEnvelope(REALTIME_EVENTS.FACILITY_CAPACITY, validated);

    io.to('operations')
      .to(`facility:${validated.facilityId}`)
      .emit(REALTIME_EVENTS.FACILITY_CAPACITY, envelope);
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit facility capacity: ${err.message}`);
  }
};

/**
 * Broadcasts simulated road network updates (closures/congestion).
 */
export const emitRoadNetworkUpdate = (payload) => {
  if (!io) return;
  try {
    const validated = validateRoadNetworkPayload(payload);
    const eventType = validated.isClosed
      ? REALTIME_EVENTS.NETWORK_ROAD_CLOSED
      : REALTIME_EVENTS.NETWORK_ROAD_REOPENED;
    const envelope = createEventEnvelope(eventType, validated);

    io.to('operations').emit(eventType, envelope);
  } catch (err) {
    logger.error(`[Socket.io Emitter] Failed to emit road network update: ${err.message}`);
  }
};

export default {
  REALTIME_EVENTS,
  setIO,
  getIO,
  socketAuthMiddleware,
  initSocketManager,
  emitAmbulanceLocationUpdate,
  emitAmbulanceStatusChange,
  emitDispatchCreated,
  emitDispatchAssigned,
  emitDispatchStatusChange,
  emitHospitalPreAlert,
  emitFacilityCapacityUpdate,
  emitRoadNetworkUpdate,
};
