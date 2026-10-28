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

export const OperationalMap = ({
  height = '560px',
  onSelectIncident,
  onSelectFacility,
  onSelectAmbulance,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routeLayersRef = useRef([]);
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
    });

    const unsubRoadReopened = socketService.subscribe(REALTIME_EVENTS.NETWORK_ROAD_REOPENED, (payload) => {
      addRealtimeNotice(`🟢 Road Reopened: ${payload.roadName || payload.edgeId} open`);
    });

    const unsubCongestion = socketService.subscribe(REALTIME_EVENTS.NETWORK_CONGESTION, (payload) => {
      addRealtimeNotice(`⚠️ Congestion: ${payload.roadName || payload.edgeId} congestion x${payload.congestionMultiplier}`);
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
    if (mapInstanceRef.current && routeLayersRef.current) {
      routeLayersRef.current.forEach((layer) => mapInstanceRef.current.removeLayer(layer));
      routeLayersRef.current = [];
    }

    try {
      const originParts = selectedOrigin.split(',').map((s) => Number(s.trim()));
      const destParts = selectedDestination.split(',').map((s) => Number(s.trim()));

      const origin = { latitude: originParts[0], longitude: originParts[1] };
      const destination = { latitude: destParts[0], longitude: destParts[1] };

      // Request A* route
      const t0A = performance.now();
      const resA = await api.planRoute({ origin, destination, algorithm: 'a_star' });
      const t1A = performance.now();
      const clientDurationA = Math.round((t1A - t0A) * 100) / 100;

      // Request Dijkstra route
      const t0D = performance.now();
      const resD = await api.planRoute({ origin, destination, algorithm: 'dijkstra' });
      const t1D = performance.now();
      const clientDurationD = Math.round((t1D - t0D) * 100) / 100;

      const aStarData = resA?.data || resA;
      const dijkstraData = resD?.data || resD;

      setComparisonResults({
        aStar: {
          ...aStarData,
          clientMeasuredMs: clientDurationA,
        },
        dijkstra: {
          ...dijkstraData,
          clientMeasuredMs: clientDurationD,
        },
      });

      // Render polylines on Leaflet map
      if (mapInstanceRef.current) {
        const bounds = L.latLngBounds();

        // Dijkstra Polyline (amber dashed)
        if (dijkstraData?.waypoints && dijkstraData.waypoints.length > 1) {
          const dijkstraCoords = dijkstraData.waypoints.map((w) => [w.latitude, w.longitude]);
          const dijkstraLine = L.polyline(dijkstraCoords, {
            color: '#f59e0b',
            weight: 5,
            opacity: 0.85,
            dashArray: '6, 8',
          }).addTo(mapInstanceRef.current);
          dijkstraLine.bindTooltip('Dijkstra Baseline Route (Uniform Cost)', { sticky: true });
          routeLayersRef.current.push(dijkstraLine);
          dijkstraCoords.forEach((pt) => bounds.extend(pt));
        }

        // A* Polyline (cyan solid)
        if (aStarData?.waypoints && aStarData.waypoints.length > 1) {
          const aStarCoords = aStarData.waypoints.map((w) => [w.latitude, w.longitude]);
          const aStarLine = L.polyline(aStarCoords, {
            color: '#00e5ff',
            weight: 4,
            opacity: 0.95,
          }).addTo(mapInstanceRef.current);
          aStarLine.bindTooltip('A* Guided Heuristic Route (Optimal)', { sticky: true });
          routeLayersRef.current.push(aStarLine);
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
    if (mapInstanceRef.current && routeLayersRef.current) {
      routeLayersRef.current.forEach((layer) => mapInstanceRef.current.removeLayer(layer));
      routeLayersRef.current = [];
    }
    setComparisonResults(null);
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
              setShowRouteComparison(!showRouteComparison);
              if (!selectedOrigin && mapData?.ambulances?.[0]?.coordinates) {
                const amb = mapData.ambulances[0].coordinates;
                setSelectedOrigin(`${amb.latitude}, ${amb.longitude}`);
              }
              if (!selectedDestination && mapData?.facilities?.[0]?.coordinates) {
                const fac = mapData.facilities[0].coordinates;
                setSelectedDestination(`${fac.latitude}, ${fac.longitude}`);
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                Origin (Lat, Lng):
              </label>
              <input
                type="text"
                value={selectedOrigin}
                onChange={(e) => setSelectedOrigin(e.target.value)}
                placeholder="e.g. 18.5204, 73.8567"
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
                onChange={(e) => setSelectedDestination(e.target.value)}
                placeholder="e.g. 18.5314, 73.8446"
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* A* Panel */}
              <div style={{ background: '#0f172a', border: '1px solid #0284c7', borderRadius: '6px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '8px', marginBottom: '8px' }}>
                  <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '14px' }}>A* Search (Guided Heuristic)</span>
                  <span style={{ background: '#0369a1', color: '#fff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>OPTIMAL</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Server Calc Time</span>
                    <strong style={{ color: '#38bdf8' }}>{comparisonResults.aStar.computationTimeMs ?? 0} ms</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Total Distance</span>
                    <strong>{comparisonResults.aStar.distanceKm} km</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Est. Travel Time</span>
                    <strong style={{ color: '#10b981' }}>{comparisonResults.aStar.estimatedDurationMinutes} min</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Nodes Explored</span>
                    <strong style={{ color: '#a855f7' }}>{comparisonResults.aStar.nodesExplored ?? 0} nodes</strong>
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                  Map Visual: Solid Cyan Line (#00e5ff)
                </div>
              </div>

              {/* Dijkstra Panel */}
              <div style={{ background: '#0f172a', border: '1px solid #b45309', borderRadius: '6px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '8px', marginBottom: '8px' }}>
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '14px' }}>Dijkstra's Algorithm (Uniform Cost)</span>
                  <span style={{ background: '#78350f', color: '#fef3c7', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>BASELINE</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Server Calc Time</span>
                    <strong style={{ color: '#fbbf24' }}>{comparisonResults.dijkstra.computationTimeMs ?? 0} ms</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Total Distance</span>
                    <strong>{comparisonResults.dijkstra.distanceKm} km</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Est. Travel Time</span>
                    <strong style={{ color: '#10b981' }}>{comparisonResults.dijkstra.estimatedDurationMinutes} min</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Nodes Explored</span>
                    <strong style={{ color: '#a855f7' }}>{comparisonResults.dijkstra.nodesExplored ?? 0} nodes</strong>
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                  Map Visual: Dashed Amber Line (#f59e0b)
                </div>
              </div>
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
