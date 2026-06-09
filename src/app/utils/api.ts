/**
 * Utilidades para hacer requests al backend del ERP
 */

/** Error extendido que preserva el `codigo` devuelto por el backend (ej: LIMITE_ALCANZADO) */
export class ApiError extends Error {
  codigo?: string;
  constructor(message: string, codigo?: string) {
    super(message);
    this.name = 'ApiError';
    this.codigo = codigo;
  }
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  token?: string | null;
  requiresAuth?: boolean;
}

/**
 * Función centralizada para hacer requests al servidor
 * IMPORTANTE: Siempre envía X-User-Token en el header para autenticación
 */
export async function apiRequest(
  endpoint: string,
  options: ApiRequestOptions = {}
) {
  const { projectId, publicAnonKey } = await import('/utils/supabase/info');
  
  const { 
    method = 'GET', 
    body, 
    token, 
    requiresAuth = false 
  } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${publicAnonKey}`,
  };

  // CRÍTICO: Agregar X-User-Token si hay token
  if (token) {
    headers['X-User-Token'] = token;
  }

  const url = `https://${projectId}.supabase.co/functions/v1/server${endpoint}`;

  console.log(`🌐 [API] ${method} ${endpoint}`);
  console.log(`🔑 [API] Token presente: ${token ? 'Sí' : 'No'}`);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Intentar parsear JSON de manera segura
    let data;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error('❌ [API] Error parseando respuesta:', parseError);
      console.error('❌ [API] Response status:', response.status);
      throw new Error(`Error parseando respuesta del servidor (status: ${response.status})`);
    }

    if (!response.ok) {
      console.error(`❌ [API] Error ${response.status}:`, data);
      
      // Si el token expiró (401), notificar para que se haga logout
      if (response.status === 401) {
        console.error('🚨 [API] Token expirado o inválido - Se requiere nuevo login');
        // Emitir evento para forzar logout
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new Error('UNAUTHORIZED');
      }
      
      // 404 - Usuario no encontrado (esto fuerza logout también)
      if (response.status === 404) {
        console.error('🚨 [API] Usuario no encontrado en base de datos');
        console.error('💡 Esto puede pasar si te registraste antes de ejecutar SETUP_COMPLETO.sql');
        console.error('💡 Solución: Cierra sesión y regístrate nuevamente');
        // Emitir evento para forzar logout
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new Error('UNAUTHORIZED');
      }
      
      throw new ApiError(data.error || data.message || 'Error en la solicitud', data.codigo);
    }

    console.log(`✅ [API] ${method} ${endpoint} - Exitoso`);
    return data;
  } catch (error: any) {
    console.error(`❌ [API] Error en ${method} ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Shortcuts para métodos comunes
 */
export const api = {
  get: (endpoint: string, token?: string | null) => 
    apiRequest(endpoint, { method: 'GET', token, requiresAuth: !!token }),
  
  post: (endpoint: string, body: any, token?: string | null) => 
    apiRequest(endpoint, { method: 'POST', body, token, requiresAuth: !!token }),
  
  put: (endpoint: string, body: any, token?: string | null) => 
    apiRequest(endpoint, { method: 'PUT', body, token, requiresAuth: !!token }),
  
  delete: (endpoint: string, token?: string | null) => 
    apiRequest(endpoint, { method: 'DELETE', token, requiresAuth: !!token }),
};