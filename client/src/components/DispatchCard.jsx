import React, { useState } from 'react';
import api from '../services/api.js';

export const DispatchCard = ({ dispatch, onStatusUpdated }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);

  // AI Route Optimization states
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [showRouteDetails, setShowRouteDetails] = useState(false);

  const getTriageBadge = (level) => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return <span className="triage-badge badge-critical">CRITICAL</span>;
      case 'urgent':
        return <span className="triage-badge badge-urgent">URGENT</span>;
      case 'standard':
      default:
        return <span className="triage-badge badge-standard">STANDARD</span>;
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'status-pill-completed';
      case 'en_route':
        return 'status-pill-enroute';
      case 'arrived':
        return 'status-pill-arrived';
      case 'assigned':
        return 'status-pill-assigned';
      case 'cancelled':
        return 'status-pill-cancelled';
      case 'pending':
      default:
        return 'status-pill-pending';
    }
  };

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (newStatus === dispatch.status) return;

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const response = await api.updateDispatchStatus(dispatch._id, newStatus);
      if (onStatusUpdated) {
        onStatusUpdated(response.data);
      }
    } catch (err) {
      setUpdateError(err.message || 'Status update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOptimizeRoute = async () => {
    setIsOptimizingRoute(true);
    setRouteError(null);

    try {
      const origin = dispatch.pickupLocation || { address: 'Current Location' };
      const destFacility = dispatch.destinationFacility;
      const destination = destFacility
        ? {
            address: destFacility.name || destFacility.address?.street || 'Medical Care Center',
            latitude: destFacility.location?.coordinates?.[1] || 40.75,
            longitude: destFacility.location?.coordinates?.[0] || -73.99,
          }
        : {
            address: 'Metro Emergency Intake Center',
            latitude: 40.74,
            longitude: -73.98,
          };

      const res = await api.optimizeRoute({
        origin: {
          address: origin.address || 'Pickup Point',
          latitude: origin.coordinates?.latitude || 40.75,
          longitude: origin.coordinates?.longitude || -74.0,
        },
        destination,
        trafficCondition: 'moderate',
        triageLevel: dispatch.triageLevel,
        vehicleType: dispatch.vehicleType,
      });

      if (res.data) {
        setOptimizedRoute(res.data);
        setShowRouteDetails(true);
      }
    } catch (err) {
      setRouteError(err.message || 'Route optimization analysis was unable to complete.');
    } finally {
      setIsOptimizingRoute(false);
    }
  };

  const formatVehicleType = (type) => {
    if (!type) return 'Standard Transport';
    return type
      .split('_')
      .map((w) => w.toUpperCase())
      .join(' ');
  };

  return (
    <div className={`dispatch-card ${dispatch.triageLevel === 'critical' ? 'critical-border' : ''}`}>
      {/* Top Header */}
      <div className="dispatch-header">
        <div className="dispatch-id-wrap">
          <span className="dispatch-number">{dispatch.dispatchNumber}</span>
          {getTriageBadge(dispatch.triageLevel)}
        </div>

        <div className="dispatch-status-control">
          {isUpdating && <span className="dispatch-updating-tag">Updating...</span>}
          <select
            className={`status-select ${getStatusBadgeClass(dispatch.status)}`}
            value={dispatch.status}
            onChange={handleStatusChange}
            disabled={isUpdating}
            aria-label="Update dispatch status"
          >
            <option value="pending">PENDING</option>
            <option value="assigned">ASSIGNED</option>
            <option value="en_route">EN ROUTE</option>
            <option value="arrived">ARRIVED</option>
            <option value="completed">COMPLETED</option>
            <option value="cancelled">CANCELLED</option>
          </select>
        </div>
      </div>

      {updateError && (
        <div className="dispatch-card-error">
          <span>⚠️ {updateError}</span>
        </div>
      )}

      {/* Patient & Vehicle Row */}
      <div className="dispatch-patient-row">
        <div>
          <h4 className="patient-name">{dispatch.patientName}</h4>
          {dispatch.contactPhone && (
            <span className="patient-phone">📞 {dispatch.contactPhone}</span>
          )}
        </div>
        <div className="dispatch-vehicle-tag">
          🚑 {formatVehicleType(dispatch.vehicleType)}
        </div>
      </div>

      {/* Route Coordinates / Locations */}
      <div className="dispatch-route-details">
        <div className="route-point">
          <span className="point-icon pickup">📍</span>
          <div className="point-text">
            <span className="point-label">Pickup</span>
            <span className="point-address">{dispatch.pickupLocation?.address || 'Address not specified'}</span>
          </div>
        </div>

        <div className="route-divider-line"></div>

        <div className="route-point">
          <span className="point-icon dest">🏥</span>
          <div className="point-text">
            <span className="point-label">Destination Facility</span>
            <span className="point-address">
              {dispatch.destinationFacility?.name || 'Nearest Available Care Center'}
            </span>
          </div>
        </div>
      </div>

      {/* Symptoms tags */}
      {dispatch.symptoms && dispatch.symptoms.length > 0 && (
        <div className="dispatch-symptoms">
          {dispatch.symptoms.map((symptom, i) => (
            <span key={`${symptom}-${i}`} className="symptom-tag">
              {symptom}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {dispatch.notes && (
        <div className="dispatch-notes">
          <span className="notes-label">Notes:</span> {dispatch.notes}
        </div>
      )}

      {/* Gemini AI Clinical Triage Assessment */}
      {dispatch.aiAssessment && (
        <div className="dispatch-ai-section">
          <div className="ai-section-header">
            <span className="ai-badge">✨ Gemini AI Assessment</span>
            {dispatch.aiAssessment.urgencyScore && (
              <span className="ai-score-pill">Urgency: {dispatch.aiAssessment.urgencyScore}/10</span>
            )}
            {dispatch.aiAssessment.recommendedFacilityType && (
              <span className="ai-sub-pill">
                {dispatch.aiAssessment.recommendedFacilityType.replace('_', ' ').toUpperCase()}
              </span>
            )}
          </div>
          {dispatch.aiAssessment.summary && (
            <p className="ai-summary-text">{dispatch.aiAssessment.summary}</p>
          )}
          {dispatch.aiAssessment.recommendations && dispatch.aiAssessment.recommendations.length > 0 && (
            <div className="ai-recs-wrap">
              <span className="ai-recs-title">Triage Directives:</span>
              <ul className="ai-recs-list">
                {dispatch.aiAssessment.recommendations.map((rec, idx) => (
                  <li key={idx}>✓ {rec}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="ai-decision-disclaimer">
            <span>ℹ️ AI-Assisted Recommendation: Decision-support only. Final triage confirmed by authorized staff.</span>
          </div>
        </div>
      )}

      {/* AI Route Optimization Action & Drawer */}
      <div className="dispatch-route-opt-bar">
        <button
          type="button"
          className="btn-opt-route"
          onClick={handleOptimizeRoute}
          disabled={isOptimizingRoute}
        >
          {isOptimizingRoute ? 'Calculating Transit Corridor...' : '✨ AI Optimize Route & Hazards'}
        </button>
      </div>

      {routeError && (
        <div className="route-opt-error">⚠️ {routeError}</div>
      )}

      {showRouteDetails && optimizedRoute && (
        <div className="route-opt-drawer">
          <div className="route-opt-header">
            <span className="route-opt-corridor">🛣️ {optimizedRoute.recommendedRouteName}</span>
            {optimizedRoute.estimatedTimeSavedMinutes > 0 && (
              <span className="route-saved-pill">
                ⏱️ Est. {optimizedRoute.estimatedTimeSavedMinutes} min saved
              </span>
            )}
          </div>
          <p className="route-opt-reasoning">{optimizedRoute.reasoning}</p>
          {optimizedRoute.priorityLaneEligible && (
            <div className="route-priority-badge">🚨 Emergency Priority Lane Access Authorized</div>
          )}
          {optimizedRoute.avoidedHazards && optimizedRoute.avoidedHazards.length > 0 && (
            <div className="route-hazards-wrap">
              <span className="hazards-title">Avoided Bottlenecks:</span>
              <div className="hazards-tags">
                {optimizedRoute.avoidedHazards.map((h, i) => (
                  <span key={i} className="hazard-tag">🛡️ {h}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Meta */}
      <div className="dispatch-footer">
        <span className="dispatch-time">
          Created:{' '}
          {dispatch.createdAt && !isNaN(new Date(dispatch.createdAt).getTime())
            ? new Date(dispatch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now'}
        </span>
        <span className="dispatch-driver">
          {dispatch.assignedDriver
            ? `Driver: ${dispatch.assignedDriver.name || 'Assigned'}`
            : 'Driver: Unassigned'}
        </span>
      </div>
    </div>
  );
};

export default DispatchCard;
