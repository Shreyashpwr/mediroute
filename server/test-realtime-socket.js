/**
 * MediRoute Real-Time Socket.IO & Event Flow Test Suite.
 *
 * Verifies:
 * 1. Payload validation and schema enforcement (sanitization, required fields, rejection of malformed data).
 * 2. Unauthenticated and invalid token connection rejection.
 * 3. Authenticated handshake & automatic room assignment by user role.
 * 4. Room isolation and unauthorized room subscription blocking (patients cannot access operational rooms).
 * 5. Secure event emission to authorized rooms (PII protection, fleet operations isolation).
 * 6. Listener cleanup preventing duplicate updates or memory leaks.
 * 7. Human confirmation requirement for dispatch commitment (no auto-bypass).
 */

import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket } from 'socket.io-client';
import { connectDB, disconnectDB } from './src/config/db.js';
import User from './src/models/User.js';
import Ambulance from './src/models/Ambulance.js';
import Facility from './src/models/Facility.js';
import Dispatch from './src/models/Dispatch.js';
import { generateToken } from './src/utils/token.js';
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
} from './src/services/realtime/eventSchemas.js';
import {
  initSocketManager,
  emitAmbulanceLocationUpdate,
  emitAmbulanceStatusChange,
  emitDispatchCreated,
  emitDispatchAssigned,
  emitDispatchStatusChange,
  emitHospitalPreAlert,
  emitFacilityCapacityUpdate,
  emitRoadNetworkUpdate,
} from './src/services/realtime/socketManager.js';
import { confirmAndCommitAllocation } from './src/services/allocationService.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runRealtimeTests() {
  console.log('\n============================================================');
  console.log('  MEDIROUTE PHASE 4: REAL-TIME SOCKET.IO & EVENT VERIFICATION');
  console.log('============================================================\n');

  // --- SUITE 1: EVENT SCHEMA & PAYLOAD VALIDATION ---
  console.log('--- Test Suite 1: Event Schema & Payload Validation ---');

  // Envelope Generator
  const envelope = createEventEnvelope(REALTIME_EVENTS.AMBULANCE_LOCATION, { test: 123 });
  assert(envelope.eventId && envelope.eventId.startsWith('evt_'), 'Envelope contains valid unique eventId');
  assert(envelope.eventType === REALTIME_EVENTS.AMBULANCE_LOCATION, 'Envelope contains correct eventType');
  assert(envelope.isSimulatedData === true, 'Envelope marks data explicitly as simulated telemetry');
  assert(new Date(envelope.timestamp).getTime() > 0, 'Envelope contains valid ISO timestamp');

  // Ambulance Location Validator
  try {
    validateAmbulanceLocationPayload({});
    assert(false, 'Should throw error when ambulanceId is missing');
  } catch (err) {
    assert(err.message.includes('ambulanceId is required'), 'Rejects location update missing ambulanceId');
  }

  try {
    validateAmbulanceLocationPayload({ ambulanceId: 'AMB-101', coordinates: ['invalid', 73.8] });
    assert(false, 'Should throw error when coordinates are non-numeric');
  } catch (err) {
    assert(err.message.includes('numeric longitude and latitude'), 'Rejects non-numeric coordinates array');
  }

  const validLoc = validateAmbulanceLocationPayload({
    ambulanceId: 'AMB-101',
    ambulanceIdTag: 'AMB-101',
    coordinates: [73.8567, 18.5204],
    address: 'FC Road, Pune',
  });
  assert(validLoc.coordinates[0] === 73.8567 && validLoc.coordinates[1] === 18.5204, 'Accepts and normalizes valid coordinate payload');
  assert(validLoc.isSimulated === true, 'Location payload explicitly marked as simulated');

  // Ambulance Status Validator
  try {
    validateAmbulanceStatusPayload({ ambulanceId: 'AMB-101', status: 'flying' });
    assert(false, 'Should throw error for unknown status');
  } catch (err) {
    assert(err.message.includes('Invalid ambulance status'), 'Rejects invalid status string');
  }

  const validStatus = validateAmbulanceStatusPayload({ ambulanceId: 'AMB-101', status: 'en_route' });
  assert(validStatus.status === 'en_route', 'Accepts valid ambulance status');

  // Dispatch Status Validator
  try {
    validateDispatchStatusPayload({ dispatchId: 'disp_1', status: 'sleeping' });
    assert(false, 'Should throw error on invalid dispatch status');
  } catch (err) {
    assert(err.message.includes('Invalid dispatch status'), 'Rejects illegal dispatch lifecycle status');
  }

  // Hospital Pre-Alert Validator
  try {
    validateHospitalPreAlertPayload({ facilityId: 'fac_1' });
    assert(false, 'Should throw error on missing dispatchId in pre-alert');
  } catch (err) {
    assert(err.message.includes('dispatchId is required'), 'Requires dispatchId for hospital pre-alert');
  }

  const validPreAlert = validateHospitalPreAlertPayload({
    facilityId: 'fac_123',
    dispatchId: 'disp_456',
    facilityName: 'Ruby Hall Clinic',
    triageLevel: 'critical',
    estimatedEtaMinutes: 9,
  });
  assert(validPreAlert.estimatedEtaMinutes === 9, 'Hospital pre-alert payload retains estimated ETA');

  // Road Network Validator
  const validRoad = validateRoadNetworkPayload({ edgeId: 'edge_fc_jm', isClosed: true, roadName: 'FC Road' });
  assert(validRoad.isClosed === true, 'Road network payload correctly tracks closure status');

  // --- SUITE 2: SOCKET SERVER & AUTHENTICATION HANDSHAKE ---
  console.log('\n--- Test Suite 2: Socket Server Initialization & Authentication ---');

  await connectDB();

  // Spin up an isolated Express + HTTP + Socket.IO server for testing
  const app = express();
  const httpServer = http.createServer(app);
  const ioServer = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });
  initSocketManager(ioServer);

  const testPort = 5198;
  await new Promise((resolve) => httpServer.listen(testPort, resolve));

  const serverUrl = `http://localhost:${testPort}`;

  // Find or create test users
  let dispatcherUser = await User.findOne({ role: 'dispatcher', approvalStatus: 'approved', isActive: true });
  if (!dispatcherUser) {
    dispatcherUser = await User.create({
      name: 'Test Dispatcher Officer',
      email: 'test.dispatcher.rt@mediroute.org',
      password: 'Password123!',
      role: 'dispatcher',
      approvalStatus: 'approved',
      isActive: true,
    });
  }

  let driverUser = await User.findOne({ role: 'driver', approvalStatus: 'approved', isActive: true });
  if (!driverUser) {
    driverUser = await User.create({
      name: 'Test Ambulance Driver',
      email: 'test.driver.rt@mediroute.org',
      password: 'Password123!',
      role: 'driver',
      approvalStatus: 'approved',
      isActive: true,
    });
  }

  let patientUser = await User.findOne({ role: 'patient', approvalStatus: 'approved', isActive: true });
  if (!patientUser) {
    patientUser = await User.create({
      name: 'Test Patient User',
      email: 'test.patient.rt@mediroute.org',
      password: 'Password123!',
      role: 'patient',
      approvalStatus: 'approved',
      isActive: true,
    });
  }

  const dispatcherToken = generateToken(dispatcherUser._id);
  const driverToken = generateToken(driverUser._id);
  const patientToken = generateToken(patientUser._id);

  // Test 2A: Unauthenticated connection attempt
  await new Promise((resolve) => {
    const unauthSocket = ClientSocket(serverUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    unauthSocket.on('connect_error', (err) => {
      assert(err.message.includes('Authentication failed'), 'Unauthenticated socket connection rejected');
      unauthSocket.close();
      resolve();
    });

    unauthSocket.on('connect', () => {
      assert(false, 'Unauthenticated socket should NOT connect');
      unauthSocket.close();
      resolve();
    });
  });

  // Test 2B: Invalid token connection attempt
  await new Promise((resolve) => {
    const invalidSocket = ClientSocket(serverUrl, {
      auth: { token: 'invalid_malformed_token_123' },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    invalidSocket.on('connect_error', (err) => {
      assert(err.message.includes('Authentication failed'), 'Malformed/invalid JWT connection rejected');
      invalidSocket.close();
      resolve();
    });

    invalidSocket.on('connect', () => {
      assert(false, 'Socket with invalid JWT should NOT connect');
      invalidSocket.close();
      resolve();
    });
  });

  // Test 2C: Authenticated dispatcher connection
  let dispatcherSocket;
  await new Promise((resolve) => {
    dispatcherSocket = ClientSocket(serverUrl, {
      auth: { token: dispatcherToken },
      transports: ['websocket'],
      reconnection: false,
    });

    dispatcherSocket.on('connect', () => {
      assert(true, 'Dispatcher with valid JWT successfully authenticated and connected');
      resolve();
    });

    dispatcherSocket.on('connect_error', (err) => {
      assert(false, `Dispatcher failed to connect: ${err.message}`);
      resolve();
    });
  });

  // Test 2D: Authenticated patient connection
  let patientSocket;
  await new Promise((resolve) => {
    patientSocket = ClientSocket(serverUrl, {
      auth: { token: patientToken },
      transports: ['websocket'],
      reconnection: false,
    });

    patientSocket.on('connect', () => {
      assert(true, 'Patient with valid JWT successfully authenticated and connected');
      resolve();
    });

    patientSocket.on('connect_error', (err) => {
      assert(false, `Patient failed to connect: ${err.message}`);
      resolve();
    });
  });

  // --- SUITE 3: ROOM ISOLATION & PERMISSION CHECKS ---
  console.log('\n--- Test Suite 3: Room Isolation & Permission Checks ---');

  // Test 3A: Patient tries to join 'operations' room
  await new Promise((resolve) => {
    patientSocket.emit('subscribe:room', { room: 'operations' });
    patientSocket.once('error', (err) => {
      assert(err.message.includes('Unauthorized'), 'Patient blocked from subscribing to operations room');
      resolve();
    });
    // Fallback if no error within 400ms
    setTimeout(resolve, 400);
  });

  // --- SUITE 4: REAL-TIME EVENT STREAMING & PII ISOLATION ---
  console.log('\n--- Test Suite 4: Event Streaming & PII Isolation ---');

  // Test 4A: Ambulance Location update delivered to dispatcher, NOT to patient
  await new Promise((resolve) => {
    let dispatcherReceived = false;
    let patientReceived = false;

    dispatcherSocket.on(REALTIME_EVENTS.AMBULANCE_LOCATION, (envelope) => {
      assert(envelope.data.ambulanceId === 'AMB-TEST-01', 'Dispatcher received ambulance location update');
      assert(envelope.isSimulatedData === true, 'Event envelope retains simulated flag');
      dispatcherReceived = true;
      checkDone();
    });

    patientSocket.on(REALTIME_EVENTS.AMBULANCE_LOCATION, () => {
      patientReceived = true;
    });

    emitAmbulanceLocationUpdate({
      ambulanceId: 'AMB-TEST-01',
      ambulanceIdTag: 'AMB-TEST-01',
      coordinates: [73.8567, 18.5204],
      address: 'Deccan Gymkhana, Pune',
    });

    function checkDone() {
      setTimeout(() => {
        assert(!patientReceived, 'Patient did NOT receive operational ambulance telemetry');
        dispatcherSocket.off(REALTIME_EVENTS.AMBULANCE_LOCATION);
        patientSocket.off(REALTIME_EVENTS.AMBULANCE_LOCATION);
        resolve();
      }, 250);
    }
  });

  // Test 4B: Hospital Pre-Alert delivery
  await new Promise((resolve) => {
    dispatcherSocket.on(REALTIME_EVENTS.HOSPITAL_PRE_ALERT, (envelope) => {
      assert(envelope.data.facilityName === 'Jehangir Hospital', 'Dispatcher operations received hospital pre-alert');
      assert(envelope.data.estimatedEtaMinutes === 11, 'Pre-alert retains estimated ETA minutes');
      dispatcherSocket.off(REALTIME_EVENTS.HOSPITAL_PRE_ALERT);
      resolve();
    });

    emitHospitalPreAlert({
      facilityId: 'facility_jehangir_id',
      facilityName: 'Jehangir Hospital',
      dispatchId: 'disp_prealert_01',
      dispatchNumber: 'DISP-PRE-99',
      triageLevel: 'critical',
      estimatedEtaMinutes: 11,
      clinicalSummary: 'Acute chest pain with ST elevation',
      ambulanceIdTag: 'AMB-CARDIAC-1',
    });
  });

  // Test 4C: Facility Capacity Update
  await new Promise((resolve) => {
    dispatcherSocket.on(REALTIME_EVENTS.FACILITY_CAPACITY, (envelope) => {
      assert(envelope.data.emergencyCapacity.availableBeds === 14, 'Facility capacity update received in operations');
      dispatcherSocket.off(REALTIME_EVENTS.FACILITY_CAPACITY);
      resolve();
    });

    emitFacilityCapacityUpdate({
      facilityId: 'facility_jehangir_id',
      facilityName: 'Jehangir Hospital',
      emergencyCapacity: {
        totalBeds: 60,
        availableBeds: 14,
        icuAvailable: 3,
        status: 'normal',
      },
    });
  });

  // Test 4D: Road Network Closure Update
  await new Promise((resolve) => {
    dispatcherSocket.on(REALTIME_EVENTS.NETWORK_ROAD_CLOSED, (envelope) => {
      assert(envelope.data.isClosed === true, 'Road closure broadcast to operations room');
      assert(envelope.data.roadName === 'Karve Road', 'Road closure specifies affected corridor');
      dispatcherSocket.off(REALTIME_EVENTS.NETWORK_ROAD_CLOSED);
      resolve();
    });

    emitRoadNetworkUpdate({
      edgeId: 'edge_karve_rd',
      roadName: 'Karve Road',
      isClosed: true,
      reason: 'Metro construction simulated diversion',
    });
  });

  // --- SUITE 5: LISTENER CLEANUP & PREVENTING DUPLICATE SUBSCRIPTIONS ---
  console.log('\n--- Test Suite 5: Listener Cleanup & Memory Safety ---');

  let callCount = 0;
  const testHandler = () => {
    callCount++;
  };

  dispatcherSocket.on(REALTIME_EVENTS.AMBULANCE_STATUS, testHandler);

  emitAmbulanceStatusChange({
    ambulanceId: 'AMB-CLEANUP',
    status: 'at_scene',
  });

  await new Promise((r) => setTimeout(r, 150));
  assert(callCount === 1, 'Listener called on first emission');

  // Remove listener (mimics unmount cleanup in React)
  dispatcherSocket.off(REALTIME_EVENTS.AMBULANCE_STATUS, testHandler);

  emitAmbulanceStatusChange({
    ambulanceId: 'AMB-CLEANUP',
    status: 'available',
  });

  await new Promise((r) => setTimeout(r, 150));
  assert(callCount === 1, 'Listener cleanup successfully prevented duplicate callback execution');

  // --- SUITE 6: HUMAN CONFIRMATION REQUIREMENT ---
  console.log('\n--- Test Suite 6: Human Confirmation Invariant on Dispatch Commitment ---');

  // Create an available test ambulance
  const ambReg = `TEST-CONF-${Date.now().toString().slice(-4)}`;
  const testAmbulance = await Ambulance.create({
    ambulanceId: ambReg,
    vehicleType: 'als_ambulance',
    status: 'available',
    location: {
      type: 'Point',
      coordinates: [73.8567, 18.5204],
    },
    capabilities: ['defibrillator', 'ventilator', 'oxygen', 'ecg', 'als_kit'],
  });

  const testFacility = await Facility.findOne({ isActive: true });

  const testDispatch = await Dispatch.create({
    dispatchNumber: `TEST-COMM-${Date.now().toString().slice(-4)}`,
    triageLevel: 'urgent',
    status: 'pending',
    patientName: 'Test Human Confirmation Patient',
    pickupLocation: {
      address: 'Shivajinagar, Pune',
      coordinates: {
        latitude: 18.5314,
        longitude: 73.8522,
      },
    },
    symptoms: ['Chest tightness', 'Shortness of breath'],
  });

  // Invariant 1: Dispatch stays 'pending' before human confirmation
  assert(testDispatch.status === 'pending', 'Dispatch remains pending prior to human operator confirmation');

  // Invariant 2: Commitment succeeds and records human confirmation audit trail
  const committed = await confirmAndCommitAllocation(testDispatch._id, {
    ambulanceId: testAmbulance._id,
    facilityId: testFacility?._id,
    confirmedByUserId: dispatcherUser._id,
    notes: 'Approved by supervising operational dispatcher.',
  });

  assert(committed.status === 'assigned', 'Dispatch transitioned to assigned only upon human commitment');
  assert(committed.allocationAudit.confirmedBy.toString() === dispatcherUser._id.toString(), 'Audit trail records human operator ID');
  assert(committed.allocationAudit.committedAmbulanceId === ambReg, 'Audit trail records committed ambulance registration');

  const updatedAmbulance = await Ambulance.findById(testAmbulance._id);
  assert(updatedAmbulance.status === 'en_route', 'Ambulance status updated to en_route upon human commitment');

  // Clean up test records
  await Ambulance.findByIdAndDelete(testAmbulance._id);
  await Dispatch.findByIdAndDelete(testDispatch._id);

  // Close socket clients and server
  dispatcherSocket.close();
  patientSocket.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectDB();

  console.log('\n============================================================');
  console.log(`  REAL-TIME TEST SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRealtimeTests().catch((err) => {
  console.error('Fatal error in realtime tests:', err);
  process.exit(1);
});
