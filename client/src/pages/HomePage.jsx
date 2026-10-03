import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';
import DispatchCard from '../components/DispatchCard.jsx';
import FacilityStatusWidget from '../components/FacilityStatusWidget.jsx';
import NewDispatchModal from '../components/NewDispatchModal.jsx';
import OperationalMap from '../components/OperationalMap.jsx';
import AiAssistantModal from '../components/AiAssistantModal.jsx';

export const HomePage = () => {
  const [dispatches, setDispatches] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filter states
  const [dispatchFilter, setDispatchFilter] = useState('active'); // 'all' | 'active' | 'critical'
  const [facilityFilter, setFacilityFilter] = useState('all'); // 'all' | 'trauma' | 'open' | 'divert'

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialValues, setModalInitialValues] = useState({});

  // AI Assistant Modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiModalMode, setAiModalMode] = useState('triage');

  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  const fetchDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [healthRes, dispatchesRes, facilitiesRes, aiRes] = await Promise.all([
        api.getHealth().catch((err) => ({ error: err })),
        api.getDispatches().catch((err) => ({ error: err })),
        api.getFacilities().catch((err) => ({ error: err })),
        api.getAiStatus().catch((err) => ({ error: err })),
      ]);

      if (healthRes.error && dispatchesRes.error && facilitiesRes.error) {
        throw new Error('Unable to connect to MediRoute API backend services.');
      }

      if (dispatchesRes.error || facilitiesRes.error) {
        const partialErr = dispatchesRes.error || facilitiesRes.error;
        setError(partialErr.message || 'Error communicating with operational backend.');
      }

      if (healthRes.data) setSystemHealth(healthRes.data);
      if (dispatchesRes.data) setDispatches(dispatchesRes.data);
      if (facilitiesRes.data) setFacilities(facilitiesRes.data);
      if (aiRes.data) setAiStatus(aiRes.data);

      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err.message || 'Error communicating with operational backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    // Auto-refresh operational metrics every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Operational Statistics
  const stats = useMemo(() => {
    const totalDispatches = dispatches.length;
    const activeDispatches = dispatches.filter(
      (d) => d.status !== 'completed' && d.status !== 'cancelled'
    ).length;
    const criticalCount = dispatches.filter(
      (d) => d.triageLevel === 'critical' && d.status !== 'completed' && d.status !== 'cancelled'
    ).length;
    const enRouteCount = dispatches.filter((d) => d.status === 'en_route').length;
    const completedToday = dispatches.filter((d) => d.status === 'completed').length;

    // Facility calculations
    const totalFacilities = facilities.length;
    let totalBeds = 0;
    let availableBeds = 0;
    let icuAvailable = 0;
    let divertCount = 0;
    let busyCount = 0;

    facilities.forEach((f) => {
      const cap = f.emergencyCapacity || {};
      totalBeds += cap.totalBeds || 0;
      availableBeds += cap.availableBeds || 0;
      icuAvailable += cap.icuAvailable || 0;
      const st = (cap.status || '').toLowerCase();
      if (st === 'divert') divertCount++;
      if (st === 'busy' || st === 'critical') busyCount++;
    });

    const overallOccupancy =
      totalBeds > 0 ? Math.round(((totalBeds - availableBeds) / totalBeds) * 100) : 0;

    return {
      totalDispatches,
      activeDispatches,
      criticalCount,
      enRouteCount,
      completedToday,
      totalFacilities,
      totalBeds,
      availableBeds,
      icuAvailable,
      divertCount,
      busyCount,
      overallOccupancy,
    };
  }, [dispatches, facilities]);

  // Filtered dispatches for the feed
  const recentDispatches = useMemo(() => {
    let list = [...dispatches];
    if (dispatchFilter === 'active') {
      list = list.filter((d) => d.status !== 'completed' && d.status !== 'cancelled');
    } else if (dispatchFilter === 'critical') {
      list = list.filter((d) => d.triageLevel === 'critical');
    }
    return list.slice(0, 6); // Top 6 most recent
  }, [dispatches, dispatchFilter]);

  // Filtered facilities for the widget column
  const filteredFacilities = useMemo(() => {
    let list = [...facilities];
    if (facilityFilter === 'trauma') {
      list = list.filter((f) => f.facilityType === 'trauma_center');
    } else if (facilityFilter === 'open') {
      list = list.filter((f) => (f.emergencyCapacity?.status || '').toLowerCase() === 'normal');
    } else if (facilityFilter === 'divert') {
      list = list.filter((f) => {
        const st = (f.emergencyCapacity?.status || '').toLowerCase();
        return st === 'divert' || st === 'critical';
      });
    }
    return list;
  }, [facilities, facilityFilter]);

  // Handlers for quick dispatch actions
  const handleOpenDispatch = (initialValues = {}) => {
    setModalInitialValues(initialValues);
    setIsModalOpen(true);
  };

  const handleFacilityQuickDispatch = (facility) => {
    handleOpenDispatch({
      destinationFacility: facility._id,
      notes: `Pre-routed to ${facility.name} based on emergency capacity.`,
    });
  };

  const handleDispatchCreated = (newDispatch) => {
    setDispatches((prev) => [newDispatch, ...prev]);
  };

  const handleStatusUpdated = (updatedDispatch) => {
    setDispatches((prev) =>
      prev.map((d) => (d._id === updatedDispatch._id ? updatedDispatch : d))
    );
  };

  const handleOpenAiModal = (modalMode = 'triage') => {
    setAiModalMode(modalMode);
    setIsAiModalOpen(true);
  };

  const handleApplyAiRecommendation = (aiResult) => {
    if (!aiResult?.data) return;
    const { type, data } = aiResult;

    if (type === 'triage') {
      handleOpenDispatch({
        triageLevel: data.triageLevel,
        vehicleType: data.recommendedVehicleType,
        notes: `[AI-Assisted Recommendation]: ${data.summary}`,
      });
    } else if (type === 'dispatch') {
      handleOpenDispatch({
        destinationFacility: data.recommendedFacilityId,
        notes: `[AI Allocation]: Rec Ambulance: ${data.ambulanceIdTag || 'Nearest'} | Rec Hospital: ${data.facilityName}. ${data.ambulanceRationale || ''}`,
      });
    } else if (type === 'facility') {
      handleOpenDispatch({
        destinationFacility: data.recommendedFacilityId,
        notes: `[AI Recommendation]: Pre-assigned to ${data.facilityName}. ${data.clinicalJustification || ''}`,
      });
    } else if (type === 'summarize') {
      handleOpenDispatch({
        notes: `[AI Incident Summary]: ${data.operationalSummary}`,
      });
    }
  };

  return (
    <div className="dashboard-container">
      {/* 1. Control Center Banner */}
      <section className="control-center-banner">
        <div className="banner-left">
          <div className="live-indicator-tag">
            <span className="pulsing-radar-dot"></span>
            <span>LIVE EMERGENCY OPERATIONS CONTROL</span>
          </div>
          <h1 className="control-center-title">MediRoute Operations Command</h1>
          <p className="control-center-subtitle">
            Regional medical logistics dispatch, emergency unit telemetry, and hospital intake monitoring
          </p>
        </div>

        <div className="banner-right">
          <div className="sync-status-box">
            <div className="sync-meta">
              <span className="sync-label">System Health</span>
              <span className="sync-val">
                <span className={`status-dot ${systemHealth?.database === 'connected' ? 'success' : 'error'}`}></span>
                {systemHealth ? `API Online (${systemHealth.database})` : 'Offline / Standby'}
              </span>
            </div>
            <div className="sync-meta ai-sync-meta">
              <span className="sync-label">Gemini AI</span>
              <span className="sync-val">
                <span className="status-dot success"></span>
                {aiStatus ? `Online (${aiStatus.model})` : 'Standby'}
              </span>
            </div>
            <div className="sync-timestamp">
              Last Synced: {lastRefreshedAt.toLocaleTimeString()}
            </div>
          </div>

          <div className="banner-actions">
            <Button
              variant="secondary"
              size="md"
              className="btn-ai-assistant"
              onClick={() => handleOpenAiModal('triage')}
            >
              ✨ AI Assistant
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Syncing...' : '🔄 Refresh Data'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => handleOpenDispatch()}
            >
              ✚ New Emergency Dispatch
            </Button>
          </div>
        </div>
      </section>

      {/* Global Error Banner */}
      {error && (
        <ErrorMessage
          title="Operational Telemetry Error"
          message={error}
          onRetry={() => fetchDashboardData()}
          retryLabel="Reconnect to Server"
        />
      )}

      {/* Loading State */}
      {loading && !dispatches.length && !facilities.length && (
        <LoadingSpinner message="Connecting to MediRoute operational services..." size="lg" />
      )}

      {/* 2. Key Operational Metrics Strip (6 KPI Cards) */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Active Dispatches</span>
            <span className="kpi-icon">🚑</span>
          </div>
          <div className="kpi-value">{stats.activeDispatches}</div>
          <div className="kpi-subtext">
            <span>{stats.totalDispatches} total logged transports</span>
          </div>
        </div>

        <div className={`kpi-card ${stats.criticalCount > 0 ? 'kpi-alert-card' : ''}`}>
          <div className="kpi-header">
            <span className="kpi-title">Critical Emergencies</span>
            <span className="kpi-icon">🚨</span>
          </div>
          <div className="kpi-value critical-val">{stats.criticalCount}</div>
          <div className="kpi-subtext">
            <span>Immediate ALS dispatch required</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Units En Route</span>
            <span className="kpi-icon">🧭</span>
          </div>
          <div className="kpi-value enroute-val">{stats.enRouteCount}</div>
          <div className="kpi-subtext">
            <span>Vehicles currently in transit</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Available Hospital Beds</span>
            <span className="kpi-icon">🏥</span>
          </div>
          <div className="kpi-value success-val">{stats.availableBeds}</div>
          <div className="kpi-subtext">
            <span>{stats.totalBeds} total beds across network</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">ICU Beds Available</span>
            <span className="kpi-icon">🫀</span>
          </div>
          <div className="kpi-value icu-val">{stats.icuAvailable}</div>
          <div className="kpi-subtext">
            <span>Critical intensive care capacity</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Network Intake Status</span>
            <span className="kpi-icon">📊</span>
          </div>
          <div className="kpi-value">
            {stats.divertCount > 0 ? `${stats.divertCount} Diverting` : 'Optimal'}
          </div>
          <div className="kpi-subtext">
            <span>{stats.totalFacilities} medical facilities monitored</span>
          </div>
        </div>
      </section>

      {/* 3. Rapid Action Launch Bar */}
      <section className="quick-actions-bar">
        <span className="quick-actions-label">⚡ Rapid Dispatch Presets:</span>
        <div className="quick-buttons-row">
          <button
            type="button"
            className="quick-action-btn btn-action-critical"
            onClick={() =>
              handleOpenDispatch({
                triageLevel: 'critical',
                vehicleType: 'als_ambulance',
                symptoms: 'Cardiovascular collapse, Acute trauma',
                notes: 'HIGH PRIORITY: Rapid ALS unit deployment requested.',
              })
            }
          >
            🚨 Critical ALS Ambulance
          </button>

          <button
            type="button"
            className="quick-action-btn btn-action-urgent"
            onClick={() =>
              handleOpenDispatch({
                triageLevel: 'urgent',
                vehicleType: 'bls_ambulance',
                symptoms: 'Fracture, Trauma, Acute distress',
                notes: 'Urgent BLS transport dispatched.',
              })
            }
          >
            🚑 Urgent BLS Transport
          </button>

          <button
            type="button"
            className="quick-action-btn btn-action-standard"
            onClick={() =>
              handleOpenDispatch({
                triageLevel: 'standard',
                vehicleType: 'wheelchair_van',
                symptoms: 'Non-emergency transport, Mobility support',
                notes: 'Wheelchair ramp accessible transport requested.',
              })
            }
          >
            ♿ Wheelchair Van Transfer
          </button>

          <button
            type="button"
            className="quick-action-btn btn-action-ai"
            onClick={() => handleOpenAiModal('triage')}
          >
            ✨ AI Clinical Triage Protocol
          </button>
        </div>
      </section>

      {/* 4. Active Real-Time Operational Map */}
      <section className="dashboard-map-section">
        <Card
          title="Active Regional Operations & Telemetry Map"
          subtitle="Real-time geographic positions of emergency ambulances, hospital intake status, and active incidents"
          headerRight={
            <div className="map-badge-tag">
              <span className="live-radar-ping"></span> Live Sector Monitoring
            </div>
          }
        >
          <OperationalMap height="520px" />
        </Card>
      </section>

      {/* 5. Two-Column Command Deck */}
      <div className="command-deck-grid">
        {/* Left Column: Recent Dispatches Feed (60%) */}
        <div className="deck-column-dispatches">
          <Card
            title="Active & Recent Dispatches"
            subtitle="Live transport lifecycle, patient urgency triage, and unit status"
            headerRight={
              <div className="card-header-controls">
                <div className="mini-filter-pills">
                  <button
                    className={`mini-pill ${dispatchFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setDispatchFilter('active')}
                  >
                    Active ({stats.activeDispatches})
                  </button>
                  <button
                    className={`mini-pill ${dispatchFilter === 'critical' ? 'active' : ''}`}
                    onClick={() => setDispatchFilter('critical')}
                  >
                    Critical ({stats.criticalCount})
                  </button>
                  <button
                    className={`mini-pill ${dispatchFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setDispatchFilter('all')}
                  >
                    All Recent
                  </button>
                </div>
                <Link to="/dispatches" className="text-link view-all-link">
                  View All &rarr;
                </Link>
              </div>
            }
          >
            {loading && !dispatches.length ? (
              <LoadingSpinner message="Loading live dispatches..." size="md" />
            ) : recentDispatches.length === 0 ? (
              <EmptyState
                icon="🚑"
                title="No dispatches to display"
                description={
                  dispatchFilter === 'critical'
                    ? 'No critical emergency dispatches are currently active.'
                    : dispatchFilter === 'active'
                    ? 'There are currently no active transport dispatches.'
                    : 'No dispatches recorded yet.'
                }
                actionLabel="Create Dispatch"
                onAction={() => handleOpenDispatch()}
              />
            ) : (
              <div className="dashboard-dispatches-list">
                {recentDispatches.map((item) => (
                  <DispatchCard
                    key={item._id}
                    dispatch={item}
                    onStatusUpdated={handleStatusUpdated}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Hospital Network Status (40%) */}
        <div className="deck-column-facilities">
          <Card
            title="Regional Healthcare Network"
            subtitle="Hospital emergency bed intake, ICU availability & diversion status"
            headerRight={
              <div className="card-header-controls">
                <select
                  className="form-input form-select mini-select"
                  value={facilityFilter}
                  onChange={(e) => setFacilityFilter(e.target.value)}
                  aria-label="Filter medical facilities"
                >
                  <option value="all">All Facilities ({facilities.length})</option>
                  <option value="trauma">Trauma Centers</option>
                  <option value="open">Normal Intake Only</option>
                  <option value="divert">High Capacity / Divert</option>
                </select>
                <Link to="/facilities" className="text-link view-all-link">
                  Directory &rarr;
                </Link>
              </div>
            }
          >
            {/* Regional Network Capacity Summary Meter */}
            <div className="regional-meter-card">
              <div className="meter-header">
                <span className="meter-title">Total Network Bed Occupancy</span>
                <span className="meter-percent">
                  {stats.overallOccupancy}% ({stats.totalBeds - stats.availableBeds} / {stats.totalBeds} beds)
                </span>
              </div>
              <div className="meter-track">
                <div
                  className={`meter-fill ${
                    stats.overallOccupancy >= 85
                      ? 'fill-critical'
                      : stats.overallOccupancy >= 70
                      ? 'fill-busy'
                      : 'fill-normal'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, stats.overallOccupancy))}%` }}
                ></div>
              </div>
            </div>

            {loading && !facilities.length ? (
              <LoadingSpinner message="Loading hospital network..." size="md" />
            ) : filteredFacilities.length === 0 ? (
              <EmptyState
                icon="🏥"
                title="No facilities found"
                description="No medical facilities match the chosen status criteria."
                actionLabel="Reset Filter"
                onAction={() => setFacilityFilter('all')}
              />
            ) : (
              <div className="facilities-widget-list">
                {filteredFacilities.map((facility) => (
                  <FacilityStatusWidget
                    key={facility._id}
                    facility={facility}
                    onQuickDispatch={handleFacilityQuickDispatch}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Reusable Dispatch Creation Modal */}
      <NewDispatchModal
        isOpen={isModalOpen}
        initialValues={modalInitialValues}
        facilities={facilities}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleDispatchCreated}
      />

      {/* Decision-Support Gemini AI Assistant Modal */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        initialMode={aiModalMode}
        facilities={facilities}
        onApplyRecommendation={handleApplyAiRecommendation}
      />
    </div>
  );
};

export default HomePage;
