import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  registerAccount,
} from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const refreshSession = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await getCurrentUser();
      setUser(response.data);
      setSessionError('');
    } catch (error) {
      setUser(null);
      if (error.status !== 401) {
        setSessionError(error.message || 'The current session could not be checked.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    const handleUnauthorized = () => {
      setUser(null);
      setSessionError('Your session expired. Please sign in again.');
    };

    window.addEventListener('peoplehub:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('peoplehub:unauthorized', handleUnauthorized);
  }, [refreshSession]);

  const signIn = useCallback(async (credentials) => {
    const response = await loginRequest(credentials);
    setUser(response.data);
    setSessionError('');
    return response.data;
  }, []);

  const register = useCallback(async (account) => {
    const response = await registerAccount(account);
    if (account.registrationSource !== 'onboarding') {
      setUser(response.data);
    }
    setSessionError('');
    return response.data;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      setSessionError('Could not sign out on the server. Your local session was cleared.');
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      sessionError,
      refreshSession,
      signIn,
      register,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
