import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import api from '../services/api.js';
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
  const tileLayerRef = useRef(null);

  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  // Layer filter toggles
  const [showAmbulances, setShowAmbulances] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [darkTiles, setDarkTiles] = useState(true);

  // Fetch operational map data from real backend MongoDB API
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
    if (mapInstanceRef.current) return; // Prevent duplicate instantiation

    // Default center on Pune / Maharashtra regional operational sector
    const map = L.map(mapContainerRef.current, {
      center: [18.5314, 73.8478],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    // Keyless OpenStreetMap tile layer
    const tileLayer = L.tileLayer(osmTileUrl, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    // Layer group for all dynamic operational markers
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    // Multi-stage invalidation to eliminate black rectangular unrendered tile areas
    const triggerInvalidate = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ debounceMoveEvents: true });
      }
    };

    // Staged triggers for initial DOM mount, CSS layout reflow, and card expansion
    requestAnimationFrame(triggerInvalidate);
    const timer1 = setTimeout(triggerInvalidate, 80);
    const timer2 = setTimeout(triggerInvalidate, 300);
    const timer3 = setTimeout(triggerInvalidate, 800);

    // Responsive container sizing: ResizeObserver to detect parent or card dimension changes
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

  // Auto-refresh polling every 12 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMapData(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMapData]);

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
                <span class="popup-k">Assigned Unit:</span>
                <span class="popup-v">${amb.driverName || 'Standby Crew'}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Fuel:</span>
                <span class="popup-v ${amb.fuelLevel < 50 ? 'text-warning' : 'text-success'}">${amb.fuelLevel}%</span>
              </div>
              ${
                amb.currentDispatch
                  ? `
                <div class="popup-dispatch-alert">
                  <strong>Active Dispatch:</strong> ${amb.currentDispatch.dispatchNumber} (${amb.currentDispatch.patientName})
                  <div class="triage-tag triage-${amb.currentDispatch.triageLevel}">Triage: ${amb.currentDispatch.triageLevel?.toUpperCase()}</div>
                </div>
              `
                  : ''
              }
              ${
                amb.destinationFacility
                  ? `
                <div class="popup-row">
                  <span class="popup-k">Hospital:</span>
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

    // 2. Healthcare Facilities
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
            <div class="popup-header">
              <span class="popup-title">🏥 ${fac.name}</span>
              <span class="badge-status badge-status-${cap.status || 'normal'}">${(cap.status || 'NORMAL').toUpperCase()}</span>
            </div>
            <div class="popup-body">
              <div class="popup-row">
                <span class="popup-k">Facility Type:</span>
                <span class="popup-v">${fac.facilityType?.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div class="popup-row">
                <span class="popup-k">Address:</span>
                <span class="popup-v">${fac.address?.street ? `${fac.address.street}, ${fac.address.city}` : 'Pune Regional'}</span>
              </div>
              <div class="popup-capacity-grid">
                <div class="cap-box">
                  <span class="cap-num ${cap.availableBeds > 0 ? 'text-success' : 'text-danger'}">${cap.availableBeds || 0}</span>
                  <span class="cap-lbl">Avail Beds</span>
                </div>
                <div class="cap-box">
                  <span class="cap-num ${cap.icuAvailable > 0 ? 'text-success' : 'text-danger'}">${cap.icuAvailable || 0}</span>
                  <span class="cap-lbl">ICU Beds</span>
                </div>
                <div class="cap-box">
                  <span class="cap-num">${cap.totalBeds || 0}</span>
                  <span class="cap-lbl">Total Capacity</span>
                </div>
              </div>
              <div class="popup-row" style="margin-top: 0.5rem">
                <span class="popup-k">Contact:</span>
                <span class="popup-v">${fac.contactPhone || 'Emergency Intake'}</span>
              </div>
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, { maxWidth: 320, className: 'dark-leaflet-popup' });
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

  const metrics = mapData?.metrics || {};

  return (
    <div className="operational-map-wrapper">
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
              <span>🚨 Active Incidents ({metrics.activeIncidents ?? '…'})</span>
            </label>
          </div>
        </div>

        <div className="map-toolbar-right">
          <button
            type="button"
            className={`map-tool-btn map-theme-btn ${darkTiles ? 'active-dark' : 'active-light'}`}
            onClick={() => setDarkTiles(!darkTiles)}
            title="Toggle between Dark Operations Grid and Light Map"
            aria-label="Dark Map / Light Map toggle"
          >
            {darkTiles ? '🌙 Dark Map / Light Map' : '☀️ Light Map / Dark Map'}
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
            className={`map-tool-btn btn-sync ${autoRefresh ? 'active-pulse' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Toggle real-time operational polling (12s interval)"
          >
            {autoRefresh ? '⚡ Live Sync (12s)' : '⏸ Sync Paused'}
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
            Last Telemetry: {lastRefreshedAt.toLocaleTimeString()}
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
