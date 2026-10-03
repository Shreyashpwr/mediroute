import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Input from '../components/Input.jsx';
import Button from '../components/Button.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const LoginPage = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If already authenticated, redirect to target page or /
  useEffect(() => {
    if (isAuthenticated) {
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const validate = () => {
    const errors = {};
    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
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

  const fillDemoCredentials = (email, password) => {
    setFormData({ email, password });
    setValidationErrors({});
    setError(null);
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

    try {
      await login(formData.email.trim(), formData.password);
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isPendingError = error?.toLowerCase()?.includes('awaiting administrator approval');
  const isRejectedError = error?.toLowerCase()?.includes('rejected');

  return (
    <div className="auth-page-container">
      <Card
        className="auth-card"
        title="Sign In to MediRoute"
        subtitle="Operations Command, Regional Ambulances & Healthcare Network"
      >
        {isPendingError ? (
          <div className="alert-banner alert-banner-pending">
            <span className="alert-icon">⏳</span>
            <div className="alert-body">
              <strong>Account Pending Review:</strong>
              <p>Your account is awaiting administrator approval. You will be able to sign in once an administrator approves your registration.</p>
            </div>
          </div>
        ) : isRejectedError ? (
          <div className="alert-banner alert-banner-rejected">
            <span className="alert-icon">🚫</span>
            <div className="alert-body">
              <strong>Account Rejected:</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : error ? (
          <ErrorMessage title="Authentication Failed" message={error} />
        ) : null}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="e.g. admin@mediroute.io"
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
            placeholder="Enter account password"
            value={formData.password}
            onChange={handleChange}
            error={validationErrors.password}
            disabled={loading}
            required
            autoComplete="current-password"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            disabled={loading}
            className="btn-auth-submit"
          >
            Sign In to Command Center
          </Button>

          {/* Quick Demo Access Bar */}
          <div className="demo-credentials-deck">
            <span className="demo-deck-label">⚡ Quick Demo Sign-In:</span>
            <div className="demo-pills-row">
              <button
                type="button"
                className="demo-pill admin-pill"
                onClick={() => fillDemoCredentials('admin@mediroute.io', 'Admin@123456')}
              >
                🛡️ Admin
              </button>
              <button
                type="button"
                className="demo-pill dispatcher-pill"
                onClick={() => fillDemoCredentials('rajesh.dispatcher@mediroute.in', 'Password@123')}
              >
                📻 Dispatcher
              </button>
              <button
                type="button"
                className="demo-pill doctor-pill"
                onClick={() => fillDemoCredentials('dr.arun.joshi@mediroute.in', 'Password@123')}
              >
                🩺 Medical Staff
              </button>
              <button
                type="button"
                className="demo-pill driver-pill"
                onClick={() => fillDemoCredentials('sachin.driver@mediroute.in', 'Password@123')}
              >
                🚑 Transport Driver
              </button>
              <button
                type="button"
                className="demo-pill pending-pill"
                onClick={() => fillDemoCredentials('kunal.applicant@mediroute.in', 'Password@123')}
                title="Click to test pending approval block"
              >
                ⏳ Pending Test
              </button>
            </div>
          </div>

          <div className="auth-switch">
            <span>Don't have an operational account? </span>
            <Link to="/register" className="text-link">
              Submit Registration
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default LoginPage;
