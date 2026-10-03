import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(api.getToken());
  const [loading, setLoading] = useState(true);

  // Restore authenticated session on initial mount
  const checkAuthStatus = useCallback(async () => {
    const existingToken = api.getToken();
    if (!existingToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    try {
      const response = await api.getCurrentUser();
      if (response.data) {
        setUser(response.data);
        setToken(existingToken);
      } else {
        api.removeToken();
        setUser(null);
        setToken(null);
      }
    } catch {
      // If token is invalid or expired, clean up session
      api.removeToken();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();

    // Listen for 401 unauthorized / session expiry event from API service
    const handleAuthExpired = () => {
      api.removeToken();
      setUser(null);
      setToken(null);
    };

    window.addEventListener('mediroute:auth_expired', handleAuthExpired);
    return () => {
      window.removeEventListener('mediroute:auth_expired', handleAuthExpired);
    };
  }, [checkAuthStatus]);

  const login = async (email, password) => {
    const response = await api.login({ email, password });
    const { token: receivedToken, user: receivedUser } = response.data;

    api.setToken(receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);

    return response.data;
  };

  const register = async (userData) => {
    const response = await api.register(userData);
    const { token: receivedToken, user: receivedUser } = response.data || {};

    if (receivedToken && receivedUser?.approvalStatus === 'approved') {
      api.setToken(receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
    }

    return response.data;
  };

  const logout = () => {
    api.removeToken();
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(user && token),
    isAdmin: user?.role === 'admin',
    isDispatcher: user?.role === 'dispatcher' || user?.role === 'admin',
    isApproved: user?.approvalStatus === 'approved',
    approvalStatus: user?.approvalStatus,
    login,
    register,
    logout,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
