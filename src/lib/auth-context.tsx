import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'FORM_ISSUER' | 'VETTING_PANEL';
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<{ error?: string }>;
  hasRole: (roles: string[]) => boolean;
  hasAreaAccess: (areaCode?: string) => boolean;
  userAreas: string[];
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'FORM_ISSUER' | 'VETTING_PANEL';
  areaCodes?: string[];
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userAreas, setUserAreas] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setUserAreas(data.userAreas || []);
      }
    } catch (err) {
      console.error('Session check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Login failed' };
      }
      setUser(data.user);
      setUserAreas(data.userAreas || []);
      return {};
    } catch (err) {
      return { error: 'Network error' };
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setUserAreas([]);
    router.push('/login');
  };

  const register = async (data: RegisterData) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        return { error: result.error || 'Registration failed' };
      }
      return {};
    } catch (err) {
      return { error: 'Network error' };
    }
  };

  const hasRole = (roles: string[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const hasAreaAccess = (areaCode?: string) => {
    if (!areaCode) return true;
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'FORM_ISSUER') return true;
    return userAreas.includes(areaCode);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, hasRole, hasAreaAccess, userAreas }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
