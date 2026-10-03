import React from 'react';

/**
 * Reusable Facility Status Widget showing live emergency capacity, ICU status, and dispatch intake
 */
export const FacilityStatusWidget = ({ facility, onQuickDispatch }) => {
  const {
    name,
    facilityType,
    address,
    capabilities = [],
    emergencyCapacity = {},
    contactPhone,
    isOpen24Hours,
  } = facility;

  const totalBeds = emergencyCapacity.totalBeds || 0;
  const availableBeds = emergencyCapacity.availableBeds || 0;
  const icuAvailable = emergencyCapacity.icuAvailable || 0;
  const status = (emergencyCapacity.status || 'normal').toLowerCase();

  const occupiedBeds = Math.max(0, totalBeds - availableBeds);
  const occupancyPercent = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const getStatusBadge = (st) => {
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

  const formatType = (type) => {
    if (!type) return 'HOSPITAL';
    return type.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className={`facility-widget ${status === 'divert' ? 'widget-divert' : status === 'critical' ? 'widget-critical' : ''}`}>
      <div className="facility-widget-header">
        <div>
          <div className="facility-type-row">
            <span className="facility-type-tag">{formatType(facilityType)}</span>
            {isOpen24Hours && <span className="facility-247-tag">24/7 OPEN</span>}
          </div>
          <h4 className="facility-name">{name}</h4>
          {address && (
            <p className="facility-location">
              📍 {address.street ? `${address.street}, ` : ''}{address.city || 'Metro City'}
            </p>
          )}
        </div>
        <div className="facility-status-col">
          {getStatusBadge(status)}
        </div>
      </div>

      {/* Bed Occupancy Meter */}
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

      {/* Key Metrics Strip (ICU, Capabilities) */}
      <div className="facility-details-row">
        <div className="icu-pill">
          <span className="icu-icon">🫀</span>
          <span>ICU Available: <strong>{icuAvailable}</strong></span>
        </div>

        {contactPhone && (
          <a href={`tel:${contactPhone}`} className="facility-phone-link">
            📞 {contactPhone}
          </a>
        )}
      </div>

      {/* Capabilities tags */}
      {capabilities.length > 0 && (
        <div className="facility-capabilities">
          {capabilities.slice(0, 4).map((cap, i) => (
            <span key={i} className="capability-tag">
              {cap.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Quick Action */}
      <div className="facility-widget-action">
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-full"
          onClick={() => onQuickDispatch && onQuickDispatch(facility)}
        >
          ✚ Dispatch Patient Here
        </button>
      </div>
    </div>
  );
};

export default FacilityStatusWidget;
