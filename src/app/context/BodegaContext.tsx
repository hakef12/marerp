import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  activa: boolean;
  direccion?: string;
}

interface BodegaContextType {
  bodegas: Bodega[];
  bodegaActiva: Bodega | null;
  setBodegaActiva: (b: Bodega) => void;
  loading: boolean;
  refetch: () => void;
}

const BodegaContext = createContext<BodegaContextType | undefined>(undefined);

const ROLES_CON_ACCESO = ['admin', 'gerente', 'super_admin', 'bodeguero'];

export function BodegaProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaActiva, setBodegaActivaState] = useState<Bodega | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBodegas = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/bodegas`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
          },
        }
      );
      if (!response.ok) throw new Error('Error al obtener bodegas');
      const data = await response.json();
      const lista: Bodega[] = (data.bodegas || []).filter((b: Bodega) => b.activa);
      setBodegas(lista);

      // Restaurar selección guardada
      const savedId = localStorage.getItem('erp_bodega_activa');
      if (savedId) {
        const saved = lista.find(b => b.id === savedId);
        if (saved) {
          setBodegaActivaState(saved);
          return;
        }
      }
      // Default: primera bodega
      if (lista.length > 0) {
        setBodegaActivaState(lista[0]);
        localStorage.setItem('erp_bodega_activa', lista[0].id);
      }
    } catch (err) {
      console.error('BodegaContext: error fetching bodegas', err);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    fetchBodegas();
  }, [fetchBodegas]);

  const setBodegaActiva = (b: Bodega) => {
    const rol = user?.rol ?? '';
    if (!ROLES_CON_ACCESO.includes(rol)) return;
    setBodegaActivaState(b);
    localStorage.setItem('erp_bodega_activa', b.id);
  };

  return (
    <BodegaContext.Provider value={{ bodegas, bodegaActiva, setBodegaActiva, loading, refetch: fetchBodegas }}>
      {children}
    </BodegaContext.Provider>
  );
}

export function useBodega() {
  const context = useContext(BodegaContext);
  if (!context) {
    throw new Error('useBodega debe usarse dentro de BodegaProvider');
  }
  return context;
}
