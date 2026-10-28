import { haversineDistanceKm, computeEffectiveSpeedKmH, computeTravelTimeMinutes } from './routeCost.js';

/**
 * RoadGraph: Directed, weighted road network graph with support for
 * geographic coordinates, dynamic congestion multipliers, and road closure states.
 */
export class RoadGraph {
  constructor(name = 'Generic Road Graph') {
    this.name = name;
    this.nodes = new Map(); // nodeId -> Node object
    this.adjacency = new Map(); // nodeId -> Array<Edge object>
    this.edges = new Map(); // edgeId -> Edge object
  }

  /**
   * Registers a vertex / road junction in the graph.
   * @param {object} node - { id, label, coordinates: { latitude, longitude }, metadata }
   */
  addNode(node) {
    if (!node || !node.id) {
      throw new Error('Node must have a valid id');
    }
    const id = String(node.id);
    if (this.nodes.has(id)) {
      throw new Error(`Node with id "${id}" already exists in graph`);
    }

    const coordinates = node.coordinates
      ? {
          latitude: Number(node.coordinates.latitude ?? node.coordinates.lat),
          longitude: Number(node.coordinates.longitude ?? node.coordinates.lng ?? node.coordinates.lon),
        }
      : null;

    if (coordinates && (isNaN(coordinates.latitude) || isNaN(coordinates.longitude))) {
      throw new Error(`Invalid coordinates for node "${id}": [${node.coordinates.latitude}, ${node.coordinates.longitude}]`);
    }

    const nodeObj = {
      id,
      label: node.label || id,
      coordinates,
      metadata: node.metadata || {},
    };

    this.nodes.set(id, nodeObj);
    this.adjacency.set(id, []);
    return nodeObj;
  }

  hasNode(id) {
    return this.nodes.has(String(id));
  }

  getNode(id) {
    return this.nodes.get(String(id)) || null;
  }

  getNodes() {
    return Array.from(this.nodes.values());
  }

  /**
   * Adds a directed road edge from source to target.
   * @param {object} edgeConfig - Edge specification
   */
  addEdge(edgeConfig) {
    if (!edgeConfig) throw new Error('Edge configuration required');

    const source = String(edgeConfig.source);
    const target = String(edgeConfig.target);

    if (!this.nodes.has(source)) {
      throw new Error(`Edge source node "${source}" does not exist in graph`);
    }
    if (!this.nodes.has(target)) {
      throw new Error(`Edge target node "${target}" does not exist in graph`);
    }

    const distanceKm = Number(edgeConfig.distanceKm ?? edgeConfig.distance);
    if (isNaN(distanceKm) || distanceKm < 0) {
      throw new Error(`Invalid edge distance for ${source} -> ${target}: ${distanceKm}`);
    }

    const id = edgeConfig.id
      ? String(edgeConfig.id)
      : `${source}->${target}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const baseSpeedKmH = Number(edgeConfig.baseSpeedKmH ?? edgeConfig.speedLimit ?? 50);
    const congestionMultiplier = Math.max(1.0, Number(edgeConfig.congestionMultiplier ?? 1.0));
    const isClosed = Boolean(edgeConfig.isClosed);

    const edgeObj = {
      id,
      source,
      target,
      distanceKm,
      baseSpeedKmH,
      congestionMultiplier,
      isClosed,
      roadName: edgeConfig.roadName || 'Unnamed Road Segment',
      roadType: edgeConfig.roadType || 'arterial',
      metadata: edgeConfig.metadata || {},

      // Dynamic getters for effective metrics
      get effectiveSpeedKmH() {
        return computeEffectiveSpeedKmH(this.baseSpeedKmH, this.congestionMultiplier);
      },
      get travelTimeMinutes() {
        return computeTravelTimeMinutes(this.distanceKm, this.effectiveSpeedKmH);
      },
    };

    this.edges.set(id, edgeObj);
    this.adjacency.get(source).push(edgeObj);
    return edgeObj;
  }

  /**
   * Helper to register bidirectional roads (two directed edges in opposite directions).
   */
  addBidirectionalEdge(edgeConfig) {
    const { id, source, target, ...rest } = edgeConfig;
    const forwardId = id ? `${id}_fwd` : undefined;
    const reverseId = id ? `${id}_rev` : undefined;

    const forwardEdge = this.addEdge({
      ...rest,
      id: forwardId,
      source,
      target,
    });

    const reverseEdge = this.addEdge({
      ...rest,
      id: reverseId,
      source: target,
      target: source,
    });

    return [forwardEdge, reverseEdge];
  }

  getEdge(id) {
    return this.edges.get(String(id)) || null;
  }

  getAllEdges() {
    return Array.from(this.edges.values());
  }

  getOutgoingEdges(nodeId) {
    return this.adjacency.get(String(nodeId)) || [];
  }

  /**
   * Update the congestion multiplier of a specific edge.
   * @param {string} edgeId
   * @param {number} congestionMultiplier - Multiplier >= 1.0
   */
  setEdgeCongestion(edgeId, congestionMultiplier) {
    const edge = this.getEdge(edgeId);
    if (!edge) {
      throw new Error(`Cannot update congestion: edge "${edgeId}" not found`);
    }
    const multiplier = Math.max(1.0, Number(congestionMultiplier) || 1.0);
    edge.congestionMultiplier = multiplier;
    return edge;
  }

  /**
   * Update road closure status for a specific edge.
   * @param {string} edgeId
   * @param {boolean} isClosed
   */
  setEdgeClosure(edgeId, isClosed = true) {
    const edge = this.getEdge(edgeId);
    if (!edge) {
      throw new Error(`Cannot toggle closure: edge "${edgeId}" not found`);
    }
    edge.isClosed = Boolean(isClosed);
    return edge;
  }

  /**
   * Sets road closure status across all edges with matching road name.
   * Useful for shutting down an entire avenue/corridor.
   * @param {string} roadName
   * @param {boolean} isClosed
   */
  setRoadClosureByName(roadName, isClosed = true) {
    const matched = [];
    const normalized = String(roadName).toLowerCase().trim();
    for (const edge of this.edges.values()) {
      if (edge.roadName.toLowerCase().includes(normalized)) {
        edge.isClosed = Boolean(isClosed);
        matched.push(edge);
      }
    }
    return matched;
  }

  /**
   * Finds the closest node in the graph to a geographic query coordinate.
   * @param {object} coords - { latitude, longitude }
   * @param {number} maxRadiusKm - Max search radius
   * @returns {{ node: object, distanceKm: number } | null}
   */
  findNearestNode(coords, maxRadiusKm = 50) {
    if (!coords) return null;
    let closestNode = null;
    let minDistance = Infinity;

    for (const node of this.nodes.values()) {
      if (!node.coordinates) continue;
      const dist = haversineDistanceKm(coords, node.coordinates);
      if (dist < minDistance) {
        minDistance = dist;
        closestNode = node;
      }
    }

    if (closestNode && minDistance <= maxRadiusKm) {
      return { node: closestNode, distanceKm: minDistance };
    }
    return null;
  }

  /**
   * Performs an integrity check on all graph vertices and edges.
   */
  validate() {
    const errors = [];
    for (const [nodeId, edges] of this.adjacency.entries()) {
      if (!this.nodes.has(nodeId)) {
        errors.push(`Adjacency list contains unregistered node "${nodeId}"`);
      }
      for (const edge of edges) {
        if (!this.nodes.has(edge.target)) {
          errors.push(`Edge "${edge.id}" targets unregistered node "${edge.target}"`);
        }
        if (edge.distanceKm < 0) {
          errors.push(`Edge "${edge.id}" has negative distance: ${edge.distanceKm}`);
        }
      }
    }
    return {
      isValid: errors.length === 0,
      errors,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
    };
  }

  /**
   * Deep clone of graph for isolated simulated runs (e.g. hypothetical hazard testing).
   */
  clone() {
    const cloned = new RoadGraph(`${this.name} (Clone)`);
    for (const node of this.nodes.values()) {
      cloned.addNode({
        id: node.id,
        label: node.label,
        coordinates: node.coordinates ? { ...node.coordinates } : null,
        metadata: { ...node.metadata },
      });
    }
    for (const edge of this.edges.values()) {
      cloned.addEdge({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        distanceKm: edge.distanceKm,
        baseSpeedKmH: edge.baseSpeedKmH,
        congestionMultiplier: edge.congestionMultiplier,
        isClosed: edge.isClosed,
        roadName: edge.roadName,
        roadType: edge.roadType,
        metadata: { ...edge.metadata },
      });
    }
    return cloned;
  }
}

export default RoadGraph;
