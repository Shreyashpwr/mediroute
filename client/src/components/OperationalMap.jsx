import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import api from '../services/api.js';
import socketService, { REALTIME_EVENTS } from '../services/socket.js';
import Button from './Button.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

// Fix Leaflet's default icon path issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper functions for custom high-contrast control-room DivIcons
const createAmbulanceIcon = (ambulance) => {
  const statusColors = {
    available: '#10b981', // green
    en_route: '#f59e0b', // amber
    at_scene: '#a855f7', // purple
    transporting: '#38bdf8', // blue
    offline: '#64748b', // grey
  };
  const color = statusColors[ambulance.status] || '#64748b';

  return L.divIcon({
    className: 'custom-leaflet-marker marker-ambulance',
    html: `
      <div class="map-marker-pin pin-ambulance" style="--marker-color: ${color}">
        <div class="marker-pulse" style="border-color: ${color}"></div>
        <div class="marker-bubble" style="background: #0f172a; border: 2px solid ${color}">
          <span class="marker-emoji">🚑</span>
        </div>
        <div class="marker-label-tag" style="border-left: 3px solid ${color}">${ambulance.ambulanceId}</div>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 46],
    popupAnchor: [0, -42],
  });
};

const createFacilityIcon = (facility) => {
  const statusColors = {
    normal: '#10b981',
    busy: '#f59e0b',
    critical: '#f97316',
    divert: '#ef4444',
  };
  const status = facility.emergencyCapacity?.status || 'normal';
  const color = statusColors[status] || '#10b981';

  return L.divIcon({
    className: 'custom-leaflet-marker marker-facility',
    html: `
      <div class="map-marker-pin pin-facility" style="--marker-color: ${color}">
        <div class="marker-bubble facility-bubble" style="background: #1e293b; border: 2px solid ${color}">
          <span class="marker-emoji">🏥</span>
        </div>
        <div class="marker-label-tag facility-tag">${facility.name?.split(' ')[0] || 'Hospital'}</div>
      </div>
    `,
    iconSize: [38, 48],
    iconAnchor: [19, 44],
    popupAnchor: [0, -40],
  });
};

const createIncidentIcon = (incident) => {
  const triageColors = {
    critical: '#ef4444',
    urgent: '#f59e0b',
    standard: '#06b6d4',
  };
  const color = triageColors[incident.triageLevel] || '#f59e0b';

  return L.divIcon({
    className: 'custom-leaflet-marker marker-incident',
    html: `
      <div class="map-marker-pin pin-incident" style="--marker-color: ${color}">
        <div class="incident-radar-ring" style="border-color: ${color}"></div>
        <div class="marker-bubble incident-bubble" style="background: #450a0a; border: 2px solid ${color}">
          <span class="marker-emoji">🚨</span>
        </div>
        <div class="marker-label-tag incident-tag" style="background: #7f1d1d; color: #fff">${incident.triageLevel?.toUpperCase()}</div>
      </div>
    `,
    iconSize: [42, 54],
    iconAnchor: [21, 48],
    popupAnchor: [0, -44],
  });
};

// --- ROUTE COMPARISON UTILITIES & METRIC FORMATTERS ---

// Normalizes coordinate representations to Leaflet [lat, lng] array
const toLatLngArray = (coords) => {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((c) => {
      if (!c) return null;
      if (Array.isArray(c) && c.length >= 2) {
        return [Number(c[0]), Number(c[1])];
      }
      const lat = Number(c.latitude ?? c.lat);
      const lng = Number(c.longitude ?? c.lng ?? c.lon);
      if (isNaN(lat) || isNaN(lng)) return null;
      return [lat, lng];
    })
    .filter(Boolean);
};

// Computes a slight perpendicular offset in lat/lng space for overlapping display
const offsetCoordinates = (coords, offsetMeters = 10) => {
  if (!coords || coords.length < 2) return coords || [];
  const latScale = 1 / 111111;
  const avgLat = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  const lngScale = 1 / (111111 * Math.cos((avgLat * Math.PI) / 180));

  return coords.map((pt, i) => {
    let dx = 0;
    let dy = 0;
    if (i < coords.length - 1) {
      dy += coords[i + 1][0] - pt[0];
      dx += (coords[i + 1][1] - pt[1]) * Math.cos((avgLat * Math.PI) / 180);
    }
    if (i > 0) {
      dy += pt[0] - coords[i - 1][0];
      dx += (pt[1] - coords[i - 1][1]) * Math.cos((avgLat * Math.PI) / 180);
    }
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return [pt[0], pt[1]];
    // Perpendicular normal: (-dy, dx)
    const normY = -dx / len;
    const normX = dy / len;
    return [
      Number((pt[0] + normY * offsetMeters * latScale).toFixed(6)),
      Number((pt[1] + normX * offsetMeters * lngScale).toFixed(6)),
    ];
  });
};

const areCoordinatesEqual = (c1, c2) => {
  if (!Array.isArray(c1) || !Array.isArray(c2)) return false;
  if (c1.length !== c2.length) return false;
  return c1.every((pt, i) => Math.abs(pt[0] - c2[i][0]) < 1e-5 && Math.abs(pt[1] - c2[i][1]) < 1e-5);
};

const formatComputationTime = (ms) => {
  if (typeof ms !== 'number' || isNaN(ms)) return 'N/A';
  if (ms <= 0) return '<1 ms';
  if (ms < 0.01) return '<0.01 ms';
  if (ms < 1) return `${ms.toFixed(2)} ms (<1 ms)`;
  return `${ms.toFixed(2)} ms`;
};

const formatDistance = (km) => {
  if (typeof km !== 'number' || isNaN(km)) return 'N/A';
  return `${km.toFixed(2)} km`;
};

const formatDuration = (mins) => {
  if (typeof mins !== 'number' || isNaN(mins)) return 'N/A';
  return `${mins.toFixed(2)} min`;
};

const formatNodes = (nodes) => {
  if (typeof nodes !== 'number' || isNaN(nodes)) return 'N/A';
  return `${nodes} ${nodes === 1 ? 'node' : 'nodes'}`;
};

const CORRIDOR_PRESETS = [
  { label: 'Shivajinagar → Kothrud (6.2 km)', origin: '18.5314, 73.8478', dest: '18.5074, 73.8087' },
  { label: 'Hinjawadi → Shivajinagar (16.3 km)', origin: '18.5913, 73.7380', dest: '18.5314, 73.8478' },
  { label: 'Baner → Sahyadri (8.4 km)', origin: '18.5590, 73.7925', dest: '18.5158, 73.8402' },
  { label: 'Swargate → Pimpri (18.1 km)', origin: '18.5018, 73.8567', dest: '18.6298, 73.7997' },
];

export const OperationalMap = ({
  height = '560px',
  onSelectIncident,
  onSelectFacility,
  onSelectAmbulance,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const comparisonLayerGroupRef = useRef(null);
  const tileLayerRef = useRef(null);

  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  // Socket Real-Time Status: 'connected' | 'reconnecting' | 'disconnected'
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [realtimeAlerts, setRealtimeAlerts] = useState([]);

  // Layer filter toggles
  const [showAmbulances, setShowAmbulances] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [darkTiles, setDarkTiles] = useState(true);

  // A* vs Dijkstra Side-by-Side Comparison Panel State
  const [showRouteComparison, setShowRouteComparison] = useState(false);
  const [comparingRoutes, setComparingRoutes] = useState(false);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [comparisonError, setComparisonError] = useState(null);
  const [selectedOrigin, setSelectedOrigin] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');

  const addRealtimeNotice = (message) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setRealtimeAlerts((prev) => [{ id, message, timestamp: new Date() }, ...prev.slice(0, 3)]);
    setTimeout(() => {
      setRealtimeAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 6000);
  };

  // Fetch operational map data from REST endpoint (for initial load and reconnect sync)
  const fetchMapData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await api.getOperationalMapData();
      if (res?.data) {
        setMapData(res.data);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.error('Failed to load operational map telemetry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Free keyless OpenStreetMap tile URL (no API key required)
  const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Default center on Pune regional operational sector
    const map = L.map(mapContainerRef.current, {
      center: [18.5314, 73.8478],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    const tileLayer = L.tileLayer(osmTileUrl, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    const comparisonLayer = L.layerGroup().addTo(map);
    comparisonLayerGroupRef.current = comparisonLayer;
    mapInstanceRef.current = map;

    const triggerInvalidate = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ debounceMoveEvents: true });
      }
    };

    requestAnimationFrame(triggerInvalidate);
    const timer1 = setTimeout(triggerInvalidate, 80);
    const timer2 = setTimeout(triggerInvalidate, 300);
    const timer3 = setTimeout(triggerInvalidate, 800);

    let resizeObserver = null;
    if (window.ResizeObserver && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        triggerInvalidate();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      triggerInvalidate();
    };
    window.addEventListener('resize', handleWindowResize);

    fetchMapData();

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener('resize', handleWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (comparisonLayerGroupRef.current) {
        comparisonLayerGroupRef.current.clearLayers();
        comparisonLayerGroupRef.current.remove();
        comparisonLayerGroupRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [fetchMapData]);

  // Handle tile theme toggle (Dark / Light mode)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.invalidateSize({ debounceMoveEvents: true });
  }, [darkTiles]);

  // Real-Time Socket.IO Subscriptions & Controlled Reconnect Fallback
  useEffect(() => {
    // 1. Connection status monitoring
    const unsubState = socketService.onStateChange((state) => {
      setSocketStatus(state);
    });

    // 2. Reconnect event triggers full synchronization to eliminate stale positions
    const unsubReconnect = socketService.onReconnect(() => {
      addRealtimeNotice('⚡ Real-time stream reconnected. Synchronizing operational state...');
      fetchMapData(true);
    });

    // 3. Ambulance location updates
    const unsubAmbLocation = socketService.subscribe(REALTIME_EVENTS.AMBULANCE_LOCATION, (payload) => {
      if (!payload?.ambulanceId || !payload.coordinates) return;
      setMapData((prev) => {
        if (!prev?.ambulances) return prev;
        const updatedAmbs = prev.ambulances.map((amb) => {
          if (String(amb._id) === String(payload.ambulanceId) || amb.ambulanceId === payload.ambulanceIdTag) {
            return {
              ...amb,
              coordinates: {
                longitude: payload.coordinates[0],
                latitude: payload.coordinates[1],
              },
              address: payload.address || amb.address,
              isSimulated: true,
            };
          }
          return amb;
        });
        return { ...prev, ambulances: updatedAmbs };
      });
      setLastRefreshedAt(new Date());
    });

    // 4. Ambulance status changes
    const unsubAmbStatus = socketService.subscribe(REALTIME_EVENTS.AMBULANCE_STATUS, (payload) => {
      if (!payload?.ambulanceId) return;
      setMapData((prev) => {
        if (!prev?.ambulances) return prev;
        const updatedAmbs = prev.ambulances.map((amb) => {
          if (String(amb._id) === String(payload.ambulanceId) || amb.ambulanceId === payload.ambulanceIdTag) {
            return {
              ...amb,
              status: payload.status,
              currentDispatch: payload.currentDispatchId || amb.currentDispatch,
              destinationFacility: payload.destinationFacilityId
                ? { _id: payload.destinationFacilityId, name: payload.destinationFacilityName || 'Hospital' }
                : amb.destinationFacility,
            };
          }
          return amb;
        });
        return { ...prev, ambulances: updatedAmbs };
      });
      setLastRefreshedAt(new Date());
    });

    // 5. Dispatch created
    const unsubDispatchCreated = socketService.subscribe(REALTIME_EVENTS.DISPATCH_CREATED, (payload) => {
      if (!payload?.dispatchId) return;
      setMapData((prev) => {
        if (!prev) return prev;
        const exists = prev.incidents?.some(
          (inc) => String(inc._id) === String(payload.dispatchId) || inc.dispatchNumber === payload.dispatchNumber
        );
        if (exists) return prev;
        const newIncident = {
          _id: payload.dispatchId,
          dispatchNumber: payload.dispatchNumber,
          triageLevel: payload.triageLevel,
          status: payload.status,
          patientName: payload.patientName,
          symptoms: payload.symptoms,
          pickupLocation: payload.pickupLocation,
          coordinates: payload.pickupLocation?.coordinates
            ? {
                longitude: payload.pickupLocation.coordinates[0],
                latitude: payload.pickupLocation.coordinates[1],
              }
            : null,
        };
        return {
          ...prev,
          incidents: [newIncident, ...(prev.incidents || [])],
          metrics: {
            ...prev.metrics,
            activeIncidents: (prev.metrics?.activeIncidents || 0) + 1,
          },
        };
      });
      addRealtimeNotice(`🚨 New Emergency: #${payload.dispatchNumber} (${payload.triageLevel?.toUpperCase()})`);
    });

    // 6. Dispatch assigned or status changes
    const unsubDispatchAssigned = socketService.subscribe(REALTIME_EVENTS.DISPATCH_ASSIGNED, (payload) => {
      setMapData((prev) => {
        if (!prev?.incidents) return prev;
        const updatedIncidents = prev.incidents.map((inc) => {
          if (String(inc._id) === String(payload.dispatchId) || inc.dispatchNumber === payload.dispatchNumber) {
            return {
              ...inc,
              status: payload.status,
              assignedAmbulance: payload.assignedAmbulanceId
                ? {
                    _id: payload.assignedAmbulanceId,
                    ambulanceId: payload.assignedAmbulanceTag,
                  }
                : inc.assignedAmbulance,
              destinationFacility: payload.destinationFacilityId
                ? {
                    _id: payload.destinationFacilityId,
                    name: payload.destinationFacilityName,
                  }
                : inc.destinationFacility,
            };
          }
          return inc;
        });
        return { ...prev, incidents: updatedIncidents };
      });
      addRealtimeNotice(`🚑 #${payload.dispatchNumber} assigned to ${payload.assignedAmbulanceTag || 'Ambulance'}`);
    });

    const unsubDispatchStatus = socketService.subscribe(REALTIME_EVENTS.DISPATCH_STATUS, (payload) => {
      setMapData((prev) => {
        if (!prev?.incidents) return prev;
        const updatedIncidents = prev.incidents.map((inc) => {
          if (String(inc._id) === String(payload.dispatchId) || inc.dispatchNumber === payload.dispatchNumber) {
            return { ...inc, status: payload.status };
          }
          return inc;
        });
        return { ...prev, incidents: updatedIncidents };
      });
    });

    // 7. Hospital Pre-Alert
    const unsubPreAlert = socketService.subscribe(REALTIME_EVENTS.HOSPITAL_PRE_ALERT, (payload) => {
      addRealtimeNotice(
        `🏥 Pre-Alert: Incoming dispatch #${payload.dispatchNumber} (${payload.triageLevel?.toUpperCase()}) to ${payload.facilityName} (~${payload.estimatedEtaMinutes} min)`
      );
    });

    // 8. Facility Capacity Updates
    const unsubFacilityCap = socketService.subscribe(REALTIME_EVENTS.FACILITY_CAPACITY, (payload) => {
      setMapData((prev) => {
        if (!prev?.facilities) return prev;
        const updatedFacilities = prev.facilities.map((fac) => {
          if (String(fac._id) === String(payload.facilityId)) {
            return {
              ...fac,
              emergencyCapacity: payload.emergencyCapacity,
            };
          }
          return fac;
        });
        return { ...prev, facilities: updatedFacilities };
      });
    });

    // 9. Simulated Road Network Alerts
    const unsubRoadClosed = socketService.subscribe(REALTIME_EVENTS.NETWORK_ROAD_CLOSED, (payload) => {
      addRealtimeNotice(`🚧 Road Closure Alert: ${payload.roadName || payload.edgeId} is closed`);
      setComparisonResults((prev) => (prev ? { ...prev, isStale: true } : null));
    });

    const unsubRoadReopened = socketService.subscribe(REALTIME_EVENTS.NETWORK_ROAD_REOPENED, (payload) => {
      addRealtimeNotice(`🟢 Road Reopened: ${payload.roadName || payload.edgeId} open`);
      setComparisonResults((prev) => (prev ? { ...prev, isStale: true } : null));
    });

    const unsubCongestion = socketService.subscribe(REALTIME_EVENTS.NETWORK_CONGESTION, (payload) => {
      addRealtimeNotice(`⚠️ Congestion: ${payload.roadName || payload.edgeId} congestion x${payload.congestionMultiplier}`);
      setComparisonResults((prev) => (prev ? { ...prev, isStale: true } : null));
    });

    return () => {
      unsubState();
      unsubReconnect();
      unsubAmbLocation();
      unsubAmbStatus();
      unsubDispatchCreated();
      unsubDispatchAssigned();
      unsubDispatchStatus();
      unsubPreAlert();
      unsubFacilityCap();
      unsubRoadClosed();
      unsubRoadReopened();
      unsubCongestion();
    };
  }, [fetchMapData]);

  // Controlled Fallback Polling: ONLY active when disconnected from live socket stream
  useEffect(() => {
    if (!autoRefresh) return;
    // When real-time stream is active, do not poll periodically
    if (socketStatus === 'connected') return;

    const interval = setInterval(() => {
      fetchMapData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, socketStatus, fetchMapData]);

  // Render markers whenever mapData or layer toggles update
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !mapData) return;

    const layer = markersLayerRef.current;
    layer.clearLayers();

    const bounds = L.latLngBounds();
    let hasCoords = false;

    // 1. Ambulances
    if (showAmbulances && mapData.ambulances) {
      mapData.ambulances.forEach((amb) => {
        if (!amb.coordinates?.latitude || !amb.coordinates?.longitude) return;
        const latLng = [amb.coordinates.latitude, amb.coordinates.longitude];
        bounds.extend(latLng);
        hasCoords = true;

        const marker = L.marker(latLng, { icon: createAmbulanceIcon(amb) });

        const popupHtml = `
          <div class="map-popup-card">
            <div class="popup-header">
              <span class="popup-title">🚑 ${amb.ambulanceId}</span>
              <span class="badge-status badge-status-${amb.status}">${amb.status?.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div class="popup-body">
              <div class="popup-row">
                <span class="popup-k">Type:</span>
                <span class="popup-v">${amb.vehicleType?.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Sector:</span>
                <span class="popup-v">${amb.address || 'En route / Transit'}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Telemetry Feed:</span>
                <span class="popup-v" style="color: #f59e0b; font-weight: 600;">Simulated GPS Stream</span>
              </div>
              ${
                amb.destinationFacility
                  ? `
                <div class="popup-row">
                  <span class="popup-k">Dest Hospital:</span>
                  <span class="popup-v">${amb.destinationFacility.name}</span>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, { maxWidth: 300, className: 'dark-leaflet-popup' });
        marker.addTo(layer);
      });
    }

    // 2. Facilities (Hospitals)
    if (showFacilities && mapData.facilities) {
      mapData.facilities.forEach((fac) => {
        if (!fac.coordinates?.latitude || !fac.coordinates?.longitude) return;
        const latLng = [fac.coordinates.latitude, fac.coordinates.longitude];
        bounds.extend(latLng);
        hasCoords = true;

        const marker = L.marker(latLng, { icon: createFacilityIcon(fac) });
        const cap = fac.emergencyCapacity || {};

        const popupHtml = `
          <div class="map-popup-card">
            <div class="popup-header popup-facility-header">
              <span class="popup-title">🏥 ${fac.name}</span>
              <span class="badge-cap-status cap-${cap.status || 'normal'}">${(cap.status || 'normal').toUpperCase()}</span>
            </div>
            <div class="popup-body">
              <div class="popup-row">
                <span class="popup-k">Address:</span>
                <span class="popup-v">${fac.address || 'Pune'}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Available Beds:</span>
                <span class="popup-v" style="color: #10b981; font-weight: 700;">${cap.availableBeds ?? 0} / ${cap.totalBeds ?? 50}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">ICU Capacity:</span>
                <span class="popup-v" style="color: #38bdf8; font-weight: 700;">${cap.icuAvailable ?? 0}</span>
              </div>
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, { maxWidth: 300, className: 'dark-leaflet-popup' });
        marker.addTo(layer);
      });
    }

    // 3. Active Emergency Incidents
    if (showIncidents && mapData.incidents) {
      mapData.incidents.forEach((inc) => {
        if (!inc.coordinates?.latitude || !inc.coordinates?.longitude) return;
        const latLng = [inc.coordinates.latitude, inc.coordinates.longitude];
        bounds.extend(latLng);
        hasCoords = true;

        const marker = L.marker(latLng, { icon: createIncidentIcon(inc) });
        const symptomsList = Array.isArray(inc.symptoms) ? inc.symptoms.join(', ') : inc.symptoms || 'Distress';

        const popupHtml = `
          <div class="map-popup-card">
            <div class="popup-header popup-incident-header">
              <span class="popup-title">🚨 ${inc.dispatchNumber}</span>
              <span class="triage-tag triage-${inc.triageLevel}">${inc.triageLevel?.toUpperCase()}</span>
            </div>
            <div class="popup-body">
              <div class="popup-row">
                <span class="popup-k">Patient:</span>
                <span class="popup-v">${inc.patientName}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Incident Scene:</span>
                <span class="popup-v">${inc.pickupLocation?.address || 'Reported Location'}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Presenting:</span>
                <span class="popup-v">${symptomsList}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Lifecycle Status:</span>
                <span class="popup-v">${inc.status?.replace('_', ' ').toUpperCase()}</span>
              </div>
              ${
                inc.destinationFacility
                  ? `
                <div class="popup-row">
                  <span class="popup-k">Destination:</span>
                  <span class="popup-v">${inc.destinationFacility.name}</span>
                </div>
              `
                  : ''
              }
              ${
                inc.assignedAmbulance
                  ? `
                <div class="popup-row">
                  <span class="popup-k">Allocated:</span>
                  <span class="popup-v">🚑 ${inc.assignedAmbulance.ambulanceId}</span>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, { maxWidth: 320, className: 'dark-leaflet-popup' });
        marker.addTo(layer);
      });
    }
  }, [mapData, showAmbulances, showFacilities, showIncidents]);

  const fitAllUnits = () => {
    if (!mapInstanceRef.current || !mapData) return;
    mapInstanceRef.current.invalidateSize({ debounceMoveEvents: true });
    const bounds = L.latLngBounds();
    let hasCoords = false;

    if (showAmbulances && mapData.ambulances) {
      mapData.ambulances.forEach((a) => {
        if (a.coordinates?.latitude) {
          bounds.extend([a.coordinates.latitude, a.coordinates.longitude]);
          hasCoords = true;
        }
      });
    }
    if (showFacilities && mapData.facilities) {
      mapData.facilities.forEach((f) => {
        if (f.coordinates?.latitude) {
          bounds.extend([f.coordinates.latitude, f.coordinates.longitude]);
          hasCoords = true;
        }
      });
    }
    if (showIncidents && mapData.incidents) {
      mapData.incidents.forEach((i) => {
        if (i.coordinates?.latitude) {
          bounds.extend([i.coordinates.latitude, i.coordinates.longitude]);
          hasCoords = true;
        }
      });
    }

    if (hasCoords) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  };

  // Run Side-by-Side A* vs Dijkstra Benchmark Route Comparison
  const runRouteComparison = async () => {
    if (!selectedOrigin || !selectedDestination) {
      setComparisonError('Please select both Origin and Destination coordinates.');
      return;
    }

    setComparingRoutes(true);
    setComparisonError(null);

    // Clear previous comparison polylines
    if (comparisonLayerGroupRef.current) {
      comparisonLayerGroupRef.current.clearLayers();
    }

    try {
      const originParts = selectedOrigin.split(',').map((s) => Number(s.trim()));
      const destParts = selectedDestination.split(',').map((s) => Number(s.trim()));

      if (originParts.length < 2 || isNaN(originParts[0]) || isNaN(originParts[1])) {
        throw new Error('Origin coordinates must be in "latitude, longitude" format (e.g. 18.5314, 73.8478)');
      }
      if (destParts.length < 2 || isNaN(destParts[0]) || isNaN(destParts[1])) {
        throw new Error('Destination coordinates must be in "latitude, longitude" format (e.g. 18.5074, 73.8087)');
      }

      const origin = { latitude: originParts[0], longitude: originParts[1] };
      const destination = { latitude: destParts[0], longitude: destParts[1] };

      // Request unified comparison running on identical graph snapshot
      const t0 = performance.now();
      const res = await api.planRoute({ origin, destination, compare: true });
      const clientDuration = Math.round((performance.now() - t0) * 100) / 100;

      const resData = res?.data || res;
      const comparison = resData?.comparison || {};
      const aStarData = comparison?.aStar || resData;
      const dijkstraData = comparison?.dijkstra || resData;
      const pathsAreIdentical = Boolean(comparison?.pathsAreIdentical);

      setComparisonResults({
        aStar: {
          ...aStarData,
          clientMeasuredMs: clientDuration,
        },
        dijkstra: {
          ...dijkstraData,
          clientMeasuredMs: clientDuration,
        },
        pathsAreIdentical,
        isStale: false,
      });

      // Render polylines on Leaflet map
      if (mapInstanceRef.current && comparisonLayerGroupRef.current) {
        comparisonLayerGroupRef.current.clearLayers();
        const bounds = L.latLngBounds();

        const dijkstraRawCoords = toLatLngArray(dijkstraData?.coordinates || dijkstraData?.waypoints);
        const aStarCoords = toLatLngArray(aStarData?.coordinates || aStarData?.waypoints);

        const areIdentical = pathsAreIdentical || areCoordinatesEqual(aStarCoords, dijkstraRawCoords);

        // Dijkstra Polyline (amber dashed)
        if (dijkstraData?.success && dijkstraRawCoords.length > 1) {
          // If paths overlap, apply visual offset so both lines remain clearly visible
          const dijkstraDisplayCoords = areIdentical
            ? offsetCoordinates(dijkstraRawCoords, 10)
            : dijkstraRawCoords;

          const dijkstraLine = L.polyline(dijkstraDisplayCoords, {
            color: '#f59e0b',
            weight: 5,
            opacity: 0.9,
            dashArray: '8, 8',
          }).addTo(comparisonLayerGroupRef.current);

          const tooltipText = areIdentical
            ? 'Dijkstra Baseline Route (Uniform Cost) [Visual Offset Applied]'
            : 'Dijkstra Baseline Route (Uniform Cost)';
          dijkstraLine.bindTooltip(tooltipText, { sticky: true });
          dijkstraDisplayCoords.forEach((pt) => bounds.extend(pt));
        }

        // A* Polyline (cyan solid)
        if (aStarData?.success && aStarCoords.length > 1) {
          const aStarLine = L.polyline(aStarCoords, {
            color: '#00e5ff',
            weight: 4,
            opacity: 0.95,
          }).addTo(comparisonLayerGroupRef.current);
          aStarLine.bindTooltip('A* Guided Heuristic Route (Optimal)', { sticky: true });
          aStarCoords.forEach((pt) => bounds.extend(pt));
        }

        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
        }
      }
    } catch (err) {
      setComparisonError(err.message || 'Failed to compute route comparison');
    } finally {
      setComparingRoutes(false);
    }
  };

  const clearRouteComparison = () => {
    if (comparisonLayerGroupRef.current) {
      comparisonLayerGroupRef.current.clearLayers();
    }
    setComparisonResults(null);
    setComparisonError(null);
    setShowRouteComparison(false);
  };

  const metrics = mapData?.metrics || {};

  return (
    <div className="operational-map-wrapper">
      {/* Live Stream Status & Real-Time Alerts Ribbon */}
      <div className="map-realtime-ribbon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#090d16', borderBottom: '1px solid #1e293b', fontSize: '13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {socketStatus === 'connected' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
              Live Real-Time Stream (Connected)
            </span>
          ) : socketStatus === 'reconnecting' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></span>
              Reconnecting Stream… (Hold live updates)
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
              Disconnected (Controlled Sync Fallback)
            </span>
          )}

          <span style={{ color: '#64748b', fontSize: '12px' }}>
            | Last Telemetry: {lastRefreshedAt.toLocaleTimeString()} {socketStatus !== 'connected' && '(Stale)'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ background: '#1e293b', color: '#cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', border: '1px solid #334155' }}>
            ⚠️ SIMULATED TELEMETRY: Fleet GPS & congestion values are demo events, not live municipal feeds
          </span>
        </div>
      </div>

      {/* Real-time Alerts Banner (Toast/Ticker) */}
      {realtimeAlerts.length > 0 && (
        <div className="realtime-alerts-banner" style={{ background: '#172554', borderBottom: '1px solid #1d4ed8', padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {realtimeAlerts.map((alert) => (
            <div key={alert.id} style={{ color: '#93c5fd', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚡</span>
              <span>{alert.message}</span>
              <span style={{ marginLeft: 'auto', color: '#60a5fa', fontSize: '11px' }}>
                {alert.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Map Header Controls Toolbar */}
      <div className="map-toolbar">
        <div className="map-toolbar-left">
          <div className="map-layer-toggles">
            <label className={`layer-toggle-chip chip-ambulances ${showAmbulances ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={showAmbulances}
                onChange={(e) => setShowAmbulances(e.target.checked)}
              />
              <span>🚑 Ambulances ({metrics.totalAmbulances ?? '…'})</span>
            </label>

            <label className={`layer-toggle-chip chip-facilities ${showFacilities ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={showFacilities}
                onChange={(e) => setShowFacilities(e.target.checked)}
              />
              <span>🏥 Hospitals ({metrics.totalFacilities ?? '…'})</span>
            </label>

            <label className={`layer-toggle-chip chip-incidents ${showIncidents ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={showIncidents}
                onChange={(e) => setShowIncidents(e.target.checked)}
              />
              <span>🚨 Incidents ({metrics.activeIncidents ?? '…'})</span>
            </label>
          </div>
        </div>

        <div className="map-toolbar-right">
          <button
            type="button"
            className={`map-tool-btn ${showRouteComparison ? 'active-pulse' : ''}`}
            onClick={() => {
              const nextShow = !showRouteComparison;
              setShowRouteComparison(nextShow);
              if (nextShow && (!selectedOrigin || !selectedDestination)) {
                if (mapData?.ambulances?.[0]?.coordinates && mapData?.facilities?.[0]?.coordinates) {
                  const amb = mapData.ambulances[0].coordinates;
                  const fac = mapData.facilities[0].coordinates;
                  setSelectedOrigin(`${amb.latitude}, ${amb.longitude}`);
                  setSelectedDestination(`${fac.latitude}, ${fac.longitude}`);
                } else {
                  setSelectedOrigin('18.5314, 73.8478');
                  setSelectedDestination('18.5074, 73.8087');
                }
              }
            }}
            title="Open side-by-side A* vs Dijkstra routing comparison"
            style={{ background: showRouteComparison ? '#0284c7' : '#1e293b', color: '#fff' }}
          >
            🧭 Route Comparison (A* vs Dijkstra)
          </button>

          <button
            type="button"
            className={`map-tool-btn map-theme-btn ${darkTiles ? 'active-dark' : 'active-light'}`}
            onClick={() => setDarkTiles(!darkTiles)}
            title="Toggle between Dark Operations Grid and Light Map"
            aria-label="Dark Map / Light Map toggle"
          >
            {darkTiles ? '🌙 Dark Map' : '☀️ Light Map'}
          </button>

          <button
            type="button"
            className="map-tool-btn btn-fit-units"
            onClick={fitAllUnits}
            title="Fit all operational units into view"
          >
            ⤢ Fit Units
          </button>

          <button
            type="button"
            className={`map-tool-btn btn-sync ${autoRefresh && socketStatus === 'connected' ? 'active-pulse' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={socketStatus === 'connected' ? 'Real-Time Stream Active' : 'Toggle Controlled Sync Polling'}
          >
            {socketStatus === 'connected' ? '⚡ Real-Time Stream' : autoRefresh ? '🔄 Sync Fallback' : '⏸ Paused'}
          </button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchMapData()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : '🔄 Refresh'}
          </Button>
        </div>
      </div>

      {/* Side-by-Side Route Comparison Modal / Dock */}
      {showRouteComparison && (
        <div className="route-comparison-dock" style={{ background: '#0b1329', borderBottom: '1px solid #1e3a8a', padding: '14px', color: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#38bdf8', fontWeight: 600 }}>
                🧭 Deterministic Routing Benchmark: A* Search vs. Dijkstra's Algorithm
              </h4>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Side-by-side computation analysis on Pune Regional Road Network graph.
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="sm" variant="secondary" onClick={clearRouteComparison}>
                Close Panel
              </Button>
            </div>
          </div>

          {/* Quick Preset Corridors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Quick Test Corridors:</span>
            {CORRIDOR_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSelectedOrigin(preset.origin);
                  setSelectedDestination(preset.dest);
                  setComparisonResults((prev) => (prev ? { ...prev, isStale: true } : null));
                  setComparisonError(null);
                }}
                style={{
                  background: '#1e293b',
                  color: '#93c5fd',
                  border: '1px solid #334155',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                Origin (Lat, Lng):
              </label>
              <input
                type="text"
                value={selectedOrigin}
                onChange={(e) => {
                  setSelectedOrigin(e.target.value);
                  setComparisonResults((prev) => (prev ? { ...prev, isStale: true } : null));
                }}
                placeholder="e.g. 18.5314, 73.8478"
                style={{ width: '100%', padding: '6px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                Destination (Lat, Lng):
              </label>
              <input
                type="text"
                value={selectedDestination}
                onChange={(e) => {
                  setSelectedDestination(e.target.value);
                  setComparisonResults((prev) => (prev ? { ...prev, isStale: true } : null));
                }}
                placeholder="e.g. 18.5074, 73.8087"
                style={{ width: '100%', padding: '6px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff', fontSize: '13px' }}
              />
            </div>
            <div>
              <Button
                variant="primary"
                size="sm"
                onClick={runRouteComparison}
                disabled={comparingRoutes}
              >
                {comparingRoutes ? 'Computing...' : '⚡ Compare Algorithms'}
              </Button>
            </div>
          </div>

          {comparisonError && (
            <div style={{ color: '#f87171', background: '#450a0a', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
              ⚠️ {comparisonError}
            </div>
          )}

          {comparisonResults && (
            <div>
              {comparisonResults.isStale && (
                <div style={{ background: '#451a03', border: '1px solid #b45309', padding: '6px 12px', borderRadius: '4px', color: '#fde68a', fontSize: '12px', marginBottom: '10px' }}>
                  ⚠️ Graph conditions or input coordinates have changed since calculation. Click <strong>Compare Algorithms</strong> to refresh metrics.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* A* Panel */}
                <div style={{ background: '#0f172a', border: '1px solid #0284c7', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '8px', marginBottom: '8px' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '14px' }}>
                      A* Search (Guided Heuristic)
                    </span>
                    <span style={{ background: comparisonResults.aStar.success ? '#0369a1' : '#7f1d1d', color: '#fff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                      {comparisonResults.aStar.success ? 'OPTIMAL' : 'FAILED'}
                    </span>
                  </div>

                  {!comparisonResults.aStar.success ? (
                    <div style={{ color: '#f87171', background: '#450a0a', padding: '8px 10px', borderRadius: '4px', fontSize: '12px' }}>
                      ⚠️ Route Unreachable: {comparisonResults.aStar.failureReason || comparisonResults.aStar.error || 'No connected path could be found.'}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Server Calc Time</span>
                          <strong style={{ color: '#38bdf8' }}>
                            {formatComputationTime(comparisonResults.aStar.computationTimeMs)}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Total Distance</span>
                          <strong>
                            {formatDistance(comparisonResults.aStar.totalDistanceKm ?? comparisonResults.aStar.distanceKm)}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Est. Travel Time</span>
                          <strong style={{ color: '#10b981' }}>
                            {formatDuration(comparisonResults.aStar.estimatedTravelTimeMinutes ?? comparisonResults.aStar.estimatedDurationMinutes)}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Nodes Explored</span>
                          <strong style={{ color: '#a855f7' }}>
                            {formatNodes(comparisonResults.aStar.nodesExplored ?? comparisonResults.aStar.expandedNodeCount)}
                          </strong>
                        </div>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                        Map Visual: Solid Cyan Line (#00e5ff) {comparisonResults.aStar.isGraphRouted ? '• Pune Regional Graph' : '• Standard Corridor Fallback'}
                      </div>
                    </>
                  )}
                </div>

                {/* Dijkstra Panel */}
                <div style={{ background: '#0f172a', border: '1px solid #b45309', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '8px', marginBottom: '8px' }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '14px' }}>
                      Dijkstra's Algorithm (Uniform Cost)
                    </span>
                    <span style={{ background: comparisonResults.dijkstra.success ? '#78350f' : '#7f1d1d', color: '#fef3c7', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                      {comparisonResults.dijkstra.success ? 'BASELINE' : 'FAILED'}
                    </span>
                  </div>

                  {!comparisonResults.dijkstra.success ? (
                    <div style={{ color: '#f87171', background: '#450a0a', padding: '8px 10px', borderRadius: '4px', fontSize: '12px' }}>
                      ⚠️ Route Unreachable: {comparisonResults.dijkstra.failureReason || comparisonResults.dijkstra.error || 'No connected path could be found.'}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Server Calc Time</span>
                          <strong style={{ color: '#fbbf24' }}>
                            {formatComputationTime(comparisonResults.dijkstra.computationTimeMs)}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Total Distance</span>
                          <strong>
                            {formatDistance(comparisonResults.dijkstra.totalDistanceKm ?? comparisonResults.dijkstra.distanceKm)}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Est. Travel Time</span>
                          <strong style={{ color: '#10b981' }}>
                            {formatDuration(comparisonResults.dijkstra.estimatedTravelTimeMinutes ?? comparisonResults.dijkstra.estimatedDurationMinutes)}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Nodes Explored</span>
                          <strong style={{ color: '#a855f7' }}>
                            {formatNodes(comparisonResults.dijkstra.nodesExplored ?? comparisonResults.dijkstra.expandedNodeCount)}
                          </strong>
                        </div>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                        Map Visual: Dashed Amber Line (#f59e0b) {comparisonResults.dijkstra.isGraphRouted ? '• Pune Regional Graph' : '• Standard Corridor Fallback'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {comparisonResults.pathsAreIdentical && comparisonResults.aStar.success && comparisonResults.dijkstra.success && (
                <div style={{ marginTop: '12px', padding: '8px 12px', background: '#172554', border: '1px solid #1d4ed8', borderRadius: '4px', fontSize: '12px', color: '#bfdbfe' }}>
                  ℹ️ <strong>Identical Path:</strong> Both algorithms converged on the identical optimal road corridor. The dashed amber Dijkstra route is drawn with a subtle parallel offset (~10m) so both lines remain clearly visible simultaneously.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Leaflet Map Display */}
      <div className={`map-viewport-container ${darkTiles ? 'dark-tiles-mode' : 'light-tiles-mode'}`} style={{ height }}>
        <div ref={mapContainerRef} className="leaflet-map-canvas" style={{ width: '100%', height: '100%' }} />

        {loading && !mapData && (
          <div className="map-loading-overlay">
            <LoadingSpinner message="Acquiring regional emergency telemetry..." size="lg" />
          </div>
        )}

        {/* Tactical Legend Strip */}
        <div className="map-tactical-legend">
          <div className="legend-item">
            <span className="legend-dot dot-available"></span> Available Ambulance
          </div>
          <div className="legend-item">
            <span className="legend-dot dot-enroute"></span> En Route / In Transit
          </div>
          <div className="legend-item">
            <span className="legend-dot dot-hospital"></span> Hospital Intake
          </div>
          <div className="legend-item">
            <span className="legend-dot dot-critical"></span> Critical Incident
          </div>
          <div className="legend-item text-muted">
            Telemetry Stream: {socketStatus === 'connected' ? 'Live WebSocket' : 'Controlled Sync'}
          </div>
        </div>
      </div>

      {/* Sandbox Notice Required by Prompt */}
      <div className="map-telemetry-notice">
        <span>ℹ️ Operational Map Engine: OpenStreetMap Tiles / Leaflet. Telemetry utilizes stored regional Indian coordinates & simulated status updates.</span>
      </div>
    </div>
  );
};

export default OperationalMap;
