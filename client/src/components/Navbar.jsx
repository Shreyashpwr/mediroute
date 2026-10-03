import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const Navbar = () => {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    closeMobileMenu();
    navigate('/login');
  };

  const getNavLinkClass = ({ isActive }) =>
    `nav-link ${isActive ? 'nav-link-active' : ''}`;

  return (
    <header className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand" onClick={closeMobileMenu}>
          <span className="brand-icon">🚨</span>
          <span className="brand-name">MediRoute <span className="brand-badge-ops">OPS</span></span>
        </Link>

        {/* Mobile menu toggle */}
        <button
          className="mobile-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>

        {/* Nav Links */}
        <nav className={`navbar-nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
          <div className="nav-links">
            <NavLink to="/" className={getNavLinkClass} onClick={closeMobileMenu} end>
              Command Deck
            </NavLink>
            <NavLink to="/dispatches" className={getNavLinkClass} onClick={closeMobileMenu}>
              Dispatches
            </NavLink>
            <NavLink to="/facilities" className={getNavLinkClass} onClick={closeMobileMenu}>
              Hospital Network
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin/users" className={getNavLinkClass} onClick={closeMobileMenu}>
                🛡️ Admin Dashboard
              </NavLink>
            )}
          </div>

          <div className="nav-actions">
            {isAuthenticated ? (
              <div className="nav-user-cluster">
                <div className="nav-user-meta">
                  <span className="nav-user-avatar">
                    {(user?.name || 'U').charAt(0).toUpperCase()}
                  </span>
                  <div className="nav-user-text">
                    <span className="nav-user-name">{user?.name}</span>
                    <span className="nav-user-role-tag">
                      {user?.role?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-logout"
                  onClick={handleLogout}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <>
                <NavLink to="/login" className={getNavLinkClass} onClick={closeMobileMenu}>
                  Sign In
                </NavLink>
                <Link
                  to="/register"
                  className="btn btn-primary btn-sm btn-nav-cta"
                  onClick={closeMobileMenu}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
