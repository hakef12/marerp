/**
 * Rutas del módulo de Retenciones Electrónicas SRI Ecuador
 *
 * Implementa:
 *  - Generación de XML comprobanteRetencion v1.0.0
 *  - Firma XAdES-BES (reutiliza motor de facturas)
 *  - Envío SOAP al SRI (mismo servicio que facturas)
 *  - Consulta y reautorización
 */

import {
  getDB, getConfig, getCert,
  xmlEncode, calcularModulo11, normalizeAmbiente,
  firmarXMLXAdES, enviarXMLAlSRI, consultarAutorizacionSRI, parsearMensajesSRI,
} from './facturacion-routes.tsx';

// ──────────────────────────────────────────────────────────────
// Catálogo de tipos de retención
// ──────────────────────────────────────────────────────────────
export const TIPOS_RETENCION_IR = [
  { label: 'Bienes (1.75%)',                codigo: '312', porcentaje: 1.75 },
  { label: 'Servicios (2%)',                codigo: '344', porcentaje: 2 },
  { label: 'Honorarios profesionales (8%)', codigo: '345', porcentaje: 8 },
  { label: 'Honorarios profesionales (10%)',codigo: '303', porcentaje: 10 },
  { label: 'Manual',                        codigo: '',    porcentaje: 0 },
];

export const TIPOS_RETENCION_IVA = [
  { label: 'Bienes (30%)',      codigo: '721', porcentaje: 30 },
  { label: 'Servicios (70%)',   codigo: '723', porcentaje: 70 },
  { label: 'Honorarios (100%)',  codigo: '725', porcentaje: 100 },
  { label: 'Manual',            codigo: '',    porcentaje: 0 },
];

// ──────────────────────────────────────────────────────────────
// Helper: fecha DD/MM/YYYY
// ──────────────────────────────────────────────────────────────
function fechaDDMMYYYY(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

// ──────────────────────────────────────────────────────────────
// Builder XML comprobanteRetencion v1.0.0
// ──────────────────────────────────────────────────────────────
function buildRetenciónXML(r: any): string {
  const secStr = String(r.secuencial).padStart(9, '0');
  const estab3 = String(r.codigo_establecimiento || '001').padStart(3, '0').substring(0, 3);
  const ptoEmi3 = String(r.punto_emision || '001').padStart(3, '0').substring(0, 3);

  const fechaEmision = r.fecha_emision
    ? fechaDDMMYYYY(r.fecha_emision)
    : fechaDDMMYYYY(new Date().toISOString().split('T')[0]);

  // periodoFiscal = MM/YYYY del mes de la factura del proveedor
  const periodoFiscal = r.periodo_fiscal || (() => {
    const d = r.doc_sustento_fecha
      ? new Date(r.doc_sustento_fecha.includes('T') ? r.doc_sustento_fecha : r.doc_sustento_fecha + 'T00:00:00')
      : new Date();
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  })();

  // Bloque de impuestos
  const impuestosXML = (r.impuestos || []).map((imp: any) => {
    const base = Number(imp.base_imponible).toFixed(2);
    const pct  = Number(imp.porcentaje).toFixed(2);
    const val  = Number(imp.valor_retenido).toFixed(2);
    const fechaDoc = imp.fecha_emision_doc_sustento
      ? fechaDDMMYYYY(imp.fecha_emision_doc_sustento)
      : fechaEmision;
    return (
      `<impuesto>` +
        `<codigo>${xmlEncode(String(imp.codigo))}</codigo>` +
        `<codigoRetencion>${xmlEncode(String(imp.codigo_retencion))}</codigoRetencion>` +
        `<baseImponible>${base}</baseImponible>` +
        `<porcentajeRetener>${pct}</porcentajeRetener>` +
        `<valorRetenido>${val}</valorRetenido>` +
        `<codDocSustento>${xmlEncode(r.doc_sustento_tipo || '01')}</codDocSustento>` +
        `<numDocSustento>${xmlEncode(r.doc_sustento_numero || '')}</numDocSustento>` +
        `<fechaEmisionDocSustento>${fechaDoc}</fechaEmisionDocSustento>` +
      `</impuesto>`
    );
  }).join('');

  const contribuyenteEspecialXML = r.contribuyente_especial
    ? `<contribuyenteEspecial>${xmlEncode(String(r.contribuyente_especial))}</contribuyenteEspecial>`
    : '';

  const agenteRetencionXML = r.agente_retencion
    ? `<agenteRetencion>${xmlEncode(String(r.agente_retencion))}</agenteRetencion>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<comprobanteRetencion id="comprobante" version="1.0.0">` +
      `<infoTributaria>` +
        `<ambiente>${r.ambiente || '1'}</ambiente>` +
        `<tipoEmision>1</tipoEmision>` +
        `<razonSocial>${xmlEncode(r.razon_social)}</razonSocial>` +
        `<nombreComercial>${xmlEncode(r.nombre_comercial || r.razon_social)}</nombreComercial>` +
        `<ruc>${xmlEncode(r.ruc)}</ruc>` +
        `<claveAcceso>${xmlEncode(r.clave_acceso)}</claveAcceso>` +
        `<codDoc>07</codDoc>` +
        `<estab>${estab3}</estab>` +
        `<ptoEmi>${ptoEmi3}</ptoEmi>` +
        `<secuencial>${secStr}</secuencial>` +
        `<dirMatriz>${xmlEncode(r.direccion_matriz)}</dirMatriz>` +
      `</infoTributaria>` +
      `<infoCompRetencion>` +
        `<fechaEmision>${fechaEmision}</fechaEmision>` +
        `<dirEstablecimiento>${xmlEncode(r.direccion_establecimiento || r.direccion_matriz)}</dirEstablecimiento>` +
        contribuyenteEspecialXML +
        agenteRetencionXML +
        `<obligadoContabilidad>${r.obligado_contabilidad ? 'SI' : 'NO'}</obligadoContabilidad>` +
        `<tipoIdentificacionSujetoRetenido>${xmlEncode(r.proveedor_tipo_id || '04')}</tipoIdentificacionSujetoRetenido>` +
        `<razonSocialSujetoRetenido>${xmlEncode(r.proveedor_razon_social)}</razonSocialSujetoRetenido>` +
        `<identificacionSujetoRetenido>${xmlEncode(r.proveedor_identificacion)}</identificacionSujetoRetenido>` +
        `<periodoFiscal>${periodoFiscal}</periodoFiscal>` +
      `</infoCompRetencion>` +
      `<impuestos>${impuestosXML}</impuestos>` +
    `</comprobanteRetencion>`
  );
}

// ──────────────────────────────────────────────────────────────
// Helper: obtener y guardar retención en DB
// ──────────────────────────────────────────────────────────────
async function getRetencion(empresaId: string, id: string): Promise<any | null> {
  const { data } = await getDB()
    .from('retenciones')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

async function saveRetencion(empresaId: string, id: string, r: any): Promise<void> {
  await getDB().from('retenciones').upsert({
    ...r,
    id,
    empresa_id: empresaId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
}

// ──────────────────────────────────────────────────────────────
// Helper: autorizar con SRI (reutilizable)
// ──────────────────────────────────────────────────────────────
async function autorizarRetenciónCore(empresaId: string, retencionId: string): Promise<{ retencion: any; error?: string; status?: number }> {
  const r = await getRetencion(empresaId, retencionId);
  if (!r) return { retencion: null, error: 'Retención no encontrada', status: 404 };

  if (r.estado === 'AUTORIZADO') return { retencion: r };

  const config = await getConfig(empresaId);
  if (!config) return { retencion: r, error: 'Sin configuración de facturación', status: 400 };

  const ambienteStr = normalizeAmbiente(config.ambiente);

  // Re-firmar si no tiene XML firmado
  let xmlParaEnviar = r.xml_firmado || '';
  if (!xmlParaEnviar && r.clave_acceso) {
    const xmlSinFirmar = buildRetenciónXML({ ...config, ...r });
    const certData = await getCert(empresaId);
    if (certData?.p12_base64) {
      try {
        xmlParaEnviar = await firmarXMLXAdES(xmlSinFirmar, certData);
        await saveRetencion(empresaId, retencionId, { ...r, xml_firmado: xmlParaEnviar });
      } catch {
        xmlParaEnviar = xmlSinFirmar;
      }
    } else {
      xmlParaEnviar = xmlSinFirmar;
    }
  }

  // Enviar al SRI
  if (xmlParaEnviar) {
    const envio = await enviarXMLAlSRI(xmlParaEnviar, ambienteStr);
    if (!envio.recibida && !envio.claveYaRegistrada) {
      const mensajes = envio.errores;
      await saveRetencion(empresaId, retencionId, {
        ...r, estado: 'NO_AUTORIZADO', mensajes_sri: mensajes, xml_firmado: xmlParaEnviar
      });
      return { retencion: { ...r, estado: 'NO_AUTORIZADO', mensajes_sri: mensajes } };
    }
  }

  // Consultar autorización
  if (!r.clave_acceso) return { retencion: r };
  const auth = await consultarAutorizacionSRI(r.clave_acceso, ambienteStr);

  const estadoFinal = auth.autorizado ? 'AUTORIZADO' : (auth.estadoSRI === 'NO AUTORIZADO' ? 'NO_AUTORIZADO' : 'PENDIENTE');
  const updated = {
    ...r,
    estado: estadoFinal,
    xml_firmado: xmlParaEnviar || r.xml_firmado,
    fecha_autorizacion: auth.fechaAutorizacion || r.fecha_autorizacion,
    numero_autorizacion: auth.numeroAutorizacion || r.numero_autorizacion,
    mensajes_sri: auth.mensajes.length ? auth.mensajes : r.mensajes_sri,
  };
  await saveRetencion(empresaId, retencionId, updated);
  return { retencion: updated };
}

// ──────────────────────────────────────────────────────────────
// POST /retenciones  — emitir nueva retención
// ──────────────────────────────────────────────────────────────
export async function handleEmitirRetencion(req: Request, empresaId: string): Promise<Response> {
  try {
    const body = await req.json();

    const config = await getConfig(empresaId);
    if (!config?.ruc || !config?.razon_social) {
      return Response.json({ error: 'Configure el RUC y razón social antes de emitir retenciones', requiere_configuracion: true }, { status: 400 });
    }

    if (!config.agente_retencion) {
      return Response.json({ error: 'La empresa no está configurada como Agente de Retención en la configuración de facturación' }, { status: 400 });
    }

    const impuestos: any[] = body.impuestos || [];
    if (impuestos.length === 0) {
      return Response.json({ error: 'Debe incluir al menos un impuesto a retener' }, { status: 400 });
    }

    // ── Clave de acceso ──────────────────────────────────────
    const nowUtc = new Date();
    const nowEc  = new Date(nowUtc.getTime() - 5 * 60 * 60 * 1000);
    const dd  = String(nowEc.getUTCDate()).padStart(2, '0');
    const mo  = String(nowEc.getUTCMonth() + 1).padStart(2, '0');
    const yy  = String(nowEc.getUTCFullYear());
    const ambCod = config.ambiente === 'produccion' ? '2' : '1';

    // ── Incremento atómico del secuencial de retenciones (race condition fix) ──
    const secuencialActual = config.secuencial_retenciones || 1;
    const { data: secRetResult } = await getDB()
      .from('configuracion_facturacion')
      .update({ secuencial_retenciones: secuencialActual + 1, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('secuencial_retenciones', secuencialActual)
      .select('secuencial_retenciones')
      .maybeSingle();
    if (!secRetResult) {
      return Response.json({
        error: 'Conflicto al reservar el secuencial de retención. Intente de nuevo.',
      }, { status: 409 });
    }
    const secStr = String(secuencialActual).padStart(9, '0');
    const cod8 = Math.floor(10000000 + Math.random() * 90000000).toString();
    const estab3  = String(config.codigo_establecimiento || '001').padStart(3, '0').substring(0, 3);
    const ptoEmi3 = String(config.punto_emision || '001').padStart(3, '0').substring(0, 3);

    const claveBase = dd + mo + yy + '07' + config.ruc + ambCod + estab3 + ptoEmi3 + secStr + cod8 + '1';
    const claveAcceso = claveBase + calcularModulo11(claveBase);
    const numeroRetencion = `${estab3}-${ptoEmi3}-${secStr}`;

    // ── Total retenido ─────────────────────────────────────
    const totalRetenido = impuestos.reduce((s: number, imp: any) => s + Number(imp.valor_retenido || 0), 0);

    // ── Objeto retención ───────────────────────────────────
    const periodoFiscal = body.periodo_fiscal || (() => {
      const docFecha = body.doc_sustento_fecha
        ? new Date(body.doc_sustento_fecha + 'T00:00:00')
        : nowEc;
      return `${String(docFecha.getUTCMonth() + 1).padStart(2, '0')}/${docFecha.getUTCFullYear()}`;
    })();

    const retencion: any = {
      // Emisor
      razon_social:              config.razon_social,
      nombre_comercial:          config.nombre_comercial || config.razon_social,
      ruc:                       config.ruc,
      direccion_matriz:          config.direccion_matriz,
      direccion_establecimiento: config.direccion_establecimiento || config.direccion_matriz,
      obligado_contabilidad:     config.obligado_contabilidad || false,
      contribuyente_especial:    config.contribuyente_especial || '',
      agente_retencion:          config.agente_retencion || '',
      // Comprobante
      numero_retencion:          numeroRetencion,
      clave_acceso:              claveAcceso,
      ambiente:                  ambCod,
      secuencial:                secuencialActual,
      codigo_establecimiento:    config.codigo_establecimiento,
      punto_emision:             config.punto_emision,
      fecha_emision:             `${yy}-${mo}-${dd}`,
      periodo_fiscal:            periodoFiscal,
      // Proveedor (sujeto retenido)
      proveedor_identificacion:  body.proveedor_identificacion,
      proveedor_tipo_id:         body.proveedor_tipo_id || '04',
      proveedor_razon_social:    body.proveedor_razon_social,
      proveedor_email:           body.proveedor_email || '',
      // Documento sustento
      doc_sustento_tipo:         body.doc_sustento_tipo || '01',
      doc_sustento_numero:       body.doc_sustento_numero || '',
      doc_sustento_fecha:        body.doc_sustento_fecha || '',
      // Impuestos
      impuestos:                 impuestos,
      total_retenido:            Math.round(totalRetenido * 100) / 100,
      // Estado
      estado:                    'PENDIENTE',
      fecha_autorizacion:        null,
      numero_autorizacion:       null,
      mensajes_sri:              [],
      xml_firmado:               '',
      // Relación con compra
      compra_id:                 body.compra_id || null,
      empresa_id:                empresaId,
      created_at:                nowUtc.toISOString(),
    };

    // ── Generar XML ───────────────────────────────────────
    const xmlSinFirmar = buildRetenciónXML(retencion);
    let xmlParaEnviar = xmlSinFirmar;

    // ── Firmar ────────────────────────────────────────────
    const certData = await getCert(empresaId);
    const tieneCertificado = !!(certData?.p12_base64 && certData?.password);
    if (tieneCertificado) {
      try {
        xmlParaEnviar = await firmarXMLXAdES(xmlSinFirmar, certData);
        retencion.xml_firmado = xmlParaEnviar;
        console.log('✅ Retención firmada digitalmente');
      } catch (e: any) {
        console.warn('⚠️ Firma fallida:', e.message);
        retencion.mensajes_sri = [`Error al firmar: ${e.message}`];
      }
    }

    // ── Guardar en DB ─────────────────────────────────────
    const { data: inserted, error: dbErr } = await getDB()
      .from('retenciones')
      .insert({ ...retencion })
      .select('id')
      .single();

    if (dbErr || !inserted) {
      console.error('DB insert error:', dbErr);
      return Response.json({ error: 'Error guardando retención: ' + (dbErr?.message || 'unknown') }, { status: 500 });
    }

    const retencionId = inserted.id;

    // (secuencial ya fue incrementado atómicamente antes de generar el XML)

    // ── Enviar al SRI ─────────────────────────────────────
    const ambienteStr = normalizeAmbiente(config.ambiente);
    const envio = await enviarXMLAlSRI(xmlParaEnviar, ambienteStr);

    if (!envio.recibida && !envio.claveYaRegistrada) {
      retencion.estado = 'NO_AUTORIZADO';
      retencion.mensajes_sri = envio.errores;
      await saveRetencion(empresaId, retencionId, { ...retencion, id: retencionId });
      return Response.json({
        ok: false,
        retencion: { ...retencion, id: retencionId },
        errores: envio.errores,
      }, { status: 200 });
    }

    // ── Consultar autorización ────────────────────────────
    const auth = await consultarAutorizacionSRI(claveAcceso, ambienteStr);
    const estadoFinal = auth.autorizado ? 'AUTORIZADO' : 'PENDIENTE';
    retencion.estado              = estadoFinal;
    retencion.fecha_autorizacion  = auth.fechaAutorizacion || null;
    retencion.numero_autorizacion = auth.numeroAutorizacion || null;
    retencion.mensajes_sri        = auth.mensajes;

    await saveRetencion(empresaId, retencionId, { ...retencion, id: retencionId });

    return Response.json({
      ok: true,
      retencion: { ...retencion, id: retencionId },
    });
  } catch (e: any) {
    console.error('handleEmitirRetencion error:', e);
    return Response.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /retenciones  — listar retenciones de la empresa
// ──────────────────────────────────────────────────────────────
export async function handleGetRetenciones(req: Request, empresaId: string): Promise<Response> {
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const estado = url.searchParams.get('estado') || '';
    const fi = url.searchParams.get('fecha_inicio') || '';
    const ff = url.searchParams.get('fecha_fin') || '';

    let query = getDB()
      .from('retenciones')
      .select('*', { count: 'exact' })
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (estado) query = query.eq('estado', estado);
    if (fi)     query = query.gte('created_at', fi + 'T00:00:00');
    if (ff)     query = query.lte('created_at', ff + 'T23:59:59');

    const { data, count, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      retenciones: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /retenciones/:id
// ──────────────────────────────────────────────────────────────
export async function handleGetRetencion(req: Request, empresaId: string, retencionId: string): Promise<Response> {
  try {
    const r = await getRetencion(empresaId, retencionId);
    if (!r) return Response.json({ error: 'Retención no encontrada' }, { status: 404 });
    return Response.json({ retencion: r });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /retenciones/:id/autorizar  — reintentar autorización SRI
// ──────────────────────────────────────────────────────────────
export async function handleAutorizarRetencion(req: Request, empresaId: string, retencionId: string): Promise<Response> {
  try {
    const result = await autorizarRetenciónCore(empresaId, retencionId);
    if (result.error) return Response.json({ error: result.error }, { status: result.status || 500 });
    return Response.json({ ok: true, retencion: result.retencion });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /retenciones/:id/xml  — descargar XML firmado
// ──────────────────────────────────────────────────────────────
export async function handleGetXMLRetencion(req: Request, empresaId: string, retencionId: string): Promise<Response> {
  try {
    const r = await getRetencion(empresaId, retencionId);
    if (!r) return Response.json({ error: 'Retención no encontrada' }, { status: 404 });
    const xml = r.xml_firmado || buildRetenciónXML(r);
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="retencion_${r.numero_retencion || retencionId}.xml"`,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
