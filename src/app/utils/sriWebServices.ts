/**
 * Cliente para Web Services del SRI (Servicio de Rentas Internas de Ecuador)
 * Implementa conexión SOAP para autorización y consulta de comprobantes electrónicos
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// URLs de Web Services del SRI
export const SRI_ENDPOINTS = {
  // Ambiente de Pruebas
  pruebas: {
    recepcion: 'https://celery.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://celery.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
  },
  // Ambiente de Producción
  produccion: {
    recepcion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
  }
};

export interface RespuestaSRI {
  estado: 'RECIBIDA' | 'DEVUELTA' | 'AUTORIZADO' | 'NO_AUTORIZADO' | 'ERROR';
  numero_autorizacion?: string;
  fecha_autorizacion?: string;
  mensajes?: string[];
  comprobante?: string;
}

/**
 * Enviar comprobante electrónico al SRI para validación
 */
export async function enviarComprobanteSRI(
  xmlFirmado: string,
  ambiente: 'pruebas' | 'produccion' = 'pruebas'
): Promise<RespuestaSRI> {
  try {
    console.log('📤 Enviando comprobante al SRI...');
    
    const endpoint = SRI_ENDPOINTS[ambiente].recepcion;
    
    // Construir mensaje SOAP para recepción
    const soapEnvelope = construirSOAPRecepcion(xmlFirmado);
    
    // Enviar petición SOAP
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'validarComprobante'
      },
      body: soapEnvelope
    });
    
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
    
    const responseText = await response.text();
    
    // Parsear respuesta SOAP
    const resultado = parsearRespuestaRecepcion(responseText);
    
    console.log('✅ Respuesta del SRI:', resultado);
    
    return resultado;
  } catch (error: any) {
    console.error('❌ Error enviando comprobante al SRI:', error);
    return {
      estado: 'ERROR',
      mensajes: [error.message || 'Error de conexión con el SRI']
    };
  }
}

/**
 * Consultar autorización de comprobante en el SRI
 */
export async function consultarAutorizacionSRI(
  claveAcceso: string,
  ambiente: 'pruebas' | 'produccion' = 'pruebas'
): Promise<RespuestaSRI> {
  try {
    console.log('🔍 Consultando autorización en SRI...');
    
    const endpoint = SRI_ENDPOINTS[ambiente].autorizacion;
    
    // Construir mensaje SOAP para autorización
    const soapEnvelope = construirSOAPAutorizacion(claveAcceso);
    
    // Enviar petición SOAP
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'autorizacionComprobante'
      },
      body: soapEnvelope
    });
    
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
    
    const responseText = await response.text();
    
    // Parsear respuesta SOAP
    const resultado = parsearRespuestaAutorizacion(responseText);
    
    console.log('✅ Autorización SRI:', resultado);
    
    return resultado;
  } catch (error: any) {
    console.error('❌ Error consultando autorización:', error);
    return {
      estado: 'ERROR',
      mensajes: [error.message || 'Error de conexión con el SRI']
    };
  }
}

/**
 * Construir envelope SOAP para recepción de comprobante
 */
function construirSOAPRecepcion(xmlComprobante: string): string {
  // Codificar XML en base64 (el SRI lo requiere así en algunos casos)
  // O enviarlo directamente como CDATA
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml><![CDATA[${xmlComprobante}]]></xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Construir envelope SOAP para consulta de autorización
 */
function construirSOAPAutorizacion(claveAcceso: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Parsear respuesta SOAP de recepción
 */
function parsearRespuestaRecepcion(soapResponse: string): RespuestaSRI {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true,
      trimValues: true
    });
    
    const result = parser.parse(soapResponse);
    
    // Navegar por la estructura SOAP
    const body = result['soapenv:Envelope']?.[' soapenv:Body'] || result['soap:Envelope']?.['soap:Body'];
    const respuesta = body?.['ns2:validarComprobanteResponse'] || body?.['validarComprobanteResponse'];
    
    if (!respuesta) {
      // Verificar si hay un fault (error SOAP)
      const fault = body?.['soapenv:Fault'] || body?.['soap:Fault'];
      if (fault) {
        return {
          estado: 'ERROR',
          mensajes: [fault.faultstring || 'Error en servicio del SRI']
        };
      }
      
      return {
        estado: 'ERROR',
        mensajes: ['Respuesta del SRI inválida']
      };
    }
    
    const estado = respuesta.RespuestaRecepcionComprobante?.estado || 'ERROR';
    const comprobantes = respuesta.RespuestaRecepcionComprobante?.comprobantes?.comprobante;
    
    const mensajes: string[] = [];
    
    if (comprobantes) {
      const comprobanteArray = Array.isArray(comprobantes) ? comprobantes : [comprobantes];
      comprobanteArray.forEach((comp: any) => {
        if (comp.mensajes?.mensaje) {
          const mensajesArray = Array.isArray(comp.mensajes.mensaje) 
            ? comp.mensajes.mensaje 
            : [comp.mensajes.mensaje];
          
          mensajesArray.forEach((msg: any) => {
            mensajes.push(`${msg.tipo || 'INFO'}: ${msg.mensaje || msg}`);
          });
        }
      });
    }
    
    return {
      estado: estado as any,
      mensajes: mensajes.length > 0 ? mensajes : undefined
    };
  } catch (error: any) {
    console.error('❌ Error parseando respuesta:', error);
    return {
      estado: 'ERROR',
      mensajes: ['Error procesando respuesta del SRI']
    };
  }
}

/**
 * Parsear respuesta SOAP de autorización
 */
function parsearRespuestaAutorizacion(soapResponse: string): RespuestaSRI {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true,
      trimValues: true
    });
    
    const result = parser.parse(soapResponse);
    
    // Navegar por la estructura SOAP
    const body = result['soapenv:Envelope']?.['soapenv:Body'] || result['soap:Envelope']?.['soap:Body'];
    const respuesta = body?.['ns2:autorizacionComprobanteResponse'] || body?.['autorizacionComprobanteResponse'];
    
    if (!respuesta) {
      const fault = body?.['soapenv:Fault'] || body?.['soap:Fault'];
      if (fault) {
        return {
          estado: 'ERROR',
          mensajes: [fault.faultstring || 'Error en servicio del SRI']
        };
      }
      
      return {
        estado: 'ERROR',
        mensajes: ['Respuesta del SRI inválida']
      };
    }
    
    const autorizaciones = respuesta.RespuestaAutorizacionComprobante?.autorizaciones?.autorizacion;
    
    if (!autorizaciones) {
      return {
        estado: 'NO_AUTORIZADO',
        mensajes: ['Comprobante no autorizado por el SRI']
      };
    }
    
    const autorizacion = Array.isArray(autorizaciones) ? autorizaciones[0] : autorizaciones;
    
    const estado = autorizacion.estado || 'NO_AUTORIZADO';
    const numeroAutorizacion = autorizacion.numeroAutorizacion;
    const fechaAutorizacion = autorizacion.fechaAutorizacion;
    const comprobante = autorizacion.comprobante;
    
    const mensajes: string[] = [];
    
    if (autorizacion.mensajes?.mensaje) {
      const mensajesArray = Array.isArray(autorizacion.mensajes.mensaje) 
        ? autorizacion.mensajes.mensaje 
        : [autorizacion.mensajes.mensaje];
      
      mensajesArray.forEach((msg: any) => {
        mensajes.push(`${msg.tipo || 'INFO'}: ${msg.mensaje || msg}`);
      });
    }
    
    return {
      estado: estado as any,
      numero_autorizacion: numeroAutorizacion,
      fecha_autorizacion: fechaAutorizacion,
      mensajes: mensajes.length > 0 ? mensajes : undefined,
      comprobante
    };
  } catch (error: any) {
    console.error('❌ Error parseando autorización:', error);
    return {
      estado: 'ERROR',
      mensajes: ['Error procesando respuesta del SRI']
    };
  }
}

/**
 * Verificar disponibilidad de servicios del SRI
 */
export async function verificarDisponibilidadSRI(
  ambiente: 'pruebas' | 'produccion' = 'pruebas'
): Promise<boolean> {
  try {
    console.log('🔍 Verificando disponibilidad del SRI...');
    
    const endpoint = SRI_ENDPOINTS[ambiente].recepcion;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
    });
    
    const disponible = response.ok;
    
    console.log(disponible ? '✅ SRI disponible' : '⚠️ SRI no disponible');
    
    return disponible;
  } catch (error) {
    console.warn('⚠️ SRI no disponible:', error);
    return false;
  }
}

/**
 * Validar estructura de clave de acceso
 */
export function validarClaveAcceso(claveAcceso: string): boolean {
  // La clave de acceso debe tener 49 dígitos
  if (!/^\d{49}$/.test(claveAcceso)) {
    return false;
  }
  
  // Validar dígito verificador (módulo 11)
  const digitos = claveAcceso.substring(0, 48);
  const digitoVerificador = parseInt(claveAcceso[48]);
  
  let suma = 0;
  let factor = 2;
  
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += parseInt(digitos[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  
  const residuo = suma % 11;
  const digitoCalculado = residuo === 0 ? 0 : 11 - residuo;
  
  return digitoCalculado === digitoVerificador;
}
