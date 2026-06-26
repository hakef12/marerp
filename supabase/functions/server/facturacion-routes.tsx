/**
 * Rutas del módulo de Facturación Electrónica SRI Ecuador
 *
 * Implementa:
 *  - Generación de XML versión 1.1.0
 *  - Firma XAdES-BES con certificado P12 (node-forge)
 *  - Envío SOAP a SRI (Recepción + Consulta Autorización)
 *  - Cálculo clave de acceso módulo-11
 *  - Gestión de certificados digitales
 */

// @ts-ignore
import forge from "npm:node-forge@1.3.1";
// @ts-ignore — xmldom: namespace-aware XML parser for correct C14N (canonical XML)
import { DOMParser as XmlDOMParser } from "npm:@xmldom/xmldom@0.9.5";
import { createClient } from "npm:@supabase/supabase-js";
// registrarAsientoAutomatico removido — las facturas POS no crean asiento propio (el POS ya lo hace)
import * as kv from './kv_store.tsx';

// ── SQL helpers para facturación ──────────────────────────────────────────────
export const getDB = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export async function getConfig(empresaId: string): Promise<any | null> {
  const { data } = await getDB().from('configuracion_facturacion')
    .select('*').eq('empresa_id', empresaId).maybeSingle();
  if (data) {
    return { ...data, ...(data.metadata || {}), punto_emision: data.codigo_punto_emision };
  }
  // Fallback KV — formato con dos puntos (sistema anterior real)
  for (const kvKey of [
    `empresa:${empresaId}:facturacion:config`,
    `empresa:${empresaId}:facturacion:configuracion`,
    `empresa_${empresaId}_facturacion_config`,
    `empresa_${empresaId}_facturacion`,
    `facturacion_config_${empresaId}`,
  ]) {
    const kvData = await kv.get(kvKey);
    if (kvData && (kvData.ruc || kvData.razon_social || kvData.ambiente)) return kvData;
  }
  return null;
}

export async function setConfig(empresaId: string, config: any): Promise<void> {
  const { punto_emision, firma_electronica_activa, firma_electronica_nombre,
          firma_electronica_validez, ...rest } = config;
  await getDB().from('configuracion_facturacion').upsert({
    empresa_id: empresaId,
    ruc: rest.ruc || null,
    razon_social: rest.razon_social || null,
    nombre_comercial: rest.nombre_comercial || null,
    direccion_matriz: rest.direccion_matriz || null,
    direccion_establecimiento: rest.direccion_establecimiento || null,
    telefono: rest.telefono || null,
    email: rest.email || null,
    obligado_contabilidad: rest.obligado_contabilidad || false,
    regimen_rimpe: rest.regimen_rimpe || false,
    contribuyente_especial: rest.contribuyente_especial || null,
    agente_retencion: rest.agente_retencion || null,
    ambiente: rest.ambiente || 'pruebas',
    secuencial_actual: rest.secuencial_actual || 0,
    codigo_establecimiento: rest.codigo_establecimiento || '001',
    codigo_punto_emision: punto_emision || rest.codigo_punto_emision || '001',
    tiene_certificado: rest.tiene_certificado || firma_electronica_activa || false,
    metadata: { firma_electronica_activa, firma_electronica_nombre, firma_electronica_validez,
                ...Object.fromEntries(Object.entries(rest).filter(([k]) =>
                  !['ruc','razon_social','nombre_comercial','direccion_matriz','direccion_establecimiento',
                    'telefono','email','obligado_contabilidad','regimen_rimpe','contribuyente_especial',
                    'agente_retencion','ambiente','secuencial_actual','codigo_establecimiento',
                    'codigo_punto_emision','tiene_certificado'].includes(k))) },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'empresa_id' });
}

export async function getCert(empresaId: string): Promise<any | null> {
  const { data } = await getDB().from('certificados_facturacion')
    .select('*').eq('empresa_id', empresaId).maybeSingle();
  if (data) {
    const meta = data.metadata || {};
    return {
      p12_base64: data.p12_base64,
      password: data.password,
      nombre: data.nombre,
      pkcs8_base64: meta.pkcs8_base64 || null,
      rawCertDer_base64: meta.rawCertDer_base64 || null,
      subido_en: meta.subido_en || data.updated_at,
      info: {
        titular: data.titular,
        emisor: meta.emisor || null,
        valido_desde: data.valido_desde,
        valido_hasta: data.valido_hasta,
        vigente: data.valido_hasta ? new Date(data.valido_hasta) > new Date() : true,
      },
    };
  }
  // Fallback KV — formato con dos puntos (sistema anterior real)
  for (const kvKey of [
    `empresa:${empresaId}:facturacion:certificado`,
    `empresa:${empresaId}:facturacion:cert`,
    `empresa_${empresaId}_facturacion_cert`,
    `empresa_${empresaId}_cert`,
    `certificado_${empresaId}`,
  ]) {
    const kvData = await kv.get(kvKey);
    if (kvData && (kvData.p12_base64 || kvData.password)) return kvData;
  }
  return null;
}

async function setCert(empresaId: string, cert: any): Promise<void> {
  await getDB().from('certificados_facturacion').upsert({
    empresa_id: empresaId,
    nombre: cert.nombre || 'certificado.p12',
    p12_base64: cert.p12_base64,
    password: cert.password,
    valido_desde: cert.info?.valido_desde || null,
    valido_hasta: cert.info?.valido_hasta || null,
    titular: cert.info?.titular || null,
    metadata: {
      pkcs8_base64: cert.pkcs8_base64 || null,
      rawCertDer_base64: cert.rawCertDer_base64 || null,
      emisor: cert.info?.emisor || null,
      subido_en: cert.subido_en || new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'empresa_id' });
}

async function getFactura(empresaId: string, facturaKey: string): Promise<any | null> {
  const { data } = await getDB().from('facturas')
    .select('datos_completos').eq('empresa_id', empresaId).eq('factura_key', facturaKey).maybeSingle();
  if (!data) return null;
  return data.datos_completos || null;
}

async function setFactura(empresaId: string, facturaKey: string, factura: any): Promise<void> {
  await getDB().from('facturas').upsert({
    empresa_id: empresaId,
    factura_key: facturaKey,
    numero_factura: factura.numero_factura || facturaKey,
    clave_acceso: factura.clave_acceso || null,
    ambiente: factura.ambiente || 'pruebas',
    estado: factura.estado || 'PENDIENTE',
    estado_autorizacion: factura.estado_autorizacion || 'PENDIENTE',
    fecha_autorizacion: factura.fecha_autorizacion || null,
    numero_autorizacion: factura.numero_autorizacion || null,
    mensajes_sri: factura.mensajes_sri || [],
    razon_social: factura.razon_social || null,
    ruc: factura.ruc || null,
    cliente_identificacion: factura.cliente_identificacion || null,
    cliente_tipo_identificacion: factura.cliente_tipo_identificacion || null,
    cliente_razon_social: factura.cliente_razon_social || null,
    cliente_email: factura.cliente_email || null,
    subtotal_iva: factura.subtotal_iva ?? factura.subtotal ?? 0,
    subtotal_0: factura.subtotal_0 ?? 0,
    subtotal_no_objeto: factura.subtotal_no_objeto ?? 0,
    total_descuento: factura.total_descuento ?? factura.descuento ?? 0,
    iva: factura.iva ?? 0,
    total: factura.total ?? 0,
    items: factura.items || [],
    formas_pago: factura.formas_pago || [],
    datos_completos: factura,
    fecha_emision: factura.fecha_emision || null,
    hora_emision: factura.hora_emision || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'empresa_id,factura_key' });
}

async function listFacturas(empresaId: string): Promise<Array<[string, any]>> {
  const { data } = await getDB().from('facturas')
    .select('factura_key, datos_completos')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  if (data && data.length > 0) {
    return (data as any[]).map(r => [r.factura_key || r.id, r.datos_completos || r]);
  }
  // Fallback KV — formato real: empresa:ID:factura:FAC-xxx
  try {
    // Formato con dos puntos (sistema real)
    const colonEntries = await kv.getByPrefixWithKeys(`empresa:${empresaId}:factura:`);
    if (colonEntries.length > 0) {
      return colonEntries.map(([k, v]) => [k.replace(`empresa:${empresaId}:factura:`, ''), v]);
    }
    // Formato con guiones bajos (fallback)
    const prefixEntries = await kv.getByPrefixWithKeys(`empresa_${empresaId}_factura_`);
    if (prefixEntries.length > 0) return prefixEntries;
  } catch { /* silencioso */ }
  return [];
}

// ============================================================
// XML HELPERS
// ============================================================

/**
 * Parses SRI XML response messages.
 * SRI uses nested <mensaje> tags:
 *   <mensajes>
 *     <mensaje>                        ← outer wrapper (item)
 *       <identificador>39</identificador>
 *       <mensaje>FIRMA NO VALIDA</mensaje>  ← inner leaf (text we want)
 *       <tipo>ADVERTENCIA</tipo>
 *     </mensaje>
 *   </mensajes>
 *
 * We extract only leaf-text <mensaje> tags (those with no child elements).
 */
export function parsearMensajesSRI(xmlBody: string): string[] {
  const msgs: string[] = [];
  const seen = new Set<string>();

  // Strategy: match <mensaje>...</mensaje> blocks that contain sub-elements (outer items)
  // and extract the inner leaf <mensaje> and <tipo> from them
  for (const blockM of xmlBody.matchAll(/<mensajes>([\s\S]*?)<\/mensajes>/g)) {
    const block = blockM[1];
    // Each message item is wrapped in <mensaje>...<sub-elements>...</mensaje>
    for (const itemM of block.matchAll(/<mensaje>([\s\S]*?)<\/mensaje>/g)) {
      const item = itemM[1];
      if (!item.includes('<')) {
        // This is a leaf node — the message text itself
        const txt = item.trim();
        if (txt && !seen.has(txt)) { seen.add(txt); msgs.push(txt); }
        continue;
      }
      // It's a wrapper — extract the inner leaf <mensaje> text and <tipo>
      const texto = item.match(/<mensaje>([^<]*)<\/mensaje>/)?.[1]?.trim() || '';
      const tipo  = item.match(/<tipo>([^<]*)<\/tipo>/)?.[1]?.trim() || '';
      const info  = item.match(/<informacionAdicional>([^<]*)<\/informacionAdicional>/)?.[1]?.trim() || '';
      if (texto && !seen.has(texto)) {
        seen.add(texto);
        const prefix = tipo === 'ADVERTENCIA' ? '⚠️' : tipo === 'ERROR' ? '❌' : '📋';
        msgs.push(`${prefix} ${texto}${info && info !== tipo ? ' — ' + info : ''}`);
      }
    }
  }

  // Fallback: if no <mensajes> wrapper found, grab any leaf-only <mensaje> or <informacionAdicional>
  if (msgs.length === 0) {
    for (const m of xmlBody.matchAll(/<mensaje>([^<]+)<\/mensaje>/g)) {
      const txt = m[1].trim();
      if (txt && !seen.has(txt)) { seen.add(txt); msgs.push(txt); }
    }
    for (const m of xmlBody.matchAll(/<informacionAdicional>([^<]+)<\/informacionAdicional>/g)) {
      const txt = m[1].trim();
      if (txt && !seen.has(txt)) { seen.add(txt); msgs.push(txt); }
    }
  }

  return msgs;
}

export function xmlEncode(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function calcularModulo11(clave: string): string {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  for (let i = clave.length - 1, f = 0; i >= 0; i--, f = (f + 1) % 6) {
    suma += parseInt(clave[i]) * factores[f];
  }
  // SRI spec v2.26: d=11→'0', d=10→'1', else String(d)
  const d = 11 - (suma % 11);
  if (d === 11) return '0';
  if (d === 10) return '1';
  return String(d);
}

function getCodigoPago(m: string): string {
  // SRI spec v2.26: 01=Efectivo, 16=Tarjeta Débito, 19=Tarjeta Crédito, 20=Otros/Transferencia
  return ({ efectivo: '01', tarjeta: '19', tarjeta_debito: '16', transferencia: '20' } as any)[m] ?? '01';
}

function getNombrePago(m: string): string {
  return ({ efectivo: 'Efectivo', tarjeta: 'Tarjeta de Crédito', tarjeta_debito: 'Tarjeta de Débito', transferencia: 'Transferencia Bancaria' } as any)[m] ?? 'Efectivo';
}

export function normalizeAmbiente(a: any): 'pruebas' | 'produccion' {
  return (a === '2' || a === 'produccion') ? 'produccion' : 'pruebas';
}

// ============================================================
// SRI XML v1.1.0
// ============================================================

// ── Determinar la versión del XML según los campos usados ────────────────────
// V2.1.0: requerida cuando el emisor es RIMPE o agente de retención
function getXMLVersion(f: any): string {
  if (f.regimen_rimpe || f.agente_retencion) return '2.1.0';
  return '2.1.0'; // usar siempre la versión más reciente para máxima compatibilidad SRI
}

function buildNotaCreditoXML(nc: any): string {
  const dt = new Date(nc.fecha_emision + 'T00:00:00');
  const dd = String(dt.getDate()).padStart(2,'0');
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yyyy = String(dt.getFullYear());
  const fechaStr = `${dd}/${mm}/${yyyy}`;
  const secStr   = String(nc.secuencial).padStart(9,'0');

  const totalSinImpuestos = Math.round(Number(nc.subtotal_iva || 0) * 100) / 100;
  const totalIva          = Math.round(Number(nc.iva || 0) * 100) / 100;
  const valorModificacion = Math.round(Number(nc.total || 0) * 100) / 100;

  const detalles = (nc.items || []).map((it: any) => {
    const cant    = Number(it.cantidad || 1);
    const precio  = Math.round(Number(it.precio_unitario || it.precio || 0) * 100) / 100;
    const subtotal = Math.round(cant * precio * 100) / 100;
    const iva15   = Math.round(subtotal * 0.15 * 100) / 100;
    return `<detalle>` +
      `<codigoInterno>${xmlEncode(it.codigo || it.producto_id || '001')}</codigoInterno>` +
      `<descripcion>${xmlEncode(it.descripcion || it.nombre || '')}</descripcion>` +
      `<cantidad>${cant.toFixed(6)}</cantidad>` +
      `<precioUnitario>${precio.toFixed(6)}</precioUnitario>` +
      `<descuento>0.00</descuento>` +
      `<precioTotalSinImpuesto>${subtotal.toFixed(2)}</precioTotalSinImpuesto>` +
      `<impuestos><impuesto>` +
      `<codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje>` +
      `<tarifa>15.00</tarifa><baseImponible>${subtotal.toFixed(2)}</baseImponible>` +
      `<valor>${iva15.toFixed(2)}</valor>` +
      `</impuesto></impuestos>` +
      `</detalle>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<notaCredito id="comprobante" version="1.0.0">` +
    `<infoTributaria>` +
    `<ambiente>${nc.ambiente === 'produccion' ? '2' : '1'}</ambiente>` +
    `<tipoEmision>1</tipoEmision>` +
    `<razonSocial>${xmlEncode(nc.razon_social || '')}</razonSocial>` +
    `<nombreComercial>${xmlEncode(nc.nombre_comercial || nc.razon_social || '')}</nombreComercial>` +
    `<ruc>${xmlEncode(nc.ruc || '')}</ruc>` +
    `<claveAcceso>${xmlEncode(nc.clave_acceso)}</claveAcceso>` +
    `<codDoc>04</codDoc>` +
    `<estab>${xmlEncode(String(nc.estab || '001').padStart(3,'0'))}</estab>` +
    `<ptoEmi>${xmlEncode(String(nc.pto_emi || '001').padStart(3,'0'))}</ptoEmi>` +
    `<secuencial>${secStr}</secuencial>` +
    `<dirMatriz>${xmlEncode(nc.direccion_matriz || '')}</dirMatriz>` +
    `</infoTributaria>` +
    `<infoNotaCredito>` +
    `<fechaEmision>${fechaStr}</fechaEmision>` +
    `<dirEstablecimiento>${xmlEncode(nc.direccion_establecimiento || nc.direccion_matriz || '')}</dirEstablecimiento>` +
    `<tipoIdentificacionComprador>${xmlEncode(nc.cliente_tipo_identificacion || '04')}</tipoIdentificacionComprador>` +
    `<razonSocialComprador>${xmlEncode(nc.cliente_razon_social || 'Consumidor Final')}</razonSocialComprador>` +
    `<identificacionComprador>${xmlEncode(nc.cliente_identificacion || '9999999999999')}</identificacionComprador>` +
    (nc.contribuyente_especial ? `<contribuyenteEspecial>${xmlEncode(nc.contribuyente_especial)}</contribuyenteEspecial>` : '') +
    `<obligadoContabilidad>${nc.obligado_contabilidad ? 'SI' : 'NO'}</obligadoContabilidad>` +
    `<codDocModificado>01</codDocModificado>` +
    `<numDocModificado>${xmlEncode(nc.num_doc_modificado)}</numDocModificado>` +
    `<fechaEmisionDocSustento>${xmlEncode(nc.fecha_doc_sustento)}</fechaEmisionDocSustento>` +
    `<totalSinImpuestos>${totalSinImpuestos.toFixed(2)}</totalSinImpuestos>` +
    `<valorModificacion>${valorModificacion.toFixed(2)}</valorModificacion>` +
    `<moneda>DOLAR</moneda>` +
    `<totalConImpuestos><totalImpuesto>` +
    `<codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje>` +
    `<baseImponible>${totalSinImpuestos.toFixed(2)}</baseImponible>` +
    `<valor>${totalIva.toFixed(2)}</valor>` +
    `</totalImpuesto></totalConImpuestos>` +
    `<motivo>${xmlEncode(nc.motivo || 'Anulación de factura')}</motivo>` +
    `</infoNotaCredito>` +
    `<detalles>${detalles}</detalles>` +
    `</notaCredito>`;
}

function buildSRIXML(f: any): string {
  const dt = new Date(f.fecha_emision + 'T00:00:00');
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = String(dt.getFullYear());
  const fechaStr = `${dd}/${mm}/${yyyy}`;
  const secStr = String(f.secuencial).padStart(9, '0');
  const xmlVersion = getXMLVersion(f);

  // ── Detalles con soporte de ítems grabados (IVA 15%) y tarifa 0% ─────────
  // El campo item.tarifa_iva puede ser 0 o 15; si no se especifica, asume 15%
  const detalles = (f.items || []).map((item: any) => {
    const cod = xmlEncode((item.descripcion || 'PROD').substring(0, 25).replace(/\s+/g, '_'));
    const sub = Math.round(Number(item.subtotal || 0) * 100) / 100;

    // Determinar si el ítem tiene IVA (15%) o está gravado con 0%
    const tarifaIva    = Number(item.tarifa_iva ?? 15);   // 0 = exento/0%, 15 = gravado
    const codPct       = tarifaIva > 0 ? '4' : '0';       // 4=15%, 0=0%
    const tarifaStr    = tarifaIva > 0 ? '15.00' : '0.00';
    const ivaItem      = tarifaIva > 0 ? (Math.round(sub * 15) / 100).toFixed(2) : '0.00';

    return `<detalle>` +
      `<codigoPrincipal>${cod}</codigoPrincipal>` +
      `<descripcion>${xmlEncode(item.descripcion)}</descripcion>` +
      `<cantidad>${Number(item.cantidad).toFixed(6)}</cantidad>` +
      `<precioUnitario>${Number(item.precio_unitario || 0).toFixed(6)}</precioUnitario>` +
      `<descuento>${Number(item.descuento || 0).toFixed(2)}</descuento>` +
      `<precioTotalSinImpuesto>${sub.toFixed(2)}</precioTotalSinImpuesto>` +
      `<impuestos><impuesto>` +
      `<codigo>2</codigo><codigoPorcentaje>${codPct}</codigoPorcentaje>` +
      `<tarifa>${tarifaStr}</tarifa>` +
      `<baseImponible>${sub.toFixed(2)}</baseImponible>` +
      `<valor>${ivaItem}</valor>` +
      `</impuesto></impuestos>` +
      `</detalle>`;
  }).join('');

  // ── Totales separados por tarifa ──────────────────────────────────────────
  const subtotalGravado = Number(f.subtotal_iva || f.subtotal || 0);
  const subtotal0       = Number(f.subtotal_0 || 0);
  const totalSinImp     = (subtotalGravado + subtotal0).toFixed(2);
  const descuento       = Number(f.total_descuento || f.descuento || 0).toFixed(2);
  const iva             = Number(f.iva || 0).toFixed(2);
  const propina         = Number(f.propina || 0).toFixed(2); // 10% servicio Ley de Turismo
  const total           = Number(f.total || 0).toFixed(2);

  // totalConImpuestos: un bloque por tarifa usada
  let totalConImpuestos = `<totalConImpuestos>`;
  // Tarifa 15% (codigoPorcentaje=4) — base gravada
  if (subtotalGravado > 0) {
    totalConImpuestos +=
      `<totalImpuesto>` +
      `<codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje>` +
      `<baseImponible>${subtotalGravado.toFixed(2)}</baseImponible>` +
      `<tarifa>15.00</tarifa>` +
      `<valor>${iva}</valor>` +
      `</totalImpuesto>`;
  }
  // Tarifa 0% (codigoPorcentaje=0) — base exenta
  if (subtotal0 > 0) {
    totalConImpuestos +=
      `<totalImpuesto>` +
      `<codigo>2</codigo><codigoPorcentaje>0</codigoPorcentaje>` +
      `<baseImponible>${subtotal0.toFixed(2)}</baseImponible>` +
      `<tarifa>0.00</tarifa>` +
      `<valor>0.00</valor>` +
      `</totalImpuesto>`;
  }
  totalConImpuestos += `</totalConImpuestos>`;

  const pagos = (f.formas_pago || [{ codigo: '01', total: f.total }]).map((p: any) =>
    `<pago><formaPago>${xmlEncode(p.codigo || '01')}</formaPago><total>${Number(p.total || 0).toFixed(2)}</total></pago>`
  ).join('');

  const ambCod = f.ambiente === '2' ? '2' : '1';

  // ── infoAdicional ─────────────────────────────────────────────────────────
  const camposAdicionales: string[] = [];
  if (f.cliente_email)     camposAdicionales.push(`<campoAdicional nombre="email">${xmlEncode(f.cliente_email)}</campoAdicional>`);
  if (f.telefono)          camposAdicionales.push(`<campoAdicional nombre="telefono">${xmlEncode(f.telefono)}</campoAdicional>`);
  if (f.numero_factura)    camposAdicionales.push(`<campoAdicional nombre="numerofactura">${xmlEncode(f.numero_factura)}</campoAdicional>`);
  const infoAdicional = camposAdicionales.length > 0
    ? `<infoAdicional>${camposAdicionales.join('')}</infoAdicional>`
    : '';

  // ── infoTributaria: campos opcionales v2.1.0 ─────────────────────────────
  // agenteRetencion: solo si aplica (número de resolución, ej: "1234")
  const agenteRetencionXML = f.agente_retencion
    ? `<agenteRetencion>${xmlEncode(String(f.agente_retencion))}</agenteRetencion>`
    : '';
  // contribuyenteRimpe: obligatorio en v2.1.0 si el emisor está en RIMPE
  // El XSD solo permite el literal exacto "CONTRIBUYENTE RÉGIMEN RIMPE"
  const rimpeXML = f.regimen_rimpe
    ? `<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<factura id="comprobante" version="${xmlVersion}">` +
    // ── infoTributaria ── (orden obligatorio según XSD)
    `<infoTributaria>` +
    `<ambiente>${ambCod}</ambiente>` +
    `<tipoEmision>1</tipoEmision>` +
    `<razonSocial>${xmlEncode(f.razon_social)}</razonSocial>` +
    `<nombreComercial>${xmlEncode(f.nombre_comercial || f.razon_social)}</nombreComercial>` +
    `<ruc>${xmlEncode(f.ruc)}</ruc>` +
    `<claveAcceso>${xmlEncode(f.clave_acceso)}</claveAcceso>` +
    `<codDoc>01</codDoc>` +
    `<estab>${String(f.codigo_establecimiento || '001').padStart(3, '0').substring(0, 3)}</estab>` +
    `<ptoEmi>${String(f.punto_emision || '001').padStart(3, '0').substring(0, 3)}</ptoEmi>` +
    `<secuencial>${secStr}</secuencial>` +
    `<dirMatriz>${xmlEncode(f.direccion_matriz)}</dirMatriz>` +
    agenteRetencionXML +   // opcional — solo si es agente de retención
    rimpeXML +             // opcional — solo si es RIMPE
    `</infoTributaria>` +
    // ── infoFactura ── (contribuyenteEspecial y obligadoContabilidad van aquí)
    `<infoFactura>` +
    `<fechaEmision>${fechaStr}</fechaEmision>` +
    `<dirEstablecimiento>${xmlEncode(f.direccion_establecimiento || f.direccion_matriz)}</dirEstablecimiento>` +
    (f.contribuyente_especial ? `<contribuyenteEspecial>${xmlEncode(f.contribuyente_especial)}</contribuyenteEspecial>` : '') +
    `<obligadoContabilidad>${f.obligado_contabilidad ? 'SI' : 'NO'}</obligadoContabilidad>` +
    `<tipoIdentificacionComprador>${xmlEncode(f.cliente_tipo_identificacion || '07')}</tipoIdentificacionComprador>` +
    `<razonSocialComprador>${xmlEncode(f.cliente_razon_social || 'Consumidor Final')}</razonSocialComprador>` +
    `<identificacionComprador>${xmlEncode(f.cliente_identificacion || '9999999999999')}</identificacionComprador>` +
    `<totalSinImpuestos>${totalSinImp}</totalSinImpuestos>` +
    `<totalDescuento>${descuento}</totalDescuento>` +
    totalConImpuestos +
    `<propina>${propina}</propina>` +
    `<importeTotal>${total}</importeTotal>` +
    `<moneda>DOLAR</moneda>` +
    `<pagos>${pagos}</pagos>` +
    `</infoFactura>` +
    `<detalles>${detalles}</detalles>` +
    infoAdicional +
    `</factura>`;
}

// ============================================================
// XADES-BES DIGITAL SIGNATURE (node-forge)
// ============================================================

// ============================================================
// CANONICAL XML 1.0 (C14N) — required by XAdES-BES / SRI
// ============================================================

/**
 * C14N attribute value normalization (RFC 3076 §2.3):
 * Tab→&#9;  LF→&#10;  CR→&#13;  &→&amp;  "→&quot;  <→&lt;
 */
function c14nAttrValue(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

/**
 * C14N text node normalization (RFC 3076 §2.3):
 * &→&amp;  <→&lt;  >→&gt;  CR→&#13;
 */
function c14nText(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;');
}

/**
 * Recursively serialize an xmldom Element node in Canonical XML 1.0 form.
 *
 * ancestorNS: Map of prefix → uri for all namespace declarations already
 *   rendered by ancestor elements (so we don't re-emit them on children).
 *
 * Inclusive C14N rules (RFC 3076 §2.3):
 *   • All namespace declarations in scope for this element are output on its
 *     start tag, EXCEPT those that are already present with the same value
 *     in an ancestor element's start tag.
 *   • Namespace declarations are sorted lexicographically by prefix name
 *     (xmlns < xmlns:ds < xmlns:xades …).
 *   • Regular attributes are sorted lexicographically by expanded name.
 *   • Empty elements are output as <tag></tag> (not self-closing).
 *   • Text nodes: special chars normalized; comments/PIs omitted.
 */
function c14nElement(el: any, ancestorNS: Map<string, string>): string {
  let result = '<' + el.tagName;

  // Collect explicitly-declared namespaces and regular attributes on this element
  const thisNSDecls = new Map<string, string>(); // prefix → uri (declared here)
  const regularAttrs: [string, string][] = [];

  const attrs = el.attributes;
  for (let i = 0; i < (attrs?.length ?? 0); i++) {
    const attr = attrs[i];
    const name: string = attr.name ?? attr.nodeName ?? '';
    const value: string = attr.value ?? attr.nodeValue ?? '';
    if (name === 'xmlns') {
      thisNSDecls.set('xmlns', value);
    } else if (name.startsWith('xmlns:')) {
      thisNSDecls.set(name, value);
    } else {
      regularAttrs.push([name, value]);
    }
  }

  // Namespace scope for this element's children
  const currentScope = new Map([...ancestorNS, ...thisNSDecls]);

  // Which namespace declarations to emit on THIS element?
  // Emit if: declared here AND (not in ancestor, or different value from ancestor)
  const nsToOutput: [string, string][] = [];
  for (const [prefix, uri] of thisNSDecls) {
    if (ancestorNS.get(prefix) !== uri) {
      nsToOutput.push([prefix, uri]);
    }
  }

  // Sort: namespace decls lexicographically by prefix (xmlns < xmlns:ds < …)
  nsToOutput.sort((a, b) => a[0].localeCompare(b[0]));

  // Sort regular attributes lexicographically by attribute name
  // (for un-prefixed attrs, expanded name = local name — sufficient for SRI's attrs)
  regularAttrs.sort((a, b) => a[0].localeCompare(b[0]));

  for (const [k, v] of nsToOutput)      result += ` ${k}="${c14nAttrValue(v)}"`;
  for (const [name, value] of regularAttrs) result += ` ${name}="${c14nAttrValue(value)}"`;

  result += '>';

  // Process child nodes
  const childNodes = el.childNodes;
  for (let i = 0; i < (childNodes?.length ?? 0); i++) {
    const child = childNodes[i];
    const nodeType: number = child.nodeType ?? 0;
    if (nodeType === 1) {           // ELEMENT_NODE
      result += c14nElement(child, currentScope);
    } else if (nodeType === 3) {    // TEXT_NODE
      result += c14nText(child.nodeValue ?? child.data ?? '');
    }
    // Comments (8), PIs (7) are excluded by C14N
  }

  result += '</' + el.tagName + '>';
  return result;
}

/**
 * Canonical XML 1.0 (inclusive, RFC 3076) using @xmldom/xmldom for parsing.
 *
 * Produces deterministic canonical form of an XML string:
 *   • XML declaration removed
 *   • Self-closing elements expanded to <tag></tag>
 *   • Namespace declarations sorted before regular attributes
 *   • All attribute groups sorted lexicographically
 *   • Text content special-chars normalized
 *   • Comments and PIs omitted
 */
function c14n(xml: string): string {
  // Remove XML declaration (C14N §2.4)
  const xmlNoDecl = xml.replace(/^<\?xml[^?]*\?>\s*/, '');

  try {
    // Parse with a proper namespace-aware XML DOM parser
    const doc = new XmlDOMParser().parseFromString(xmlNoDecl, 'text/xml');
    const root = doc?.documentElement;
    if (!root) throw new Error('no documentElement');
    return c14nElement(root, new Map());
  } catch (e: any) {
    // Should not happen for well-formed XML; log and return stripped form
    console.error('[C14N] parse error, returning stripped XML:', e?.message);
    return xmlNoDecl;
  }
}

/** SHA-1 digest (node-forge) of a UTF-8 string, returned as base64 */
function sha1b64(text: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(text));
  return forge.util.encode64(md.digest().getBytes());
}

// ============================================================
// XADES-BES DIGITAL SIGNATURE (node-forge + proper C14N)
// ============================================================

/**
 * Extracts raw certificate DER bytes from a PKCS#12 file by navigating the
 * ASN.1 tree directly — without going through forge's Certificate parser.
 *
 * WHY: forge.pki.certificateToAsn1 → forge.asn1.toDer can alter the DER
 * (e.g. NULL parameters in AlgorithmIdentifiers, BitString padding bits).
 * SRI verifies the certificate's CA signature on the ORIGINAL DER bytes.
 * Even a single changed byte causes "FIRMA INVALIDA: certificados alterados".
 *
 * P12 structure (unencrypted cert bags):
 *  PFX → authSafe ContentInfo (pkcs7-data) → OCTET STRING → AuthenticatedSafe
 *  → ContentInfo (pkcs7-data) → OCTET STRING → SafeContents
 *  → SafeBag (certBag) → CertBag → [0] OCTET STRING { raw cert DER }
 */
/**
 * Extracts raw cert DER bytes from an already-parsed + decrypted forge P12 object.
 *
 * WHY THIS EXISTS:
 *   extractRawCertDersFromP12 (below) only reads UNENCRYPTED cert bags (pkcs7-data).
 *   Ecuador P12 files from BCE, Security Data, ANF AC etc. store certs in ENCRYPTED
 *   bags (pkcs7-encryptedData OID 1.2.840.113549.1.7.6) — so that function returns [].
 *
 *   The fallback forge.asn1.toDer(forge.pki.certificateToAsn1(cert)) re-serializes the
 *   cert and can change individual bytes → SRI rejects with "certificados alterados".
 *
 *   This function uses the forge P12 object AFTER decryption. When forge decrypts an
 *   encrypted bag it stores the parsed ASN.1 in bag.asn1. The cert DER bytes are still
 *   present as an OCTET STRING value deep in that ASN.1 tree — they have NOT been
 *   re-serialized; they are the original bytes that came out of decryption.
 *
 *   CertBag ASN.1 structure (RFC 7292 §4.2.3):
 *     CertBag SEQUENCE {
 *       certId  OID (x509Certificate = 1.2.840.113549.1.9.22.1)
 *       certValue [0] EXPLICIT OCTET STRING containing raw cert DER
 *     }
 *   → bag.asn1.value[1].value[0].value = raw cert DER bytes (binary string)
 */
/**
 * Extracts raw cert DER bytes by manually decrypting pkcs7-encryptedData bags
 * in the raw P12 ASN.1. Does NOT use bag.asn1 (which is null in forge 1.3.1
 * for bags from encrypted SafeContents).
 *
 * Handles PKCS#12 PBE algorithms used by Ecuador CAs (Security Data, BCE, ANF):
 *   - pbeWithSHAAnd3-KeyTripleDES-CBC (1.2.840.113549.1.12.1.3)  ← most common
 *   - pbeWithSHAAnd128BitRC2-CBC      (1.2.840.113549.1.12.1.5)
 *   - pbeWithSHAAnd40BitRC2-CBC       (1.2.840.113549.1.12.1.6)
 */
function extractRawCertDersFromForgeP12(p12: any, p12DerStr?: string, password?: string): string[] {
  const CERT_BAG_OID       = '1.2.840.113549.1.12.10.1.3';
  const PKCS7_ENCRYPTED    = '1.2.840.113549.1.7.6';
  const PBE_SHA1_3DES      = '1.2.840.113549.1.12.1.3';
  const PBE_SHA1_RC2_128   = '1.2.840.113549.1.12.1.5';
  const PBE_SHA1_RC2_40    = '1.2.840.113549.1.12.1.6';

  const results: string[] = [];

  // ── Helper: extract cert DER from a parsed SafeContents SEQUENCE ──────────
  const extractFromSafeContents = (sc: any) => {
    for (const safeBag of (Array.isArray(sc?.value) ? sc.value : [])) {
      try {
        if (!Array.isArray(safeBag?.value) || safeBag.value.length < 2) continue;
        if (safeBag.value[0]?.type !== 6) continue;
        let bagOid = ''; try { bagOid = forge.asn1.derToOid(safeBag.value[0].value); } catch { continue; }
        if (bagOid !== CERT_BAG_OID) continue;

        // bagValue = safeBag.value[1]  →  [0] EXPLICIT  →  CertBag SEQUENCE
        const bagValCtx = safeBag.value[1];

        // Resolve certBagAsn1: may be pre-parsed (Array value) or still DER bytes (string value)
        let certBagAsn1: any = null;
        if (Array.isArray(bagValCtx?.value) && bagValCtx.value.length > 0) {
          const child = bagValCtx.value[0];
          if (Array.isArray(child?.value)) {
            // Already a parsed ASN.1 SEQUENCE (Approach B path via forge.asn1.fromDer)
            certBagAsn1 = child;
          } else if (typeof child?.value === 'string' && child.value.length > 10) {
            // child.value holds DER bytes — re-parse (Approach A path)
            try { certBagAsn1 = forge.asn1.fromDer(child.value); } catch { continue; }
          }
        } else if (typeof bagValCtx?.value === 'string' && bagValCtx.value.length > 10) {
          try { certBagAsn1 = forge.asn1.fromDer(bagValCtx.value); } catch { continue; }
        }
        if (!certBagAsn1 || !Array.isArray(certBagAsn1.value) || certBagAsn1.value.length < 2) continue;

        // certValue = certBagAsn1.value[1]  →  [0] EXPLICIT  →  OCTET STRING (cert DER bytes)
        const certValCtx = certBagAsn1.value[1];
        let certDer: string | null = null;
        if (Array.isArray(certValCtx?.value) && certValCtx.value.length > 0) {
          const v = certValCtx.value[0]?.value;
          if (typeof v === 'string' && v.length > 64) certDer = v;
        } else if (typeof certValCtx?.value === 'string' && certValCtx.value.length > 64) {
          certDer = certValCtx.value;
        }
        if (!certDer) continue;

        // Validate it's a real X.509 cert
        try { forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer)); results.push(certDer); }
        catch { /* not a valid cert */ }
      } catch (_) { /* skip */ }
    }
  };

  // ── Approach A: bag.asn1 (works if forge sets it — some versions do) ──────
  try {
    for (const sc of (p12.safeContents || [])) {
      for (const bag of (sc.safeBags || [])) {
        if (!bag.asn1) continue;
        try {
          // bag.asn1 = SafeBag → value[1].value[0].value = CertBag DER
          const certBagDerStr = bag.asn1.value?.[1]?.value?.[0]?.value;
          if (typeof certBagDerStr !== 'string' || certBagDerStr.length < 10) continue;
          const certBagParsed = forge.asn1.fromDer(certBagDerStr);
          const certDer = certBagParsed.value?.[1]?.value?.[0]?.value;
          if (typeof certDer !== 'string' || certDer.length < 64) continue;
          try { forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer)); results.push(certDer); } catch { /* skip */ }
        } catch (_) { /* skip */ }
      }
    }
  } catch (_) { /* ignore */ }

  if (results.length > 0) return results;

  // ── Approach B: manual decryption from raw P12 ASN.1 bytes ───────────────
  if (!p12DerStr || !password) return results;
  try {
    const pfx = forge.asn1.fromDer(p12DerStr);
    const authSafeOctet = pfx.value?.[1]?.value?.[1]?.value?.[0];
    if (typeof authSafeOctet?.value !== 'string') {
      console.warn('[CertDer-B] No se pudo leer AuthenticatedSafe OCTET STRING del PFX');
      return results;
    }
    const authSafe = forge.asn1.fromDer(authSafeOctet.value);

    // forge.pkcs12.generateKey (and forge.pbe.getCipher which calls it internally)
    // already handle the UTF-16 BE + null-terminator encoding (RFC 7292 §B.1).
    // Do NOT pre-encode here — passing plain password is correct.

    const ciList = Array.isArray(authSafe?.value) ? authSafe.value : [];
    console.log(`[CertDer-B] AuthenticatedSafe tiene ${ciList.length} ContentInfos`);

    for (const ci of ciList) {
      try {
        if (!Array.isArray(ci?.value) || ci.value.length < 2) continue;
        if (ci.value[0]?.type !== 6) continue;
        const ciOid = forge.asn1.derToOid(ci.value[0].value);
        console.log(`[CertDer-B] ContentInfo OID: ${ciOid}`);
        if (ciOid !== PKCS7_ENCRYPTED) continue;

        // EncryptedData → EncryptedContentInfo
        const encData = ci.value[1]?.value?.[0];
        if (!Array.isArray(encData?.value) || encData.value.length < 2) {
          console.warn('[CertDer-B] EncryptedData estructura inválida');
          continue;
        }
        const eci = encData.value[1];
        if (!Array.isArray(eci?.value) || eci.value.length < 2) {
          console.warn('[CertDer-B] EncryptedContentInfo estructura inválida, len=', eci?.value?.length);
          continue;
        }

        // AlgorithmIdentifier (PBE)
        const algId = eci.value[1];
        let pbeOid = '';
        try { pbeOid = forge.asn1.derToOid(algId.value[0].value); } catch (e: any) {
          console.warn('[CertDer-B] No se pudo leer pbeOid:', e.message); continue;
        }
        const pbeParams = algId.value[1];
        console.log(`[CertDer-B] pbeOid=${pbeOid} pbeParams exists=${!!pbeParams}`);

        // Encrypted content bytes
        const encCtx = eci.value[2];
        let encContent = '';
        if (Array.isArray(encCtx?.value) && encCtx.value.length > 0) encContent = encCtx.value[0]?.value || '';
        else if (typeof encCtx?.value === 'string') encContent = encCtx.value;
        console.log(`[CertDer-B] encContent length=${encContent.length}`);
        if (!encContent) { console.warn('[CertDer-B] encContent vacío'); continue; }

        // ── Attempt 1: forge.pbe.getCipher (handles all forge PBE algorithms) ──
        let decrypted: string | null = null;
        const forgePbe = (forge as any).pbe;
        if (forgePbe && typeof forgePbe.getCipher === 'function') {
          try {
            // forge.pbe.getCipher(oid, params, password) — pass plain password; forge encodes UTF-16 internally
            const cipher = forgePbe.getCipher(pbeOid, pbeParams, password);
            if (cipher) {
              cipher.update(forge.util.createBuffer(encContent));
              cipher.finish();
              decrypted = cipher.output.getBytes();
              console.log(`[CertDer-B] forge.pbe.getCipher OK, decrypted len=${decrypted.length}`);
            }
          } catch (pbeErr: any) {
            console.warn('[CertDer-B] forge.pbe.getCipher error:', pbeErr.message);
          }
        }

        // ── Attempt 2: manual PKCS#12 KDF + cipher (3DES / RC2) ─────────────
        if (!decrypted && pbeParams) {
          try {
            const salt = pbeParams.value?.[0]?.value;
            if (typeof salt !== 'string') throw new Error('salt not a string');
            const iterBytes: string = pbeParams.value?.[1]?.value || '\x00\x01';
            let iter = 0;
            for (let i = 0; i < iterBytes.length; i++) iter = (iter << 8) | iterBytes.charCodeAt(i);
            if (iter < 1) iter = 2048;
            console.log(`[CertDer-B] salt len=${salt.length} iter=${iter}`);

            const gk = (n: number) => forge.pkcs12.generateKey(password, salt, 1, iter, n, forge.md.sha1.create());
            const giv = (n: number) => forge.pkcs12.generateKey(password, salt, 2, iter, n, forge.md.sha1.create());

            let cipher: any = null;
            if (pbeOid === PBE_SHA1_3DES) {
              cipher = (forge.des as any).createDecryptionCipher(gk(24));
              cipher.start(giv(8));
            } else if (pbeOid === PBE_SHA1_RC2_128) {
              cipher = (forge.rc2 as any).createDecryptionCipher(gk(16), 128);
              cipher.start(giv(8));
            } else if (pbeOid === PBE_SHA1_RC2_40) {
              cipher = (forge.rc2 as any).createDecryptionCipher(gk(5), 40);
              cipher.start(giv(8));
            } else {
              console.warn(`[CertDer-B] Algoritmo PBE no soportado manualmente: ${pbeOid}`);
            }
            if (cipher) {
              cipher.update(forge.util.createBuffer(encContent));
              cipher.finish();
              decrypted = cipher.output.getBytes();
              console.log(`[CertDer-B] Descifrado manual OK, decrypted len=${decrypted.length}`);
            }
          } catch (manErr: any) {
            console.warn('[CertDer-B] Descifrado manual error:', manErr.message);
          }
        }

        if (!decrypted) { console.warn('[CertDer-B] No se pudo descifrar'); continue; }

        // Parse decrypted SafeContents and extract cert DERs
        try {
          const sc = forge.asn1.fromDer(decrypted);
          const prevLen = results.length;
          extractFromSafeContents(sc);
          console.log(`[CertDer-B] extractFromSafeContents encontró ${results.length - prevLen} certs`);
        } catch (scErr: any) {
          console.warn('[CertDer-B] Error parseando SafeContents descifrado:', scErr.message);
        }
      } catch (ciErr: any) { console.warn('[CertDer-B] Error en ContentInfo:', ciErr.message); }
    }
  } catch (topErr: any) { console.warn('[CertDer-B] Error general:', topErr.message); }

  return results;
}

function extractRawCertDersFromP12(p12DerBytesOrAsn1: string | any): string[] {
  const PKCS7_DATA  = '1.2.840.113549.1.7.1';
  const CERT_BAG    = '1.2.840.113549.1.12.10.1.3';
  const results: string[] = [];
  try {
    // Accept either raw DER bytes or an already-parsed ASN.1 (avoids double parsing)
    const pfx = typeof p12DerBytesOrAsn1 === 'string'
      ? forge.asn1.fromDer(p12DerBytesOrAsn1)
      : p12DerBytesOrAsn1;
    // PFX: SEQUENCE { version(0), authSafe ContentInfo(1), macData(2)? }
    const authSafe = pfx.value[1];                              // ContentInfo
    const contentWrapper = authSafe?.value?.[1];                // [0] explicit
    const outerOctet = contentWrapper?.value?.[0];              // OCTET STRING
    if (typeof outerOctet?.value !== 'string') return results;

    // AuthenticatedSafe = SEQUENCE OF ContentInfo
    const authSafeSeq = forge.asn1.fromDer(outerOctet.value);
    for (const ci of (authSafeSeq.value as any[] || [])) {
      if (!Array.isArray(ci.value) || ci.value.length < 2) continue;
      const ciOid = ci.value[0];
      if (ciOid?.type !== 6) continue;                          // must be OID tag
      if (forge.asn1.derToOid(ciOid.value) !== PKCS7_DATA) continue; // only unencrypted

      // pkcs7-data: [0] OCTET STRING → SafeContents DER
      const innerOctet = ci.value[1]?.value?.[0];
      if (typeof innerOctet?.value !== 'string') continue;

      const safeContents = forge.asn1.fromDer(innerOctet.value);
      for (const safeBag of (safeContents.value as any[] || [])) {
        if (!Array.isArray(safeBag.value) || safeBag.value.length < 2) continue;
        const bagId = safeBag.value[0];
        if (bagId?.type !== 6) continue;
        if (forge.asn1.derToOid(bagId.value) !== CERT_BAG) continue;

        // SafeBag.bagValue[0] = [0]{ CertBag SEQUENCE { certId, [0]{ OCTET STRING } } }
        const certBagSeq = safeBag.value[1]?.value?.[0];
        if (!Array.isArray(certBagSeq?.value) || certBagSeq.value.length < 2) continue;

        // CertBag.certValue [0] → OCTET STRING with raw cert DER
        const certOctet = certBagSeq.value[1]?.value?.[0];
        if (typeof certOctet?.value === 'string') {
          results.push(certOctet.value);
        }
      }
    }
  } catch (_) { /* fall back to re-serialization */ }
  return results;
}

/**
 * Signs an SRI XML with XAdES-BES.
 *
 * certData is the object from the KV store (empresa:X:facturacion:certificado).
 * Fast path  (<100 ms) : uses pre-extracted pkcs8_base64 + rawCertDer_base64 with WebCrypto.
 * Slow path  (~30  s ) : falls back to full P12 parsing (PBKDF2) when pre-extracted data
 *                        is absent (certificates uploaded before this feature was added).
 *                        Fix: re-upload the certificate to activate the fast path.
 */
export async function firmarXMLXAdES(xmlSinFirmar: string, certData: any): Promise<string> {

  // ── Key & certificate resolution ───────────────────────────────────────────
  let cryptoKey: CryptoKey | null = null;   // WebCrypto key (fast path)
  let forgePK:   any             = null;   // forge key    (slow path fallback)
  let certDer    = '';                     // raw cert DER (binary string)
  let certificate: any           = null;   // forge Certificate (for metadata)

  if (certData.pkcs8_base64 && certData.rawCertDer_base64) {
    // ── Fast path: WebCrypto (< 100 ms) ──────────────────────────────────────
    const certDerBytes = forge.util.decode64(certData.rawCertDer_base64);
    const certDerLen   = certDerBytes.length;
    const certDerMd    = forge.md.sha1.create(); certDerMd.update(certDerBytes);
    const certDerSha1  = forge.util.encode64(certDerMd.digest().getBytes());
    console.log(`⚡ Fast path — certDer len=${certDerLen} sha1=${certDerSha1} (subido_en=${certData.subido_en || 'desconocido'})`);
    try {
      const pkcs8Bytes = Uint8Array.from(
        forge.util.decode64(certData.pkcs8_base64), (c: string) => c.charCodeAt(0)
      );
      cryptoKey = await crypto.subtle.importKey(
        'pkcs8', pkcs8Bytes,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
        false, ['sign']
      );
      certDer = certDerBytes;
      certificate = forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer));
    } catch (fastErr: any) {
      console.warn('⚠️ Fast path falló, usando P12 completo:', fastErr.message);
      cryptoKey = null;
    }
  }

  if (!cryptoKey) {
    // ── Slow path: P12 + PBKDF2 (~30 s) ─────────────────────────────────────
    console.warn('🐢 Firma lenta (re-sube el certificado para activar la ruta rápida)');
    const p12Der  = forge.util.decode64(certData.p12_base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certData.password);

    const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const skb = shroudedBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    if (skb.length > 0 && skb[0].key) forgePK = skb[0].key;
    else {
      const plainBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const pkb = plainBags[forge.pki.oids.keyBag] || [];
      if (pkb.length > 0 && pkb[0].key) forgePK = pkb[0].key;
    }
    if (!forgePK) throw new Error('Clave privada no encontrada en el P12');

    const certBagsAll = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certs = certBagsAll[forge.pki.oids.certBag] || [];
    if (certs.length === 0) throw new Error('Certificado no encontrado en el P12');
    certificate = certs.find((b: any) => {
      try { const bc = b.cert!.getExtension('basicConstraints') as any; return !bc || !bc.cA; }
      catch { return true; }
    })?.cert || certs[0].cert!;

    // Method 1: unencrypted bags
    let rawDersSlow = extractRawCertDersFromP12(p12Asn1);
    // Method 2: encrypted bags — pass raw P12 bytes + password for manual decrypt fallback
    if (rawDersSlow.length === 0) {
      rawDersSlow = extractRawCertDersFromForgeP12(p12, p12Der, certData.password);
      if (rawDersSlow.length > 0) {
        console.log('✅ [Firma] Raw DER extraído desde bags cifrados — slow path');
      } else {
        console.warn('⚠️ [Firma] Usando re-serialización del certificado — riesgo FIRMA INVALIDA');
      }
    }
    // Strategy 1: non-CA cert from extracted DERs (matches signing cert by basicConstraints)
    certDer = rawDersSlow.find(der => {
      try {
        const c = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
        const bc = c.getExtension('basicConstraints') as any;
        return !bc || !bc.cA;
      }
      catch { return false; }
    })
    // Strategy 2: serial number match
    ?? rawDersSlow.find(der => {
      try { return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der)).serialNumber === certificate.serialNumber; }
      catch { return false; }
    })
    // Last resort: re-serialization (risk: FIRMA INVALIDA)
    ?? forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  }

  // ── Certificate metadata ───────────────────────────────────────────────────
  const certBase64 = forge.util.encode64(certDer);
  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certDigest = forge.util.encode64(certMd.digest().getBytes());

  // Issuer DN (RFC 2253 — reversed attribute order)
  const issuerAttrs = [...certificate.issuer.attributes].reverse();
  const issuerDN = issuerAttrs
    .map((a: any) => `${a.shortName || a.name}=${a.value}`)
    .join(',');
  const hexSer = (certificate.serialNumber || '0').replace(/^0+/, '') || '0';
  const serialDecimal = BigInt('0x' + hexSer).toString();

  // RSA public key (Modulus + Exponent) — informational only in XAdES-BES
  const pubKey = certificate.publicKey as any;
  const bytesOf = (arr: number[]) => arr.map((b: number) => String.fromCharCode(b < 0 ? b + 256 : b)).join('');
  const modulusB64 = forge.util.encode64(bytesOf(pubKey.n.toByteArray()));
  const exponentB64 = forge.util.encode64(bytesOf(pubKey.e.toByteArray()));

  // 7. Unique IDs
  // SRI's FirmaXML (MITyCLibXADES) uses:
  //   sigId   = "Signature" + generated-id
  //   spId    = sigId + "-SignedProperties"
  //   certKiId = "Certificate1"  ← FIXED suffix "1", NOT a timestamp (from FirmaXML.class)
  //   refId   = "Reference-ID-" + generated-id
  const ts = Date.now();
  const sigId        = `Signature${ts}`;
  const spId         = `Signature${ts}-SignedProperties`;
  const certKiId     = `Certificate1`;           // SRI always uses "Certificate1" (fixed literal)
  const refId        = `Reference-ID-${ts}`;   // Id for the comprobante ds:Reference
  const signingTime  = new Date().toISOString().substring(0, 19) + 'Z';

  // ── 8. Build elements ────────────────────────────────────────────────────
  //
  // C14N NAMESPACE RULE (inclusive C14N, RFC 3076 §2.3):
  //   When SRI verifies URI="#id" references, it selects that element node-set
  //   from the full document.  Since the selected element is the ONLY root in
  //   the node-set, all inherited namespace declarations (from ancestors NOT in
  //   the node-set) ARE re-emitted on that element by the C14N algorithm.
  //
  //   Concrete impact:
  //   • <ds:KeyInfo>  is inside <ds:Signature xmlns:ds="...">.
  //     SRI's C14N of KeyInfo emits xmlns:ds on KeyInfo itself.
  //     ∴ our digest string must also declare xmlns:ds on <ds:KeyInfo>.
  //
  //   • <xades:SignedProperties> is inside <ds:Signature xmlns:ds="...">
  //     and <xades:QualifyingProperties xmlns:xades="...">.
  //     SRI's C14N emits BOTH xmlns:ds and xmlns:xades on SignedProperties.
  //     ∴ our digest string must declare both.
  //
  //   • <ds:SignedInfo> is inside <ds:Signature xmlns:ds="...">.
  //     SRI's C14N for RSA verification emits xmlns:ds on SignedInfo.
  //     ∴ we must SIGN the C14N of <ds:SignedInfo xmlns:ds="...">.

  // KeyInfo — declares xmlns:ds (will be re-emitted by SRI's C14N in context)
  const keyInfoXml =
    `<ds:KeyInfo Id="${certKiId}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:X509Data><ds:X509Certificate>${certBase64}</ds:X509Certificate></ds:X509Data>` +
    `<ds:KeyValue><ds:RSAKeyValue>` +
    `<ds:Modulus>${modulusB64}</ds:Modulus>` +
    `<ds:Exponent>${exponentB64}</ds:Exponent>` +
    `</ds:RSAKeyValue></ds:KeyValue>` +
    `</ds:KeyInfo>`;

  // SignedProperties — declares xmlns:ds AND xmlns:xades (both re-emitted by SRI's C14N)
  const signedProps =
    `<xades:SignedProperties Id="${spId}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${certDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${xmlEncode(issuerDN)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${serialDecimal}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `<xades:SignedDataObjectProperties>` +
    `<xades:DataObjectFormat ObjectReference="#${refId}">` +
    `<xades:Description>contenido comprobante</xades:Description>` +
    `<xades:MimeType>text/xml</xades:MimeType>` +
    `</xades:DataObjectFormat>` +
    `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`;

  // ── 9. Compute Reference digests using C14N ───────────────────────────────

  // Reference 1: <factura id="comprobante"> — URI="#comprobante".
  // xmlSinFirmar has no <ds:Signature> yet; enveloped-signature transform = no-op.
  // <factura> is the root element, so no ancestor namespaces to inherit.
  const c14nDoc     = c14n(xmlSinFirmar);
  const c14nKI      = c14n(keyInfoXml);
  const c14nSP      = c14n(signedProps);
  const docDigest      = sha1b64(c14nDoc);
  const keyInfoDigest  = sha1b64(c14nKI);
  const spDigest       = sha1b64(c14nSP);
  console.log(`[C14N] docDigest=${docDigest} (primeros 80: ${c14nDoc.substring(0,80)})`);
  console.log(`[C14N] keyInfoDigest=${keyInfoDigest} (primeros 80: ${c14nKI.substring(0,80)})`);
  console.log(`[C14N] spDigest=${spDigest} (primeros 120: ${c14nSP.substring(0,120)})`);

  // ── 10. Build SignedInfo ──────────────────────────────────────────────────
  // Reference order confirmed from SRI FirmaXML.class (MITyCLibXADES) bytecode:
  //   method call order: addDocument() → addKeyInfo() → appendObject(XAdES)
  //   maps to Reference order:
  //     1. Comprobante (document, URI="#comprobante")
  //     2. KeyInfo/Certificate (URI="#Certificate1")
  //     3. SignedProperties (Type="...#SignedProperties", URI="#...SignedProperties")
  // xmlns:ds declared here — SRI's C14N for RSA verification re-emits it.
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>` +
    `<ds:Reference Id="${refId}" URI="#comprobante">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference URI="#${certKiId}">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${spId}">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${spDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // ── 11. Sign C14N(SignedInfo) with RSA-SHA1 ───────────────────────────────
  // signedInfo includes xmlns:ds — C14N output matches what SRI computes for verification
  let sigValue: string;
  const c14nSignedInfo = c14n(signedInfo);
  if (cryptoKey) {
    // Fast path: WebCrypto native RSA (< 5 ms)
    const dataBytes = new TextEncoder().encode(c14nSignedInfo);
    const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, dataBytes);
    let bin = '';
    new Uint8Array(sigBuf).forEach(b => { bin += String.fromCharCode(b); });
    sigValue = btoa(bin);
  } else {
    // Slow path: forge pure-JS RSA
    const sigMd = forge.md.sha1.create();
    sigMd.update(forge.util.encodeUtf8(c14nSignedInfo));
    sigValue = forge.util.encode64(forgePK.sign(sigMd));
  }

  // ── Self-verify: confirm key matches cert before sending to SRI ──────────
  try {
    const verifyMd = forge.md.sha1.create();
    verifyMd.update(forge.util.encodeUtf8(c14nSignedInfo));
    const certPub = (forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer)) as any).publicKey;
    const sigBytes = forge.util.decode64(sigValue);
    const selfOk = certPub.verify(verifyMd.digest().bytes(), sigBytes);
    console.log(`[Firma] Self-verify (clave↔cert): ${selfOk ? '✅ OK' : '❌ FALLO — clave no corresponde al cert'}`);
  } catch (ve: any) {
    console.warn('[Firma] Self-verify error:', ve.message);
  }

  // ── 12. Assemble ds:Signature block ──────────────────────────────────────
  // In the assembled XML the inner elements have redundant namespace declarations,
  // but that is valid XML and does not affect verification (xmlns is idempotent).
  const signatureBlock =
    `<ds:Signature Id="${sigId}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<ds:SignatureValue Id="${sigId}-SignatureValue">${sigValue}</ds:SignatureValue>` +
    keyInfoXml +
    `<ds:Object Id="${sigId}-Object">` +
    `<xades:QualifyingProperties Target="#${sigId}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
    signedProps +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`;

  // ── 13. Inject before closing </factura> ─────────────────────────────────
  return xmlSinFirmar.replace('</factura>', signatureBlock + '</factura>');
}

// ============================================================
// SRI SOAP: RECEPTION
// ============================================================

/** Converts a UTF-8 string to base64 safely in Deno (handles chars > U+00FF). */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  // Process in chunks to avoid call-stack overflow on large strings
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function enviarXMLAlSRI(xml: string, ambiente: string, timeoutMs = 10000): Promise<{ recibida: boolean; devuelta: boolean; claveYaRegistrada?: boolean; errores: string[]; rawResponse?: string }> {
  const sriUrl = ambiente === 'produccion'
    ? 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline'
    : 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline';

  const xmlBase64 = utf8ToBase64(xml);

  const soap =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<ec:validarComprobante><xml>${xmlBase64}</xml></ec:validarComprobante>` +
    `</soapenv:Body></soapenv:Envelope>`;

  // AbortController with manual timeout (more compatible than AbortSignal.timeout)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(sriUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '""',
        'Accept': 'text/xml, application/xml, */*',
        'User-Agent': 'RestaurantePOS/1.0',
      },
      body: soap,
      signal: controller.signal,
      // Bloqueamos redirecciones automaticas: el SRI ocasionalmente responde
      // con 30x hacia su IP interna (181.113.x.x) cuyo certificado TLS no es
      // valido para esa IP, causando 'NotValidForName'. Tratamos un redirect
      // como fallo controlado en lugar de seguirlo a un destino con cert roto.
      redirect: 'manual',
    });
    clearTimeout(timer);
    if (resp.status >= 300 && resp.status < 400) {
      return { recibida: false, devuelta: false, errores: [
        'El servidor del SRI esta redirigiendo a una IP con certificado TLS invalido. ' +
        'Esto es una falla temporal del servicio del SRI (no del ERP). ' +
        'Espere 10-15 minutos e intente nuevamente. Si persiste por mas de 1 hora, ' +
        'consulte estado del SRI en https://www.sri.gob.ec'
      ] };
    }
    const body = await resp.text();
    console.log('[SRI Recepcion] HTTP', resp.status, '| resp:', body.substring(0, 600));

    // "CLAVE ACCESO REGISTRADA" = el comprobante YA existe en SRI de un envío anterior.
    // SRI lo devuelve como DEVUELTA, pero NO es un rechazo nuevo — el doc fue procesado antes.
    // En este caso se debe ir directo al servicio de Autorización para ver el estado real.
    const claveYaRegistrada =
      body.includes('CLAVE ACCESO REGISTRADA') ||
      body.includes('CLAVE DE ACCESO REGISTRADA');

    const recibida = body.includes('RECIBIDA') || claveYaRegistrada;
    // Sólo es DEVUELTA "real" si NO es el caso de clave ya registrada
    const devuelta = body.includes('DEVUELTA') && !claveYaRegistrada;
    const errores = (devuelta || !recibida) ? parsearMensajesSRI(body) : [];
    return { recibida, devuelta, claveYaRegistrada, errores, rawResponse: body.substring(0, 800) };
  } catch (err: any) {
    clearTimeout(timer);
    const detail = [err.name, err.message, err.cause?.message || String(err.cause || '')].filter(Boolean).join(' — ');
    console.error('[SRI Recepcion] Error:', detail);
    const esCertInvalido = /NotValidForName|invalid peer certificate|UnknownIssuer/i.test(detail);
    const errorMsg = esCertInvalido
      ? 'El servidor del SRI presenta un certificado TLS invalido en este momento (falla del SRI, no del ERP). ' +
        'Espere 10-15 minutos e intente nuevamente.'
      : `Error conectando al SRI: ${detail}`;
    return { recibida: false, devuelta: false, errores: [errorMsg] };
  }
}

// ============================================================
// SRI SOAP: AUTHORIZATION QUERY
// ============================================================

export async function consultarAutorizacionSRI(claveAcceso: string, ambiente: string, timeoutMs = 12000): Promise<{
  autorizado: boolean; numeroAutorizacion: string; fechaAutorizacion: string; mensajes: string[]; estadoSRI: string;
}> {
  const sriUrl = ambiente === 'produccion'
    ? 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline'
    : 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline';

  const soap =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<ec:autorizacionComprobante><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ec:autorizacionComprobante>` +
    `</soapenv:Body></soapenv:Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(sriUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '""',
        'Accept': 'text/xml, application/xml, */*',
        'User-Agent': 'RestaurantePOS/1.0',
      },
      body: soap,
      signal: controller.signal,
      // Ver comentario en enviarXMLAlSRI sobre por que no seguimos redirects.
      redirect: 'manual',
    });
    clearTimeout(timer);
    if (resp.status >= 300 && resp.status < 400) {
      return {
        autorizado: false, numeroAutorizacion: '', fechaAutorizacion: '',
        mensajes: ['SRI esta redirigiendo a una IP con certificado TLS invalido. Falla temporal del servicio SRI. Espere 10-15 minutos e intente.'],
        estadoSRI: ''
      };
    }
    const body = await resp.text();
    console.log('[SRI Autorizacion] HTTP', resp.status, '| resp:', body.substring(0, 800));

    // ✅ CRITICAL FIX: 'NO AUTORIZADO'.includes('AUTORIZADO') === true in JS
    // Must parse the <estado> XML element and match EXACTLY — never use body.includes()
    const estadoMatch = body.match(/<estado>\s*([^<]+?)\s*<\/estado>/i);
    const estadoSRI = estadoMatch?.[1]?.trim() ?? '';
    console.log('[SRI Autorizacion] estado parseado:', JSON.stringify(estadoSRI));

    // AUTORIZADO only when estado element equals exactly 'AUTORIZADO'
    // Also accept if numeroAutorizacion is present and non-empty (secondary check)
    const numeroAutorizacion = body.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/)?.[1]?.trim() || '';
    const fechaAutorizacion = body.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/)?.[1]?.trim() || '';
    const autorizado = estadoSRI === 'AUTORIZADO' && numeroAutorizacion.length > 10;

    const mensajes = parsearMensajesSRI(body);

    if (!autorizado && estadoSRI) {
      // Log the real SRI status and mensajes to help diagnose rejections
      console.warn(`[SRI Autorizacion] Estado SRI: "${estadoSRI}" — mensajes: ${JSON.stringify(mensajes)}`);
    }

    return { autorizado, numeroAutorizacion, fechaAutorizacion, mensajes, estadoSRI };
  } catch (err: any) {
    clearTimeout(timer);
    const detail = [err.name, err.message, err.cause?.message || String(err.cause || '')].filter(Boolean).join(' — ');
    console.error('[SRI Autorizacion] Error:', detail);
    const esCertInvalido = /NotValidForName|invalid peer certificate|UnknownIssuer/i.test(detail);
    const errorMsg = esCertInvalido
      ? 'El servidor del SRI presenta un certificado TLS invalido en este momento. Falla temporal del servicio del SRI (no del ERP). Espere 10-15 minutos e intente nuevamente.'
      : `Error SRI autorizacion: ${detail}`;
    return { autorizado: false, numeroAutorizacion: '', fechaAutorizacion: '', mensajes: [errorMsg], estadoSRI: '' };
  }
}

// ============================================================
// CERTIFICATE MANAGEMENT
// ============================================================

export async function handleUploadCertificado(req: Request, empresaId: string) {
  try {
    const body = await req.json();
    const { p12_base64, password, nombre } = body;

    if (!p12_base64 || !password) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el certificado (base64) y la contraseña' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate certificate by parsing and pre-extract PKCS#8 private key
    // Storing pkcs8_base64 avoids the expensive PBKDF2 decryption (30+ seconds)
    // on every invoice — signing will use WebCrypto directly (< 100ms).
    let certInfo: any = {};
    let pkcs8_base64 = '';
    let rawCertDer_base64 = '';
    try {
      const p12Der = forge.util.decode64(p12_base64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

      // Extract private key → PKCS#8 DER → base64
      let privateKey: any = null;
      const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const skb = shroudedBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
      if (skb.length > 0 && skb[0].key) privateKey = skb[0].key;
      else {
        const plainBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
        const pkb = plainBags[forge.pki.oids.keyBag] || [];
        if (pkb.length > 0 && pkb[0].key) privateKey = pkb[0].key;
      }
      if (privateKey) {
        const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey));
        const pkcs8Der  = forge.asn1.toDer(pkcs8Asn1).getBytes();
        pkcs8_base64 = forge.util.encode64(pkcs8Der);
      }

      // Extract raw cert DER (original bytes — no re-serialization to avoid "certificados alterados")
      // Method 1: traverse unencrypted pkcs7-data bags in raw ASN.1 (works for some P12 formats)
      let rawDers = extractRawCertDersFromP12(p12Asn1);

      // Method 2: use forge's already-decrypted bag.asn1 (handles pkcs7-encryptedData bags
      // used by BCE, Security Data, ANF AC — pass raw P12 bytes + password for manual decrypt fallback
      if (rawDers.length === 0) {
        rawDers = extractRawCertDersFromForgeP12(p12, p12Der, password);
        if (rawDers.length > 0) {
          console.log('✅ [Certificado] Raw DER extraído desde bags cifrados (pkcs7-encryptedData) — método forge');
        } else {
          console.warn('⚠️ [Certificado] No se pudo extraer raw DER — se usará re-serialización (riesgo de "certificados alterados")');
        }
      } else {
        console.log('✅ [Certificado] Raw DER extraído desde bags no cifrados (pkcs7-data)');
      }

      const certBagsAll = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBagsAll[forge.pki.oids.certBag] || [];

      if (certs.length > 0) {
        const endEntity = certs.find((b: any) => {
          try { const bc = b.cert!.getExtension('basicConstraints') as any; return !bc || !bc.cA; }
          catch { return true; }
        }) || certs[0];
        const cert = endEntity.cert!;

        // Strategy 1: find non-CA cert directly from extracted DERs (most reliable)
        const endEntityDer = rawDers.find(der => {
          try {
            const c = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
            const bc = c.getExtension('basicConstraints') as any;
            return !bc || !bc.cA;
          }
          catch { return false; }
        });
        // Strategy 2: match by serial number from p12.getBags (fallback)
        const matchedBySerial = endEntityDer ? null : rawDers.find(der => {
          try { return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der)).serialNumber === cert.serialNumber; }
          catch { return false; }
        });

        if (endEntityDer) {
          console.log('[Certificado] DER: end-entity cert encontrado por basicConstraints ✓');
          rawCertDer_base64 = forge.util.encode64(endEntityDer);
        } else if (matchedBySerial) {
          console.log('[Certificado] DER: end-entity cert encontrado por serialNumber ✓');
          rawCertDer_base64 = forge.util.encode64(matchedBySerial);
        } else {
          console.warn('[Certificado] DER: FALLBACK re-serialización — basicConstraints y serialNumber fallaron');
          rawCertDer_base64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
        }

        const cn = cert.subject.attributes.find((a: any) => a.shortName === 'CN');
        const cnIssuer = cert.issuer.attributes.find((a: any) => a.shortName === 'CN');
        certInfo = {
          titular: cn?.value || 'Desconocido',
          emisor: cnIssuer?.value || 'Desconocido',
          valido_desde: cert.validity.notBefore.toISOString(),
          valido_hasta: cert.validity.notAfter.toISOString(),
          vigente: cert.validity.notAfter > new Date(),
        };
      }
    } catch (parseErr: any) {
      return new Response(
        JSON.stringify({ error: `Certificado inválido o contraseña incorrecta: ${parseErr.message}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!certInfo.vigente) {
      return new Response(
        JSON.stringify({ error: `El certificado está vencido. Válido hasta: ${certInfo.valido_hasta}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await setCert(empresaId, {
      p12_base64,
      password,
      pkcs8_base64,
      rawCertDer_base64,
      nombre: nombre || 'certificado.p12',
      info: certInfo,
      subido_en: new Date().toISOString(),
    });

    // Mark firma as active in config
    const config = await getConfig(empresaId);
    if (config) {
      config.firma_electronica_activa = true;
      config.firma_electronica_nombre = nombre || 'certificado.p12';
      config.firma_electronica_validez = certInfo.valido_hasta || '';
      await setConfig(empresaId, config);
    }

    console.log('✅ Certificado P12 cargado para empresa:', empresaId, certInfo);
    return new Response(
      JSON.stringify({ success: true, mensaje: 'Certificado cargado exitosamente', info: certInfo }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error cargando certificado:', error);
    return new Response(
      JSON.stringify({ error: 'Error al cargar certificado', detalle: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleGetCertificadoInfo(req: Request, empresaId: string) {
  try {
    const cert = await getCert(empresaId);
    if (!cert) {
      return new Response(JSON.stringify({ certificado: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(
      JSON.stringify({ certificado: { nombre: cert.nombre, info: cert.info, subido_en: cert.subido_en } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Error al obtener info del certificado' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================
// CONFIGURACIÓN DE FACTURACIÓN
// ============================================================

export async function handleGetConfiguracionFacturacion(req: Request, empresaId: string) {
  try {
    const config = await getConfig(empresaId);
    return new Response(
      JSON.stringify({
        configuracion: config || {
          razon_social: '', nombre_comercial: '', ruc: '',
          direccion_matriz: '', direccion_establecimiento: '', telefono: '', email: '',
          obligado_contabilidad: false, contribuyente_especial: '', agente_retencion: '',
          regimen_rimpe: false, tipo_contribuyente: 'sociedad', codigo_establecimiento: '001', punto_emision: '001',
          secuencial_actual: 1, firma_electronica_activa: false,
          firma_electronica_nombre: '', firma_electronica_validez: '', ambiente: 'pruebas',
          // Reglamento Ley de Turismo Ecuador (03-OCT-2025)
          numero_registro_turismo: '', categoria_tenedores: 0,
          luaf_numero: '', luaf_fecha_emision: '', luaf_fecha_vencimiento: '',
          // 10% de servicio (Decreto Ejecutivo 1269 — restaurantes turísticos categorizados)
          cobra_servicio_10pct: false, porcentaje_servicio: 10,
          // Canales de venta y comisiones de delivery (apps)
          canales_venta: [
            { codigo: 'directo',    nombre: 'Directo',    comision_pct: 0,  activo: true,  color: '#22c55e' },
            { codigo: 'uber_eats',  nombre: 'Uber Eats',  comision_pct: 30, activo: true,  color: '#000000' },
            { codigo: 'rappi',      nombre: 'Rappi',      comision_pct: 25, activo: true,  color: '#FF441F' },
            { codigo: 'pedidosya',  nombre: 'PedidosYa',  comision_pct: 22, activo: true,  color: '#FA0050' },
            { codigo: 'didi_food',  nombre: 'DiDi Food',  comision_pct: 25, activo: true,  color: '#FF7A00' },
          ],
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error al obtener configuración' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleSaveConfiguracionFacturacion(req: Request, empresaId: string) {
  try {
    let config: any;
    try { config = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!config || typeof config !== 'object') {
      return new Response(JSON.stringify({ error: 'Configuración inválida' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!config.razon_social || !config.ruc || !config.direccion_matriz) {
      return new Response(JSON.stringify({ error: 'Faltan datos obligatorios: razón social, RUC y dirección' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const ruc = String(config.ruc).replace(/\D/g, '');
    if (ruc.length !== 13) {
      return new Response(JSON.stringify({ error: `RUC debe tener 13 dígitos (recibido: ${ruc.length})` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    config.ruc = ruc;
    await setConfig(empresaId, config);
    console.log('✅ Config facturación guardada:', empresaId);
    return new Response(JSON.stringify({ success: true, mensaje: 'Configuración guardada' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error al guardar configuración', detalle: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// GENERAR FACTURA (con firma XAdES-BES + envío SRI)
// ============================================================

export async function handleGenerarFactura(req: Request, empresaId: string) {
  try {
    const ventaData = await req.json();

    const config = await getConfig(empresaId);
    if (!config || !config.ruc || !config.razon_social) {
      return new Response(
        JSON.stringify({ error: 'Configure el RUC y razón social antes de generar facturas', requiere_configuracion: true }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Clave de acceso ──────────────────────────────────────
    // IMPORTANT: Edge functions run on UTC servers. Ecuador is UTC-5 (no DST).
    // We must use Ecuador local time for the invoice date — otherwise after
    // 19:00 Ecuador time (00:00 UTC) the date jumps to tomorrow and SRI rejects.
    const nowUtc = new Date();
    const nowEc  = new Date(nowUtc.getTime() - 5 * 60 * 60 * 1000); // shift to UTC-5
    const dd  = String(nowEc.getUTCDate()).padStart(2, '0');
    const mo  = String(nowEc.getUTCMonth() + 1).padStart(2, '0');
    const yy  = String(nowEc.getUTCFullYear());
    const hh  = String(nowEc.getUTCHours()).padStart(2, '0');
    const min = String(nowEc.getUTCMinutes()).padStart(2, '0');
    const ss  = String(nowEc.getUTCSeconds()).padStart(2, '0');
    const ambCod = config.ambiente === 'produccion' ? '2' : '1';

    // ── Incremento atómico del secuencial (previene race condition entre requests simultáneos) ──
    // UPDATE con optimistic lock: solo tiene efecto si el valor actual coincide con el leído.
    // Si otro request ya lo incrementó, maybeSingle() retorna null → 409.
    const secActual = config.secuencial_actual || 1;
    const { data: secResult } = await getDB()
      .from('configuracion_facturacion')
      .update({ secuencial_actual: secActual + 1, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('secuencial_actual', secActual)
      .select('secuencial_actual')
      .maybeSingle();
    if (!secResult) {
      return Response.json({
        error: 'Conflicto al reservar el secuencial — otro comprobante se está emitiendo simultáneamente. Espere un momento e intente de nuevo.',
      }, { status: 409 });
    }
    const secStr = String(secActual).padStart(9, '0');
    const cod8 = Math.floor(10000000 + Math.random() * 90000000).toString();
    // Pad estab/ptoEmi to exactly 3 digits — SRI access key requires fixed-length fields
    const estab3 = String(config.codigo_establecimiento || '001').padStart(3, '0').substring(0, 3);
    const ptoEmi3 = String(config.punto_emision || '001').padStart(3, '0').substring(0, 3);
    const claveBase = dd + mo + yy + '01' + config.ruc + ambCod + estab3 + ptoEmi3 + secStr + cod8 + '1';
    const claveAcceso = claveBase + calcularModulo11(claveBase);
    const numeroFactura = `${estab3}-${ptoEmi3}-${secStr}`;

    // ── Calcular totales con redondeo correcto ───────────────
    // Problema JS: (1.50*0.15).toFixed(2) = "0.22" pero (1.725).toFixed(2) = "1.73"
    // → diferencia de $0.01 en el RIDE y en el XML → SRI rechaza por inconsistencia
    // Solución: usar Math.round(x * 100) / 100 en cadena desde la base
    const _base = Math.round(Number(ventaData.subtotal || 0) * 100) / 100;
    const _desc = Math.round(Number(ventaData.descuento || 0) * 100) / 100;
    const _ivaRaw = Number(ventaData.impuestos || ventaData.iva || 0);
    // Si el POS envió IVA, redondearlo; si no, calcularlo del subtotal
    const _iva = Math.round((_ivaRaw > 0 ? _ivaRaw : _base * 0.15) * 100) / 100;
    const _total = Math.round((_base + _iva) * 100) / 100;

    // Construir items normalizados:
    // El POS envía precios CON IVA incluido, pero el XML SRI necesita
    // precioUnitario y precioTotalSinImpuesto SIN IVA.
    // Además, si hay descuento global se distribuye proporcionalmente.
    // El ÚLTIMO ítem absorbe todo residuo de redondeo para que
    // sum(precioTotalSinImpuesto) == totalSinImpuestos (header) exactamente.
    const _itemsBrutos = (ventaData.items || []).map((i: any) => {
      const cant    = Number(i.cantidad || 1);
      const precio  = Number(i.precio_unitario || i.precio || 0);
      const rawSub  = Number(i.subtotal || 0);
      const bruto   = Math.round((rawSub > 0 ? rawSub : cant * precio) * 100) / 100;
      const iva     = Number(i.tarifa_iva ?? 15);
      // precio unitario sin IVA (para campo precioUnitario del XML)
      const precioSinIva = iva > 0 ? precio / (1 + iva / 100) : precio;
      return { cant, precio, precioSinIva, bruto, iva, nombre: i.nombre || i.descripcion || 'Producto' };
    });
    const totalBruto = _itemsBrutos.reduce((s: number, i: any) => s + i.bruto, 0);

    let sumItems = 0;
    const _items = _itemsBrutos.map((i: any, idx: number) => {
      const isLast = idx === _itemsBrutos.length - 1;
      // Descuento proporcional de la línea (sobre precio bruto)
      const descLinea = (!isLast && totalBruto > 0)
        ? Math.round((i.bruto / totalBruto) * _desc * 100) / 100
        : 0;
      let sub: number;
      if (isLast) {
        // Absorber residuo de redondeo IVA + descuento
        sub = Math.round((_base - sumItems) * 100) / 100;
      } else {
        // Extraer IVA del bruto y restar descuento proporcional
        const baseSinIva = i.iva > 0
          ? Math.round(i.bruto / (1 + i.iva / 100) * 100) / 100
          : i.bruto;
        sub = Math.round((baseSinIva - descLinea) * 100) / 100;
        sumItems += sub;
      }
      return {
        cantidad:       i.cant,
        descripcion:    i.nombre,
        precio_unitario: i.precioSinIva,  // sin IVA → correcto para precioUnitario en XML
        descuento:      descLinea,
        subtotal:       sub,              // sin IVA → precioTotalSinImpuesto
        tarifa_iva:     i.iva,
      };
    });

    // ── Build factura object ─────────────────────────────────
    const factura: any = {
      // Emisor
      razon_social: config.razon_social,
      nombre_comercial: config.nombre_comercial || config.razon_social,
      ruc: config.ruc,
      direccion_matriz: config.direccion_matriz,
      direccion_establecimiento: config.direccion_establecimiento || config.direccion_matriz,
      telefono: config.telefono || '',
      email: config.email || '',
      obligado_contabilidad: config.obligado_contabilidad || false,
      regimen_rimpe: config.regimen_rimpe || false,
      contribuyente_especial: config.contribuyente_especial || '',
      agente_retencion: config.agente_retencion || '',
      // Comprobante
      numero_factura: numeroFactura,
      clave_acceso: claveAcceso,
      fecha_emision: `${yy}-${mo}-${dd}`,   // Ecuador date (UTC-5)
      hora_emision:  `${hh}:${min}:${ss}`,  // Ecuador time (UTC-5)
      codigo_establecimiento: config.codigo_establecimiento,
      punto_emision: config.punto_emision,
      secuencial: config.secuencial_actual,
      ambiente: ambCod,
      // Cliente
      cliente_identificacion: ventaData.cliente_identificacion || '9999999999999',
      cliente_tipo_identificacion: ventaData.cliente_tipo_identificacion || '07',
      cliente_razon_social: ventaData.cliente_razon_social || 'Consumidor Final',
      cliente_email: ventaData.cliente_email || '',
      // Ítems (subtotales ya redondeados)
      items: _items,
      // Totales (ya calculados con redondeo correcto antes del objeto)
      subtotal_iva: _base,
      subtotal: _base,
      subtotal_0: 0,
      subtotal_no_objeto: 0,
      total_descuento: _desc,
      descuento: _desc,
      iva: _iva,
      total: _total,
      // Pago
      formas_pago: [{
        codigo: getCodigoPago(ventaData.metodo_pago || 'efectivo'),
        descripcion: getNombrePago(ventaData.metodo_pago || 'efectivo'),
        total: _total,
      }],
      // Estado inicial
      estado: 'PENDIENTE',
      estado_autorizacion: 'PENDIENTE',
      fecha_autorizacion: null,
      numero_autorizacion: null,
      mensajes_sri: [] as string[],
      xml_sin_firmar: '',
      xml_firmado: '',
      firmado_digitalmente: false,
      // Meta
      venta_id: ventaData.numero_ticket || '',
      empresa_id: empresaId,
      creado_en: nowUtc.toISOString(),
      created_at: nowUtc.toISOString(),
      // CxC: si el pago fue inmediato (efectivo/tarjeta) en POS, la factura ya está cobrada
      cobrado: !['credito','crédito','cuenta_corriente','cuenta corriente'].includes(
        (ventaData.metodo_pago || 'efectivo').toLowerCase()
      ),
      monto_cobrado: !['credito','crédito','cuenta_corriente','cuenta corriente'].includes(
        (ventaData.metodo_pago || 'efectivo').toLowerCase()
      ) ? _total : 0,
      fecha_cobro: !['credito','crédito','cuenta_corriente','cuenta corriente'].includes(
        (ventaData.metodo_pago || 'efectivo').toLowerCase()
      ) ? nowUtc.toISOString().split('T')[0] : null,
    };

    // ── Generate XML ─────────────────────────────────────────
    const xmlSinFirmar = buildSRIXML(factura);
    factura.xml_sin_firmar = xmlSinFirmar;
    let xmlParaEnviar = xmlSinFirmar;

    // ── Sign with XAdES-BES (if certificate loaded) ──────────
    const certData = await getCert(empresaId);
    const tieneCertificado = !!(certData?.p12_base64 && certData?.password);

    if (tieneCertificado) {
      try {
        xmlParaEnviar = await firmarXMLXAdES(xmlSinFirmar, certData);
        factura.firmado_digitalmente = true;
        console.log('✅ XML firmado digitalmente con XAdES-BES');
      } catch (signErr: any) {
        console.warn('⚠️ Firma fallida:', signErr.message);
        factura.mensajes_sri.push(`Error al firmar: ${signErr.message}`);
      }
    } else {
      factura.mensajes_sri.push('Sin firma digital — cargue su certificado P12 en Configuración para que el SRI autorice el comprobante.');
    }
    factura.xml_firmado = xmlParaEnviar;

    // ── Save before SRI call (preserve on network error) ────
    const facturaId = `FAC-${Date.now()}`;
    await setFactura(empresaId, facturaId, factura);
    // secuencial ya fue incrementado de forma atómica antes de generar el XML

    // ── SRI Reception (fast path — no blocking authorization wait) ──────────
    // Short 10s timeout prevents Edge Function from timing out (60s limit).
    // Authorization is fetched separately via "Reintentar" in Consulta de Facturas.
    const ambienteStr = config.ambiente === 'produccion' ? 'produccion' : 'pruebas';
    const { recibida, devuelta, claveYaRegistrada: claveReg, errores, rawResponse: rawRec } = await enviarXMLAlSRI(xmlParaEnviar, ambienteStr, 10000);
    console.log(`[GenerarFactura] SRI recepcion → recibida=${recibida} devuelta=${devuelta} claveYaRegistrada=${claveReg} errores=${JSON.stringify(errores)}`);

    if (claveReg) {
      // Clave ya registrada — el documento existe en SRI pero no fue autorizado antes
      factura.estado = 'PENDIENTE';
      factura.mensajes_sri = ['⚠️ Clave de acceso ya registrada en SRI — consultando autorización...'];
    } else if (devuelta) {
      // SRI received but rejected the XML (invalid signature, format error, etc.)
      factura.estado = 'NO_AUTORIZADO';
      factura.estado_autorizacion = 'NO_AUTORIZADO';
      factura.mensajes_sri = errores.length > 0
        ? errores
        : ['❌ XML devuelto por SRI (DEVUELTA). Verifique la firma electrónica y el formato.'];
      if (rawRec) factura.debug_sri_response = rawRec.substring(0, 500);
      console.log('❌ SRI rechazó el comprobante:', errores);
    } else if (recibida) {
      // RECIBIDA — don't block waiting for authorization; user retries from Consulta de Facturas
      factura.estado = 'PENDIENTE';
      factura.estado_autorizacion = 'PENDIENTE';
      factura.mensajes_sri = ['✅ Comprobante RECIBIDO por el SRI. Autorización en proceso — use el botón "Reintentar" en Consulta de Facturas en unos segundos.'];
      console.log('📤 Comprobante RECIBIDO por SRI:', facturaId);
    } else {
      // Could not reach SRI (network error, timeout, etc.)
      factura.estado = 'PENDIENTE';
      factura.estado_autorizacion = 'PENDIENTE';
      const motivo = errores.length > 0 ? errores.join('; ') : 'No se recibió respuesta del SRI';
      if (!factura.mensajes_sri.some((m: string) => m.includes('Sin firma'))) {
        factura.mensajes_sri.push(motivo);
      } else {
        factura.mensajes_sri.push(`SRI: ${motivo}`);
      }
      console.warn('⚠️ SRI sin respuesta:', motivo);
    }

    await setFactura(empresaId, facturaId, factura);
    console.log('📄 Factura guardada:', facturaId, factura.estado);

    // ── Asiento contable de la factura ────────────────────────
    // El asiento de ingreso ya fue registrado por el POS cuando se realizó la venta
    // (tipo='venta_pos': Banco/Caja Dr → Ventas Cr + IVA Cr).
    // Crear otro asiento aquí duplicaría el ingreso → NO se registra asiento para facturas de ventas POS.
    // (Si en el futuro se requieren facturas de crédito puro sin venta POS previa,
    //  agregar lógica aquí verificando que ventaData.id esté vacío.)

    // ── Auto-guardar cliente (si no es Consumidor Final) ──────────
    try {
      const ruc = factura.cliente_identificacion;
      const esConsumidorFinal = !ruc || ruc === '9999999999999' || ruc === '0000000000000';
      if (!esConsumidorFinal) {
        const db = getDB();
        // Buscar si ya existe por identificación
        const { data: existente } = await db.from('clientes')
          .select('id, total_compras, ultima_compra')
          .eq('empresa_id', empresaId)
          .eq('identificacion', ruc)
          .maybeSingle();

        if (existente) {
          // Actualizar estadísticas
          await db.from('clientes').update({
            nombre: factura.cliente_razon_social,
            email: factura.cliente_email || existente.email || null,
            total_compras: (Number(existente.total_compras) || 0) + factura.total,
            ultima_compra: nowUtc.toISOString(),
            updated_at: nowUtc.toISOString(),
          }).eq('id', existente.id);
        } else {
          // Crear nuevo cliente
          await db.from('clientes').insert({
            empresa_id: empresaId,
            identificacion: ruc,
            tipo_identificacion: factura.cliente_tipo_identificacion || '04',
            nombre: factura.cliente_razon_social,
            email: factura.cliente_email || null,
            total_compras: factura.total,
            ultima_compra: nowUtc.toISOString(),
            created_at: nowUtc.toISOString(),
            updated_at: nowUtc.toISOString(),
          });
        }
      }
    } catch (clienteErr: any) {
      console.warn('[factura] No se pudo guardar cliente:', clienteErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, factura_id: facturaId, factura, firmada: factura.firmado_digitalmente }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error generando factura:', error);
    return new Response(
      JSON.stringify({ error: 'Error al generar factura', detalle: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================
// OBTENER FACTURAS (normalized shape)
// ============================================================

export async function handleGetFacturas(req: Request, empresaId: string) {
  try {
    const entries = await listFacturas(empresaId);

    const facturas = entries.map(([key, value]: [string, any]) => {
      const id = key;
      const estado = value.estado || value.estado_autorizacion || 'PENDIENTE';
      return {
        ...value,
        id,
        // Normalize for ConsultaFacturas.tsx interface
        estado,
        estado_autorizacion: estado,
        subtotal: value.subtotal ?? value.subtotal_iva ?? 0,
        subtotal_iva: value.subtotal_iva ?? value.subtotal ?? 0,
        descuento: value.descuento ?? value.total_descuento ?? 0,
        total_descuento: value.total_descuento ?? value.descuento ?? 0,
        created_at: value.created_at || value.creado_en || '',
        creado_en: value.creado_en || value.created_at || '',
        ambiente: normalizeAmbiente(value.ambiente),
      };
    });

    facturas.sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return new Response(JSON.stringify({ facturas }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('❌ Error obteniendo facturas:', error);
    return new Response(JSON.stringify({ facturas: [], error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// AUTORIZAR / REINTENTAR (core shared)
// ============================================================

async function autorizarCore(empresaId: string, facturaId: string): Promise<{ factura: any; error?: string; status?: number }> {
  const factura = await getFactura(empresaId, facturaId);
  if (!factura) return { factura: null, error: 'Factura no encontrada', status: 404 };

  const config = await getConfig(empresaId);
  if (!config) return { factura: null, error: 'Configuración de facturación no encontrada', status: 400 };

  const ambienteStr = config.ambiente === 'produccion' ? 'produccion' : 'pruebas';

  // ALWAYS re-sign on retry so the latest signing code is used.
  // (Previous xml_firmado may have been generated by a broken/older signing version.)
  const certData = await getCert(empresaId);
  let xml = factura.xml_sin_firmar || buildSRIXML(factura);

  if (certData?.p12_base64 && certData?.password) {
    try {
      xml = await firmarXMLXAdES(xml, certData);
      factura.xml_firmado = xml;
      factura.firmado_digitalmente = true;
      console.log('[autorizarCore] Re-firmado con código actual ✓');
    } catch (e: any) {
      console.warn('[autorizarCore] Re-sign falló, usando XML previo:', e.message);
      xml = factura.xml_firmado || xml;
    }
  } else {
    xml = factura.xml_firmado || xml;
  }

  // Reception: 12s timeout; authorization: 12s timeout; total SRI budget ~25s
  const { recibida, devuelta, claveYaRegistrada, errores, rawResponse } = await enviarXMLAlSRI(xml, ambienteStr, 12000);
  console.log(`[autorizarCore] SRI recepcion → recibida=${recibida} devuelta=${devuelta} claveYaRegistrada=${claveYaRegistrada} errores=${JSON.stringify(errores)}`);

  // Helper: consultar autorización y actualizar factura
  const procesarAutorizacion = async (contexto: string) => {
    await new Promise(r => setTimeout(r, 1500));
    const auth = await consultarAutorizacionSRI(factura.clave_acceso, ambienteStr, 12000);
    console.log(`[autorizarCore][${contexto}] auth → estadoSRI=${auth.estadoSRI} autorizado=${auth.autorizado} mensajes=${JSON.stringify(auth.mensajes)}`);
    if (auth.autorizado) {
      factura.estado = 'AUTORIZADO';
      factura.estado_autorizacion = 'AUTORIZADO';
      factura.numero_autorizacion = auth.numeroAutorizacion || factura.clave_acceso;
      factura.fecha_autorizacion = auth.fechaAutorizacion || new Date().toISOString();
      factura.mensajes_sri = auth.mensajes.length ? auth.mensajes : ['✅ AUTORIZADO por SRI'];
    } else if (auth.estadoSRI === 'NO AUTORIZADO') {
      console.warn(`[autorizarCore][${contexto}] NO AUTORIZADO definitivo. Mensajes:`, auth.mensajes);
      factura.estado = 'NO_AUTORIZADO';
      factura.estado_autorizacion = 'NO_AUTORIZADO';
      // Filtrar mensaje "CLAVE ACCESO REGISTRADA" si hay otros mensajes más útiles
      const mensajesUtiles = auth.mensajes.filter(m => !m.includes('CLAVE ACCESO REGISTRADA') && !m.includes('CLAVE DE ACCESO REGISTRADA'));
      factura.mensajes_sri = mensajesUtiles.length > 0
        ? mensajesUtiles
        : auth.mensajes.length > 0
        ? auth.mensajes
        : ['❌ NO AUTORIZADO por SRI — verifique la firma electrónica del certificado'];
    } else {
      console.log(`[autorizarCore][${contexto}] Pendiente. estadoSRI:`, auth.estadoSRI, 'mensajes:', auth.mensajes);
      factura.estado = 'PENDIENTE';
      factura.estado_autorizacion = 'PENDIENTE';
      factura.mensajes_sri = auth.mensajes.length
        ? auth.mensajes
        : ['RECIBIDA — autorización pendiente. Reintente en unos segundos.'];
    }
  };

  if (claveYaRegistrada) {
    // El comprobante ya existe en SRI de un envío anterior.
    // No podemos re-enviarlo. Consultamos directamente el estado de autorización.
    console.log('[autorizarCore] Clave ya registrada en SRI — consultando autorización directamente...');
    factura.mensajes_sri = ['⏳ Comprobante ya registrado en SRI, consultando estado...'];
    await procesarAutorizacion('claveRegistrada');

    // Si SRI dice NO AUTORIZADO y no hay razón específica, agregar explicación
    if (factura.estado === 'NO_AUTORIZADO') {
      const tieneRazonEspecifica = (factura.mensajes_sri || []).some(
        (m: string) => m.includes('FIRMA') || m.includes('RUC') || m.includes('SECUENCIAL') || m.includes('FECHA')
      );
      if (!tieneRazonEspecifica) {
        factura.mensajes_sri = [
          '❌ Comprobante rechazado por el SRI (firma electrónica inválida en el envío original)',
          '💡 Este número de factura quedó bloqueado en SRI. Registre una nueva factura para esta venta.',
        ];
      }
    }
  } else if (devuelta) {
    factura.estado = 'NO_AUTORIZADO';
    factura.estado_autorizacion = 'NO_AUTORIZADO';
    factura.mensajes_sri = errores.length > 0
      ? errores
      : ['❌ XML devuelto por SRI (DEVUELTA). Verifique la firma electrónica.'];
    if (rawResponse) factura.debug_sri_response = rawResponse.substring(0, 500);
  } else if (recibida) {
    await procesarAutorizacion('recibida');
  } else if (!recibida && !devuelta) {
    // If we already have a clave_acceso, try querying authorization directly
    // (maybe SRI already received and authorized it from a previous send attempt)
    console.log('[autorizarCore] Sin recepción, consultando autorización directamente...');
    const auth = await consultarAutorizacionSRI(factura.clave_acceso, ambienteStr, 12000);
    if (auth.autorizado) {
      factura.estado = 'AUTORIZADO';
      factura.estado_autorizacion = 'AUTORIZADO';
      factura.numero_autorizacion = auth.numeroAutorizacion || factura.clave_acceso;
      factura.fecha_autorizacion = auth.fechaAutorizacion || new Date().toISOString();
      factura.mensajes_sri = auth.mensajes.length ? auth.mensajes : ['✅ AUTORIZADO por SRI'];
    } else if (auth.estadoSRI === 'NO AUTORIZADO') {
      console.warn('[autorizarCore] NO AUTORIZADO (consulta directa). Mensajes SRI:', auth.mensajes);
      factura.estado = 'NO_AUTORIZADO';
      factura.estado_autorizacion = 'NO_AUTORIZADO';
      factura.mensajes_sri = auth.mensajes.length ? auth.mensajes : ['❌ NO AUTORIZADO por SRI'];
    } else {
      // Could not reach SRI or pending state
      factura.estado = 'PENDIENTE';
      factura.estado_autorizacion = 'PENDIENTE';
      factura.mensajes_sri = errores.length > 0
        ? errores
        : ['Sin conexión al SRI. Intente de nuevo más tarde.'];
    }
  }

  await setFactura(empresaId, facturaId, factura);
  return { factura };
}

export async function handleAutorizarFactura(req: Request, empresaId: string) {
  try {
    const body = await req.json();
    const facturaId = body.factura_id || body.id;
    if (!facturaId) return new Response(JSON.stringify({ error: 'factura_id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const result = await autorizarCore(empresaId, facturaId);
    if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: result.status || 400, headers: { 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ success: true, factura: result.factura }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error al autorizar factura', detalle: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleReintentarAutorizacion(req: Request, empresaId: string) {
  try {
    const { factura_id } = await req.json();
    if (!factura_id) return new Response(JSON.stringify({ error: 'factura_id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const check = await getFactura(empresaId, factura_id);
    if (!check) return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    check.reintentos = (check.reintentos || 0) + 1;
    // Reset estado if stuck in ERROR so autorizarCore can re-attempt
    if (check.estado === 'ERROR') {
      check.estado = 'PENDIENTE';
      check.estado_autorizacion = 'PENDIENTE';
    }
    await setFactura(empresaId, factura_id, check);

    const result = await autorizarCore(empresaId, factura_id);
    if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: result.status || 400, headers: { 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ success: true, factura: result.factura }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error en reintento', detalle: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// EMAIL  — Envío real con Resend (https://resend.com)
// Requiere secret RESEND_API_KEY en Supabase
// ============================================================

/** Genera el HTML del RIDE para el cuerpo del email */
function generarHTMLFactura(f: any): string {
  const fmt2 = (n: number) => Number(n || 0).toFixed(2);
  const fmtFecha = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return iso || '—'; }
  };
  const items: any[] = f.items || [];
  const filas = items.map((it: any) => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:8px 10px;font-size:13px;color:#374151;">${it.descripcion || it.nombre || '—'}</td>
      <td style="padding:8px 10px;font-size:13px;color:#374151;text-align:center;">${it.cantidad || 1}</td>
      <td style="padding:8px 10px;font-size:13px;color:#374151;text-align:right;">$${fmt2(it.precio_unitario || it.precio)}</td>
      <td style="padding:8px 10px;font-size:13px;color:#374151;text-align:right;">$${fmt2(it.subtotal || (it.cantidad * it.precio_unitario))}</td>
    </tr>`).join('');

  const subtotal   = fmt2(f.subtotal_iva ?? f.subtotal ?? 0);
  const descuento  = fmt2(f.total_descuento ?? f.descuento ?? 0);
  const iva        = fmt2(f.iva ?? 0);
  const total      = fmt2(f.total ?? 0);

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Factura Electrónica ${f.numero_factura || ''}</title></head>
<body style="margin:0;padding:20px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

  <!-- HEADER -->
  <tr><td style="background:#1e293b;padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="color:#ffffff;font-size:20px;font-weight:bold;">${f.razon_social || f.nombre_comercial || 'Emisor'}</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:4px;">RUC: ${f.ruc || '—'} | ${f.direccion_matriz || ''}</div>
        </td>
        <td align="right" style="vertical-align:top;">
          <div style="background:#ffffff;border-radius:6px;padding:10px 14px;text-align:center;">
            <div style="color:#6b7280;font-size:10px;text-transform:uppercase;">Factura N°</div>
            <div style="color:#1e293b;font-size:16px;font-weight:bold;">${f.numero_factura || '—'}</div>
            <div style="color:#6b7280;font-size:11px;margin-top:2px;">${fmtFecha(f.fecha_emision)}</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ESTADO SRI -->
  ${(f.estado_autorizacion === 'AUTORIZADO' || f.estado === 'AUTORIZADO') ? `
  <tr><td style="background:#f0fdf4;border-bottom:1px solid #bbf7d0;padding:12px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#15803d;font-size:13px;font-weight:bold;">✅ Autorizado por el SRI</td>
      <td align="right" style="color:#6b7280;font-size:11px;">N° Autorización: ${f.numero_autorizacion || '—'}</td>
    </tr></table>
  </td></tr>` : `
  <tr><td style="background:#fff7ed;border-bottom:1px solid #fed7aa;padding:12px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#c2410c;font-size:13px;font-weight:bold;">⏳ ${f.estado_autorizacion || f.estado || 'PENDIENTE'} — Clave acceso: ${(f.clave_acceso || '').substring(0, 20)}…</td>
    </tr></table>
  </td></tr>`}

  <!-- DATOS CLIENTE -->
  <tr><td style="padding:24px 32px 0;">
    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px;">Receptor</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;font-weight:bold;color:#111827;">${f.cliente_razon_social || 'Consumidor Final'}</td>
          <td align="right" style="font-size:13px;color:#6b7280;">${f.cliente_tipo_identificacion || 'RUC/CI'}: ${f.cliente_identificacion || '—'}</td>
        </tr>
        ${f.cliente_email ? `<tr><td colspan="2" style="font-size:12px;color:#6b7280;padding-top:4px;">📧 ${f.cliente_email}</td></tr>` : ''}
      </table>
    </div>
  </td></tr>

  <!-- DETALLE DE ITEMS -->
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:12px;">Detalle</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;">
        <th style="padding:10px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:left;font-weight:600;">Descripción</th>
        <th style="padding:10px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:center;font-weight:600;">Cant.</th>
        <th style="padding:10px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:right;font-weight:600;">P. Unit.</th>
        <th style="padding:10px;font-size:11px;text-transform:uppercase;color:#6b7280;text-align:right;font-weight:600;">Subtotal</th>
      </tr>
      ${filas || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">Sin detalle de ítems</td></tr>'}
    </table>
  </td></tr>

  <!-- TOTALES -->
  <tr><td style="padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td></td><td width="260" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:8px 16px;font-size:13px;color:#6b7280;">Subtotal sin IVA</td>
            <td style="padding:8px 16px;font-size:13px;color:#374151;text-align:right;">$${subtotal}</td>
          </tr>
          ${Number(descuento) > 0 ? `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:8px 16px;font-size:13px;color:#6b7280;">Descuento</td>
            <td style="padding:8px 16px;font-size:13px;color:#ef4444;text-align:right;">-$${descuento}</td>
          </tr>` : ''}
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:8px 16px;font-size:13px;color:#6b7280;">IVA 15%</td>
            <td style="padding:8px 16px;font-size:13px;color:#374151;text-align:right;">$${iva}</td>
          </tr>
          <tr style="background:#fff7ed;">
            <td style="padding:12px 16px;font-size:15px;font-weight:bold;color:#111827;">TOTAL</td>
            <td style="padding:12px 16px;font-size:15px;font-weight:bold;color:#C2410C;text-align:right;">$${total}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CLAVE DE ACCESO -->
  ${f.clave_acceso ? `
  <tr><td style="padding:0 32px 24px;">
    <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:6px;">Clave de Acceso SRI</div>
      <div style="font-size:11px;font-family:monospace;color:#374151;word-break:break-all;">${f.clave_acceso}</div>
    </div>
  </td></tr>` : ''}

  <!-- FOOTER -->
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Este documento es una Factura Electrónica generada por el sistema <strong>M.A.R ERP</strong>.</p>
    <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;">Para consultas: ${f.email || f.telefono || ''}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ── Encode helper: convierte string UTF-8 a base64 ────────────────────────────
function xmlToBase64(xml: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(xml);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── PDF RIDE ──────────────────────────────────────────────────────────────────
/** Genera el RIDE en formato PDF usando pdf-lib */
async function generarPDFRIDE(f: any): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('npm:pdf-lib');

  const doc  = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const fmt2 = (n: any) => Number(n || 0).toFixed(2);
  const BLACK = rgb(0, 0, 0);
  const DARK  = rgb(0.15, 0.15, 0.15);
  const GRAY  = rgb(0.45, 0.45, 0.45);
  const LGRAY = rgb(0.88, 0.88, 0.88);
  const WHITE = rgb(1, 1, 1);

  const drawText = (str: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: any; maxWidth?: number } = {}) => {
    const font  = opts.bold ? bold : regular;
    const size  = opts.size ?? 8;
    const color = opts.color ?? BLACK;
    let s = String(str ?? '');
    if (opts.maxWidth) {
      // truncate to fit
      while (s.length > 1 && font.widthOfTextAtSize(s, size) > opts.maxWidth) s = s.slice(0, -1);
    }
    page.drawText(s, { x, y, size, font, color });
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 0.5, color = LGRAY) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });

  const drawRect = (x: number, y: number, w: number, h: number, fill?: any, border?: any) => {
    const opts: any = { x, y, width: w, height: h };
    if (fill)   { opts.color = fill; }
    if (border) { opts.borderColor = border; opts.borderWidth = 0.5; }
    page.drawRectangle(opts);
  };

  const fmtFecha = (iso: string) => {
    try { return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return iso || '—'; }
  };

  const M = 30; // margin
  let y = height - M;

  // ── SECCIÓN 1: CABECERA ──────────────────────────────────────────────────
  const hdrH = 165;
  drawRect(M, y - hdrH, width - 2*M, hdrH, WHITE, LGRAY);

  // Línea divisoria vertical al centro
  const midX = M + (width - 2*M) / 2;
  drawLine(midX, y, midX, y - hdrH);

  // ── COLUMNA IZQUIERDA: Datos Emisor ────────────────────────────────────
  const lx = M + 8;
  let ly = y - 14;

  drawText(f.razon_social || f.nombre_comercial || 'EMISOR', lx, ly, { bold: true, size: 10 });
  ly -= 13;
  drawText(`RUC: ${f.ruc || ''}`, lx, ly, { size: 8, color: DARK });
  ly -= 11;

  // Dirección (max 2 líneas)
  const dir = f.direccion_matriz || f.direccion_establecimiento || '';
  const MAX_DIR = midX - lx - 10;
  const dirWords = dir.split(' ');
  let dirL1 = '', dirL2 = '';
  for (const w of dirWords) {
    const test = dirL1 ? dirL1 + ' ' + w : w;
    if (regular.widthOfTextAtSize(test, 7.5) < MAX_DIR) dirL1 = test;
    else dirL2 = dirL2 ? dirL2 + ' ' + w : w;
  }
  drawText(`Matriz: ${dirL1}`, lx, ly, { size: 7.5, color: DARK });
  if (dirL2) { ly -= 10; drawText(dirL2, lx, ly, { size: 7.5, color: DARK }); }
  ly -= 11;
  if (f.email) { drawText(`Correo: ${f.email}`, lx, ly, { size: 7.5, color: DARK }); ly -= 11; }
  if (f.telefono) { drawText(`Teléfono: ${f.telefono}`, lx, ly, { size: 7.5, color: DARK }); ly -= 11; }
  drawText('Obligado a llevar contabilidad: SI', lx, ly, { size: 7.5, color: DARK });
  if (f.contribuyente_especial) { ly -= 11; drawText(`Agente de Retención`, lx, ly, { size: 7.5, color: DARK }); }

  // ── COLUMNA DERECHA: Datos Factura ────────────────────────────────────
  const rx = midX + 8;
  let ry = y - 12;
  const rw = width - M - midX - 10;

  drawText('FACTURA', rx, ry, { bold: true, size: 9 });
  drawText(`No. ${f.numero_factura || ''}`, rx + 55, ry, { bold: true, size: 9 });

  ry -= 14;
  drawText('Número de Autorización:', rx, ry, { bold: true, size: 7.5 });
  ry -= 10;
  const auth = f.numero_autorizacion || f.clave_acceso || '';
  drawText(auth.substring(0, 40), rx, ry, { size: 6.5, color: DARK });
  ry -= 9;
  if (auth.length > 40) drawText(auth.substring(40), rx, ry, { size: 6.5, color: DARK });
  ry -= 12;

  drawText('Fecha y hora de Autorización:', rx, ry, { bold: true, size: 7.5 });
  ry -= 10;
  const fechaAuth = f.fecha_autorizacion
    ? new Date(f.fecha_autorizacion).toLocaleString('es-EC')
    : fmtFecha(f.fecha_emision || '');
  drawText(fechaAuth, rx, ry, { size: 8, color: DARK });
  ry -= 12;

  drawText(`Ambiente: ${f.ambiente === 'produccion' ? 'PRODUCCION' : 'PRUEBAS'}`, rx, ry, { bold: true, size: 8 });
  ry -= 11;
  drawText('Emisión: NORMAL', rx, ry, { bold: true, size: 8 });
  ry -= 12;
  drawText('Clave de Acceso:', rx, ry, { bold: true, size: 7.5 });
  ry -= 10;

  // Barcode simulado
  const barcodeH = 28;
  const barcodeW = rw - 5;
  drawRect(rx, ry - barcodeH, barcodeW, barcodeH, WHITE, LGRAY);
  const barCount = 90;
  const barW = barcodeW / barCount;
  const claveStr = auth || '0'.repeat(49);
  for (let i = 0; i < barCount; i++) {
    const code = claveStr.charCodeAt(i % claveStr.length) || 48;
    const h = barcodeH * (0.5 + ((code % 5) * 0.1));
    if ((code + i) % 2 === 0) {
      drawRect(rx + i * barW, ry - h, barW, h, BLACK);
    }
  }
  ry -= barcodeH + 5;
  drawText(auth.substring(0, 49), rx, ry, { size: 5, color: GRAY, maxWidth: barcodeW });

  y -= hdrH + 4;

  // ── SECCIÓN 2: DATOS CLIENTE ──────────────────────────────────────────
  const clientH = 46;
  drawRect(M, y - clientH, width - 2*M, clientH, WHITE, LGRAY);

  const cx1 = M + 8; const cx2 = width / 2 + 10;
  let cy = y - 12;
  drawText('Razón Social:', cx1, cy, { bold: true, size: 8 });
  drawText(f.cliente_razon_social || 'Consumidor Final', cx1 + 72, cy, { size: 8, maxWidth: width/2 - cx1 - 70 });
  drawText('RUC/CI:', cx2, cy, { bold: true, size: 8 });
  drawText(f.cliente_identificacion || '', cx2 + 38, cy, { size: 8 });
  cy -= 12;
  drawText('Dirección:', cx1, cy, { bold: true, size: 8 });
  drawText((f.cliente_direccion || ''), cx1 + 52, cy, { size: 8, maxWidth: width/2 - cx1 - 50 });
  drawText('Teléfono:', cx2, cy, { bold: true, size: 8 });
  drawText(f.cliente_telefono || '', cx2 + 45, cy, { size: 8 });
  cy -= 12;
  drawText('Fecha Emisión:', cx1, cy, { bold: true, size: 8 });
  drawText(fmtFecha(f.fecha_emision || ''), cx1 + 72, cy, { size: 8 });
  drawText('Correo:', cx2, cy, { bold: true, size: 8 });
  drawText(f.cliente_email || '', cx2 + 38, cy, { size: 8, maxWidth: width - cx2 - 38 - M });

  y -= clientH + 4;

  // ── SECCIÓN 3: TABLA DE ÍTEMS ──────────────────────────────────────────
  const tW = width - 2*M;
  // Columns: [x_start, width, label, align]
  const COLS: [number, number, string, 'left'|'right'][] = [
    [M,      50, 'Código Principal', 'left'],
    [M+50,   30, 'Cant.',            'right'],
    [M+80,  180, 'Descripción',      'left'],
    [M+260,  70, 'Det. Adicionales', 'left'],
    [M+330,  65, 'P. Unitario',      'right'],
    [M+395,  60, 'Descuento',        'right'],
    [M+455,  tW-(455), 'Total',      'right'],
  ];

  const rowH = 16;
  // Header
  drawRect(M, y - rowH, tW, rowH, LGRAY, LGRAY);
  for (const [cx, cw, label, align] of COLS) {
    const lw = bold.widthOfTextAtSize(label, 7);
    const tx = align === 'right' ? cx + cw - lw - 3 : cx + 3;
    drawText(label, tx, y - 11, { bold: true, size: 7, color: DARK });
    drawLine(cx + cw, y, cx + cw, y - rowH, 0.3, LGRAY);
  }
  drawLine(M, y - rowH, M + tW, y - rowH, 0.5);
  y -= rowH;

  const items: any[] = f.items || [];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const bg = idx % 2 === 1 ? rgb(0.97, 0.97, 0.97) : WHITE;
    drawRect(M, y - rowH, tW, rowH, bg);
    drawLine(M, y - rowH, M + tW, y - rowH, 0.3, LGRAY);

    const vals: [number, number, string, 'left'|'right'][] = [
      [COLS[0][0], COLS[0][1], it.codigo || '', 'left'],
      [COLS[1][0], COLS[1][1], String(it.cantidad ?? 1), 'right'],
      [COLS[2][0], COLS[2][1], it.descripcion || it.nombre || '', 'left'],
      [COLS[3][0], COLS[3][1], '', 'left'],
      [COLS[4][0], COLS[4][1], `${Number(it.precio_unitario || it.precio || 0).toFixed(6)}`, 'right'],
      [COLS[5][0], COLS[5][1], `$${fmt2(it.descuento || 0)}`, 'right'],
      [COLS[6][0], COLS[6][1], `$${fmt2(it.subtotal || (it.cantidad * (it.precio_unitario ?? it.precio ?? 0)))}`, 'right'],
    ];
    for (const [vx, vw, val, align] of vals) {
      const vw2 = align === 'right' ? regular.widthOfTextAtSize(val, 8) : 0;
      const tx  = align === 'right' ? vx + vw - vw2 - 3 : vx + 3;
      drawText(val, tx, y - 11, { size: 8, maxWidth: vw - 5 });
    }
    y -= rowH;
    if (y < 200) break;
  }
  drawLine(M, y, M + tW, y, 0.8, DARK);
  y -= 5;

  // ── SECCIÓN 4: PIE DE PÁGINA ──────────────────────────────────────────
  const footH  = Math.max(120, 14 * 11 + 10); // espacio para totales
  const halfW  = (tW - 4) / 2;
  const leftFX = M;
  const rightFX = M + halfW + 4;

  drawRect(leftFX, y - footH, halfW, footH, WHITE, LGRAY);
  drawRect(rightFX, y - footH, halfW, footH, WHITE, LGRAY);

  // LEFT: Información Adicional
  let fyl = y - 12;
  drawRect(leftFX, y - 16, halfW, 16, LGRAY);
  drawText('Información Adicional', leftFX + 5, fyl, { bold: true, size: 8 });
  fyl -= 14;

  const infoAd = f.info_adicional || f.informacion_adicional || {};
  if (typeof infoAd === 'object') {
    for (const [k, v] of Object.entries(infoAd)) {
      drawText(`${k}`, leftFX + 5, fyl, { bold: true, size: 7.5, color: DARK });
      drawText(`${v}`, leftFX + 75, fyl, { size: 7.5, maxWidth: halfW - 80 });
      fyl -= 11;
      if (fyl < y - footH + 35) break;
    }
  }

  // Formas de pago
  fyl -= 5;
  drawRect(leftFX, fyl + 12, halfW, 15, LGRAY);
  drawText('Formas de pago', leftFX + 5, fyl + 3, { bold: true, size: 8 });
  fyl -= 11;
  const formas: any[] = f.formas_pago || [];
  for (const fp of formas) {
    const desc = fp.descripcion || fp.tipo || fp.nombre || '';
    const val  = `$${fmt2(fp.valor || fp.monto || 0)}`;
    drawText(desc, leftFX + 5, fyl, { size: 8, maxWidth: halfW / 2 });
    drawText(val, leftFX + halfW / 2 + 5, fyl, { size: 8 });
    drawText(`${fp.plazo || 0} días`, leftFX + halfW - 35, fyl, { size: 8 });
    fyl -= 11;
    if (fyl < y - footH + 5) break;
  }

  // RIGHT: Totales
  const totRows: [string, string][] = [
    ['Subtotal Sin Impuestos:', `$${fmt2(f.subtotal_iva ?? f.subtotal ?? 0)}`],
    ['Subtotal 15%:',           `$${fmt2(f.subtotal_iva15 ?? (f.iva ? (Number(f.iva)/0.15) : 0))}`],
    ['Subtotal 5%:',            '$0.00'],
    ['Subtotal 0%:',            `$${fmt2(f.subtotal_0 ?? 0)}`],
    ['Subtotal No Objeto IVA:', '$0.00'],
    ['Descuentos:',             `$${fmt2(f.total_descuento ?? f.descuento ?? 0)}`],
    ['ICE:',                    '$0.00'],
    ['IVA 15%:',                `$${fmt2(f.iva ?? 0)}`],
    ['IVA 5%:',                 '$0.00'],
    ['Servicio 10%:',           `$${fmt2(f.servicio ?? 0)}`],
    ['Valor Total:',            `$${fmt2(f.total ?? 0)}`],
  ];
  let fyr = y - 16;
  drawRect(rightFX, y - 16, halfW, 16, LGRAY);
  for (let i = 0; i < totRows.length; i++) {
    const [label, val] = totRows[i];
    const isTotal = i === totRows.length - 1;
    if (isTotal) drawRect(rightFX, fyr, halfW, 16, LGRAY);
    drawLine(rightFX, fyr, rightFX + halfW, fyr, 0.3, LGRAY);
    const valW = (isTotal ? bold : regular).widthOfTextAtSize(val, isTotal ? 9 : 8);
    drawText(label, rightFX + 5, fyr + 4, { size: isTotal ? 9 : 8, bold: isTotal, color: DARK });
    drawText(val, rightFX + halfW - valW - 5, fyr + 4, { size: isTotal ? 9 : 8, bold: isTotal });
    fyr -= 16;
  }

  // Borde exterior final
  drawRect(M, y - footH, tW, footH, undefined, LGRAY);

  const pdfBytes = await doc.save();
  return pdfBytes;
}

// ── Envío con Resend ──────────────────────────────────────────────────────────
/** Convierte HTML básico a texto plano para el campo text del email (mejor deliverability) */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ').trim();
}

async function enviarConResend(opts: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  replyTo?: string;
  xmlAdjunto?: string;
  xmlFilename?: string;
  pdfAdjunto?: string;      // PDF RIDE (base64)
  pdfFilename?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY no configurada en secrets de Supabase' };

  const fromDomain = Deno.env.get('RESEND_FROM_DOMAIN') || 'onboarding@resend.dev';
  // Si es un email completo → agregar display name. Si es solo dominio → construir email.
  const from = fromDomain.includes('@')
    ? `${opts.fromName} <${fromDomain}>`
    : `${opts.fromName} <noreply@${fromDomain}>`;

  const body: any = {
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: htmlToText(opts.html),   // versión texto plano → mejora deliverability
    headers: {
      'X-Entity-Ref-ID': `mar-erp-${Date.now()}`,   // evita agrupación como thread
    },
  };

  // reply_to: permite al cliente responder directamente al emisor
  if (opts.replyTo) body.reply_to = opts.replyTo;

  body.attachments = [];
  if (opts.xmlAdjunto && opts.xmlFilename)
    body.attachments.push({ filename: opts.xmlFilename, content: opts.xmlAdjunto });
  if (opts.pdfAdjunto && opts.pdfFilename)
    body.attachments.push({ filename: opts.pdfFilename, content: opts.pdfAdjunto });
  if (body.attachments.length === 0) delete body.attachments;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const resBody = await res.json();
  if (!res.ok) return { ok: false, error: resBody.message || resBody.error || `HTTP ${res.status}` };
  return { ok: true, id: resBody.id };
}

/** Handler principal: envía a un email especificado manualmente */
export async function handleEnviarEmailFactura(req: Request, empresaId: string) {
  try {
    const emailData = await req.json();
    const destinatario: string = emailData.destinatario || '';
    const facturaId: string    = emailData.factura_id   || '';

    if (!destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario))
      return new Response(JSON.stringify({ error: 'Email de destinatario inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (!facturaId)
      return new Response(JSON.stringify({ error: 'factura_id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const f = await getFactura(empresaId, facturaId);
    if (!f) return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const html    = generarHTMLFactura(f);
    const subject = `Factura Electrónica N° ${f.numero_factura || facturaId} — ${f.razon_social || 'MAR ERP'}`;
    const fileNum = (f.numero_factura || facturaId).replace(/[\/\\]/g, '-');

    const xmlAdjunto  = f.xml_firmado ? xmlToBase64(f.xml_firmado) : undefined;
    const xmlFilename = f.xml_firmado ? `factura_${fileNum}.xml` : undefined;

    // Generar PDF RIDE
    let pdfAdjunto: string | undefined;
    let pdfFilename: string | undefined;
    try {
      const pdfBytes = await generarPDFRIDE(f);
      pdfAdjunto  = btoa(String.fromCharCode(...pdfBytes));
      pdfFilename = `RIDE_${fileNum}.pdf`;
    } catch (pdfErr: any) {
      console.warn('⚠ PDF RIDE no generado:', pdfErr?.message);
    }

    const replyTo = f.email || undefined;
    const result  = await enviarConResend({ to: destinatario, subject, html, fromName: f.razon_social || 'MAR ERP', replyTo, xmlAdjunto, xmlFilename, pdfAdjunto, pdfFilename });
    if (!result.ok) {
      console.error('❌ Resend error:', result.error);
      return new Response(JSON.stringify({ error: result.error }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // Marcar como enviado
    f.email_enviado      = true;
    f.email_enviado_en   = new Date().toISOString();
    f.email_destinatario = destinatario;
    f.resend_email_id    = result.id;
    await setFactura(empresaId, facturaId, f);

    console.log(`✅ Email factura ${f.numero_factura} enviado a ${destinatario} (Resend ID: ${result.id})`);
    return new Response(JSON.stringify({ success: true, mensaje: `Factura enviada a ${destinatario}`, resend_id: result.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('❌ handleEnviarEmailFactura:', error.message);
    return new Response(JSON.stringify({ error: 'Error al enviar email', detalle: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/** Handler reenvío: usa el email del cliente registrado en la factura */
export async function handleReenviarEmailFactura(req: Request, empresaId: string) {
  try {
    const body        = await req.json();
    const facturaId   = body.factura_id || '';
    const override    = body.destinatario || '';   // permite sobreescribir el email

    if (!facturaId)
      return new Response(JSON.stringify({ error: 'factura_id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const f = await getFactura(empresaId, facturaId);
    if (!f) return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const destinatario = override || f.cliente_email || '';
    if (!destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario))
      return new Response(JSON.stringify({ error: 'El cliente no tiene email registrado. Ingrese un email de destino.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const html    = generarHTMLFactura(f);
    const subject = `Factura Electrónica N° ${f.numero_factura || facturaId} — ${f.razon_social || 'MAR ERP'}`;
    const fileNum = (f.numero_factura || facturaId).replace(/[\/\\]/g, '-');

    const xmlAdjunto  = f.xml_firmado ? xmlToBase64(f.xml_firmado) : undefined;
    const xmlFilename = f.xml_firmado ? `factura_${fileNum}.xml` : undefined;

    // Generar PDF RIDE
    let pdfAdjunto2: string | undefined;
    let pdfFilename2: string | undefined;
    try {
      const pdfBytes2 = await generarPDFRIDE(f);
      pdfAdjunto2  = btoa(String.fromCharCode(...pdfBytes2));
      pdfFilename2 = `RIDE_${fileNum}.pdf`;
    } catch (pdfErr: any) {
      console.warn('⚠ PDF RIDE no generado:', pdfErr?.message);
    }

    const replyTo2 = f.email || undefined;
    const result = await enviarConResend({ to: destinatario, subject, html, fromName: f.razon_social || 'MAR ERP', replyTo: replyTo2, xmlAdjunto, xmlFilename, pdfAdjunto: pdfAdjunto2, pdfFilename: pdfFilename2 });
    if (!result.ok) {
      console.error('❌ Resend error (reenvío):', result.error);
      return new Response(JSON.stringify({ error: result.error }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    f.email_enviado      = true;
    f.email_enviado_en   = new Date().toISOString();
    f.email_destinatario = destinatario;
    f.resend_email_id    = result.id;
    await setFactura(empresaId, facturaId, f);

    console.log(`✅ Email factura ${f.numero_factura} reenviado a ${destinatario} (Resend ID: ${result.id})`);
    return new Response(JSON.stringify({ success: true, mensaje: `Factura enviada a ${destinatario}`, resend_id: result.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('❌ handleReenviarEmailFactura:', error.message);
    return new Response(JSON.stringify({ error: 'Error al reenviar email', detalle: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// TEST EMAIL — Diagnóstico completo del envío de emails
// ============================================================

export async function handleTestEmail(req: Request, empresaId: string) {
  const result: Record<string, any> = { timestamp: new Date().toISOString() };

  // 1. Verificar secrets
  const apiKey     = Deno.env.get('RESEND_API_KEY')    || '';
  const fromDomain = Deno.env.get('RESEND_FROM_DOMAIN') || '';
  result.secrets = {
    resend_api_key_set:    apiKey.length > 0,
    resend_api_key_prefix: apiKey ? apiKey.substring(0, 6) + '...' : '(no configurado)',
    resend_from_domain_set: fromDomain.length > 0,
    resend_from_domain:     fromDomain || '(no configurado — usará onboarding@resend.dev)',
  };

  if (!apiKey) {
    result.diagnostico = '❌ RESEND_API_KEY no está configurado en los secrets de Supabase';
    return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // 2. Construir el from que se usaría
  const config = await getConfig(empresaId);
  const fromName = config?.razon_social || 'MAR ERP';
  const resolvedDomain = fromDomain || 'onboarding@resend.dev';
  const from = resolvedDomain.includes('@')
    ? `${fromName} <${resolvedDomain}>`
    : `${fromName} <noreply@${resolvedDomain}>`;
  result.from_calculado = from;

  // 3. Determinar destinatario de prueba
  let body: any = {};
  try { body = await req.json(); } catch { /* sin body */ }
  const destinatario: string = body.destinatario || config?.email || '';

  if (!destinatario) {
    result.diagnostico = '⚠️ No hay email de destino. Agrega un email en la configuración del emisor o pásalo en el body { "destinatario": "tu@email.com" }';
    return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  result.destinatario_prueba = destinatario;

  // 4. Enviar email real de prueba
  const htmlTest = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
      <div style="background:#F97316;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">✅ Prueba de Email — MAR ERP</h2>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:20px 24px;border-radius:0 0 8px 8px;">
        <p style="color:#374151;">Este es un email de prueba enviado desde el sistema <strong>MAR ERP</strong>.</p>
        <p style="color:#374151;">Si lo recibes correctamente, el envío de facturas por email está funcionando.</p>
        <hr style="border-color:#e5e7eb;margin:16px 0;">
        <p style="color:#9ca3af;font-size:12px;">
          <strong>Remitente:</strong> ${from}<br>
          <strong>Dominio:</strong> ${resolvedDomain}<br>
          <strong>Fecha:</strong> ${new Date().toLocaleString('es-EC')}
        </p>
      </div>
    </div>
  `;

  try {
    const resBody_send: any = {
      from,
      to: [destinatario],
      subject: `✅ Prueba de email — MAR ERP (${new Date().toLocaleTimeString('es-EC')})`,
      html: htmlTest,
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(resBody_send),
    });

    const resendJson = await resendRes.json();
    result.resend_http_status = resendRes.status;
    result.resend_response    = resendJson;

    if (resendRes.ok) {
      result.diagnostico = `✅ Email de prueba enviado correctamente a ${destinatario}. Revisa tu bandeja de entrada (y spam).`;
      result.email_id    = resendJson.id;
    } else {
      const msg = resendJson.message || resendJson.error || resendJson.name || `HTTP ${resendRes.status}`;
      result.diagnostico = `❌ Resend rechazó el envío: ${msg}`;
      // Sugerencias según el error
      if (msg.includes('domain') || msg.includes('verified')) {
        result.sugerencia = `El dominio "${resolvedDomain}" no está verificado en Resend. Ve a https://resend.com/domains y verifica tu dominio.`;
      } else if (msg.includes('API key') || resendRes.status === 401) {
        result.sugerencia = 'La RESEND_API_KEY es incorrecta o fue revocada. Genera una nueva en https://resend.com/api-keys';
      }
    }
  } catch (e: any) {
    result.diagnostico = `❌ Error al conectar con Resend: ${e.message}`;
  }

  return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// public alias
export async function enviarSRI(xml: string, ambiente: string) {
  const r = await enviarXMLAlSRI(xml, ambiente);
  return { estado: r.recibida ? 'RECIBIDA' : r.devuelta ? 'DEVUELTA' : 'ERROR', errores: r.errores };
}

// ============================================================
// DIAGNÓSTICO SRI — GET /facturacion/test-sri
// Prueba la conectividad con los servidores del SRI Ecuador y
// devuelve el resultado detallado para diagnóstico.
// ============================================================

export async function handleTestSRI(req: Request, empresaId: string) {
  const results: Record<string, any> = { timestamp: new Date().toISOString(), ambiente: 'pruebas' };

  // 1. DNS / basic HTTPS connectivity to SRI test server
  const sriBase = 'https://celcer.sri.gob.ec';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${sriBase}/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl`, {
      method: 'GET',
      headers: { 'Accept': 'text/xml, */*', 'User-Agent': 'RestaurantePOS/1.0' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const txt = await r.text();
    results.wsdl_recepcion = {
      ok: r.ok,
      status: r.status,
      es_wsdl: txt.includes('wsdl') || txt.includes('WSDL') || txt.includes('definitions'),
      bytes: txt.length,
      preview: txt.substring(0, 200),
    };
  } catch (e: any) {
    results.wsdl_recepcion = {
      ok: false,
      error: `${e.name}: ${e.message}`,
      cause: e.cause?.message || String(e.cause || ''),
    };
  }

  // 2. Test authorization WSDL
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${sriBase}/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl`, {
      method: 'GET',
      headers: { 'Accept': 'text/xml, */*', 'User-Agent': 'RestaurantePOS/1.0' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const txt = await r.text();
    results.wsdl_autorizacion = { ok: r.ok, status: r.status, bytes: txt.length, es_wsdl: txt.includes('wsdl') || txt.includes('definitions') };
  } catch (e: any) {
    results.wsdl_autorizacion = { ok: false, error: `${e.name}: ${e.message}`, cause: e.cause?.message || '' };
  }

  // 3. Minimal SOAP call to reception (should return a SOAP fault or DEVUELTA — both mean SRI responded)
  const testXml = `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente><tipoEmision>1</tipoEmision><razonSocial>TEST</razonSocial><ruc>0000000000001</ruc><claveAcceso>0000000000000000000000000000000000000000000000000</claveAcceso><codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000001</secuencial><dirMatriz>TEST</dirMatriz></infoTributaria></factura>`;
  const soapResult = await enviarXMLAlSRI(testXml, 'pruebas', 10000);
  results.soap_recepcion_test = {
    sri_respondio: soapResult.recibida || soapResult.devuelta || (soapResult.rawResponse && soapResult.rawResponse.length > 0),
    recibida: soapResult.recibida,
    devuelta: soapResult.devuelta,
    errores: soapResult.errores,
    rawResponse: soapResult.rawResponse || null,
  };

  // 4. Config info (no sensitive data)
  const config = await getConfig(empresaId);
  const cert = await getCert(empresaId);
  results.configuracion = {
    tiene_config: !!config,
    ruc_configurado: !!(config?.ruc),
    ambiente: config?.ambiente || 'pruebas',
    tiene_certificado: !!(cert?.p12_base64),
    cert_titular: cert?.info?.titular || null,
    cert_vigente: cert?.info?.vigente ?? null,
    cert_expira: cert?.info?.valido_hasta || null,
  };

  const sri_respondio = results.soap_recepcion_test.sri_respondio;
  results.diagnostico = sri_respondio
    ? '✅ SRI responde correctamente. La conexión funciona.'
    : '❌ SRI no responde — posible bloqueo de IP, SSL o red desde Supabase Edge Functions.';

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── NOTA DE CRÉDITO ───────────────────────────────────────────────────────────
export async function handleEmitirNotaCredito(req: Request, empresaId: string): Promise<Response> {
  try {
    const body = await req.json();
    const { factura_id, motivo, tipo = 'total', monto_parcial, items_parciales } = body;

    if (!factura_id || !motivo) {
      return Response.json({ error: 'factura_id y motivo son requeridos' }, { status: 400 });
    }

    // Obtener factura original
    const { data: factOrig } = await getDB().from('facturas')
      .select('*').eq('id', factura_id).eq('empresa_id', empresaId).maybeSingle();
    if (!factOrig) return Response.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (factOrig.estado_autorizacion !== 'AUTORIZADO')
      return Response.json({ error: 'Solo se puede emitir nota de crédito sobre facturas autorizadas' }, { status: 422 });

    // Configuración del emisor
    const config = await getConfig(empresaId);
    if (!config?.ruc) return Response.json({ error: 'Configure primero los datos de facturación' }, { status: 422 });

    // Determinar totales según tipo (total o parcial)
    const dc = typeof factOrig.datos_completos === 'string' ? JSON.parse(factOrig.datos_completos || '{}') : (factOrig.datos_completos || {});
    const itemsNC = tipo === 'parcial' && items_parciales?.length ? items_parciales : (dc.items || factOrig.datos_completos?.items || []);
    const totalNC = tipo === 'parcial' && monto_parcial ? Number(monto_parcial) : Number(factOrig.total || 0);
    const subtotalNC = tipo === 'parcial' && monto_parcial ? Math.round(Number(monto_parcial) / 1.15 * 100) / 100 : Number(factOrig.subtotal_iva || 0);
    const ivaNC = Math.round((totalNC - subtotalNC) * 100) / 100;

    // Generar secuencial para nota de crédito (usa secuencial separado si existe, sino el mismo de factura)
    const secNC = config.secuencial_nc_actual || 1;
    await getDB().from('configuracion_facturacion')
      .update({ secuencial_nc_actual: secNC + 1, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId);
    const secStr = String(secNC).padStart(9, '0');

    const nowUtc    = new Date();
    const ambCod    = config.ambiente === 'produccion' ? '2' : '1';
    const estab3    = String(config.codigo_establecimiento || '001').padStart(3,'0').substring(0,3);
    const ptoEmi3   = String(config.punto_emision || '001').padStart(3,'0').substring(0,3);
    const dd = String(nowUtc.getDate()).padStart(2,'0');
    const mo = String(nowUtc.getMonth()+1).padStart(2,'0');
    const yy = String(nowUtc.getFullYear()).substring(2);
    const cod8      = Math.floor(10000000 + Math.random() * 90000000).toString();
    const claveBase = dd + mo + yy + '04' + config.ruc + ambCod + estab3 + ptoEmi3 + secStr + cod8 + '1';
    const claveAcceso = claveBase + calcularModulo11(claveBase);
    const numeroNC  = `${estab3}-${ptoEmi3}-${secStr}`;
    const fechaEmision = nowUtc.toISOString().split('T')[0];

    // Fecha del doc sustento formateada como dd/mm/yyyy
    const fechaSustento = factOrig.fecha_emision
      ? (() => {
          const d = new Date(factOrig.fecha_emision + 'T00:00:00');
          return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        })()
      : `${dd}/${mo}/20${yy}`;

    const notaCredito: any = {
      // Identificación
      tipo_comprobante: 'nota_credito',
      numero_nc: numeroNC,
      clave_acceso: claveAcceso,
      secuencial: secNC,
      fecha_emision: fechaEmision,
      ambiente: config.ambiente || 'pruebas',
      // Emisor
      ruc: config.ruc,
      razon_social: config.razon_social,
      nombre_comercial: config.nombre_comercial || config.razon_social,
      direccion_matriz: config.direccion_matriz || '',
      direccion_establecimiento: config.direccion_establecimiento || config.direccion_matriz || '',
      obligado_contabilidad: config.obligado_contabilidad ?? true,
      contribuyente_especial: config.contribuyente_especial || '',
      estab: estab3, pto_emi: ptoEmi3,
      // Receptor (igual que factura original)
      cliente_razon_social: factOrig.cliente_razon_social || 'Consumidor Final',
      cliente_identificacion: factOrig.cliente_identificacion || '9999999999999',
      cliente_tipo_identificacion: factOrig.cliente_tipo_identificacion || '07',
      cliente_email: factOrig.cliente_email || '',
      // Referencia a factura original
      num_doc_modificado: factOrig.numero_factura,
      fecha_doc_sustento: fechaSustento,
      // Totales
      subtotal_iva: subtotalNC,
      iva: ivaNC,
      total: totalNC,
      // Detalle
      items: itemsNC,
      motivo,
      tipo_nc: tipo,
      // Meta
      factura_origen_id: factura_id,
      empresa_id: empresaId,
    };

    // Generar XML
    const xmlSinFirmar = buildNotaCreditoXML(notaCredito);
    notaCredito.xml_sin_firmar = xmlSinFirmar;
    let xmlParaEnviar = xmlSinFirmar;

    // Firmar si hay certificado
    const certData = await getCert(empresaId);
    if (certData?.p12_base64 && certData?.password) {
      try {
        xmlParaEnviar = await firmarXMLXAdES(xmlSinFirmar, certData);
        notaCredito.firmado_digitalmente = true;
      } catch (e: any) {
        notaCredito.mensajes = [`Error al firmar: ${e.message}`];
      }
    }
    notaCredito.xml_firmado = xmlParaEnviar;

    // Enviar al SRI
    notaCredito.estado = 'PENDIENTE';
    notaCredito.estado_autorizacion = 'PENDIENTE';

    const resultSRI = await enviarAlSRI(xmlParaEnviar, config.ambiente || 'pruebas');
    if (resultSRI.estado === 'RECIBIDA') {
      const authResult = await consultarAutorizacionSRI(claveAcceso, config.ambiente || 'pruebas', 15000);
      if (authResult.autorizado) {
        notaCredito.estado = 'AUTORIZADO';
        notaCredito.estado_autorizacion = 'AUTORIZADO';
        notaCredito.numero_autorizacion = authResult.numeroAutorizacion || claveAcceso;
        notaCredito.fecha_autorizacion  = authResult.fechaAutorizacion;
      } else {
        notaCredito.estado = 'PENDIENTE';
        notaCredito.mensajes_sri = authResult.mensajes;
      }
    } else {
      notaCredito.mensajes_sri = resultSRI.mensajes || [];
    }

    // Guardar nota de crédito en tabla facturas con tipo diferenciado
    const { data: ncGuardada } = await getDB().from('facturas').insert({
      empresa_id: empresaId,
      numero_factura: numeroNC,
      clave_acceso: claveAcceso,
      estado: notaCredito.estado,
      estado_autorizacion: notaCredito.estado_autorizacion,
      numero_autorizacion: notaCredito.numero_autorizacion || null,
      fecha_autorizacion: notaCredito.fecha_autorizacion || null,
      fecha_emision: fechaEmision,
      cliente_razon_social: notaCredito.cliente_razon_social,
      cliente_identificacion: notaCredito.cliente_identificacion,
      cliente_email: notaCredito.cliente_email,
      subtotal_iva: subtotalNC,
      iva: ivaNC,
      total: totalNC,
      xml_sin_firmar: xmlSinFirmar,
      xml_firmado: xmlParaEnviar,
      mensajes_sri: notaCredito.mensajes_sri || [],
      ambiente: config.ambiente || 'pruebas',
      datos_completos: {
        ...notaCredito,
        tipo_comprobante: 'nota_credito',
        factura_origen_id: factura_id,
        factura_origen_numero: factOrig.numero_factura,
      },
      updated_at: new Date().toISOString(),
    }).select().maybeSingle();

    return Response.json({
      ok: true,
      numero_nc: numeroNC,
      estado: notaCredito.estado,
      estado_autorizacion: notaCredito.estado_autorizacion,
      numero_autorizacion: notaCredito.numero_autorizacion,
      clave_acceso: claveAcceso,
      mensajes_sri: notaCredito.mensajes_sri,
      nc: ncGuardada,
    }, { status: 201 });

  } catch (e: any) {
    console.error('❌ handleEmitirNotaCredito:', e.message);
    return Response.json({ error: 'Error al emitir nota de crédito', detalle: e.message }, { status: 500 });
  }
}
