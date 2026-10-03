import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api.js';
import DispatchCard from '../components/DispatchCard.jsx';
import NewDispatchModal from '../components/NewDispatchModal.jsx';
import OperationalMap from '../components/OperationalMap.jsx';
import AiAssistantModal from '../components/AiAssistantModal.jsx';
import Button from '../components/Button.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Card from '../components/Card.jsx';

export const DispatchesPage = () => {
  const [dispatches, setDispatches] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [triageFilter, setTriageFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Map state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialValues, setModalInitialValues] = useState({});
  const [showMap, setShowMap] = useState(true);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiModalMode, setAiModalMode] = useState('triage');

  const fetchDispatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dispRes, facRes] = await Promise.all([
        api.getDispatches(),
        api.getFacilities().catch(() => ({ data: [] })),
      ]);
      setDispatches(dispRes.data || []);
      setFacilities(facRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load dispatches from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatches();
  }, []);

  const handleDispatchCreated = (newDispatch) => {
    setDispatches((prev) => [newDispatch, ...prev]);
  };

  const handleStatusUpdated = (updatedDispatch) => {
    setDispatches((prev) =>
      prev.map((d) => (d._id === updatedDispatch._id ? updatedDispatch : d))
    );
  };

  const handleOpenAiModal = (mode = 'triage') => {
    setAiModalMode(mode);
    setIsAiModalOpen(true);
  };

  const handleApplyAiRecommendation = (aiResult) => {
    if (!aiResult?.data) return;
    const { type, data } = aiResult;

    if (type === 'triage') {
      setModalInitialValues({
        triageLevel: data.triageLevel,
        vehicleType: data.recommendedVehicleType,
        notes: `[AI Recommendation]: ${data.summary}`,
      });
      setIsModalOpen(true);
    } else if (type === 'dispatch') {
      setModalInitialValues({
        destinationFacility: data.recommendedFacilityId,
        notes: `[AI Allocation]: Suggested Unit: ${data.ambulanceIdTag || 'Nearest'} | Rec Hospital: ${data.facilityName}`,
      });
      setIsModalOpen(true);
    } else if (type === 'facility') {
      setModalInitialValues({
        destinationFacility: data.recommendedFacilityId,
        notes: `[AI Hospital Selection]: ${data.clinicalJustification || ''}`,
      });
      setIsModalOpen(true);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const total = dispatches.length;
    const critical = dispatches.filter((d) => d.triageLevel === 'critical').length;
    const enRoute = dispatches.filter((d) => d.status === 'en_route').length;
    const completed = dispatches.filter((d) => d.status === 'completed').length;
    return { total, critical, enRoute, completed };
  }, [dispatches]);

  // Filtered dispatches
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((item) => {
      // Status filter
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      // Triage filter
      if (triageFilter !== 'all' && item.triageLevel !== triageFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const patientMatch = item.patientName?.toLowerCase().includes(query);
        const numberMatch = item.dispatchNumber?.toLowerCase().includes(query);
        const addressMatch = item.pickupLocation?.address?.toLowerCase().includes(query);
        if (!patientMatch && !numberMatch && !addressMatch) {
          return false;
        }
      }
      return true;
    });
  }, [dispatches, statusFilter, triageFilter, searchQuery]);

  return (
    <div className="page-container">
      {/* Header section */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency & Transport Dispatches</h1>
          <p className="page-subtitle">
            Coordinate triage levels, ambulance allocations, and patient transfers across regional sectors
          </p>
        </div>
        <div className="header-actions">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setShowMap(!showMap)}
            title="Toggle Live Operational Map"
          >
            {showMap ? 'Hide Map' : '🗺️ Show Live Map'}
          </Button>

          <Button
            variant="secondary"
            size="md"
            className="btn-ai-assistant"
            onClick={() => handleOpenAiModal('triage')}
          >
            ✨ AI Assistant
          </Button>

          <Button variant="secondary" size="md" onClick={fetchDispatches} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setModalInitialValues({});
              setIsModalOpen(true);
            }}
          >
            ✚ New Dispatch
          </Button>
        </div>
      </div>

      {/* Live Metrics Summary Strip */}
      <div className="metrics-strip">
        <div className="metric-box">
          <span className="metric-label">Total Logged</span>
          <span className="metric-val">{metrics.total}</span>
        </div>
        <div className="metric-box alert-metric">
          <span className="metric-label">Critical Priority</span>
          <span className="metric-val critical-text">{metrics.critical}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">En Route</span>
          <span className="metric-val enroute-text">{metrics.enRoute}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Completed</span>
          <span className="metric-val completed-text">{metrics.completed}</span>
        </div>
      </div>

      {/* Collapsible Operational Map Section */}
      {showMap && (
        <section className="dispatch-map-section" style={{ marginBottom: '1.5rem' }}>
          <Card
            title="Active Operational Telemetry"
            subtitle="Geographic tracking of active emergency calls, en-route ambulances, and regional hospital network"
          >
            <OperationalMap height="450px" />
          </Card>
        </section>
      )}

      {/* Search and Filters Bar */}
      <div className="controls-bar">
        <div className="search-wrap">
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by patient, dispatch #, or pickup address (e.g. Pune, Baner)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-group">
          <div className="filter-chips">
            {['all', 'pending', 'assigned', 'en_route', 'completed'].map((status) => (
              <button
                key={status}
                className={`filter-chip ${statusFilter === status ? 'chip-active' : ''}`}
                onClick={() => setStatusFilter(status)}
              >
                {status.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          <div className="triage-select-wrap">
            <select
              className="form-input form-select filter-select"
              value={triageFilter}
              onChange={(e) => setTriageFilter(e.target.value)}
              aria-label="Filter by triage level"
            >
              <option value="all">All Triage Levels</option>
              <option value="critical">Critical Only</option>
              <option value="urgent">Urgent Only</option>
              <option value="standard">Standard Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading && (
        <LoadingSpinner message="Fetching active dispatches from MongoDB..." size="lg" />
      )}

      {!loading && error && (
        <ErrorMessage
          title="Could not load dispatches"
          message={error}
          onRetry={fetchDispatches}
          retryLabel="Retry Connection"
        />
      )}

      {!loading && !error && filteredDispatches.length === 0 && (
        <EmptyState
          icon="🚑"
          title="No dispatches found"
          description={
            searchQuery || statusFilter !== 'all' || triageFilter !== 'all'
              ? 'No dispatches match your current filter or search criteria.'
              : 'There are currently no emergency or transport dispatches in the database.'
          }
          actionLabel="Create First Dispatch"
          onAction={() => {
            setModalInitialValues({});
            setIsModalOpen(true);
          }}
        />
      )}

      {!loading && !error && filteredDispatches.length > 0 && (
        <div className="dispatches-grid">
          {filteredDispatches.map((item) => (
            <DispatchCard
              key={item._id}
              dispatch={item}
              onStatusUpdated={handleStatusUpdated}
            />
          ))}
        </div>
      )}

      {/* Dispatch Creation Modal (Requires Human Confirmation) */}
      <NewDispatchModal
        isOpen={isModalOpen}
        initialValues={modalInitialValues}
        facilities={facilities}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleDispatchCreated}
      />

      {/* AI Decision Support Modal */}
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

export default DispatchesPage;
