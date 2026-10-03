import React from 'react';

/**
 * Reusable Card component with header, content body, and optional footer
 */
export const Card = ({
  title,
  subtitle,
  headerRight,
  children,
  footer,
  className = '',
  ...props
}) => {
  const hasHeader = Boolean(title || subtitle || headerRight);

  return (
    <div className={`card ${className}`.trim()} {...props}>
      {hasHeader && (
        <div className="card-header">
          <div className="card-header-titles">
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {headerRight && <div className="card-header-actions">{headerRight}</div>}
        </div>
      )}

      <div className="card-body">{children}</div>

      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};

export default Card;
