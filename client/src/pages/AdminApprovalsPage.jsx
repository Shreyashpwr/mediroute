import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';

export const AdminApprovalsPage = () => {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'approved' | 'rejected'
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Approval modal state (for optional role override)
  const [approvingUser, setApprovingUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('dispatcher');

  // Rejection modal state
  const [rejectingUser, setRejectingUser] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch count metrics across all statuses
  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        api.getPendingUsers(),
        api.getUsers({ approvalStatus: 'approved' }),
        api.getUsers({ approvalStatus: 'rejected' }),
      ]);
      setCounts({
        pending: Array.isArray(pendingRes.data) ? pendingRes.data.length : 0,
        approved: Array.isArray(approvedRes.data) ? approvedRes.data.length : 0,
        rejected: Array.isArray(rejectedRes.data) ? rejectedRes.data.length : 0,
      });
    } catch {
      // Non-critical metric count failure
    }
  }, []);

  // Fetch users based on current tab filter
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data = [];
      if (activeTab === 'pending') {
        const res = await api.getPendingUsers();
        data = res.data || [];
      } else {
        const res = await api.getUsers({ approvalStatus: activeTab });
        data = res.data || [];
      }
      setUsers(Array.isArray(data) ? data : []);
      fetchCounts();
    } catch (err) {
      setError(err.message || 'Failed to load user approval requests.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchCounts]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Clear success messages after 6 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Direct 1-click quick approval using user's requested role
  const handleQuickApprove = async (user) => {
    const userId = user._id || user.id;
    if (!userId) return;

    setActionLoading(true);
    setError(null);
    try {
      await api.approveUser(userId, { role: user.role || 'dispatcher' });
      setSuccessMessage(`Account for ${user.name} (${user.email}) has been APPROVED successfully as ${user.role || 'dispatcher'}. User can now sign in.`);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to approve account.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open modal for approval with role customization
  const handleOpenApproveModal = (user) => {
    setApprovingUser(user);
    setSelectedRole(user.role || 'dispatcher');
  };

  // Confirm approval from modal
  const handleConfirmApproval = async () => {
    if (!approvingUser) return;
    const userId = approvingUser._id || approvingUser.id;

    setActionLoading(true);
    setError(null);
    try {
      await api.approveUser(userId, { role: selectedRole });
      setSuccessMessage(`Account for ${approvingUser.name} (${approvingUser.email}) approved successfully as ${selectedRole}.`);
      setApprovingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to approve account.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open modal for rejection
  const handleOpenRejectModal = (user) => {
    setRejectingUser(user);
    setRejectionReason('Application criteria or operational credential verification requirements not met.');
  };

  // Confirm rejection from modal
  const handleConfirmRejection = async () => {
    if (!rejectingUser) return;
    const userId = rejectingUser._id || rejectingUser.id;

    setActionLoading(true);
    setError(null);
    try {
      await api.rejectUser(userId, { rejectionReason });
      setSuccessMessage(`Account application for ${rejectingUser.name} (${rejectingUser.email}) has been REJECTED.`);
      setRejectingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to reject account.');
    } finally {
      setActionLoading(false);
    }
  };

  // Change role for already approved user
  const handleChangeRole = async (userId, newRole) => {
    setActionLoading(true);
    try {
      await api.updateUserRole(userId, newRole);
      setSuccessMessage('User role updated successfully.');
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user role.');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter users by search query
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-approvals-page-container">
      {/* 1. Header Banner */}
      <section className="control-center-banner admin-banner">
        <div className="banner-left">
          <div className="live-indicator-tag admin-tag">
            <span className="pulsing-radar-dot admin-dot"></span>
            <span>ADMINISTRATIVE OPERATIONS CONTROL</span>
          </div>
          <h1 className="control-center-title">Admin Approval Dashboard</h1>
          <p className="control-center-subtitle">
            Authorize new responder registrations, verify credentials, assign operational roles, and manage emergency personnel access.
          </p>
        </div>
        <div className="banner-right">
          <Button variant="secondary" onClick={() => fetchUsers()} disabled={loading || actionLoading}>
            🔄 Refresh Directory
          </Button>
        </div>
      </section>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="alert-banner alert-banner-success">
          <span className="alert-icon">✓</span>
          <div className="alert-body">
            <strong>Security Confirmation:</strong>
            <p>{successMessage}</p>
          </div>
          <button className="alert-close-btn" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}

      {/* Error Notification Banner */}
      {error && <ErrorMessage title="Administrative Action Failed" message={error} onRetry={() => fetchUsers()} />}

      {/* 2. Navigation Tabs with Live Counts */}
      <div className="admin-tabs-nav">
        <button
          className={`admin-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Pending Approvals
          {counts.pending > 0 && <span className="tab-counter-badge badge-pending-count">{counts.pending}</span>}
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'approved' ? 'active' : ''}`}
          onClick={() => setActiveTab('approved')}
        >
          ✓ Approved Personnel
          <span className="tab-counter-badge">{counts.approved}</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'rejected' ? 'active' : ''}`}
          onClick={() => setActiveTab('rejected')}
        >
          🚫 Rejected Requests
          <span className="tab-counter-badge">{counts.rejected}</span>
        </button>
      </div>

      {/* 3. Search and Filter Bar */}
      <div className="admin-toolbar-row">
        <div className="admin-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="form-input admin-search-input"
            placeholder="Search by name, email, phone, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
        <div className="admin-status-summary-pills">
          <span className="summary-pill">
            Showing: <strong>{filteredUsers.length}</strong> of {users.length} accounts
          </span>
        </div>
      </div>

      {/* 4. Main Data Table Card */}
      <Card
        title={
          activeTab === 'pending'
            ? 'Pending Account Approvals'
            : activeTab === 'approved'
            ? 'Active Approved Personnel'
            : 'Rejected Account Applications'
        }
        subtitle={
          activeTab === 'pending'
            ? 'The following users registered and are awaiting administrator review. Access to operational emergency telemetry is blocked until approved.'
            : activeTab === 'approved'
            ? 'Verified personnel with active authorization to access dispatches, hospital data, and operational controls.'
            : 'Account applications declined due to incomplete verification or failed administrative checks.'
        }
      >
        {loading ? (
          <LoadingSpinner message="Querying administrative personnel directory..." size="lg" />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={activeTab === 'pending' ? '🎉' : '👥'}
            title={
              activeTab === 'pending'
                ? 'No Pending Approvals'
                : activeTab === 'approved'
                ? 'No Approved Accounts Found'
                : 'No Rejected Accounts'
            }
            description={
              activeTab === 'pending'
                ? 'All submitted personnel applications have been reviewed. New registrations will automatically appear here.'
                : searchQuery
                ? 'No accounts match your current search query.'
                : 'No records found in this category.'
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Requested Role</th>
                  <th>Registration Date</th>
                  <th>Approval Status</th>
                  {activeTab === 'rejected' && <th>Rejection Reason</th>}
                  {activeTab === 'approved' && <th>Approved By</th>}
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const userId = u._id || u.id;
                  const status = u.approvalStatus || 'pending';

                  return (
                    <tr key={userId} className="admin-table-row">
                      {/* Name */}
                      <td className="font-semibold">
                        <div className="user-name-cell">
                          <span className="user-avatar-circle">{u.name?.charAt(0) || 'U'}</span>
                          <div>
                            <span className="user-primary-name">{u.name}</span>
                            {u.role === 'admin' && <span className="admin-chip">ADMIN</span>}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="text-mono user-email-cell">{u.email}</td>

                      {/* Phone */}
                      <td>{u.phone || '—'}</td>

                      {/* Requested / Assigned Role */}
                      <td>
                        {activeTab === 'approved' && u.role !== 'admin' ? (
                          <select
                            className="form-input form-select mini-select role-changer"
                            value={u.role}
                            onChange={(e) => handleChangeRole(userId, e.target.value)}
                            disabled={actionLoading}
                            title="Change assigned role"
                          >
                            <option value="dispatcher">Dispatcher</option>
                            <option value="medical_staff">Medical Staff</option>
                            <option value="transport_operator">Transport Operator</option>
                            <option value="patient">Patient</option>
                          </select>
                        ) : (
                          <span className={`badge-role badge-role-${u.role}`}>
                            {u.role?.replace('_', ' ')}
                          </span>
                        )}
                      </td>

                      {/* Registration Date */}
                      <td>
                        <span className="date-time-cell">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }) : '—'}
                        </span>
                      </td>

                      {/* Approval Status */}
                      <td>
                        <span className={`badge-status badge-status-${status}`}>
                          {status.toUpperCase()}
                        </span>
                      </td>

                      {/* Rejection Reason (for rejected tab) */}
                      {activeTab === 'rejected' && (
                        <td className="rejection-reason-text">
                          {u.rejectionReason || 'No specific reason recorded.'}
                        </td>
                      )}

                      {/* Approved By (for approved tab) */}
                      {activeTab === 'approved' && (
                        <td>
                          {u.approvedBy?.name ? (
                            <span className="approved-by-tag">
                              🛡️ {u.approvedBy.name}
                            </span>
                          ) : (
                            <span className="text-muted">System Admin</span>
                          )}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="text-right table-actions-cell">
                        {status === 'pending' && (
                          <div className="action-buttons-group">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleQuickApprove(u)}
                              disabled={actionLoading}
                              title="Approve immediately with requested role"
                            >
                              ✓ Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenApproveModal(u)}
                              disabled={actionLoading}
                              title="Review & customize role before approving"
                            >
                              ⚙️ Role...
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleOpenRejectModal(u)}
                              disabled={actionLoading}
                              title="Reject registration request"
                            >
                              ✕ Reject
                            </Button>
                          </div>
                        )}

                        {status === 'rejected' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenApproveModal(u)}
                            disabled={actionLoading}
                          >
                            Reconsider & Approve
                          </Button>
                        )}

                        {status === 'approved' && u.role !== 'admin' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleOpenRejectModal(u)}
                            disabled={actionLoading}
                          >
                            Revoke Access
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Approve User Confirmation & Role Selection Modal */}
      {approvingUser && (
        <Modal
          isOpen={Boolean(approvingUser)}
          title={`Approve Account: ${approvingUser.name}`}
          onClose={() => setApprovingUser(null)}
        >
          <div className="modal-dialog-body">
            <p>
              Grant operational authorization to <strong>{approvingUser.email}</strong>.
              Review and confirm their assigned operational role permissions:
            </p>

            <div className="applicant-mini-summary">
              <div className="mini-row">
                <span className="mini-label">Applicant Name:</span>
                <span className="mini-value">{approvingUser.name}</span>
              </div>
              <div className="mini-row">
                <span className="mini-label">Contact Phone:</span>
                <span className="mini-value">{approvingUser.phone || '—'}</span>
              </div>
              <div className="mini-row">
                <span className="mini-label">Requested Role:</span>
                <span className="mini-value badge-role">{approvingUser.role?.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label htmlFor="confirm-role" className="form-label">
                Assigned Operational Role:
              </label>
              <select
                id="confirm-role"
                className="form-input form-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="dispatcher">Emergency Dispatcher (Telemetry & routing)</option>
                <option value="medical_staff">Medical Staff / Hospital ER intake</option>
                <option value="transport_operator">Ambulance Transport Operator / Driver</option>
                <option value="patient">Patient / Family Caregiver</option>
              </select>
            </div>

            <div className="modal-actions-bar" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setApprovingUser(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmApproval} isLoading={actionLoading}>
                ✓ Confirm & Activate Account
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject User Reason Confirmation Modal */}
      {rejectingUser && (
        <Modal
          isOpen={Boolean(rejectingUser)}
          title={`Reject Application: ${rejectingUser.name}`}
          onClose={() => setRejectingUser(null)}
        >
          <div className="modal-dialog-body">
            <p>
              Please enter the administrative reason for declining account access for{' '}
              <strong>{rejectingUser.email}</strong>:
            </p>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label htmlFor="reject-reason" className="form-label">
                Rejection Reason (will be displayed to applicant upon sign-in attempt):
              </label>
              <textarea
                id="reject-reason"
                className="form-input"
                rows="3"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Incomplete paramedic certification or unverifiable contact address"
                required
              />
            </div>

            <div className="modal-actions-bar" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setRejectingUser(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmRejection} isLoading={actionLoading}>
                ✕ Confirm Rejection
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminApprovalsPage;
