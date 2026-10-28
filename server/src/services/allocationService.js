import Ambulance from '../models/Ambulance.js';
import Facility from '../models/Facility.js';
import Dispatch from '../models/Dispatch.js';
import { calculateDeterministicRoute } from './routing/graphAdapter.js';
import { haversineDistanceKm } from './routing/routeCost.js';
import AppError from '../utils/appError.js';
import logger from '../utils/logger.js';
import {
  emitAmbulanceStatusChange,
  emitDispatchAssigned,
  emitHospitalPreAlert,
} from './realtime/socketManager.js';

/**
 * Configurable multi-criteria weights.
 * All criteria weights within each category sum strictly to 1.00.
 */
export const DEFAULT_ALLOCATION_WEIGHTS = {
  ambulance: {
    travelTime: 0.45,        // Lower ETA is better
    readiness: 0.20,         // Higher fuel/equipment readiness is better
    capabilityMatch: 0.25,   // Higher capability match grade is better
    routeReliability: 0.10,  // Higher route reliability / low congestion is better
  },
  facility: {
    travelTime: 0.40,        // Lower transit time from scene is better
    bedCapacity: 0.30,       // Higher available bed buffer is better
    clinicalMatch: 0.20,     // Specialized trauma/cardiac/department match
    statusBuffer: 0.10,      // Normal vs Busy operating buffer
  },
};

/**
 * Validates that weight configuration sums to 1.0 within tolerance.
 */
export const validateWeights = (weights) => {
  const ambSum = Object.values(weights.ambulance).reduce((a, b) => a + b, 0);
  const facSum = Object.values(weights.facility).reduce((a, b) => a + b, 0);
  if (Math.abs(ambSum - 1.0) > 0.001) {
    throw new Error(`Ambulance criteria weights must sum to 1.00 (current sum: ${ambSum.toFixed(4)})`);
  }
  if (Math.abs(facSum - 1.0) > 0.001) {
    throw new Error(`Facility criteria weights must sum to 1.00 (current sum: ${facSum.toFixed(4)})`);
  }
  return true;
};

/**
 * Determines required vehicle capabilities based on clinical triage level and symptoms.
 */
export const inferIncidentRequirements = ({ triageLevel = 'standard', symptoms = [], requiredDepartment = null, requiredVehicleType = null }) => {
  const sympList = Array.isArray(symptoms) ? symptoms : [String(symptoms || '')];
  const sympStr = sympList.join(' ').toLowerCase();

  let minVehicleType = requiredVehicleType;
  let targetDepartment = requiredDepartment;
  let requiresIcu = false;

  if (!minVehicleType) {
    if (triageLevel === 'critical') {
      minVehicleType = /\b(icu|ventilator|cardiac arrest|respiratory arrest|arrest|coma|stemi|shock)\b/i.test(sympStr)
        ? 'mobile_icu'
        : 'als_ambulance';
      requiresIcu = true;
    } else if (triageLevel === 'urgent') {
      minVehicleType = 'bls_ambulance'; // BLS or higher
    } else {
      minVehicleType = 'patient_transport'; // Any operational transport
    }
  }

  if (!targetDepartment) {
    if (/\b(cardiac|chest pain|heart|stemi|angina|infarct)\b/i.test(sympStr)) {
      targetDepartment = 'cardiac';
    } else if (/\b(trauma|fracture|collision|stab|fall|injury|hemorrhage|laceration|polytrauma)\b/i.test(sympStr)) {
      targetDepartment = 'trauma';
    } else if (/\b(pediatric|child|infant|baby)\b/i.test(sympStr)) {
      targetDepartment = 'pediatric';
    } else if (triageLevel === 'critical') {
      targetDepartment = 'icu';
    } else {
      targetDepartment = 'emergency';
    }
  }

  return {
    triageLevel,
    minVehicleType,
    targetDepartment,
    requiresIcu: requiresIcu || targetDepartment === 'icu',
    requiredBeds: 1,
  };
};

/**
 * HARD FEASIBILITY FILTER: Ambulance
 * Evaluates candidate without scoring. If any constraint fails, returns explicit rejection reason.
 */
export const checkAmbulanceFeasibility = (ambulance, requirements) => {
  if (!ambulance) {
    return { isFeasible: false, rejectionReason: 'Null or undefined ambulance record' };
  }

  // 1. Operational status
  if (ambulance.isActive === false) {
    return { isFeasible: false, rejectionReason: 'Ambulance is deactivated or decommissioned' };
  }

  // 2. Availability status
  if (ambulance.status !== 'available') {
    return { isFeasible: false, rejectionReason: `Ambulance is currently not available (current status: '${ambulance.status}')` };
  }

  // 3. Fuel level sufficiency (minimum 15% reserve for emergency mission)
  const fuel = Number(ambulance.fuelLevel ?? 100);
  if (fuel < 15) {
    return { isFeasible: false, rejectionReason: `Insufficient fuel reserve (${fuel}% < 15% threshold)` };
  }

  // 4. Coordinates validity
  const coords = ambulance.location?.coordinates;
  if (!coords || isNaN(coords[0]) || isNaN(coords[1])) {
    return { isFeasible: false, rejectionReason: 'Ambulance lacks valid GPS location coordinates' };
  }

  // 5. Capability hierarchy
  // Hierarchy: mobile_icu (4) >= als_ambulance (3) >= bls_ambulance (2) >= patient_transport/standard_transport/wheelchair_van (1)
  const typeRank = {
    mobile_icu: 4,
    als_ambulance: 3,
    bls_ambulance: 2,
    patient_transport: 1,
    standard_transport: 1,
    wheelchair_van: 1,
  };

  const candidateRank = typeRank[ambulance.vehicleType] || 1;
  const requiredRank = typeRank[requirements.minVehicleType] || 1;

  if (candidateRank < requiredRank) {
    return {
      isFeasible: false,
      rejectionReason: `Vehicle type '${ambulance.vehicleType}' does not satisfy required capability '${requirements.minVehicleType}'`,
    };
  }

  return { isFeasible: true, rejectionReason: null };
};

/**
 * HARD FEASIBILITY FILTER: Facility
 * Evaluates receiving hospital without scoring.
 */
export const checkFacilityFeasibility = (facility, requirements) => {
  if (!facility) {
    return { isFeasible: false, rejectionReason: 'Null or undefined facility record' };
  }

  // 1. Operational status
  if (facility.isActive === false) {
    return { isFeasible: false, rejectionReason: 'Facility is deactivated or closed' };
  }

  // 2. Diversion status check
  const cap = facility.emergencyCapacity || {};
  if (cap.status === 'divert') {
    return { isFeasible: false, rejectionReason: 'Facility is on diversion status (refusing emergency intake)' };
  }

  // 3. Location validity
  const coords = facility.location?.coordinates;
  if (!coords || isNaN(coords[0]) || isNaN(coords[1])) {
    return { isFeasible: false, rejectionReason: 'Facility lacks valid GPS location coordinates' };
  }

  // 4. Overall bed availability
  const availableBeds = Number(cap.availableBeds ?? 0);
  if (availableBeds < requirements.requiredBeds) {
    return { isFeasible: false, rejectionReason: `No available emergency beds (available: ${availableBeds}, required: ${requirements.requiredBeds})` };
  }

  // 5. ICU capacity check if required
  if (requirements.requiresIcu) {
    const icuAvailable = Number(cap.icuAvailable ?? 0);
    if (icuAvailable < 1) {
      return { isFeasible: false, rejectionReason: `Critical patient requires ICU but facility has 0 available ICU beds` };
    }
  }

  // 6. Department existence check if specific department required
  if (requirements.targetDepartment && requirements.targetDepartment !== 'emergency') {
    const deptInfo = cap.departments?.[requirements.targetDepartment];
    const hasCapability = Array.isArray(facility.capabilities) &&
      facility.capabilities.some((c) => c.toLowerCase().includes(requirements.targetDepartment.toLowerCase()));

    if (!deptInfo && !hasCapability) {
      return { isFeasible: false, rejectionReason: `Facility lacks required department or clinical capability: '${requirements.targetDepartment}'` };
    }

    // If department tracking exists and reports 0 available beds
    if (deptInfo && typeof deptInfo.available === 'number' && deptInfo.available <= 0) {
      return { isFeasible: false, rejectionReason: `Department '${requirements.targetDepartment}' is at 100% occupancy (0 beds available)` };
    }
  }

  return { isFeasible: true, rejectionReason: null };
};

/**
 * Calculates estimated travel time from candidate to target location.
 */
export const estimateTravelTimeMinutes = (originCoords, destinationCoords, trafficCondition = 'moderate', roadClosures = []) => {
  if (!originCoords || !destinationCoords) return 20;

  try {
    const route = calculateDeterministicRoute({
      origin: { latitude: originCoords[1], longitude: originCoords[0] },
      destination: { latitude: destinationCoords[1], longitude: destinationCoords[0] },
      trafficCondition,
      costMetric: 'time',
      roadClosures,
    });
    if (route && !route.isValidRoute && route.totalCost === Infinity) {
      return {
        durationMinutes: Infinity,
        distanceKm: Infinity,
        isGraphRouted: Boolean(route.isGraphRouted),
        isClosed: true,
      };
    }
    if (route && typeof route.estimatedDurationMinutes === 'number' && route.estimatedDurationMinutes > 0) {
      return {
        durationMinutes: route.estimatedDurationMinutes,
        distanceKm: route.totalDistanceKm,
        isGraphRouted: Boolean(route.isGraphRouted),
        isClosed: !route.isValidRoute && route.totalCost === Infinity,
      };
    }
  } catch {
    // fallback
  }

  const distKm = haversineDistanceKm(
    { latitude: originCoords[1], longitude: originCoords[0] },
    { latitude: destinationCoords[1], longitude: destinationCoords[0] }
  );
  return {
    durationMinutes: Number(((distKm * 1.3 / 35) * 60).toFixed(1)),
    distanceKm: Number((distKm * 1.3).toFixed(1)),
    isGraphRouted: false,
    isClosed: false,
  };
};

/**
 * MULTI-CRITERIA SCORING: Feasible Ambulance
 * Equation:
 *   S_amb = w_time * V_time + w_ready * V_ready + w_cap * V_cap + w_rel * V_rel
 * Scale: [0, 1] where 1.0 is optimal.
 */
export const scoreFeasibleAmbulance = (ambulance, requirements, travelEstimate, weights = DEFAULT_ALLOCATION_WEIGHTS.ambulance) => {
  // Criterion 1: Travel time (Lower ETA is better)
  // Normalization: V_time = max(0, 1 - duration / 45min)
  const maxTimeBound = 45;
  const duration = Math.max(0, travelEstimate.durationMinutes);
  const vTime = Math.max(0, Math.min(1, 1 - duration / maxTimeBound));

  // Criterion 2: Readiness / Fuel (Higher is better)
  // Normalization: V_ready = fuel / 100
  const fuel = Number(ambulance.fuelLevel ?? 80);
  const vReady = Math.max(0, Math.min(1, fuel / 100));

  // Criterion 3: Capability match grade
  // Perfect level match: 1.0; superior resource when not critical: 0.85 (preserves critical assets); higher capability for critical: 1.0
  let vCap = 0.8;
  if (ambulance.vehicleType === requirements.minVehicleType) {
    vCap = 1.0;
  } else if (requirements.triageLevel === 'critical' && ambulance.vehicleType === 'mobile_icu') {
    vCap = 1.0;
  } else if (ambulance.vehicleType === 'mobile_icu' && requirements.triageLevel !== 'critical') {
    vCap = 0.75; // Minor discount to preserve mobile_icu for true critical events
  } else {
    vCap = 0.9;
  }

  // Criterion 4: Route reliability
  // Graph routed corridor: 1.0, unmapped / congested: 0.8
  const vRel = travelEstimate.isGraphRouted ? 1.0 : 0.8;

  // Composite Weighted Score
  const score = Number(
    (
      weights.travelTime * vTime +
      weights.readiness * vReady +
      weights.capabilityMatch * vCap +
      weights.routeReliability * vRel
    ).toFixed(5)
  );

  return {
    score,
    rawMetrics: {
      travelTimeMinutes: Number(duration.toFixed(1)),
      distanceKm: travelEstimate.distanceKm,
      fuelLevel: fuel,
      vehicleType: ambulance.vehicleType,
      isGraphRouted: travelEstimate.isGraphRouted,
    },
    normalizedMetrics: {
      travelTime: Number(vTime.toFixed(4)),
      readiness: Number(vReady.toFixed(4)),
      capabilityMatch: Number(vCap.toFixed(4)),
      routeReliability: Number(vRel.toFixed(4)),
    },
  };
};

/**
 * MULTI-CRITERIA SCORING: Feasible Facility
 * Equation:
 *   S_fac = w_transit * V_transit + w_bed * V_bed + w_clin * V_clin + w_stat * V_stat
 * Scale: [0, 1] where 1.0 is optimal.
 */
export const scoreFeasibleFacility = (facility, requirements, travelEstimate, weights = DEFAULT_ALLOCATION_WEIGHTS.facility) => {
  const cap = facility.emergencyCapacity || {};

  // Criterion 1: Transit time from incident to hospital
  // Normalization: V_transit = max(0, 1 - duration / 50min)
  const maxTransitBound = 50;
  const duration = Math.max(0, travelEstimate.durationMinutes);
  const vTransit = Math.max(0, Math.min(1, 1 - duration / maxTransitBound));

  // Criterion 2: Bed and ICU capacity availability buffer
  // Normalization: availableBeds / totalBeds, scaled
  const totalBeds = Math.max(1, Number(cap.totalBeds ?? 50));
  const availableBeds = Math.max(0, Number(cap.availableBeds ?? 0));
  const bedRatio = availableBeds / totalBeds;
  const icuAvailable = Number(cap.icuAvailable ?? 0);
  let vBed = Math.min(1.0, bedRatio * 2.5); // 40%+ availability yields 1.0
  if (requirements.requiresIcu) {
    const icuBonus = Math.min(1.0, icuAvailable / 5);
    vBed = 0.5 * vBed + 0.5 * icuBonus;
  }

  // Criterion 3: Clinical capability match
  // Trauma Center 1 for trauma/critical = 1.0, general hospital = 0.8, urgent care clinic = 0.6
  let vClin = 0.75;
  if (facility.facilityType === 'trauma_center') {
    vClin = requirements.triageLevel === 'critical' || requirements.targetDepartment === 'trauma' ? 1.0 : 0.85;
  } else if (facility.facilityType === 'hospital') {
    vClin = requirements.triageLevel === 'standard' ? 0.95 : 0.85;
  } else if (facility.facilityType === 'urgent_care') {
    vClin = requirements.triageLevel === 'standard' ? 0.9 : 0.5;
  }

  // Criterion 4: Operating status buffer
  const statusScores = { normal: 1.0, busy: 0.6, critical: 0.25, divert: 0.0 };
  const vStat = statusScores[cap.status] ?? 0.8;

  // Composite Weighted Score
  const score = Number(
    (
      weights.travelTime * vTransit +
      weights.bedCapacity * vBed +
      weights.clinicalMatch * vClin +
      weights.statusBuffer * vStat
    ).toFixed(5)
  );

  return {
    score,
    rawMetrics: {
      transitTimeMinutes: Number(duration.toFixed(1)),
      distanceKm: travelEstimate.distanceKm,
      availableBeds,
      totalBeds,
      icuAvailable,
      facilityType: facility.facilityType,
      operatingStatus: cap.status || 'normal',
    },
    normalizedMetrics: {
      travelTime: Number(vTransit.toFixed(4)),
      bedCapacity: Number(vBed.toFixed(4)),
      clinicalMatch: Number(vClin.toFixed(4)),
      statusBuffer: Number(vStat.toFixed(4)),
    },
  };
};

/**
 * DETERMINISTIC MULTI-CRITERIA ALLOCATION ENGINE
 * Evaluates all candidate resources without mutating database availability.
 * Rejects unfeasible candidates, computes normalized multi-criteria scores for feasible ones,
 * and breaks ties deterministically.
 */
export const evaluateAllocation = async ({
  incidentLocation,
  triageLevel = 'standard',
  symptoms = [],
  requiredDepartment = null,
  requiredVehicleType = null,
  trafficCondition = 'moderate',
  roadClosures = [],
  ambulances = null,
  facilities = null,
  weights = DEFAULT_ALLOCATION_WEIGHTS,
}) => {
  validateWeights(weights);

  // Parse location coordinates [lon, lat]
  const incidentCoords = incidentLocation?.coordinates
    ? Array.isArray(incidentLocation.coordinates)
      ? incidentLocation.coordinates
      : [incidentLocation.coordinates.longitude, incidentLocation.coordinates.latitude]
    : incidentLocation?.latitude !== undefined
    ? [incidentLocation.longitude, incidentLocation.latitude]
    : [73.8478, 18.5314]; // default Pune center

  const requirements = inferIncidentRequirements({
    triageLevel,
    symptoms,
    requiredDepartment,
    requiredVehicleType,
  });

  // Query live resources from DB if not passed directly
  const [candidateAmbs, candidateFacs] = await Promise.all([
    ambulances ? Promise.resolve(ambulances) : Ambulance.find({ isActive: true }).lean(),
    facilities ? Promise.resolve(facilities) : Facility.find({ isActive: true }).lean(),
  ]);

  // --- 1. EVALUATE AMBULANCES ---
  const feasibleAmbulances = [];
  const rejectedAmbulances = [];

  for (const amb of candidateAmbs) {
    const ambId = amb._id || amb.id;
    const feasibility = checkAmbulanceFeasibility(amb, requirements);

    if (!feasibility.isFeasible) {
      rejectedAmbulances.push({
        id: String(ambId),
        ambulanceId: amb.ambulanceId,
        vehicleType: amb.vehicleType,
        status: amb.status,
        rejectionReason: feasibility.rejectionReason,
      });
      continue;
    }

    // Compute route and travel time to incident scene
    const travelEst = estimateTravelTimeMinutes(amb.location?.coordinates, incidentCoords, trafficCondition, roadClosures);

    // Route closure check
    if (travelEst.isClosed || amb.isRouteClosed || amb._testTravelClosed) {
      rejectedAmbulances.push({
        id: String(ambId),
        ambulanceId: amb.ambulanceId,
        vehicleType: amb.vehicleType,
        status: amb.status,
        rejectionReason: 'Road closure prevents traversing route to incident location',
      });
      continue;
    }

    const scoring = scoreFeasibleAmbulance(amb, requirements, travelEst, weights.ambulance);

    feasibleAmbulances.push({
      id: String(ambId),
      ambulanceId: amb.ambulanceId,
      vehicleType: amb.vehicleType,
      score: scoring.score,
      rawMetrics: scoring.rawMetrics,
      normalizedMetrics: scoring.normalizedMetrics,
      driverName: amb.driverName,
      contactPhone: amb.contactPhone,
      record: amb,
    });
  }

  // Deterministic Ambulance Ranking:
  // Primary: Score (Descending)
  // Tie-breaker 1: Travel time (Ascending)
  // Tie-breaker 2: Fuel level (Descending)
  // Tie-breaker 3: ID lexicographical (Deterministic)
  feasibleAmbulances.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
    if (a.rawMetrics.travelTimeMinutes !== b.rawMetrics.travelTimeMinutes) {
      return a.rawMetrics.travelTimeMinutes - b.rawMetrics.travelTimeMinutes;
    }
    if (b.rawMetrics.fuelLevel !== a.rawMetrics.fuelLevel) {
      return b.rawMetrics.fuelLevel - a.rawMetrics.fuelLevel;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  // --- 2. EVALUATE FACILITIES ---
  const feasibleFacilities = [];
  const rejectedFacilities = [];

  for (const fac of candidateFacs) {
    const facId = fac._id || fac.id;
    const feasibility = checkFacilityFeasibility(fac, requirements);

    if (!feasibility.isFeasible) {
      rejectedFacilities.push({
        id: String(facId),
        name: fac.name,
        facilityType: fac.facilityType,
        operatingStatus: fac.emergencyCapacity?.status,
        rejectionReason: feasibility.rejectionReason,
      });
      continue;
    }

    // Transit time from incident scene to hospital
    const transitEst = estimateTravelTimeMinutes(incidentCoords, fac.location?.coordinates, trafficCondition, roadClosures);

    if (transitEst.isClosed || fac.isRouteClosed || fac._testTravelClosed) {
      rejectedFacilities.push({
        id: String(facId),
        name: fac.name,
        facilityType: fac.facilityType,
        rejectionReason: 'Road closure prevents corridor transit to receiving facility',
      });
      continue;
    }

    const scoring = scoreFeasibleFacility(fac, requirements, transitEst, weights.facility);

    feasibleFacilities.push({
      id: String(facId),
      name: fac.name,
      facilityType: fac.facilityType,
      score: scoring.score,
      rawMetrics: scoring.rawMetrics,
      normalizedMetrics: scoring.normalizedMetrics,
      emergencyCapacity: fac.emergencyCapacity,
      record: fac,
    });
  }

  // Deterministic Facility Ranking:
  // Primary: Score (Descending)
  // Tie-breaker 1: Transit time (Ascending)
  // Tie-breaker 2: Available beds (Descending)
  // Tie-breaker 3: ID lexicographical
  feasibleFacilities.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
    if (a.rawMetrics.transitTimeMinutes !== b.rawMetrics.transitTimeMinutes) {
      return a.rawMetrics.transitTimeMinutes - b.rawMetrics.transitTimeMinutes;
    }
    if (b.rawMetrics.availableBeds !== a.rawMetrics.availableBeds) {
      return b.rawMetrics.availableBeds - a.rawMetrics.availableBeds;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const selectedAmbulance = feasibleAmbulances[0] || null;
  const selectedFacility = feasibleFacilities[0] || null;
  const isAllocationFeasible = Boolean(selectedAmbulance && selectedFacility);

  const failureReasons = [];
  if (!selectedAmbulance) {
    failureReasons.push(
      `No feasible ambulance available matching capability '${requirements.minVehicleType}'. (${rejectedAmbulances.length} rejected)`
    );
  }
  if (!selectedFacility) {
    failureReasons.push(
      `No feasible receiving hospital available with required capacity / department '${requirements.targetDepartment}'. (${rejectedFacilities.length} rejected)`
    );
  }

  const rationale = isAllocationFeasible
    ? `Deterministic Multi-Criteria Selection: Assigned ambulance ${selectedAmbulance.ambulanceId} (Score: ${selectedAmbulance.score}, ETA: ${selectedAmbulance.rawMetrics.travelTimeMinutes}m) and receiving facility ${selectedFacility.name} (Score: ${selectedFacility.score}, Transit: ${selectedFacility.rawMetrics.transitTimeMinutes}m, Beds: ${selectedFacility.rawMetrics.availableBeds}). Requires human dispatcher confirmation.`
    : `Allocation Infeasible: ${failureReasons.join(' | ')}`;

  return {
    isFeasible: isAllocationFeasible,
    failureReason: failureReasons.length > 0 ? failureReasons.join('; ') : null,
    requirements,
    selectedAmbulance: selectedAmbulance
      ? {
          id: selectedAmbulance.id,
          ambulanceId: selectedAmbulance.ambulanceId,
          vehicleType: selectedAmbulance.vehicleType,
          score: selectedAmbulance.score,
          estimatedEtaMinutes: selectedAmbulance.rawMetrics.travelTimeMinutes,
          driverName: selectedAmbulance.driverName,
          location: selectedAmbulance.record?.location || selectedAmbulance.location,
          rawMetrics: selectedAmbulance.rawMetrics,
          normalizedMetrics: selectedAmbulance.normalizedMetrics,
        }
      : null,
    selectedFacility: selectedFacility
      ? {
          id: selectedFacility.id,
          name: selectedFacility.name,
          facilityType: selectedFacility.facilityType,
          score: selectedFacility.score,
          location: selectedFacility.record?.location || selectedFacility.location,
          estimatedTransitMinutes: selectedFacility.rawMetrics.transitTimeMinutes,
          availableBeds: selectedFacility.rawMetrics.availableBeds,
          icuAvailable: selectedFacility.rawMetrics.icuAvailable,
          rawMetrics: selectedFacility.rawMetrics,
          normalizedMetrics: selectedFacility.normalizedMetrics,
        }
      : null,
    feasibleAmbulances: feasibleAmbulances.map(({ record, ...f }) => f),
    rejectedAmbulances,
    feasibleFacilities: feasibleFacilities.map(({ record, ...f }) => f),
    rejectedFacilities,
    weights,
    scoringEquation: {
      ambulance: 'S_amb = 0.45*V_time + 0.20*V_ready + 0.25*V_cap + 0.10*V_rel',
      facility: 'S_fac = 0.40*V_transit + 0.30*V_bed + 0.20*V_clin + 0.10*V_stat',
    },
    rationale,
    evaluatedAt: new Date().toISOString(),
    requiresHumanConfirmation: true,
  };
};

/**
 * HUMAN CONFIRMATION & DISPATCH COMMITMENT WORKFLOW
 * Atomically commits the dispatch and updates ambulance/facility status only upon
 * explicit confirmation by an authorized human operator.
 */
export const confirmAndCommitAllocation = async (dispatchId, { ambulanceId, facilityId, confirmedByUserId, notes = '' }) => {
  if (!dispatchId) throw new AppError('Dispatch ID is required for commitment', 400);
  if (!ambulanceId) throw new AppError('Ambulance ID is required for commitment', 400);

  const dispatch = await Dispatch.findById(dispatchId);
  if (!dispatch) throw new AppError(`Dispatch not found with ID: ${dispatchId}`, 404);

  // Verify ambulance is available right now
  const ambulance = await Ambulance.findById(ambulanceId);
  if (!ambulance) throw new AppError(`Ambulance not found with ID: ${ambulanceId}`, 404);
  if (ambulance.status !== 'available') {
    throw new AppError(`Ambulance ${ambulance.ambulanceId} is no longer available (current status: '${ambulance.status}')`, 409);
  }

  // Verify facility if provided
  let facility = null;
  if (facilityId) {
    facility = await Facility.findById(facilityId);
    if (!facility) throw new AppError(`Facility not found with ID: ${facilityId}`, 404);
    if (facility.emergencyCapacity?.status === 'divert') {
      throw new AppError(`Facility ${facility.name} has changed to diversion status`, 409);
    }
  }

  // 1. Commit Ambulance state change
  ambulance.status = 'en_route';
  ambulance.currentDispatch = dispatch._id;
  if (facility) ambulance.destinationFacility = facility._id;
  await ambulance.save();

  // 2. Commit Dispatch state change
  dispatch.status = 'assigned';
  dispatch.assignedAmbulance = ambulance._id;
  if (ambulance.assignedDriver) dispatch.assignedDriver = ambulance.assignedDriver;
  if (facility) dispatch.destinationFacility = facility._id;
  if (notes) dispatch.notes = dispatch.notes ? `${dispatch.notes}\n${notes}` : notes;

  // Record audit trail
  dispatch.allocationAudit = {
    recommendedAmbulanceId: ambulance._id,
    recommendedFacilityId: facility?._id || null,
    confirmedBy: confirmedByUserId || null,
    confirmedAt: new Date(),
    committedAmbulanceId: ambulance.ambulanceId,
    committedFacilityName: facility?.name || 'Unassigned',
  };

  await dispatch.save();

  logger.info(`[Dispatch Commitment] Dispatch ${dispatch.dispatchNumber} committed by operator. Ambulance ${ambulance.ambulanceId} set to 'en_route'.`);

  const committedDispatch = await Dispatch.findById(dispatch._id)
    .populate('assignedAmbulance', 'ambulanceId vehicleType status driverName contactPhone')
    .populate('destinationFacility', 'name address emergencyCapacity')
    .populate('assignedDriver', 'name phone');

  // Broadcast real-time operational events
  try {
    emitAmbulanceStatusChange(ambulance);
    emitDispatchAssigned(committedDispatch);
    if (facility) {
      emitHospitalPreAlert({
        facilityId: facility._id,
        facilityName: facility.name,
        dispatchId: dispatch._id,
        dispatchNumber: dispatch.dispatchNumber,
        triageLevel: dispatch.triageLevel,
        estimatedEtaMinutes: 12,
        clinicalSummary: `Confirmed transport en-route. Triage priority: ${dispatch.triageLevel}.`,
        ambulanceIdTag: ambulance.ambulanceId,
      });
    }
  } catch (emitErr) {
    logger.warn(`[Realtime Alert] Failed to broadcast dispatch commitment events: ${emitErr.message}`);
  }

  return committedDispatch;
};

export default {
  DEFAULT_ALLOCATION_WEIGHTS,
  validateWeights,
  inferIncidentRequirements,
  checkAmbulanceFeasibility,
  checkFacilityFeasibility,
  estimateTravelTimeMinutes,
  scoreFeasibleAmbulance,
  scoreFeasibleFacility,
  evaluateAllocation,
  confirmAndCommitAllocation,
};
