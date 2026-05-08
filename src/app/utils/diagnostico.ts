/**
 * Utilidades de diagnóstico para detectar problemas de conexión con Supabase
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

interface DiagnosticoResult {
  paso: string;
  estado: 'ok' | 'error' | 'warning';
  mensaje: string;
  detalles?: any;
}

/**
 * Ejecuta un diagnóstico completo del sistema
 */
export async function ejecutarDiagnostico(): Promise<DiagnosticoResult[]> {
  const resultados: DiagnosticoResult[] = [];
  
  console.log('🔍 =================================');
  console.log('🔍 INICIANDO DIAGNÓSTICO DEL SISTEMA');
  console.log('🔍 =================================\n');

  // 1. Verificar configuración de Supabase
  console.log('📋 Paso 1: Verificando configuración...');
  if (!projectId || !publicAnonKey) {
    resultados.push({
      paso: '1. Configuración',
      estado: 'error',
      mensaje: 'Falta projectId o publicAnonKey',
      detalles: { projectId: !!projectId, publicAnonKey: !!publicAnonKey }
    });
    console.error('❌ ERROR: Configuración incompleta');
  } else {
    resultados.push({
      paso: '1. Configuración',
      estado: 'ok',
      mensaje: 'Configuración de Supabase OK',
      detalles: { 
        projectId: projectId.substring(0, 10) + '...', 
        publicAnonKey: publicAnonKey.substring(0, 50) + '...' 
      }
    });
    console.log('✅ Configuración correcta');
  }

  // 2. Verificar conexión al servidor
  console.log('\n📋 Paso 2: Verificando conexión al servidor...');
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/server/health`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      resultados.push({
        paso: '2. Servidor',
        estado: 'ok',
        mensaje: 'Servidor responde correctamente',
        detalles: data
      });
      console.log('✅ Servidor OK:', data);
    } else {
      resultados.push({
        paso: '2. Servidor',
        estado: 'error',
        mensaje: `Servidor respondió con código ${response.status}`,
        detalles: await response.text()
      });
      console.error(`❌ Error ${response.status}`);
    }
  } catch (error: any) {
    resultados.push({
      paso: '2. Servidor',
      estado: 'error',
      mensaje: 'No se pudo conectar al servidor',
      detalles: error.message
    });
    console.error('❌ ERROR de conexión:', error.message);
  }

  // 3. Verificar debug endpoint
  console.log('\n📋 Paso 3: Verificando endpoint de debug...');
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/server/debug/test`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      resultados.push({
        paso: '3. Debug',
        estado: 'ok',
        mensaje: 'Endpoint de debug OK',
        detalles: data
      });
      console.log('✅ Debug OK:', data);
    } else {
      resultados.push({
        paso: '3. Debug',
        estado: 'error',
        mensaje: `Debug respondió con código ${response.status}`,
        detalles: await response.text()
      });
      console.error(`❌ Error ${response.status}`);
    }
  } catch (error: any) {
    resultados.push({
      paso: '3. Debug',
      estado: 'error',
      mensaje: 'Error en endpoint de debug',
      detalles: error.message
    });
    console.error('❌ ERROR:', error.message);
  }

  // 4. Verificar localStorage
  console.log('\n📋 Paso 4: Verificando sesión guardada...');
  const savedToken = localStorage.getItem('erp_token');
  const savedUser = localStorage.getItem('erp_user');
  const savedRefreshToken = localStorage.getItem('erp_refresh_token');
  
  if (savedToken && savedUser) {
    resultados.push({
      paso: '4. Sesión',
      estado: 'ok',
      mensaje: 'Sesión guardada en localStorage',
      detalles: {
        hasToken: !!savedToken,
        hasUser: !!savedUser,
        hasRefreshToken: !!savedRefreshToken,
        tokenLength: savedToken?.length,
        userEmail: JSON.parse(savedUser)?.email
      }
    });
    console.log('✅ Sesión encontrada:', JSON.parse(savedUser)?.email);
  } else {
    resultados.push({
      paso: '4. Sesión',
      estado: 'warning',
      mensaje: 'No hay sesión guardada',
      detalles: {
        hasToken: !!savedToken,
        hasUser: !!savedUser,
        hasRefreshToken: !!savedRefreshToken
      }
    });
    console.warn('⚠️ No hay sesión activa');
  }

  // 5. Verificar token (si existe)
  if (savedToken) {
    console.log('\n📋 Paso 5: Verificando validez del token...');
    try {
      const payload = JSON.parse(atob(savedToken.split('.')[1]));
      const exp = payload.exp * 1000;
      const now = Date.now();
      const esValido = exp > now;
      const tiempoRestante = Math.floor((exp - now) / 1000 / 60);
      
      if (esValido) {
        resultados.push({
          paso: '5. Token',
          estado: tiempoRestante < 5 ? 'warning' : 'ok',
          mensaje: tiempoRestante < 5 
            ? `Token expira pronto (en ${tiempoRestante} minutos)`
            : `Token válido (expira en ${tiempoRestante} minutos)`,
          detalles: {
            exp: new Date(exp).toISOString(),
            tiempoRestante: `${tiempoRestante} minutos`
          }
        });
        console.log(`✅ Token válido - Expira en ${tiempoRestante} minutos`);
      } else {
        resultados.push({
          paso: '5. Token',
          estado: 'error',
          mensaje: 'Token expirado',
          detalles: {
            exp: new Date(exp).toISOString(),
            expiradoHace: `${Math.abs(tiempoRestante)} minutos`
          }
        });
        console.error('❌ Token EXPIRADO hace', Math.abs(tiempoRestante), 'minutos');
      }
    } catch (error: any) {
      resultados.push({
        paso: '5. Token',
        estado: 'error',
        mensaje: 'Error al verificar token',
        detalles: error.message
      });
      console.error('❌ Error verificando token:', error.message);
    }
  }

  console.log('\n🔍 ===========================');
  console.log('🔍 DIAGNÓSTICO COMPLETADO');
  console.log('🔍 ===========================\n');

  // Resumen
  const errores = resultados.filter(r => r.estado === 'error').length;
  const warnings = resultados.filter(r => r.estado === 'warning').length;
  const ok = resultados.filter(r => r.estado === 'ok').length;
  
  console.log(`✅ OK: ${ok}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Errores: ${errores}\n`);

  return resultados;
}

/**
 * Muestra el diagnóstico en consola de forma legible
 */
export function mostrarDiagnostico(resultados: DiagnosticoResult[]) {
  console.table(resultados.map(r => ({
    Paso: r.paso,
    Estado: r.estado === 'ok' ? '✅ OK' : r.estado === 'warning' ? '⚠️ Warning' : '❌ Error',
    Mensaje: r.mensaje
  })));
}

/**
 * Ejecuta y muestra el diagnóstico automáticamente
 */
export async function diagnosticarSistema() {
  const resultados = await ejecutarDiagnostico();
  mostrarDiagnostico(resultados);
  return resultados;
}
