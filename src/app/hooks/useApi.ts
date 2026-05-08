import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { toast } from 'sonner';

/**
 * Hook personalizado para hacer peticiones a la API con manejo automático de errores
 * y autenticación
 */
export function useApi() {
  const { token, logout } = useAuth();

  const handleApiError = useCallback((error: any) => {
    console.error('❌ [useApi] Error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      toast.error('⚠️ Sesión expirada. Por favor inicie sesión nuevamente.');
      logout();
      return;
    }
    
    // Error genérico
    const message = error.message || 'Error en la solicitud';
    toast.error(message);
  }, [logout]);

  const get = useCallback(async <T = any>(endpoint: string): Promise<T | null> => {
    try {
      if (!token) {
        console.warn('⚠️ [useApi] No hay token disponible para GET', endpoint);
        return null;
      }
      
      const data = await api.get(endpoint, token);
      return data as T;
    } catch (error: any) {
      handleApiError(error);
      return null;
    }
  }, [token, handleApiError]);

  const post = useCallback(async <T = any>(endpoint: string, body: any): Promise<T | null> => {
    try {
      if (!token) {
        console.warn('⚠️ [useApi] No hay token disponible para POST', endpoint);
        toast.error('No hay sesión activa');
        return null;
      }
      
      const data = await api.post(endpoint, body, token);
      return data as T;
    } catch (error: any) {
      handleApiError(error);
      return null;
    }
  }, [token, handleApiError]);

  const put = useCallback(async <T = any>(endpoint: string, body: any): Promise<T | null> => {
    try {
      if (!token) {
        console.warn('⚠️ [useApi] No hay token disponible para PUT', endpoint);
        toast.error('No hay sesión activa');
        return null;
      }
      
      const data = await api.put(endpoint, body, token);
      return data as T;
    } catch (error: any) {
      handleApiError(error);
      return null;
    }
  }, [token, handleApiError]);

  const del = useCallback(async <T = any>(endpoint: string): Promise<T | null> => {
    try {
      if (!token) {
        console.warn('⚠️ [useApi] No hay token disponible para DELETE', endpoint);
        toast.error('No hay sesión activa');
        return null;
      }
      
      const data = await api.delete(endpoint, token);
      return data as T;
    } catch (error: any) {
      handleApiError(error);
      return null;
    }
  }, [token, handleApiError]);

  return {
    get,
    post,
    put,
    delete: del,
    token,
    isAuthenticated: !!token
  };
}
