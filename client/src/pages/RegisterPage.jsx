import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Input from '../components/Input.jsx';
import Button from '../components/Button.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const RegisterPage = () => {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'dispatcher',
    phone: '',
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registeredPendingUser, setRegisteredPendingUser] = useState(null);

  // If already authenticated, redirect to /
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const validate = () => {
    const errors = {};
    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!formData.name.trim()) {
      errors.name = 'Full name is required';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters long';
    }

    return errors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      role: formData.role,
      phone: formData.phone.trim() || undefined,
    };

    try {
      const res = await register(payload);
      setRegisteredPendingUser({
        name: payload.name,
        email: payload.email,
        role: payload.role,
        message: res?.message || 'Your account is awaiting administrator approval.',
      });
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  if (registeredPendingUser) {
    return (
      <div className="auth-page-container">
        <Card className="auth-card status-success-card" title="Registration Submitted">
          <div className="registration-pending-box">
            <div className="pending-icon-large">⏳</div>
            <h3 className="pending-heading">Awaiting Administrator Approval</h3>
            <p className="pending-message">
              Thank you, <strong>{registeredPendingUser.name}</strong>. Your account has been registered
              with status <strong>PENDING</strong>.
            </p>
            <p className="pending-subtext">
              For operational security, an authorized administrator must review and approve your account
              before you can access the emergency dispatch console and live telemetry.
            </p>

            <div className="pending-summary-details">
              <div><strong>Registered Email:</strong> {registeredPendingUser.email}</div>
              <div><strong>Requested Role:</strong> {registeredPendingUser.role.replace('_', ' ')}</div>
            </div>

            <div className="pending-actions">
              <Link to="/login">
                <Button variant="primary" size="lg">
                  Proceed to Sign In
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-page-container">
      <Card
        className="auth-card"
        title="Create an Operational Account"
        subtitle="Register for MediRoute Emergency Logistics & Command Console"
      >
        {error && <ErrorMessage title="Registration Failed" message={error} />}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <Input
            label="Full Name"
            name="name"
            type="text"
            placeholder="e.g. Rajesh Sharma"
            value={formData.name}
            onChange={handleChange}
            error={validationErrors.name}
            disabled={loading}
            required
            autoComplete="name"
          />

          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="e.g. rajesh.sharma@mediroute.in"
            value={formData.email}
            onChange={handleChange}
            error={validationErrors.email}
            disabled={loading}
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="Minimum 6 characters"
            value={formData.password}
            onChange={handleChange}
            error={validationErrors.password}
            helperText="Must be at least 6 characters long"
            disabled={loading}
            required
            autoComplete="new-password"
          />

          <div className="form-group">
            <label htmlFor="role-select" className="form-label">
              Operational Role <span className="required-star">*</span>
            </label>
            <select
              id="role-select"
              name="role"
              className="form-input form-select"
              value={formData.role}
              onChange={handleChange}
              disabled={loading}
              required
            >
              <option value="dispatcher">Emergency Dispatcher</option>
              <option value="medical_staff">Medical Staff / Hospital Liaison</option>
              <option value="transport_operator">Ambulance / Transport Operator</option>
              <option value="patient">Patient / Caregiver</option>
            </select>
            <small className="form-helper-text">
              Note: Public registration accounts require administrative approval prior to activation.
            </small>
          </div>

          <Input
            label="Contact Phone"
            name="phone"
            type="tel"
            placeholder="e.g. +91 98220 12345"
            value={formData.phone}
            onChange={handleChange}
            disabled={loading}
            autoComplete="tel"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            disabled={loading}
            className="btn-auth-submit"
          >
            Submit for Approval
          </Button>

          <div className="auth-switch">
            <span>Already have an account? </span>
            <Link to="/login" className="text-link">
              Sign In
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default RegisterPage;
