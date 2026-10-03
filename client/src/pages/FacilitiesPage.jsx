import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api.js';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Modal from '../components/Modal.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';
import NewDispatchModal from '../components/NewDispatchModal.jsx';

export const FacilitiesPage = () => {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search, Filter, and Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('available_beds');

  // Modal states
  const [selectedFacilityForDetails, setSelectedFacilityForDetails] = useState(null);
  const [selectedFacilityForCapacity, setSelectedFacilityForCapacity] = useState(null);
  const [isAddFacilityModalOpen, setIsAddFacilityModalOpen] = useState(false);

  // Quick Dispatch modal state
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchModalInitialValues, setDispatchModalInitialValues] = useState({});

  // Capacity Form state
  const [capacityForm, setCapacityForm] = useState({
    totalBeds: 0,
    availableBeds: 0,
    icuAvailable: 0,
    status: 'normal',
  });
  const [capacitySubmitting, setCapacitySubmitting] = useState(false);
  const [capacityError, setCapacityError] = useState(null);

  // Add Facility Form state
  const [newFacilityForm, setNewFacilityForm] = useState({
    name: '',
    facilityType: 'hospital',
    street: '',
    city: 'Pune',
    state: 'Maharashtra',
    zipCode: '411005',
    latitude: 18.5314,
    longitude: 73.8478,
    contactPhone: '+91 20 2550 1100',
    totalBeds: 100,
    availableBeds: 20,
    icuAvailable: 4,
    status: 'normal',
    capabilities: 'icu, emergency, trauma',
    isOpen24Hours: true,
  });
  const [newFacilitySubmitting, setNewFacilitySubmitting] = useState(false);
  const [newFacilityError, setNewFacilityError] = useState(null);

  const fetchFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getFacilities();
      setFacilities(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load medical facilities network.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  // Overall Network Metrics
  const networkMetrics = useMemo(() => {
    const totalFacilities = facilities.length;
    let totalBeds = 0;
    let availableBeds = 0;
    let icuAvailable = 0;
    let divertCount = 0;
    let busyOrCriticalCount = 0;

    facilities.forEach((f) => {
      const cap = f.emergencyCapacity || {};
      totalBeds += cap.totalBeds || 0;
      availableBeds += cap.availableBeds || 0;
      icuAvailable += cap.icuAvailable || 0;
      const st = (cap.status || '').toLowerCase();
      if (st === 'divert') divertCount++;
      if (st === 'busy' || st === 'critical') busyOrCriticalCount++;
    });

    const occupiedBeds = Math.max(0, totalBeds - availableBeds);
    const overallOccupancy = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    return {
      totalFacilities,
      totalBeds,
      availableBeds,
      occupiedBeds,
      icuAvailable,
      divertCount,
      busyOrCriticalCount,
      overallOccupancy,
    };
  }, [facilities]);

  // Filtered & Sorted Facilities
  const filteredFacilities = useMemo(() => {
    let result = [...facilities];

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        const nameMatch = item.name?.toLowerCase().includes(q);
        const streetMatch = item.address?.street?.toLowerCase().includes(q);
        const cityMatch = item.address?.city?.toLowerCase().includes(q);
        const typeMatch = item.facilityType?.toLowerCase().includes(q);
        const capsMatch = item.capabilities?.some((cap) => cap.toLowerCase().includes(q));
        return nameMatch || streetMatch || cityMatch || typeMatch || capsMatch;
      });
    }

    // 2. Type filter
    if (typeFilter !== 'all') {
      result = result.filter((item) => item.facilityType === typeFilter);
    }

    // 3. Status filter
    if (statusFilter !== 'all') {
      result = result.filter((item) => {
        const st = (item.emergencyCapacity?.status || 'normal').toLowerCase();
        return st === statusFilter;
      });
    }

    // 4. Sorting
    result.sort((a, b) => {
      const capA = a.emergencyCapacity || {};
      const capB = b.emergencyCapacity || {};

      const totalA = capA.totalBeds || 0;
      const availA = capA.availableBeds || 0;
      const occA = totalA > 0 ? ((totalA - availA) / totalA) * 100 : 0;

      const totalB = capB.totalBeds || 0;
      const availB = capB.availableBeds || 0;
      const occB = totalB > 0 ? ((totalB - availB) / totalB) * 100 : 0;

      switch (sortBy) {
        case 'available_beds':
          return (capB.availableBeds || 0) - (capA.availableBeds || 0);
        case 'occupancy_asc':
          return occA - occB;
        case 'occupancy_desc':
          return occB - occA;
        case 'icu_beds':
          return (capB.icuAvailable || 0) - (capA.icuAvailable || 0);
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });

    return result;
  }, [facilities, searchQuery, typeFilter, statusFilter, sortBy]);

  // Helper formatters
  const formatFacilityType = (type) => {
    if (!type) return 'HOSPITAL';
    return type.replace(/_/g, ' ').toUpperCase();
  };

  const getStatusBadge = (status) => {
    const st = (status || 'normal').toLowerCase();
    switch (st) {
      case 'divert':
        return <span className="facility-status-pill divert">DIVERT ACTIVE</span>;
      case 'critical':
        return <span className="facility-status-pill critical">CRITICAL INTAKE</span>;
      case 'busy':
        return <span className="facility-status-pill busy">BUSY</span>;
      case 'normal':
      default:
        return <span className="facility-status-pill normal">NORMAL INTAKE</span>;
    }
  };

  const getOccupancyBarColor = (percent) => {
    if (percent >= 90) return 'bar-critical';
    if (percent >= 75) return 'bar-busy';
    return 'bar-normal';
  };

  // Capacity Control Handlers
  const handleOpenCapacityModal = (facility) => {
    const cap = facility.emergencyCapacity || {};
    setCapacityForm({
      totalBeds: cap.totalBeds || 0,
      availableBeds: cap.availableBeds || 0,
      icuAvailable: cap.icuAvailable || 0,
      status: cap.status || 'normal',
    });
    setCapacityError(null);
    setSelectedFacilityForCapacity(facility);
  };

  const handleSaveCapacity = async (e) => {
    e.preventDefault();
    if (!selectedFacilityForCapacity) return;

    setCapacitySubmitting(true);
    setCapacityError(null);

    const payload = {
      emergencyCapacity: {
        totalBeds: Number(capacityForm.totalBeds) || 0,
        availableBeds: Number(capacityForm.availableBeds) || 0,
        icuAvailable: Number(capacityForm.icuAvailable) || 0,
        status: capacityForm.status,
      },
    };

    try {
      const response = await api.updateFacilityCapacity(
        selectedFacilityForCapacity._id,
        payload.emergencyCapacity
      );
      const updatedFacility = response.data;

      // Update state locally
      setFacilities((prev) =>
        prev.map((f) => (f._id === updatedFacility._id ? updatedFacility : f))
      );

      // If details modal is open for this facility, update it too
      if (selectedFacilityForDetails?._id === updatedFacility._id) {
        setSelectedFacilityForDetails(updatedFacility);
      }

      setSelectedFacilityForCapacity(null);
    } catch (err) {
      setCapacityError(err.message || 'Capacity update unauthorized or failed.');
    } finally {
      setCapacitySubmitting(false);
    }
  };

  // Add Facility Handlers
  const handleCreateFacility = async (e) => {
    e.preventDefault();
    setNewFacilitySubmitting(true);
    setNewFacilityError(null);

    const payload = {
      name: newFacilityForm.name.trim(),
      facilityType: newFacilityForm.facilityType,
      address: {
        street: newFacilityForm.street.trim(),
        city: newFacilityForm.city.trim(),
        state: newFacilityForm.state.trim(),
        zipCode: newFacilityForm.zipCode.trim(),
      },
      location: {
        type: 'Point',
        coordinates: [
          parseFloat(newFacilityForm.longitude) || -73.99,
          parseFloat(newFacilityForm.latitude) || 40.73,
        ],
      },
      contactPhone: newFacilityForm.contactPhone.trim() || undefined,
      capabilities: newFacilityForm.capabilities
        ? newFacilityForm.capabilities.split(',').map((c) => c.trim()).filter(Boolean)
        : [],
      emergencyCapacity: {
        totalBeds: Number(newFacilityForm.totalBeds) || 0,
        availableBeds: Number(newFacilityForm.availableBeds) || 0,
        icuAvailable: Number(newFacilityForm.icuAvailable) || 0,
        status: newFacilityForm.status,
      },
      isOpen24Hours: Boolean(newFacilityForm.isOpen24Hours),
      isActive: true,
    };

    try {
      const response = await api.createFacility(payload);
      const createdFacility = response.data;
      setFacilities((prev) => [createdFacility, ...prev]);
      setIsAddFacilityModalOpen(false);
      // Reset form
      setNewFacilityForm({
        name: '',
        facilityType: 'hospital',
        street: '',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411005',
        latitude: 18.5314,
        longitude: 73.8478,
        contactPhone: '+91 20 2550 1100',
        totalBeds: 100,
        availableBeds: 20,
        icuAvailable: 4,
        status: 'normal',
        capabilities: 'icu, emergency, trauma',
        isOpen24Hours: true,
      });
    } catch (err) {
      setNewFacilityError(err.message || 'Failed to register facility.');
    } finally {
      setNewFacilitySubmitting(false);
    }
  };

  // Quick Dispatch Handler
  const handleOpenDispatchForFacility = (facility) => {
    setDispatchModalInitialValues({
      destinationFacility: facility._id,
      notes: `Pre-routed to ${facility.name} based on emergency capacity.`,
    });
    setIsDispatchModalOpen(true);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setSortBy('available_beds');
  };

  return (
    <div className="page-container">
      {/* 1. Header Section */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Regional Healthcare Facilities Directory</h1>
          <p className="page-subtitle">
            Live hospital intake network, emergency bed availability, ICU telemetry, and diversion status
          </p>
        </div>
        <div className="header-actions">
          <Button variant="secondary" size="md" onClick={fetchFacilities} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </Button>
          <Button variant="primary" size="md" onClick={() => setIsAddFacilityModalOpen(true)}>
            ✚ Add Facility
          </Button>
        </div>
      </div>

      {/* 2. Network Metrics Summary Strip */}
      <div className="metrics-strip">
        <div className="metric-box">
          <span className="metric-label">Monitored Facilities</span>
          <span className="metric-val">{networkMetrics.totalFacilities}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Available Hospital Beds</span>
          <span className="metric-val completed-text">
            {networkMetrics.availableBeds}{' '}
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              / {networkMetrics.totalBeds}
            </span>
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Network Bed Occupancy</span>
          <span className="metric-val">
            {networkMetrics.overallOccupancy}%
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-label">ICU Beds Available</span>
          <span className="metric-val enroute-text">{networkMetrics.icuAvailable}</span>
        </div>
        <div className={`metric-box ${networkMetrics.divertCount > 0 ? 'alert-metric' : ''}`}>
          <span className="metric-label">Divert Status</span>
          <span className={`metric-val ${networkMetrics.divertCount > 0 ? 'critical-text' : 'completed-text'}`}>
            {networkMetrics.divertCount > 0
              ? `${networkMetrics.divertCount} Diverting`
              : 'All Receiving'}
          </span>
        </div>
      </div>

      {/* 3. Search and Multi-Dimensional Controls Bar */}
      <div className="controls-bar">
        {/* Search input */}
        <div className="search-wrap">
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by facility name, city, street, or capability (e.g. ICU, trauma)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="filter-group">
          {/* Facility Type Chips */}
          <div className="filter-chips">
            {[
              { id: 'all', label: 'ALL TYPES' },
              { id: 'hospital', label: 'HOSPITALS' },
              { id: 'trauma_center', label: 'TRAUMA' },
              { id: 'urgent_care', label: 'URGENT CARE' },
              { id: 'clinic', label: 'CLINICS' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`filter-chip ${typeFilter === tab.id ? 'chip-active' : ''}`}
                onClick={() => setTypeFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter Dropdown */}
          <select
            className="form-input form-select filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by intake status"
          >
            <option value="all">All Intake Statuses</option>
            <option value="normal">Normal Intake</option>
            <option value="busy">Busy / High Volume</option>
            <option value="critical">Critical Intake</option>
            <option value="divert">Divert Active</option>
          </select>

          {/* Sorting Dropdown */}
          <select
            className="form-input form-select filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort facilities"
          >
            <option value="available_beds">Available Beds (High to Low)</option>
            <option value="occupancy_asc">Bed Occupancy (Lowest First)</option>
            <option value="occupancy_desc">Bed Occupancy (Highest First)</option>
            <option value="icu_beds">ICU Beds (High to Low)</option>
            <option value="name">Facility Name (A to Z)</option>
          </select>
        </div>
      </div>

      {/* 4. Main Facilities Directory Grid & States */}
      {loading ? (
        <LoadingSpinner message="Fetching medical facilities registry from MongoDB..." size="lg" />
      ) : error ? (
        <ErrorMessage
          title="Could not load facilities directory"
          message={error}
          onRetry={fetchFacilities}
          retryLabel="Retry Connection"
        />
      ) : filteredFacilities.length === 0 ? (
        <Card>
          <EmptyState
            icon="🏥"
            title="No medical facilities found"
            description={
              searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'No facilities match your search criteria or active filters.'
                : 'There are currently no healthcare facilities registered in the system.'
            }
            actionLabel="Reset All Filters"
            onAction={resetFilters}
          />
        </Card>
      ) : (
        <div className="facilities-grid">
          {filteredFacilities.map((facility) => {
            const cap = facility.emergencyCapacity || {};
            const totalBeds = cap.totalBeds || 0;
            const availableBeds = cap.availableBeds || 0;
            const icuAvailable = cap.icuAvailable || 0;
            const status = (cap.status || 'normal').toLowerCase();

            const occupiedBeds = Math.max(0, totalBeds - availableBeds);
            const occupancyPercent = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

            const coordinates = facility.location?.coordinates || [];
            const lat = typeof coordinates[1] === 'number' ? coordinates[1].toFixed(3) : null;
            const lng = typeof coordinates[0] === 'number' ? coordinates[0].toFixed(3) : null;

            return (
              <div
                key={facility._id}
                className={`facility-dir-card ${
                  status === 'divert' ? 'card-divert' : status === 'critical' ? 'card-critical' : ''
                }`}
              >
                {/* Header */}
                <div className="facility-card-header">
                  <div>
                    <div className="facility-badge-strip">
                      <span className="facility-type-tag">
                        {formatFacilityType(facility.facilityType)}
                      </span>
                      {facility.isOpen24Hours && (
                        <span className="facility-247-tag">24/7 OPEN</span>
                      )}
                    </div>
                    <h3 className="facility-card-title">{facility.name}</h3>
                    {facility.address && (
                      <p className="facility-card-location">
                        📍 {facility.address.street ? `${facility.address.street}, ` : ''}
                        {facility.address.city || 'Pune'}
                        {facility.address.state ? `, ${facility.address.state}` : ''}
                      </p>
                    )}
                  </div>
                  <div>{getStatusBadge(status)}</div>
                </div>

                {/* Capacity Occupancy Meter */}
                <div className="facility-capacity-block">
                  <div className="capacity-meta-row">
                    <span className="capacity-label">Bed Occupancy ({occupancyPercent}%)</span>
                    <span className="capacity-counts">
                      <strong>{availableBeds}</strong> available of {totalBeds} beds
                    </span>
                  </div>
                  <div className="occupancy-track">
                    <div
                      className={`occupancy-fill ${getOccupancyBarColor(occupancyPercent)}`}
                      style={{ width: `${Math.min(100, Math.max(0, occupancyPercent))}%` }}
                    ></div>
                  </div>
                </div>

                {/* Metrics Meta Row: ICU & Phone */}
                <div className="facility-card-meta">
                  <div className="icu-pill">
                    <span>🫀</span>
                    <span>
                      ICU Available: <strong>{icuAvailable}</strong>
                    </span>
                  </div>
                  {facility.contactPhone && (
                    <a href={`tel:${facility.contactPhone}`} className="facility-phone-link">
                      📞 {facility.contactPhone}
                    </a>
                  )}
                  {lat && lng && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      🧭 {lat}, {lng}
                    </span>
                  )}
                </div>

                {/* Capabilities Tags */}
                {facility.capabilities && facility.capabilities.length > 0 && (
                  <div className="facility-capabilities">
                    {facility.capabilities.map((capTag, i) => (
                      <span key={`${capTag}-${i}`} className="capability-tag">
                        {capTag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Controls Row */}
                <div className="facility-actions-row">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedFacilityForDetails(facility)}
                  >
                    📋 Details
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenCapacityModal(facility)}
                  >
                    ⚙️ Capacity
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenDispatchForFacility(facility)}
                  >
                    ✚ Dispatch
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Facility Details Modal */}
      {selectedFacilityForDetails && (
        <Modal
          isOpen={Boolean(selectedFacilityForDetails)}
          onClose={() => setSelectedFacilityForDetails(null)}
          title={`Facility Profile: ${selectedFacilityForDetails.name}`}
          maxWidth="640px"
        >
          <div className="facility-details-content">
            {/* Status & Type Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="facility-type-tag">
                  {formatFacilityType(selectedFacilityForDetails.facilityType)}
                </span>
                {selectedFacilityForDetails.isOpen24Hours && (
                  <span className="facility-247-tag">24/7 EMERGENCY INTAKE</span>
                )}
              </div>
              {getStatusBadge(selectedFacilityForDetails.emergencyCapacity?.status)}
            </div>

            {/* Real-time Telemetry Stats Grid */}
            <div>
              <h4 className="detail-section-title">Emergency Bed & ICU Telemetry</h4>
              <div className="detail-stats-grid">
                <div className="detail-stat-box">
                  <span className="detail-stat-label">Total Beds</span>
                  <span className="detail-stat-val">
                    {selectedFacilityForDetails.emergencyCapacity?.totalBeds || 0}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="detail-stat-label">Available</span>
                  <span className="detail-stat-val" style={{ color: 'var(--success)' }}>
                    {selectedFacilityForDetails.emergencyCapacity?.availableBeds || 0}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="detail-stat-label">Occupancy</span>
                  <span className="detail-stat-val">
                    {selectedFacilityForDetails.emergencyCapacity?.totalBeds > 0
                      ? Math.round(
                          ((selectedFacilityForDetails.emergencyCapacity.totalBeds -
                            selectedFacilityForDetails.emergencyCapacity.availableBeds) /
                            selectedFacilityForDetails.emergencyCapacity.totalBeds) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="detail-stat-label">ICU Units</span>
                  <span className="detail-stat-val" style={{ color: '#8b5cf6' }}>
                    {selectedFacilityForDetails.emergencyCapacity?.icuAvailable || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Location & Contact Information */}
            <div>
              <h4 className="detail-section-title">Location & Logistics Telemetry</h4>
              <div className="detail-info-list">
                <div className="detail-info-item">
                  <span className="detail-info-label">Street Address:</span>
                  <span className="detail-info-value">
                    {selectedFacilityForDetails.address?.street || 'Not specified'}
                  </span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">City, State & Zip:</span>
                  <span className="detail-info-value">
                    {selectedFacilityForDetails.address?.city || 'Pune'},{' '}
                    {selectedFacilityForDetails.address?.state || 'Maharashtra'}{' '}
                    {selectedFacilityForDetails.address?.zipCode || ''}
                  </span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Geographic Coordinates:</span>
                  <span className="detail-info-value">
                    {selectedFacilityForDetails.location?.coordinates
                      ? `${selectedFacilityForDetails.location.coordinates[1]} (Lat), ${selectedFacilityForDetails.location.coordinates[0]} (Lng)`
                      : 'Unavailable'}
                  </span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Emergency Desk Phone:</span>
                  <span className="detail-info-value">
                    {selectedFacilityForDetails.contactPhone ? (
                      <a
                        href={`tel:${selectedFacilityForDetails.contactPhone}`}
                        className="text-link"
                      >
                        {selectedFacilityForDetails.contactPhone}
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Specializations & Clinical Capabilities */}
            {selectedFacilityForDetails.capabilities?.length > 0 && (
              <div>
                <h4 className="detail-section-title">Clinical Capabilities & Accreditations</h4>
                <div className="facility-capabilities">
                  {selectedFacilityForDetails.capabilities.map((cap, i) => (
                    <span key={i} className="capability-tag" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
                      ✓ {cap.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  const fac = selectedFacilityForDetails;
                  setSelectedFacilityForDetails(null);
                  handleOpenCapacityModal(fac);
                }}
              >
                ⚙️ Update Capacity
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const fac = selectedFacilityForDetails;
                  setSelectedFacilityForDetails(null);
                  handleOpenDispatchForFacility(fac);
                }}
              >
                ✚ Dispatch Patient Here
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Capacity Control Modal (Authorized via PUT /api/facilities/:id) */}
      {selectedFacilityForCapacity && (
        <Modal
          isOpen={Boolean(selectedFacilityForCapacity)}
          onClose={() => setSelectedFacilityForCapacity(null)}
          title={`Update Emergency Capacity: ${selectedFacilityForCapacity.name}`}
          maxWidth="560px"
        >
          {capacityError && (
            <ErrorMessage title="Capacity Update Failed" message={capacityError} />
          )}

          <form onSubmit={handleSaveCapacity} noValidate>
            {/* Quick Status Presets */}
            <div className="capacity-presets-bar">
              <span className="presets-label">⚡ Quick Presets:</span>
              <button
                type="button"
                className="preset-chip-btn preset-normal"
                onClick={() => setCapacityForm((prev) => ({ ...prev, status: 'normal' }))}
              >
                ✅ Normal Intake
              </button>
              <button
                type="button"
                className="preset-chip-btn"
                onClick={() => setCapacityForm((prev) => ({ ...prev, status: 'busy' }))}
              >
                ⚠️ Set Busy
              </button>
              <button
                type="button"
                className="preset-chip-btn"
                onClick={() => setCapacityForm((prev) => ({ ...prev, status: 'critical' }))}
              >
                🚨 Set Critical
              </button>
              <button
                type="button"
                className="preset-chip-btn preset-divert"
                onClick={() => setCapacityForm((prev) => ({ ...prev, status: 'divert' }))}
              >
                🚫 Divert Active
              </button>
            </div>

            {/* Status Selector */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="capacityStatus" className="form-label">
                Operational Intake Status <span className="required-star">*</span>
              </label>
              <select
                id="capacityStatus"
                name="status"
                className="form-input form-select"
                value={capacityForm.status}
                onChange={(e) =>
                  setCapacityForm((prev) => ({ ...prev, status: e.target.value }))
                }
                required
              >
                <option value="normal">Normal Intake (Receiving All Ambulances)</option>
                <option value="busy">Busy (Elevated Wait Times)</option>
                <option value="critical">Critical Intake (Severe Resource Strain)</option>
                <option value="divert">Divert Active (Emergency Inbound Diverted)</option>
              </select>
            </div>

            {/* 3 Numeric Bed Inputs */}
            <div className="capacity-grid-3">
              <Input
                label="Total Emergency Beds"
                name="totalBeds"
                type="number"
                min="0"
                value={capacityForm.totalBeds}
                onChange={(e) =>
                  setCapacityForm((prev) => ({ ...prev, totalBeds: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                }
                required
              />
              <Input
                label="Available Beds"
                name="availableBeds"
                type="number"
                min="0"
                value={capacityForm.availableBeds}
                onChange={(e) =>
                  setCapacityForm((prev) => ({ ...prev, availableBeds: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                }
                required
              />
              <Input
                label="Available ICU Beds"
                name="icuAvailable"
                type="number"
                min="0"
                value={capacityForm.icuAvailable}
                onChange={(e) =>
                  setCapacityForm((prev) => ({ ...prev, icuAvailable: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                }
                required
              />
            </div>

            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button
                variant="secondary"
                onClick={() => setSelectedFacilityForCapacity(null)}
                disabled={capacitySubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={capacitySubmitting}>
                Save Capacity Telemetry
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 7. Add Facility Modal (POST /api/facilities) */}
      <Modal
        isOpen={isAddFacilityModalOpen}
        onClose={() => setIsAddFacilityModalOpen(false)}
        title="Register Medical Facility"
        maxWidth="600px"
      >
        {newFacilityError && (
          <ErrorMessage title="Registration Failed" message={newFacilityError} />
        )}

        <form onSubmit={handleCreateFacility} noValidate>
          <div className="form-row">
            <Input
              label="Facility Name"
              name="name"
              placeholder="e.g. City Central Hospital"
              value={newFacilityForm.name}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <div className="form-group">
              <label htmlFor="newFacilityType" className="form-label">
                Facility Type <span className="required-star">*</span>
              </label>
              <select
                id="newFacilityType"
                name="facilityType"
                className="form-input form-select"
                value={newFacilityForm.facilityType}
                onChange={(e) =>
                  setNewFacilityForm((prev) => ({ ...prev, facilityType: e.target.value }))
                }
                required
              >
                <option value="hospital">Hospital</option>
                <option value="trauma_center">Trauma Center</option>
                <option value="urgent_care">Urgent Care Clinic</option>
                <option value="clinic">Outpatient Clinic</option>
                <option value="pharmacy">Medical Pharmacy</option>
              </select>
            </div>
          </div>

          <Input
            label="Street Address"
            name="street"
            placeholder="e.g. 1200 Health Parkway"
            value={newFacilityForm.street}
            onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, street: e.target.value }))}
            required
          />

          <div className="form-row">
            <Input
              label="City"
              name="city"
              value={newFacilityForm.city}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, city: e.target.value }))}
            />
            <Input
              label="State"
              name="state"
              value={newFacilityForm.state}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, state: e.target.value }))}
            />
            <Input
              label="Zip Code"
              name="zipCode"
              value={newFacilityForm.zipCode}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, zipCode: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <Input
              label="Latitude"
              name="latitude"
              type="number"
              step="0.001"
              value={newFacilityForm.latitude}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, latitude: e.target.value }))}
              required
            />
            <Input
              label="Longitude"
              name="longitude"
              type="number"
              step="0.001"
              value={newFacilityForm.longitude}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, longitude: e.target.value }))}
              required
            />
            <Input
              label="Emergency Phone"
              name="contactPhone"
              value={newFacilityForm.contactPhone}
              onChange={(e) => setNewFacilityForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
            />
          </div>

          <div className="capacity-grid-3">
            <Input
              label="Total Beds"
              name="totalBeds"
              type="number"
              min="0"
              value={newFacilityForm.totalBeds}
              onChange={(e) =>
                setNewFacilityForm((prev) => ({ ...prev, totalBeds: parseInt(e.target.value, 10) || 0 }))
              }
            />
            <Input
              label="Available Beds"
              name="availableBeds"
              type="number"
              min="0"
              value={newFacilityForm.availableBeds}
              onChange={(e) =>
                setNewFacilityForm((prev) => ({ ...prev, availableBeds: parseInt(e.target.value, 10) || 0 }))
              }
            />
            <Input
              label="ICU Units"
              name="icuAvailable"
              type="number"
              min="0"
              value={newFacilityForm.icuAvailable}
              onChange={(e) =>
                setNewFacilityForm((prev) => ({ ...prev, icuAvailable: parseInt(e.target.value, 10) || 0 }))
              }
            />
          </div>

          <Input
            label="Capabilities (Comma-separated)"
            name="capabilities"
            placeholder="e.g. icu, trauma, stroke, cardiac"
            value={newFacilityForm.capabilities}
            onChange={(e) =>
              setNewFacilityForm((prev) => ({ ...prev, capabilities: e.target.value }))
            }
            helperText="Separate multiple capabilities with commas"
          />

          <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
            <Button
              variant="secondary"
              onClick={() => setIsAddFacilityModalOpen(false)}
              disabled={newFacilitySubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={newFacilitySubmitting}>
              Register Facility
            </Button>
          </div>
        </form>
      </Modal>

      {/* 8. Reusable Dispatch Modal pre-routed for Facility */}
      <NewDispatchModal
        isOpen={isDispatchModalOpen}
        initialValues={dispatchModalInitialValues}
        facilities={facilities}
        onClose={() => setIsDispatchModalOpen(false)}
        onSuccess={() => {
          setIsDispatchModalOpen(false);
        }}
      />
    </div>
  );
};

export default FacilitiesPage;
