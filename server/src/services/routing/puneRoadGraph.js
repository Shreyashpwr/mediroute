import { RoadGraph } from './roadGraph.js';

export const PUNE_GRAPH_METADATA = {
  name: 'Pune Metropolitan Emergency Demonstration Network',
  region: 'Pune & Pimpri-Chinchwad, Maharashtra, India',
  isDemonstrationModel: true,
  disclaimer:
    'This is a seeded demonstration topological graph of primary Pune arterial corridors and hospital junctions. It is not an exhaustive street-level map of all municipal roads.',
};

/**
 * Builds and initializes the Pune emergency corridor demonstration road graph.
 * @returns {RoadGraph} Fully connected, directed road graph
 */
export const createPuneRoadGraph = () => {
  const graph = new RoadGraph(PUNE_GRAPH_METADATA.name);

  // --- 1. HEALTHCARE FACILITY JUNCTIONS & ARTERIAL HUBS ---
  const nodes = [
    {
      id: 'NODE_PUNE_CENTRAL',
      label: 'Pune Central Emergency Hospital (Shivajinagar)',
      coordinates: { latitude: 18.5314, longitude: 73.8478 },
      metadata: { facilityId: '6ab961df35670da04db404f9', type: 'hospital_hub' },
    },
    {
      id: 'NODE_SAHYADRI',
      label: 'Sahyadri Acute Trauma Care (Deccan Gymkhana)',
      coordinates: { latitude: 18.5158, longitude: 73.8402 },
      metadata: { facilityId: '6ab961df35670da04db404fb', type: 'trauma_hub' },
    },
    {
      id: 'NODE_KOTHRUD',
      label: 'Kothrud Municipal Emergency Unit (Paud Road)',
      coordinates: { latitude: 18.5074, longitude: 73.8087 },
      metadata: { facilityId: '6ab961df35670da04db404fc', type: 'urgent_care' },
    },
    {
      id: 'NODE_HINJAWADI',
      label: 'Hinjawadi LifeLine Medical Centre (Infotech Park)',
      coordinates: { latitude: 18.5913, longitude: 73.7380 },
      metadata: { facilityId: '6ab961df35670da04db404fd', type: 'hospital_hub' },
    },
    {
      id: 'NODE_PIMPRI',
      label: 'Pimpri Emergency Medical Centre (Nigdi / Pradhikaran)',
      coordinates: { latitude: 18.6298, longitude: 73.7997 },
      metadata: { facilityId: '6ab961df35670da04db404fa', type: 'hospital_hub' },
    },
    {
      id: 'NODE_SWARGATE',
      label: 'Swargate Chowk Junction (South Pune Transit Hub)',
      coordinates: { latitude: 18.5018, longitude: 73.8567 },
      metadata: { type: 'transit_hub' },
    },
    {
      id: 'NODE_DECCAN_GYM',
      label: 'Deccan Gymkhana / FC Road Junction',
      coordinates: { latitude: 18.5195, longitude: 73.8420 },
      metadata: { type: 'arterial_junction' },
    },
    {
      id: 'NODE_SHIVAJINAGAR_CHOWK',
      label: 'Shivajinagar Station Chowk',
      coordinates: { latitude: 18.5320, longitude: 73.8520 },
      metadata: { type: 'arterial_junction' },
    },
    {
      id: 'NODE_UNIVERSITY_CIRCLE',
      label: 'Savitribai Phule Pune University Circle',
      coordinates: { latitude: 18.5529, longitude: 73.8285 },
      metadata: { type: 'arterial_hub' },
    },
    {
      id: 'NODE_AUNDH',
      label: 'Rajiv Gandhi Bridge / Aundh Chowk',
      coordinates: { latitude: 18.5630, longitude: 73.8070 },
      metadata: { type: 'arterial_junction' },
    },
    {
      id: 'NODE_BANER',
      label: 'Baner High Street / Highway Junction',
      coordinates: { latitude: 18.5590, longitude: 73.7925 },
      metadata: { type: 'highway_corridor' },
    },
    {
      id: 'NODE_WAKAD',
      label: 'Wakad Bypass Interchange',
      coordinates: { latitude: 18.5980, longitude: 73.7650 },
      metadata: { type: 'highway_corridor' },
    },
    {
      id: 'NODE_CHINCHWAD',
      label: 'Chinchwad Station Chowk (Old Mumbai-Pune Highway)',
      coordinates: { latitude: 18.6250, longitude: 73.7910 },
      metadata: { type: 'arterial_hub' },
    },
    {
      id: 'NODE_AKURDI',
      label: 'Akurdi Railway Station Chowk (PCMC)',
      coordinates: { latitude: 18.6180, longitude: 73.8150 },
      metadata: { type: 'arterial_junction' },
    },
    {
      id: 'NODE_KASARWADI',
      label: 'Kasarwadi Flyover / Nashik Phata Junction',
      coordinates: { latitude: 18.5930, longitude: 73.8260 },
      metadata: { type: 'flyover_corridor' },
    },
    {
      id: 'NODE_HADAPSAR',
      label: 'Hadapsar Gadital / Magarpatta Junction',
      coordinates: { latitude: 18.5020, longitude: 73.9280 },
      metadata: { type: 'eastern_corridor' },
    },
  ];

  for (const node of nodes) {
    graph.addNode(node);
  }

  // --- 2. BIDIRECTIONAL ROAD EDGES ---
  // Connects Pune city center, Pimpri-Chinchwad, and Western IT Corridor
  const roadSegments = [
    // 1. Ganeshkhind Road Corridor (Shivajinagar <-> Pune Central <-> University Circle)
    {
      id: 'ROAD_GANESHKHIND_CENTRAL',
      source: 'NODE_SHIVAJINAGAR_CHOWK',
      target: 'NODE_PUNE_CENTRAL',
      distanceKm: 0.8,
      baseSpeedKmH: 45,
      roadName: 'Ganeshkhind Road (Central Section)',
      roadType: 'arterial',
      metadata: { priorityCorridor: true },
    },
    {
      id: 'ROAD_GANESHKHIND_UNI',
      source: 'NODE_PUNE_CENTRAL',
      target: 'NODE_UNIVERSITY_CIRCLE',
      distanceKm: 3.1,
      baseSpeedKmH: 50,
      roadName: 'Ganeshkhind Road (Flyover Reach)',
      roadType: 'arterial',
      metadata: { priorityCorridor: true },
    },

    // 2. FC Road & Karve Road (Shivajinagar <-> Deccan Gymkhana <-> Sahyadri)
    {
      id: 'ROAD_FC_ROAD',
      source: 'NODE_PUNE_CENTRAL',
      target: 'NODE_DECCAN_GYM',
      distanceKm: 1.8,
      baseSpeedKmH: 40,
      roadName: 'Fergusson College Road',
      roadType: 'urban_arterial',
    },
    {
      id: 'ROAD_DECCAN_SAHYADRI',
      source: 'NODE_DECCAN_GYM',
      target: 'NODE_SAHYADRI',
      distanceKm: 0.6,
      baseSpeedKmH: 35,
      roadName: 'Karve Road (Deccan Reach)',
      roadType: 'urban_arterial',
    },

    // 3. Karve Road / Paud Road (Sahyadri <-> Kothrud)
    {
      id: 'ROAD_KARVE_PAUD',
      source: 'NODE_SAHYADRI',
      target: 'NODE_KOTHRUD',
      distanceKm: 3.8,
      baseSpeedKmH: 45,
      roadName: 'Paud Road Arterial',
      roadType: 'arterial',
    },

    // 4. Bajirao Road / Tilak Road (Deccan <-> Swargate)
    {
      id: 'ROAD_DECCAN_SWARGATE',
      source: 'NODE_DECCAN_GYM',
      target: 'NODE_SWARGATE',
      distanceKm: 3.2,
      baseSpeedKmH: 35,
      roadName: 'Tilak Road Corridor',
      roadType: 'urban_arterial',
    },
    {
      id: 'ROAD_CENTRAL_SWARGATE',
      source: 'NODE_SHIVAJINAGAR_CHOWK',
      target: 'NODE_SWARGATE',
      distanceKm: 4.1,
      baseSpeedKmH: 40,
      roadName: 'Bajirao Road Transit Route',
      roadType: 'urban_arterial',
    },

    // 5. University Circle <-> Aundh <-> Baner Corridor
    {
      id: 'ROAD_UNI_AUNDH',
      source: 'NODE_UNIVERSITY_CIRCLE',
      target: 'NODE_AUNDH',
      distanceKm: 2.6,
      baseSpeedKmH: 50,
      roadName: 'Rajiv Gandhi Bridge Road',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_AUNDH_BANER',
      source: 'NODE_AUNDH',
      target: 'NODE_BANER',
      distanceKm: 2.1,
      baseSpeedKmH: 50,
      roadName: 'Aundh-Baner Link Road',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_UNI_BANER',
      source: 'NODE_UNIVERSITY_CIRCLE',
      target: 'NODE_BANER',
      distanceKm: 4.2,
      baseSpeedKmH: 55,
      roadName: 'Baner Road Direct Corridor',
      roadType: 'arterial',
    },

    // 6. Western Expressway / Mumbai-Bengaluru Highway (Baner <-> Wakad)
    {
      id: 'ROAD_BANER_WAKAD_HWY',
      source: 'NODE_BANER',
      target: 'NODE_WAKAD',
      distanceKm: 5.4,
      baseSpeedKmH: 70, // Faster highway speed
      roadName: 'Mumbai-Bengaluru Western Bypass Highway (NH-48)',
      roadType: 'expressway',
      metadata: { priorityLane: true },
    },

    // 7. Hinjawadi IT Park Link (Wakad <-> Hinjawadi LifeLine)
    {
      id: 'ROAD_WAKAD_HINJAWADI',
      source: 'NODE_WAKAD',
      target: 'NODE_HINJAWADI',
      distanceKm: 3.6,
      baseSpeedKmH: 50,
      roadName: 'Hinjawadi Flyover Corridor',
      roadType: 'arterial',
      metadata: { peakHourCongestion: true },
    },

    // 8. PCMC Arterial Corridor (Wakad <-> Chinchwad <-> Pimpri)
    {
      id: 'ROAD_WAKAD_CHINCHWAD',
      source: 'NODE_WAKAD',
      target: 'NODE_CHINCHWAD',
      distanceKm: 4.8,
      baseSpeedKmH: 55,
      roadName: 'Dange Chowk - Chinchwad Link Road',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_CHINCHWAD_PIMPRI',
      source: 'NODE_CHINCHWAD',
      target: 'NODE_PIMPRI',
      distanceKm: 2.2,
      baseSpeedKmH: 45,
      roadName: 'Old Mumbai-Pune Highway (Nigdi Reach)',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_CHINCHWAD_AKURDI',
      source: 'NODE_CHINCHWAD',
      target: 'NODE_AKURDI',
      distanceKm: 2.8,
      baseSpeedKmH: 45,
      roadName: 'Akurdi Railway Approach Road',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_AKURDI_PIMPRI',
      source: 'NODE_AKURDI',
      target: 'NODE_PIMPRI',
      distanceKm: 2.5,
      baseSpeedKmH: 45,
      roadName: 'Pradhikaran Spine Road',
      roadType: 'arterial',
    },

    // 9. Old Mumbai-Pune Highway East Arterial (Shivajinagar <-> Kasarwadi <-> Akurdi)
    {
      id: 'ROAD_SHIVAJINAGAR_KASARWADI',
      source: 'NODE_SHIVAJINAGAR_CHOWK',
      target: 'NODE_KASARWADI',
      distanceKm: 7.2,
      baseSpeedKmH: 60,
      roadName: 'Old Mumbai-Pune Highway (Khirki-Dapodi Reach)',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_KASARWADI_AKURDI',
      source: 'NODE_KASARWADI',
      target: 'NODE_AKURDI',
      distanceKm: 4.5,
      baseSpeedKmH: 55,
      roadName: 'Nashik Phata - Pimpri Grade Separator',
      roadType: 'arterial',
    },
    {
      id: 'ROAD_AUNDH_KASARWADI',
      source: 'NODE_AUNDH',
      target: 'NODE_KASARWADI',
      distanceKm: 4.1,
      baseSpeedKmH: 50,
      roadName: 'Sangvi-Nashik Phata Connector',
      roadType: 'arterial',
    },

    // 10. Hadapsar South-East Link (Swargate <-> Hadapsar)
    {
      id: 'ROAD_SWARGATE_HADAPSAR',
      source: 'NODE_SWARGATE',
      target: 'NODE_HADAPSAR',
      distanceKm: 7.5,
      baseSpeedKmH: 50,
      roadName: 'Solapur Road Arterial',
      roadType: 'arterial',
    },
  ];

  for (const seg of roadSegments) {
    graph.addBidirectionalEdge(seg);
  }

  return graph;
};

// Singleton instance of default seeded Pune graph
let defaultPuneGraph = null;
export const getPuneRoadGraph = () => {
  if (!defaultPuneGraph) {
    defaultPuneGraph = createPuneRoadGraph();
  }
  return defaultPuneGraph;
};

export default {
  PUNE_GRAPH_METADATA,
  createPuneRoadGraph,
  getPuneRoadGraph,
};
