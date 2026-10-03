import React from 'react';

/**
 * Reusable Loading Spinner component supporting message, fullScreen, and size
 */
export const LoadingSpinner = ({
  message = 'Loading...',
  fullScreen = false,
  size = 'md', // 'sm' | 'md' | 'lg'
}) => {
  const content = (
    <div className={`spinner-container spinner-${size}`}>
      <div className="spinner" aria-label="Loading animation" role="status"></div>
      {message && <p className="spinner-label">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="spinner-fullscreen-overlay">{content}</div>;
  }

  return content;
};

export default LoadingSpinner;
