/**
 * MediRoute Real-Time Event Schemas & Payload Validation.
 *
 * Defines explicit payload structures and schema validators for all real-time events.
 * Strips unnecessary sensitive patient PII and enforces required operational fields.
 */

export const REALTIME_EVENTS = {
  AMBULANCE_LOCATION: 'ambulance:location_updated',
  AMBULANCE_STATUS: 'ambulance:status_changed',
  DISPATCH_CREATED: 'dispatch:created',
  DISPATCH_ASSIGNED: 'dispatch:assigned',
  DISPATCH_STATUS: 'dispatch:status_changed',
  HOSPITAL_PRE_ALERT: 'hospital:pre_alert',
  FACILITY_CAPACITY: 'facility:capacity_updated',
  NETWORK_ROAD_CLOSED: 'network:road_closed',
  NETWORK_ROAD_REOPENED: 'network:road_reopened',
  NETWORK_CONGESTION: 'network:congestion_updated',
};

/**
 * Generates an event envelope with unique ID and ISO timestamp.
 */
export const createEventEnvelope = (eventType, data = {}) => ({
  eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  eventType,
  timestamp: new Date().toISOString(),
  data,
  isSimulatedData: true,
});

/**
 * Validates ambulance location update payload.
 */
export const validateAmbulanceLocationPayload = (data) => {
  if (!data.ambulanceId) throw new Error('ambulanceId is required');
  if (!data.coordinates || !Array.isArray(data.coordinates) || data.coordinates.length < 2) {
    throw new Error('Valid [longitude, latitude] coordinates array is required');
  }
  const [lon, lat] = data.coordinates;
  if (isNaN(lon) || isNaN(lat)) {
    throw new Error('Coordinates must contain numeric longitude and latitude');
  }

  return {
    ambulanceId: String(data.ambulanceId),
    ambulanceIdTag: data.ambulanceIdTag || 'AMB',
    coordinates: [Number(lon), Number(lat)],
    address: data.address || 'In Transit',
    heading: typeof data.heading === 'number' ? data.heading : null,
    speedKmH: typeof data.speedKmH === 'number' ? data.speedKmH : 35,
    isSimulated: true,
  };
};

/**
 * Validates ambulance status change payload.
 */
export const validateAmbulanceStatusPayload = (data) => {
  if (!data.ambulanceId) throw new Error('ambulanceId is required');
  const validStatuses = ['available', 'en_route', 'at_scene', 'transporting', 'offline', 'maintenance'];
  if (!validStatuses.includes(data.status)) {
    throw new Error(`Invalid ambulance status: '${data.status}'`);
  }

  return {
    ambulanceId: String(data.ambulanceId),
    ambulanceIdTag: data.ambulanceIdTag || 'AMB',
    status: data.status,
    currentDispatchId: data.currentDispatchId ? String(data.currentDispatchId) : null,
    destinationFacilityId: data.destinationFacilityId ? String(data.destinationFacilityId) : null,
    destinationFacilityName: data.destinationFacilityName || null,
  };
};

/**
 * Validates dispatch created payload.
 */
export const validateDispatchCreatedPayload = (data) => {
  if (!data.dispatchId) throw new Error('dispatchId is required');
  if (!data.dispatchNumber) throw new Error('dispatchNumber is required');

  return {
    dispatchId: String(data.dispatchId),
    dispatchNumber: String(data.dispatchNumber),
    triageLevel: ['critical', 'urgent', 'standard'].includes(data.triageLevel)
      ? data.triageLevel
      : 'standard',
    status: data.status || 'pending',
    pickupLocation: {
      address: data.pickupLocation?.address || 'Incident Scene',
      coordinates: data.pickupLocation?.coordinates || null,
    },
    symptoms: Array.isArray(data.symptoms) ? data.symptoms : [String(data.symptoms || 'Distress')],
    patientName: data.patientName ? String(data.patientName).substring(0, 50) : 'Patient',
  };
};

/**
 * Validates dispatch assigned payload.
 */
export const validateDispatchAssignedPayload = (data) => {
  if (!data.dispatchId) throw new Error('dispatchId is required');

  return {
    dispatchId: String(data.dispatchId),
    dispatchNumber: data.dispatchNumber || '',
    assignedAmbulanceId: data.assignedAmbulanceId ? String(data.assignedAmbulanceId) : null,
    assignedAmbulanceTag: data.assignedAmbulanceTag || '',
    assignedDriverId: data.assignedDriverId ? String(data.assignedDriverId) : null,
    destinationFacilityId: data.destinationFacilityId ? String(data.destinationFacilityId) : null,
    destinationFacilityName: data.destinationFacilityName || '',
    status: data.status || 'assigned',
    triageLevel: data.triageLevel || 'standard',
    confirmedByUserId: data.confirmedByUserId ? String(data.confirmedByUserId) : null,
    allocationAudit: data.allocationAudit || null,
  };
};

/**
 * Validates dispatch status change payload.
 */
export const validateDispatchStatusPayload = (data) => {
  if (!data.dispatchId) throw new Error('dispatchId is required');
  const validStatuses = ['pending', 'assigned', 'en_route', 'arrived', 'completed', 'cancelled'];
  if (!validStatuses.includes(data.status)) {
    throw new Error(`Invalid dispatch status: '${data.status}'`);
  }

  return {
    dispatchId: String(data.dispatchId),
    dispatchNumber: data.dispatchNumber || '',
    status: data.status,
    patientId: data.patientId ? String(data.patientId) : null,
    assignedDriverId: data.assignedDriverId ? String(data.assignedDriverId) : null,
    destinationFacilityId: data.destinationFacilityId ? String(data.destinationFacilityId) : null,
  };
};

/**
 * Validates hospital pre-alert payload.
 */
export const validateHospitalPreAlertPayload = (data) => {
  if (!data.facilityId) throw new Error('facilityId is required');
  if (!data.dispatchId) throw new Error('dispatchId is required');

  return {
    facilityId: String(data.facilityId),
    facilityName: data.facilityName || 'Emergency Intake',
    dispatchId: String(data.dispatchId),
    dispatchNumber: data.dispatchNumber || '',
    triageLevel: data.triageLevel || 'standard',
    estimatedEtaMinutes: typeof data.estimatedEtaMinutes === 'number' ? data.estimatedEtaMinutes : 12,
    clinicalSummary: data.clinicalSummary || 'Inbound emergency transit initiated.',
    ambulanceIdTag: data.ambulanceIdTag || 'AMB',
  };
};

/**
 * Validates facility capacity updated payload.
 */
export const validateFacilityCapacityPayload = (data) => {
  if (!data.facilityId) throw new Error('facilityId is required');

  const cap = data.emergencyCapacity || {};
  return {
    facilityId: String(data.facilityId),
    facilityName: data.facilityName || 'Hospital',
    emergencyCapacity: {
      totalBeds: Number(cap.totalBeds ?? 50),
      availableBeds: Number(cap.availableBeds ?? 0),
      icuAvailable: Number(cap.icuAvailable ?? 0),
      status: cap.status || 'normal',
    },
  };
};

/**
 * Validates road network update payload.
 */
export const validateRoadNetworkPayload = (data) => {
  const roadId = data.roadId || data.edgeId;
  if (!roadId) throw new Error('roadId or edgeId is required');

  return {
    roadId: String(roadId),
    edgeId: String(roadId),
    roadName: data.roadName || data.label || 'Road Segment',
    label: data.label || data.roadName || 'Road Segment',
    isClosed: Boolean(data.isClosed),
    congestionMultiplier: typeof data.congestionMultiplier === 'number' ? data.congestionMultiplier : 1.0,
    isSimulated: true,
    reason: data.reason || null,
  };
};

export default {
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
};
