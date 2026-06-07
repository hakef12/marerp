import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface User {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  bodega_id?: string | null;
  bodega_nombre?: string | null;
  empresa: {
    id: string;
    nombre: string;
    plan: string;
    modulos_activos: {
      pos: boolean;
      inventario: boolean;
      contabilidad: boolean;
      rrhh: boolean;
      cocina: boolean;
      auditoria: boolean;
      bi: boolean;
    };
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Helpers JWT ──────────────────────────────────────────────────────────────

/** Decodifica el payload de un JWT (base64URL → base64 estándar antes de atob) */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    // base64URL usa - y _ en lugar de + y /; atob solo acepta base64 estándar
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      part.length + (4 - part.length % 4) % 4, '='
    );
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/** Segundos restantes antes de que expire el token (negativo = ya expiró) */
function segsRestantes(token: string): number {
  const p = decodeJwtPayload(token);
  if (!p?.exp) return -1;
  return Math.floor(p.exp - Date.now() / 1000);
}

// ── Refresh con Supabase Auth v1 ─────────────────────────────────────────────

async function doRefresh(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        publicAnonKey,
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return d.access_token
      ? { access_token: d.access_token, refresh_token: d.refresh_token ?? refreshToken }
      : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Persistir sesión ──────────────────────────────────────────────────────
  const persist = (at: string, rt: string, u: User) => {
    localStorage.setItem('erp_token',         at);
    localStorage.setItem('erp_refresh_token', rt);
    localStorage.setItem('erp_user',          JSON.stringify(u));
  };

  const clearStorage = () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_refresh_token');
    localStorage.removeItem('erp_user');
  };

  // ── Programar renovación automática (5 min antes de expirar) ─────────────
  const scheduleRenew = (at: string, rt: string, u: User) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const segs = segsRestantes(at);
    if (segs <= 0) return;
    const delay = Math.max((segs - 300) * 1000, 15_000); // min 15 s
    timerRef.current = setTimeout(async () => {
      const fresh = await doRefresh(rt);
      if (fresh) {
        setToken(fresh.access_token);
        persist(fresh.access_token, fresh.refresh_token, u);
        scheduleRenew(fresh.access_token, fresh.refresh_token, u);
      } else {
        // Refresh falló — cerrar sesión
        setToken(null); setUser(null); clearStorage();
      }
    }, delay);
  };

  // ── Inicialización: RESTAURAR siempre si hay datos, validar en background ─
  useEffect(() => {
    const savedToken   = localStorage.getItem('erp_token');
    const savedRefresh = localStorage.getItem('erp_refresh_token');
    const savedUser    = localStorage.getItem('erp_user');

    if (!savedToken || !savedUser) {
      setIsLoading(false);
      return;
    }

    let userData: User;
    try { userData = JSON.parse(savedUser); } catch { setIsLoading(false); return; }

    // RESTAURAR INMEDIATAMENTE — el usuario no ve la pantalla de login
    setToken(savedToken);
    setUser(userData);
    setIsLoading(false);

    // Toda la validación se hace en el siguiente tick para no anular
    // el estado optimista dentro del mismo batch de React.
    setTimeout(() => {
      const segs = segsRestantes(savedToken);

      if (segs > 60) {
        // Token válido por al menos 1 minuto → programar renovación proactiva
        if (savedRefresh) scheduleRenew(savedToken, savedRefresh, userData);
      } else if (savedRefresh) {
        // Token expirado o a punto de expirar → renovar ahora
        doRefresh(savedRefresh).then(fresh => {
          if (fresh) {
            setToken(fresh.access_token);
            persist(fresh.access_token, fresh.refresh_token, userData);
            scheduleRenew(fresh.access_token, fresh.refresh_token, userData);
          } else {
            // No se pudo renovar → cerrar sesión
            setToken(null); setUser(null); clearStorage();
          }
        });
      } else if (segs <= 0) {
        // Sin refresh_token y el token ya expiró → cerrar sesión
        setToken(null); setUser(null); clearStorage();
      }
      // Si segs > 0 pero < 60 y sin refresh: dejar correr, expirará solo
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Evento auth:unauthorized (401 del backend) → intentar renovar ─────────
  useEffect(() => {
    const handle = async () => {
      const rt = localStorage.getItem('erp_refresh_token');
      const su = localStorage.getItem('erp_user');
      if (rt && su) {
        const fresh = await doRefresh(rt);
        if (fresh) {
          const u: User = JSON.parse(su);
          setToken(fresh.access_token);
          persist(fresh.access_token, fresh.refresh_token, u);
          scheduleRenew(fresh.access_token, fresh.refresh_token, u);
          return;
        }
      }
      setToken(null); setUser(null); clearStorage();
    };
    window.addEventListener('auth:unauthorized', handle);
    return () => window.removeEventListener('auth:unauthorized', handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/server/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ email, password }),
      }
    );
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Error al iniciar sesión');
    }
    const data = await res.json();
    const rt = data.refresh_token ?? '';
    setToken(data.access_token);
    setUser(data.user);
    persist(data.access_token, rt, data.user);
    if (rt) scheduleRenew(data.access_token, rt, data.user);
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToken(null);
    setUser(null);
    clearStorage();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
