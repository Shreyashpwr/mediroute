import React from 'react';
import Button from './Button.jsx';

/**
 * Reusable Error Message component with retry option
 */
export const ErrorMessage = ({
  title = 'An error occurred',
  message,
  onRetry,
  retryLabel = 'Try Again',
  className = '',
}) => {
  return (
    <div className={`error-box ${className}`.trim()} role="alert">
      <div className="error-icon" aria-hidden="true">⚠️</div>
      <div className="error-content">
        <h4 className="error-title">{title}</h4>
        {message && <p className="error-description">{message}</p>}
        {onRetry && (
          <div className="error-actions">
            <Button variant="outline" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
