/**
 * MediRoute Discrete-Event Simulation (DES) Engine.
 *
 * Implements a fully reproducible, deterministic simulation environment where:
 * - Events are processed in strict chronological order via a deterministic priority queue.
 * - Identical seeds and scenario configurations produce identical event traces and decision streams.
 * - Hard state invariants prevent negative capacities, double assignments, or lost incidents.
 * - All synthetic traffic, road closures, hospital capacity changes, and incidents are explicitly labelled.
 */

import { SeededRandom, createRng } from './seededRandom.js';
import { executeDispatchPolicy, ALGORITHM_POLICIES } from './baselines.js';
import { computeSimulationMetrics } from './metrics.js';
import logger from '../../utils/logger.js';

/**
 * Standard Pre-Configured Simulation Scenarios
 */
export const SIMULATION_SCENARIOS = {
  standard_day: {
    id: 'standard_day',
    name: 'Standard Metropolitan Day Shift',
    description: 'Realistic urban emergency demand with moderate arterial traffic and isolated road maintenance.',
    arrivalRatePerHour: 10, // ~10 incidents/hour
    durationMinutes: 120,   // 2 hours
    trafficCondition: 'moderate',
    triageWeights: { critical: 0.20, urgent: 0.50, standard: 0.30 },
    roadClosures: [
      {
        roadId: 'EDGE_PUNE_CENTRAL_DECCAN_S',
        label: 'JM Road Metro Construction Corridor',
        startMinute: 30,
        endMinute: 90,
      },
    ],
  },
  mass_casualty: {
    id: 'mass_casualty',
    name: 'Mass Casualty Highway Collision',
    description: 'High-intensity surge of severe polytrauma and cardiac incidents testing triage capability hierarchy.',
    arrivalRatePerHour: 28, // Surge rate
    durationMinutes: 120,
    trafficCondition: 'heavy',
    triageWeights: { critical: 0.50, urgent: 0.35, standard: 0.15 },
    roadClosures: [
      {
        roadId: 'EDGE_BYPASS_HINJAWADI_WAKAD_N',
        label: 'Mumbai-Bengaluru Western Bypass Collision Closure',
        startMinute: 15,
        endMinute: 105,
      },
    ],
  },
  arterial_gridlock: {
    id: 'arterial_gridlock',
    name: 'Monsoon Flooding & Arterial Gridlock',
    description: 'Multiple simultaneous corridor closures and heavy traffic forcing intelligent detour navigation.',
    arrivalRatePerHour: 14,
    durationMinutes: 120,
    trafficCondition: 'severe',
    triageWeights: { critical: 0.30, urgent: 0.45, standard: 0.25 },
    roadClosures: [
      {
        roadId: 'EDGE_HINJAWADI_PIMPRI_E',
        label: 'Wakad Bridge Waterlogging Closure',
        startMinute: 10,
        endMinute: 110,
      },
      {
        roadId: 'EDGE_SWARGATE_HADAPSAR_E',
        label: 'Shankar Sheth Road Arterial Inundation',
        startMinute: 25,
        endMinute: 115,
      },
    ],
  },
  hospital_surge: {
    id: 'hospital_surge',
    name: 'Hospital Network Bed Saturation',
    description: 'High initial occupancy and diversion status testing capacity-aware multi-criteria matching.',
    arrivalRatePerHour: 16,
    durationMinutes: 120,
    trafficCondition: 'moderate',
    initialBedSaturationRatio: 0.90, // 90% beds occupied initially
    triageWeights: { critical: 0.35, urgent: 0.45, standard: 0.20 },
    roadClosures: [],
  },
};

/**
 * Key Pune Demonstration Geographic Junctions for Incident Sampling
 */
const DEMO_INCIDENT_HOTSPOTS = [
  { name: 'Shivajinagar FC Road Commercial District', coordinates: [73.8415, 18.5284] },
  { name: 'Deccan Gymkhana Junction', coordinates: [73.8420, 18.5195] },
  { name: 'Swargate Bus Terminal & Transit Hub', coordinates: [73.8567, 18.5018] },
  { name: 'Kothrud Paud Road Residential Arterial', coordinates: [73.8087, 18.5074] },
  { name: 'Hinjawadi Rajiv Gandhi Infotech Park Phase 1', coordinates: [73.7380, 18.5913] },
  { name: 'Wakad Chowk Highway Intersection', coordinates: [73.7650, 18.5980] },
  { name: 'Pimpri-Chinchwad Industrial Zone', coordinates: [73.7997, 18.6298] },
  { name: 'Aundh Commercial Center (Parihar Chowk)', coordinates: [73.8060, 18.5580] },
  { name: 'Hadapsar Magarpatta Cybercity Sector', coordinates: [73.9280, 18.5120] },
  { name: 'Bhosari MIDC Industrial Area', coordinates: [73.8450, 18.6250] },
];

/**
 * Generates synthetic incident stream for a scenario deterministically from seed.
 */
export const generateScenarioIncidents = ({
  seed = 42,
  scenarioId = 'standard_day',
  incidentCount = null,
  durationMinutes = 120,
}) => {
  const rng = createRng(seed);
  const scenario = SIMULATION_SCENARIOS[scenarioId] || SIMULATION_SCENARIOS.standard_day;

  const incidents = [];
  let currentMinute = 0;

  // Determine target incident count or sample by Poisson process
  const arrivalRatePerMinute = (scenario.arrivalRatePerHour || 10) / 60;
  let incidentSeq = 1;

  while (currentMinute < durationMinutes) {
    if (incidentCount !== null && incidents.length >= incidentCount) {
      break;
    }

    // Sample inter-arrival time from exponential distribution
    const interval = rng.exponential(arrivalRatePerMinute);
    currentMinute += Number(interval.toFixed(2));

    if (currentMinute >= durationMinutes && incidentCount === null) {
      break;
    }

    // Determine triage level
    const roll = rng.next();
    let triageLevel = 'standard';
    if (roll < scenario.triageWeights.critical) {
      triageLevel = 'critical';
    } else if (roll < scenario.triageWeights.critical + scenario.triageWeights.urgent) {
      triageLevel = 'urgent';
    }

    // Sample symptoms and clinical profile
    let symptoms = ['General abdominal discomfort'];
    let sceneDurationMinutes = Number(rng.uniform(4, 8).toFixed(1));

    if (triageLevel === 'critical') {
      const critProfiles = [
        ['Acute anterior STEMI myocardial infarction', 'Severe retrosternal pain'],
        ['Massive hemorrhage from vehicular polytrauma', 'Unresponsive'],
        ['Severe respiratory arrest with hypoxia', 'Comatose'],
        ['High-speed highway collision with bilateral femur fracture'],
      ];
      symptoms = rng.choice(critProfiles);
      sceneDurationMinutes = Number(rng.uniform(10, 18).toFixed(1));
    } else if (triageLevel === 'urgent') {
      const urgProfiles = [
        ['Compound tibia fracture from motorbike fall', 'Moderate laceration'],
        ['High fever with acute dehydration', 'Shortness of breath'],
        ['Severe asthma exacerbation refractory to inhaler'],
        ['Acute severe burn injury second degree'],
      ];
      symptoms = rng.choice(urgProfiles);
      sceneDurationMinutes = Number(rng.uniform(6, 12).toFixed(1));
    }

    // Sample location with small random jitter around hotspot
    const hotspot = rng.choice(DEMO_INCIDENT_HOTSPOTS);
    const lonJitter = rng.uniform(-0.008, 0.008);
    const latJitter = rng.uniform(-0.008, 0.008);
    const coordinates = [
      Number((hotspot.coordinates[0] + lonJitter).toFixed(6)),
      Number((hotspot.coordinates[1] + latJitter).toFixed(6)),
    ];

    incidents.push({
      id: `INC-SIM-${seed}-${incidentSeq.toString().padStart(4, '0')}`,
      sequenceNumber: incidentSeq,
      arrivalTimeMinutes: Number(Math.min(durationMinutes, currentMinute).toFixed(2)),
      triageLevel,
      symptoms,
      location: {
        address: `${hotspot.name} [SIMULATED ZONE]`,
        coordinates,
      },
      sceneDurationMinutes,
      status: 'pending',
      assignedAmbulanceId: null,
      destinationFacilityId: null,
      dispatchedAtMinutes: null,
      arrivedSceneAtMinutes: null,
      admittedAtMinutes: null,
      responseTimeMinutes: null,
      transitTimeMinutes: null,
      totalMissionDurationMinutes: null,
      isSimulatedData: true,
    });

    incidentSeq++;
  }

  return incidents;
};

/**
 * Creates initial fleet of ambulances for simulation.
 */
export const createInitialFleet = (seed = 42) => {
  const rng = createRng(seed);

  return [
    {
      id: 'SIM_AMB_101',
      ambulanceId: 'MH-12-SIM-101',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: rng.int(80, 100),
      location: { coordinates: [73.8478, 18.5314] }, // Shivajinagar
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_102',
      ambulanceId: 'MH-12-SIM-102',
      vehicleType: 'mobile_icu',
      status: 'available',
      fuelLevel: rng.int(85, 100),
      location: { coordinates: [73.8402, 18.5158] }, // Deccan
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_103',
      ambulanceId: 'MH-12-SIM-103',
      vehicleType: 'bls_ambulance',
      status: 'available',
      fuelLevel: rng.int(75, 95),
      location: { coordinates: [73.8087, 18.5074] }, // Kothrud
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_104',
      ambulanceId: 'MH-12-SIM-104',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: rng.int(80, 100),
      location: { coordinates: [73.7380, 18.5913] }, // Hinjawadi
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_105',
      ambulanceId: 'MH-12-SIM-105',
      vehicleType: 'bls_ambulance',
      status: 'available',
      fuelLevel: rng.int(70, 90),
      location: { coordinates: [73.7997, 18.6298] }, // Pimpri
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_106',
      ambulanceId: 'MH-12-SIM-106',
      vehicleType: 'patient_transport',
      status: 'available',
      fuelLevel: rng.int(80, 95),
      location: { coordinates: [73.8567, 18.5018] }, // Swargate
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_107',
      ambulanceId: 'MH-12-SIM-107',
      vehicleType: 'als_ambulance',
      status: 'available',
      fuelLevel: rng.int(75, 95),
      location: { coordinates: [73.8060, 18.5580] }, // Aundh
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
    {
      id: 'SIM_AMB_108',
      ambulanceId: 'MH-12-SIM-108',
      vehicleType: 'mobile_icu',
      status: 'available',
      fuelLevel: rng.int(85, 100),
      location: { coordinates: [73.9280, 18.5120] }, // Hadapsar
      isActive: true,
      totalBusyTimeMinutes: 0,
      totalMissionsCompleted: 0,
    },
  ];
};

/**
 * Creates initial receiving hospital network for simulation.
 */
export const createInitialFacilities = (scenario = {}) => {
  const isSurge = Boolean(scenario.initialBedSaturationRatio);

  return [
    {
      id: 'SIM_FAC_01',
      name: 'Pune Central Emergency Hospital',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.8478, 18.5314] },
      capabilities: ['emergency', 'icu', 'cardiac', 'trauma'],
      emergencyCapacity: {
        totalBeds: 50,
        availableBeds: isSurge ? 4 : 22,
        icuAvailable: isSurge ? 1 : 6,
        status: isSurge ? 'busy' : 'normal',
        departments: {
          emergency: { available: isSurge ? 2 : 12 },
          icu: { available: isSurge ? 1 : 6 },
          cardiac: { available: isSurge ? 1 : 4 },
          trauma: { available: isSurge ? 0 : 3 },
        },
      },
      peakOccupiedBeds: 0,
      totalAdmissions: 0,
    },
    {
      id: 'SIM_FAC_02',
      name: 'Sahyadri Acute Trauma Care Centre',
      facilityType: 'trauma_center',
      isActive: true,
      location: { coordinates: [73.8402, 18.5158] },
      capabilities: ['emergency', 'trauma', 'icu', 'surgery'],
      emergencyCapacity: {
        totalBeds: 60,
        availableBeds: isSurge ? 5 : 28,
        icuAvailable: isSurge ? 1 : 8,
        status: 'normal',
        departments: {
          emergency: { available: isSurge ? 3 : 14 },
          trauma: { available: isSurge ? 2 : 10 },
          icu: { available: isSurge ? 1 : 8 },
        },
      },
      peakOccupiedBeds: 0,
      totalAdmissions: 0,
    },
    {
      id: 'SIM_FAC_03',
      name: 'Pimpri Emergency Medical Centre',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.7997, 18.6298] },
      capabilities: ['emergency', 'icu', 'trauma', 'pediatric'],
      emergencyCapacity: {
        totalBeds: 45,
        availableBeds: isSurge ? 3 : 18,
        icuAvailable: isSurge ? 1 : 5,
        status: isSurge ? 'busy' : 'normal',
        departments: {
          emergency: { available: isSurge ? 2 : 10 },
          icu: { available: isSurge ? 1 : 5 },
          trauma: { available: isSurge ? 1 : 4 },
        },
      },
      peakOccupiedBeds: 0,
      totalAdmissions: 0,
    },
    {
      id: 'SIM_FAC_04',
      name: 'Kothrud Municipal Emergency Unit',
      facilityType: 'urgent_care',
      isActive: true,
      location: { coordinates: [73.8087, 18.5074] },
      capabilities: ['emergency', 'general'],
      emergencyCapacity: {
        totalBeds: 25,
        availableBeds: isSurge ? 2 : 12,
        icuAvailable: 0,
        status: 'normal',
        departments: {
          emergency: { available: isSurge ? 2 : 12 },
        },
      },
      peakOccupiedBeds: 0,
      totalAdmissions: 0,
    },
    {
      id: 'SIM_FAC_05',
      name: 'Hinjawadi LifeLine Medical Centre',
      facilityType: 'hospital',
      isActive: true,
      location: { coordinates: [73.7380, 18.5913] },
      capabilities: ['emergency', 'icu', 'cardiac'],
      emergencyCapacity: {
        totalBeds: 35,
        availableBeds: isSurge ? 1 : 14,
        icuAvailable: isSurge ? 0 : 4,
        status: isSurge ? 'divert' : 'normal',
        departments: {
          emergency: { available: isSurge ? 1 : 8 },
          icu: { available: isSurge ? 0 : 4 },
        },
      },
      peakOccupiedBeds: 0,
      totalAdmissions: 0,
    },
  ];
};

/**
 * Deterministic Event Queue Item
 */
class SimulationEvent {
  constructor(time, eventType, data = {}, seq = 0) {
    this.time = Number(time.toFixed(3));
    this.eventType = eventType;
    this.data = data;
    this.seq = seq;
  }
}

/**
 * Priority Queue for Discrete Events.
 * Ordered strictly by event time ascending; ties broken by sequence number.
 */
class EventQueue {
  constructor() {
    this.events = [];
    this.seqCounter = 0;
  }

  push(time, eventType, data = {}) {
    const event = new SimulationEvent(time, eventType, data, ++this.seqCounter);
    // Binary insert for efficient sorted priority queue
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const cmp = this.events[mid].time - event.time;
      if (cmp < 0 || (cmp === 0 && this.events[mid].seq < event.seq)) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    this.events.splice(low, 0, event);
    return event;
  }

  pop() {
    return this.events.shift();
  }

  isEmpty() {
    return this.events.length === 0;
  }

  peek() {
    return this.events[0] || null;
  }

  size() {
    return this.events.length;
  }
}

/**
 * Runs a discrete-event simulation for a specific dispatch algorithm.
 *
 * @param {Object} params
 * @param {string} params.algorithm - 'proposed' | 'nearest_available' | 'shortest_path_dijkstra'
 * @param {string|number} params.seed - Configurable seed for reproducibility
 * @param {string} params.scenarioId - Scenario identifier
 * @param {number} [params.durationMinutes] - Override duration
 * @param {number} [params.incidentCount] - Override incident count
 * @param {Array} [params.preGeneratedIncidents] - Identical incident list across comparative runs
 */
export const runSimulationScenario = async ({
  algorithm = ALGORITHM_POLICIES.PROPOSED,
  seed = 42,
  scenarioId = 'standard_day',
  durationMinutes = null,
  incidentCount = null,
  preGeneratedIncidents = null,
}) => {
  const scenario = SIMULATION_SCENARIOS[scenarioId] || SIMULATION_SCENARIOS.standard_day;
  const simDuration = durationMinutes || scenario.durationMinutes || 120;

  // Use pre-generated incidents or generate deterministically
  const rawIncidents = preGeneratedIncidents
    ? JSON.parse(JSON.stringify(preGeneratedIncidents))
    : generateScenarioIncidents({
        seed,
        scenarioId,
        incidentCount,
        durationMinutes: simDuration,
      });

  // Deep clone fleet and facilities for isolated run
  const ambulances = createInitialFleet(seed);
  const facilities = createInitialFacilities(scenario);

  // Initialize road closures
  const scheduledClosures = scenario.roadClosures || [];
  const activeRoadClosures = [];

  const queue = new EventQueue();
  const eventLog = [];
  const computationTimesMs = [];
  const pendingIncidentsQueue = [];

  let clock = 0;

  // Log simulation initialization
  eventLog.push({
    time: 0,
    eventType: 'SIMULATION_START',
    data: {
      algorithm,
      seed,
      scenarioId,
      durationMinutes: simDuration,
      totalIncidentsLoaded: rawIncidents.length,
      ambulanceCount: ambulances.length,
      facilityCount: facilities.length,
      isSimulatedData: true,
    },
  });

  // Schedule all incident arrival events
  for (const inc of rawIncidents) {
    queue.push(inc.arrivalTimeMinutes, 'INCIDENT_ARRIVAL', { incidentId: inc.id });
  }

  // Schedule road closure events
  for (const rc of scheduledClosures) {
    queue.push(rc.startMinute, 'ROAD_CLOSURE_START', { roadId: rc.roadId, label: rc.label });
    queue.push(rc.endMinute, 'ROAD_CLOSURE_END', { roadId: rc.roadId, label: rc.label });
  }

  // Schedule simulation end
  queue.push(simDuration, 'SIMULATION_END', {});

  // Fast incident map lookup
  const incidentMap = new Map();
  for (const inc of rawIncidents) {
    incidentMap.set(inc.id, inc);
  }

  /**
   * Helper: Dispatches an incident using the configured algorithm policy.
   */
  const attemptDispatch = async (incident) => {
    const decision = await executeDispatchPolicy(algorithm, {
      incident,
      ambulances,
      facilities,
      trafficCondition: scenario.trafficCondition,
      roadClosures: activeRoadClosures,
    });

    computationTimesMs.push(decision.computeTimeMs || 1.0);

    eventLog.push({
      time: clock,
      eventType: 'DISPATCH_DECISION',
      data: {
        incidentId: incident.id,
        algorithm,
        success: decision.success,
        ambulanceId: decision.selectedAmbulance?.id || null,
        facilityId: decision.selectedFacility?.id || null,
        estimatedResponseMinutes: decision.estimatedResponseTimeMinutes || null,
        failureReason: decision.failureReason || null,
        computeTimeMs: decision.computeTimeMs,
        isValidRoute: decision.routeToScene?.isValidRoute !== false,
      },
    });

    if (decision.success && decision.selectedAmbulance && decision.selectedFacility) {
      const amb = ambulances.find((a) => a.id === decision.selectedAmbulance.id);
      const fac = facilities.find((f) => f.id === decision.selectedFacility.id);

      if (!amb || !fac) {
        incident.status = 'unserved';
        return false;
      }

      // Reserve resource state atomically
      amb.status = 'en_route_pickup';
      incident.status = 'dispatched';
      incident.assignedAmbulanceId = amb.id;
      incident.destinationFacilityId = fac.id;
      incident.dispatchedAtMinutes = clock;

      // Realistic travel time (clamped between 3 and 45 minutes)
      const travelToSceneMinutes = Math.max(
        3.0,
        Math.min(45.0, Number((decision.estimatedResponseTimeMinutes || 12.0).toFixed(2)))
      );
      const sceneArrivalTime = Number((clock + travelToSceneMinutes).toFixed(2));

      // Schedule ambulance arrival at scene
      queue.push(sceneArrivalTime, 'AMBULANCE_ARRIVE_SCENE', {
        incidentId: incident.id,
        ambulanceId: amb.id,
        facilityId: fac.id,
        travelToSceneMinutes,
      });

      return true;
    } else {
      // Could not dispatch immediately; add to pending queue
      if (!pendingIncidentsQueue.includes(incident)) {
        pendingIncidentsQueue.push(incident);
      }
      return false;
    }
  };

  // --- DISCRETE EVENT SIMULATION LOOP ---
  while (!queue.isEmpty()) {
    const event = queue.pop();
    clock = event.time;

    // Terminate simulation upon reaching duration
    if (clock >= simDuration && event.eventType === 'SIMULATION_END') {
      break;
    }

    switch (event.eventType) {
      case 'INCIDENT_ARRIVAL': {
        const inc = incidentMap.get(event.data.incidentId);
        if (!inc) break;

        await attemptDispatch(inc);
        break;
      }

      case 'AMBULANCE_ARRIVE_SCENE': {
        const inc = incidentMap.get(event.data.incidentId);
        const amb = ambulances.find((a) => a.id === event.data.ambulanceId);
        if (!inc || !amb) break;

        amb.status = 'at_scene';
        inc.status = 'at_scene';
        inc.arrivedSceneAtMinutes = clock;
        inc.responseTimeMinutes = Number((clock - inc.arrivalTimeMinutes).toFixed(2));

        eventLog.push({
          time: clock,
          eventType: 'AMBULANCE_ARRIVED_SCENE',
          data: {
            incidentId: inc.id,
            ambulanceId: amb.id,
            responseTimeMinutes: inc.responseTimeMinutes,
          },
        });

        // Schedule departure to hospital after stabilization
        const departTime = Number((clock + inc.sceneDurationMinutes).toFixed(2));
        queue.push(departTime, 'PATIENT_DEPART_TO_FACILITY', {
          incidentId: inc.id,
          ambulanceId: amb.id,
          facilityId: event.data.facilityId,
        });
        break;
      }

      case 'PATIENT_DEPART_TO_FACILITY': {
        const inc = incidentMap.get(event.data.incidentId);
        const amb = ambulances.find((a) => a.id === event.data.ambulanceId);
        const fac = facilities.find((f) => f.id === event.data.facilityId);
        if (!inc || !amb || !fac) break;

        amb.status = 'en_route_facility';
        inc.status = 'transporting';

        // Calculate transit time from scene to hospital
        const transitMinutes = Math.max(
          4.0,
          Math.min(45.0, Number((event.data.estimatedTransitTimeMinutes || 14.0).toFixed(2)))
        );
        const hospitalArrivalTime = Number((clock + transitMinutes).toFixed(2));

        queue.push(hospitalArrivalTime, 'PATIENT_ADMITTED', {
          incidentId: inc.id,
          ambulanceId: amb.id,
          facilityId: fac.id,
          transitMinutes,
        });
        break;
      }

      case 'PATIENT_ADMITTED': {
        const inc = incidentMap.get(event.data.incidentId);
        const amb = ambulances.find((a) => a.id === event.data.ambulanceId);
        const fac = facilities.find((f) => f.id === event.data.facilityId);
        if (!inc || !amb || !fac) break;

        inc.status = 'completed';
        inc.admittedAtMinutes = clock;
        inc.transitTimeMinutes = Number((event.data.transitMinutes || (clock - (inc.arrivedSceneAtMinutes + inc.sceneDurationMinutes))).toFixed(2));
        inc.totalMissionDurationMinutes = Number((clock - inc.arrivalTimeMinutes).toFixed(2));

        // Update facility occupancy safely
        const cap = fac.emergencyCapacity || {};
        if (cap.availableBeds > 0) {
          cap.availableBeds = Math.max(0, cap.availableBeds - 1);
        }
        if (inc.triageLevel === 'critical' && cap.icuAvailable > 0) {
          cap.icuAvailable = Math.max(0, cap.icuAvailable - 1);
        }
        fac.totalAdmissions = (fac.totalAdmissions || 0) + 1;
        const currentOccupied = (cap.totalBeds || 50) - cap.availableBeds;
        fac.peakOccupiedBeds = Math.max(fac.peakOccupiedBeds || 0, currentOccupied);

        // Track ambulance busy time and release to available
        const missionDuration = clock - inc.dispatchedAtMinutes;
        amb.totalBusyTimeMinutes = Number(((amb.totalBusyTimeMinutes || 0) + missionDuration).toFixed(2));
        amb.totalMissionsCompleted = (amb.totalMissionsCompleted || 0) + 1;
        amb.status = 'available';

        eventLog.push({
          time: clock,
          eventType: 'PATIENT_ADMITTED',
          data: {
            incidentId: inc.id,
            ambulanceId: amb.id,
            facilityId: fac.id,
            totalMissionDurationMinutes: inc.totalMissionDurationMinutes,
            facilityAvailableBeds: cap.availableBeds,
          },
        });

        // Schedule hospital bed turnover release (patient discharged / moved to ward)
        const treatmentDurationMinutes = inc.triageLevel === 'critical' ? 90 : 45;
        const bedReleaseTime = Number((clock + treatmentDurationMinutes).toFixed(2));
        queue.push(bedReleaseTime, 'FACILITY_BED_RELEASE', {
          facilityId: fac.id,
          triageLevel: inc.triageLevel,
        });

        // Try to dispatch any queued waiting incidents now that this ambulance is available!
        if (pendingIncidentsQueue.length > 0) {
          const nextInc = pendingIncidentsQueue.shift();
          await attemptDispatch(nextInc);
        }
        break;
      }

      case 'FACILITY_BED_RELEASE': {
        const fac = facilities.find((f) => f.id === event.data.facilityId);
        if (fac && fac.emergencyCapacity) {
          const cap = fac.emergencyCapacity;
          cap.availableBeds = Math.min(cap.totalBeds || 50, cap.availableBeds + 1);
          if (event.data.triageLevel === 'critical' && typeof cap.icuAvailable === 'number') {
            cap.icuAvailable = Math.min(cap.totalBeds, cap.icuAvailable + 1);
          }
        }
        break;
      }

      case 'ROAD_CLOSURE_START': {
        if (!activeRoadClosures.includes(event.data.roadId)) {
          activeRoadClosures.push(event.data.roadId);
        }
        eventLog.push({
          time: clock,
          eventType: 'ROAD_CLOSURE_START',
          data: { roadId: event.data.roadId, label: event.data.label, isSimulatedData: true },
        });
        break;
      }

      case 'ROAD_CLOSURE_END': {
        const idx = activeRoadClosures.indexOf(event.data.roadId);
        if (idx !== -1) {
          activeRoadClosures.splice(idx, 1);
        }
        eventLog.push({
          time: clock,
          eventType: 'ROAD_CLOSURE_END',
          data: { roadId: event.data.roadId, label: event.data.label, isSimulatedData: true },
        });
        break;
      }

      default:
        break;
    }
  }

  // Post-simulation processing: account for all incidents and ensure fleet integrity
  for (const inc of rawIncidents) {
    if (inc.status !== 'completed') {
      inc.status = 'unserved';
      eventLog.push({
        time: simDuration,
        eventType: 'INCIDENT_UNSERVED',
        data: {
          incidentId: inc.id,
          reason: 'Simulation timeline ended before hospital admission could be completed',
        },
      });
    }
  }

  // Reset any active ambulances back to available status at horizon
  for (const amb of ambulances) {
    amb.status = 'available';
  }

  // Compute standardized aggregate metrics
  const metrics = computeSimulationMetrics({
    eventLog,
    incidents: rawIncidents,
    ambulances,
    facilities,
    durationMinutes: simDuration,
    computationTimesMs,
  });

  return {
    algorithm,
    seed,
    scenarioId,
    scenarioConfig: scenario,
    metrics,
    incidents: rawIncidents,
    ambulances,
    facilities,
    eventLog,
    runTimestamp: new Date().toISOString(),
    isSimulatedData: true,
  };
};

export default {
  SIMULATION_SCENARIOS,
  generateScenarioIncidents,
  createInitialFleet,
  createInitialFacilities,
  runSimulationScenario,
};
