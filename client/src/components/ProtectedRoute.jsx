import React from 'react';
import { Navigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import Button from './Button.jsx';

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading, checkAuthStatus, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: '4rem 1rem', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner message="Verifying authentication session..." size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Account is awaiting administrator approval
  if (user?.approvalStatus === 'pending') {
    return (
      <div className="approval-status-screen">
        <div className="status-modal-card">
          <div className="status-icon-wrap pending-pulse">
            <span className="status-emoji">⏳</span>
          </div>
          <h2 className="status-title">Account Awaiting Administrator Approval</h2>
          <p className="status-description">
            Your registration has been received and is currently under administrative review.
            Operational medical logistics, live ambulance tracking, and dispatch control are
            restricted to approved personnel.
          </p>

          <div className="user-details-summary">
            <div className="summary-row">
              <span className="summary-label">Registered Name:</span>
              <span className="summary-value">{user.name}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Account Email:</span>
              <span className="summary-value">{user.email}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Requested Role:</span>
              <span className="summary-value badge-role">{user.role?.replace('_', ' ')}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Current Status:</span>
              <span className="summary-value badge-status-pending">Pending Review</span>
            </div>
          </div>

          <div className="status-actions">
            <Button variant="primary" onClick={() => checkAuthStatus()}>
              🔄 Check Approval Status
            </Button>
            <Button variant="secondary" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Account was rejected
  if (user?.approvalStatus === 'rejected') {
    return (
      <div className="approval-status-screen">
        <div className="status-modal-card status-rejected-card">
          <div className="status-icon-wrap rejected-icon">
            <span className="status-emoji">🚫</span>
          </div>
          <h2 className="status-title">Access Denied: Application Rejected</h2>
          <p className="status-description">
            Your account application was reviewed and rejected by the system administrator.
          </p>
          {user.rejectionReason && (
            <div className="rejection-reason-box">
              <strong>Reason:</strong> {user.rejectionReason}
            </div>
          )}
          <div className="status-actions">
            <Button variant="secondary" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Role-based authorization check
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return (
      <div className="approval-status-screen">
        <div className="status-modal-card">
          <div className="status-icon-wrap restricted-icon">
            <span className="status-emoji">🔒</span>
          </div>
          <h2 className="status-title">Access Restricted</h2>
          <p className="status-description">
            Your role <strong>({user?.role})</strong> is not authorized to access this operational area.
          </p>
          <div className="status-actions">
            <Link to="/">
              <Button variant="primary">Return to Operations Command</Button>
            </Link>
            <Button variant="secondary" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
