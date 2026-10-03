import React from 'react';
import Button from './Button.jsx';

/**
 * Reusable Empty State component for missing or initial data
 */
export const EmptyState = ({
  icon = '📋',
  title = 'No records found',
  description = 'There is currently no data available to display.',
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {actionLabel && onAction && (
        <div className="empty-state-action">
          <Button variant="primary" size="md" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
