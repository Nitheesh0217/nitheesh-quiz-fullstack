'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiCall } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  school_id: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (userData: AuthUser) => void;
  logout: () => Promise<void>;
  hasRole: (role: 'student' | 'teacher' | 'admin') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      try {
        const userData = await apiCall('/api/auth/me');
        if (userData) {
          setUser({
            id: userData.user_id || userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            school_id: userData.school_id,
          });
        }
      } catch (err) {
        console.error('Session verification failed', err);
      } finally {
        setIsLoading(false);
      }
    }

    checkSession();
  }, []);

  const login = (userData: AuthUser) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout request failed', err);
    } finally {
      setUser(null);
      localStorage.clear();
      router.push('/login');
    }
  };

  const hasRole = (role: 'student' | 'teacher' | 'admin') => {
    return user?.role === role;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
