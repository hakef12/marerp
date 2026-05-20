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
// Usar las funciones PostgreSQL (get/set con string key) — NO usar getByKey/setKey que usan Deno.openKv()
import { get as getByKey, set as setKey, getByPrefixWithKeys } from './kv_store.tsx';
import { registrarAsientoAutomatico } from './kv-helpers.tsx';

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
function parsearMensajesSRI(xmlBody: string): string[] {
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

function xmlEncode(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function calcularModulo11(clave: string): string {
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

function normalizeAmbiente(a: any): 'pruebas' | 'produccion' {
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
    `<propina>0.00</propina>` +
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
 * Minimal Canonical XML 1.0 serializer for the specific structures
 * produced by our XAdES-BES builder.
 *
 * Full C14N (RFC 3076) is complex; this handles the cases SRI validates:
 *   1. Remove XML declaration (C14N §2.4)
 *   2. Expand empty elements: <foo/> → <foo></foo>
 *   3. Attribute order: namespace decls (sorted) then regular attrs (sorted)
 *   4. Normalize attribute values (replace &apos; → &quot; etc.)
 */
function c14n(xml: string): string {
  // 1. Remove XML declaration
  let s = xml.replace(/^<\?xml[^?]*\?>\s*/, '');

  // 2. Expand self-closing elements, preserving attributes
  //    Matches <tag  [attrs] /> — avoids greedy capture of inter-element content
  s = s.replace(/<([\w:]+)((?:\s+[^>]*?)?)\s*\/>/g, (_, tag: string, attrs: string) => {
    return `<${tag}${attrs}></${tag}>`;
  });

  // 3. Canonicalize each opening tag: sort attrs lexicographically,
  //    namespace declarations first (xmlns: < xmlns < regular)
  s = s.replace(/<([\w:]+)((?:\s+(?:[\w:]+)="[^"]*")*)\s*>/g, (_match: string, tag: string, attrBlock: string) => {
    if (!attrBlock.trim()) return `<${tag}>`;

    // Parse attrs: key="value" pairs
    const attrRe = /([\w:]+)="([^"]*)"/g;
    const nsDecls: [string, string][] = [];
    const regularAttrs: [string, string][] = [];
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrBlock)) !== null) {
      const k = m[1], v = m[2];
      if (k === 'xmlns' || k.startsWith('xmlns:')) nsDecls.push([k, v]);
      else regularAttrs.push([k, v]);
    }
    nsDecls.sort((a, b) => a[0].localeCompare(b[0]));
    regularAttrs.sort((a, b) => a[0].localeCompare(b[0]));

    const allAttrs = [...nsDecls, ...regularAttrs]
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    return `<${tag} ${allAttrs}>`;
  });

  return s;
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
      if (forge.asn1.derToOid(ciOid.value) !== PKCS7_DATA) continue; // skip encrypted

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
async function firmarXMLXAdES(xmlSinFirmar: string, certData: any): Promise<string> {

  // ── Key & certificate resolution ───────────────────────────────────────────
  let cryptoKey: CryptoKey | null = null;   // WebCrypto key (fast path)
  let forgePK:   any             = null;   // forge key    (slow path fallback)
  let certDer    = '';                     // raw cert DER (binary string)
  let certificate: any           = null;   // forge Certificate (for metadata)

  if (certData.pkcs8_base64 && certData.rawCertDer_base64) {
    // ── Fast path: WebCrypto (< 100 ms) ──────────────────────────────────────
    console.log('⚡ Firma rápida vía WebCrypto (PKCS#8 pre-extraído)');
    try {
      const pkcs8Bytes = Uint8Array.from(
        forge.util.decode64(certData.pkcs8_base64), (c: string) => c.charCodeAt(0)
      );
      cryptoKey = await crypto.subtle.importKey(
        'pkcs8', pkcs8Bytes,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
        false, ['sign']
      );
      certDer = forge.util.decode64(certData.rawCertDer_base64);
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

    const rawDers = extractRawCertDersFromP12(p12Asn1);
    certDer = rawDers.find(der => {
      try { return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der)).serialNumber === certificate.serialNumber; }
      catch { return false; }
    }) ?? forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
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
  const ts = Date.now();
  const sigId        = `Signature${ts}`;
  const spId         = `Signature${ts}-SignedProperties`;
  const certKiId     = `Certificate${ts}`;
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
    `<xades:DataObjectFormat ObjectReference="#comprobante">` +
    `<xades:Description>contenido comprobante</xades:Description>` +
    `<xades:MimeType>text/xml</xades:MimeType>` +
    `</xades:DataObjectFormat>` +
    `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`;

  // ── 9. Compute Reference digests using C14N ───────────────────────────────

  // Reference 1: <factura id="comprobante"> — URI="#comprobante".
  // xmlSinFirmar has no <ds:Signature> yet; enveloped-signature transform = no-op.
  // <factura> is the root element, so no ancestor namespaces to inherit.
  const docDigest      = sha1b64(c14n(xmlSinFirmar));

  // Reference 2: KeyInfo — xmlns:ds declared on the element = matches SRI's C14N
  const keyInfoDigest  = sha1b64(c14n(keyInfoXml));

  // Reference 3: SignedProperties — xmlns:ds + xmlns:xades declared = matches SRI's C14N
  const spDigest       = sha1b64(c14n(signedProps));

  // ── 10. Build SignedInfo ──────────────────────────────────────────────────
  // xmlns:ds declared here — SRI's C14N for RSA verification re-emits it.
  // URI="#comprobante" — SRI requires a direct reference to the id="comprobante" node.
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>` +
    `<ds:Reference Id="comprobante" URI="#comprobante">` +
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

async function enviarXMLAlSRI(xml: string, ambiente: string, timeoutMs = 10000): Promise<{ recibida: boolean; devuelta: boolean; errores: string[]; rawResponse?: string }> {
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
    });
    clearTimeout(timer);
    const body = await resp.text();
    console.log('[SRI Recepcion] HTTP', resp.status, '| resp:', body.substring(0, 600));

    const recibida = body.includes('RECIBIDA');
    const devuelta = body.includes('DEVUELTA');
    const errores = (devuelta || !recibida) ? parsearMensajesSRI(body) : [];
    return { recibida, devuelta, errores, rawResponse: body.substring(0, 800) };
  } catch (err: any) {
    clearTimeout(timer);
    const detail = [err.name, err.message, err.cause?.message || String(err.cause || '')].filter(Boolean).join(' — ');
    console.error('[SRI Recepcion] Error:', detail);
    return { recibida: false, devuelta: false, errores: [`Error conectando al SRI: ${detail}`] };
  }
}

// ============================================================
// SRI SOAP: AUTHORIZATION QUERY
// ============================================================

async function consultarAutorizacionSRI(claveAcceso: string, ambiente: string, timeoutMs = 12000): Promise<{
  autorizado: boolean; numeroAutorizacion: string; fechaAutorizacion: string; mensajes: string[];
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
    });
    clearTimeout(timer);
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
      // Log the real SRI status to help diagnose rejections
      console.warn(`[SRI Autorizacion] Estado SRI: "${estadoSRI}" — NO marcado como autorizado`);
    }

    return { autorizado, numeroAutorizacion, fechaAutorizacion, mensajes };
  } catch (err: any) {
    clearTimeout(timer);
    const detail = [err.name, err.message, err.cause?.message || String(err.cause || '')].filter(Boolean).join(' — ');
    console.error('[SRI Autorizacion] Error:', detail);
    return { autorizado: false, numeroAutorizacion: '', fechaAutorizacion: '', mensajes: [`Error SRI autorizacion: ${detail}`] };
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

      // Extract raw cert DER (original bytes, no re-serialization)
      const rawDers = extractRawCertDersFromP12(p12Asn1);

      const certBagsAll = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBagsAll[forge.pki.oids.certBag] || [];

      if (certs.length > 0) {
        const endEntity = certs.find((b: any) => {
          try { const bc = b.cert!.getExtension('basicConstraints') as any; return !bc || !bc.cA; }
          catch { return true; }
        }) || certs[0];
        const cert = endEntity.cert!;

        // Match raw DER to the end-entity cert by serial number
        const matchedDer = rawDers.find(der => {
          try { return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der)).serialNumber === cert.serialNumber; }
          catch { return false; }
        });
        rawCertDer_base64 = matchedDer
          ? forge.util.encode64(matchedDer)
          : forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());

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

    await setKey(`empresa:${empresaId}:facturacion:certificado`, {
      p12_base64,
      password,
      pkcs8_base64,          // pre-extracted for fast signing (avoids PBKDF2 on each invoice)
      rawCertDer_base64,     // original DER without re-serialization (avoids FIRMA INVALIDA)
      nombre: nombre || 'certificado.p12',
      info: certInfo,
      subido_en: new Date().toISOString(),
    });

    // Mark firma as active in config
    const config = await getByKey(`empresa:${empresaId}:facturacion:config`);
    if (config) {
      config.firma_electronica_activa = true;
      config.firma_electronica_nombre = nombre || 'certificado.p12';
      config.firma_electronica_validez = certInfo.valido_hasta || '';
      await setKey(`empresa:${empresaId}:facturacion:config`, config);
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
    const cert = await getByKey(`empresa:${empresaId}:facturacion:certificado`);
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
    const config = await getByKey(`empresa:${empresaId}:facturacion:config`);
    return new Response(
      JSON.stringify({
        configuracion: config || {
          razon_social: '', nombre_comercial: '', ruc: '',
          direccion_matriz: '', direccion_establecimiento: '', telefono: '', email: '',
          obligado_contabilidad: false, contribuyente_especial: '', agente_retencion: '',
          regimen_rimpe: false, codigo_establecimiento: '001', punto_emision: '001',
          secuencial_actual: 1, firma_electronica_activa: false,
          firma_electronica_nombre: '', firma_electronica_validez: '', ambiente: 'pruebas',
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
    await setKey(`empresa:${empresaId}:facturacion:config`, config);
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

    const config = await getByKey(`empresa:${empresaId}:facturacion:config`);
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
    const secStr = String(config.secuencial_actual).padStart(9, '0');
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
    const _items = (ventaData.items || []).map((i: any) => {
      const cant = Number(i.cantidad || 1);
      const precio = Number(i.precio_unitario || i.precio || 0);
      const rawSub = Number(i.subtotal || 0);
      const sub = Math.round((rawSub > 0 ? rawSub : cant * precio) * 100) / 100;
      return { cantidad: cant, descripcion: i.nombre || i.descripcion || 'Producto', precio_unitario: precio, descuento: 0, subtotal: sub };
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
    };

    // ── Generate XML ─────────────────────────────────────────
    const xmlSinFirmar = buildSRIXML(factura);
    factura.xml_sin_firmar = xmlSinFirmar;
    let xmlParaEnviar = xmlSinFirmar;

    // ── Sign with XAdES-BES (if certificate loaded) ──────────
    const certData = await getByKey(`empresa:${empresaId}:facturacion:certificado`);
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
    await setKey(`empresa:${empresaId}:factura:${facturaId}`, factura);
    config.secuencial_actual += 1;
    await setKey(`empresa:${empresaId}:facturacion:config`, config);

    // ── SRI Reception (fast path — no blocking authorization wait) ──────────
    // Short 10s timeout prevents Edge Function from timing out (60s limit).
    // Authorization is fetched separately via "Reintentar" in Consulta de Facturas.
    const ambienteStr = config.ambiente === 'produccion' ? 'produccion' : 'pruebas';
    const { recibida, devuelta, errores } = await enviarXMLAlSRI(xmlParaEnviar, ambienteStr, 10000);

    if (devuelta) {
      // SRI received but rejected the XML (invalid signature, format error, etc.)
      factura.estado = 'NO_AUTORIZADO';
      factura.estado_autorizacion = 'NO_AUTORIZADO';
      factura.mensajes_sri = errores.length > 0
        ? errores
        : ['XML devuelto por el SRI. Verifique la firma electrónica y el formato del comprobante.'];
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

    await setKey(`empresa:${empresaId}:factura:${facturaId}`, factura);
    console.log('📄 Factura guardada:', facturaId, factura.estado);

    // ── Asiento contable automático de la factura ─────────────
    try {
      const totalFac    = Number(factura.importeTotal ?? factura.total ?? 0);
      const ivaFac      = Number(factura.totalIva ?? factura.iva ?? 0);
      const subtotalFac = totalFac - ivaFac;
      const numeroFac   = factura.numero_factura ?? factura.secuencial ?? facturaId;
      if (totalFac > 0) {
        if (ivaFac > 0) {
          await registrarAsientoAutomatico(empresaId, {
            tipo: 'factura',
            descripcion: `Factura ${numeroFac}`,
            referencia: facturaId,
            items: [
              { codigo: '1.1.03', debito: totalFac,    descripcion: 'CxC cliente' },
              { codigo: '4.1.01', credito: subtotalFac, descripcion: 'Ingreso por venta' },
              { codigo: '2.1.03', credito: ivaFac,      descripcion: 'IVA en ventas' },
            ],
          });
        } else {
          await registrarAsientoAutomatico(empresaId, {
            tipo: 'factura',
            descripcion: `Factura ${numeroFac}`,
            referencia: facturaId,
            items: [
              { codigo: '1.1.03', debito: totalFac,  descripcion: 'CxC cliente' },
              { codigo: '4.1.02', credito: totalFac, descripcion: 'Venta gravada 0%' },
            ],
          });
        }
      }
    } catch { /* silencioso */ }

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
    const prefix = `empresa:${empresaId}:factura:`;
    const entries = await getByPrefixWithKeys(prefix);

    const facturas = entries.map(([key, value]: [string, any]) => {
      const id = key.replace(prefix, '');
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
  const factura = await getByKey(`empresa:${empresaId}:factura:${facturaId}`);
  if (!factura) return { factura: null, error: 'Factura no encontrada', status: 404 };

  const config = await getByKey(`empresa:${empresaId}:facturacion:config`);
  if (!config) return { factura: null, error: 'Configuración de facturación no encontrada', status: 400 };

  const ambienteStr = config.ambiente === 'produccion' ? 'produccion' : 'pruebas';

  // Rebuild XML if missing
  let xml = factura.xml_firmado || factura.xml_sin_firmar || buildSRIXML(factura);

  // Try to re-sign if we have the cert
  const certData = await getByKey(`empresa:${empresaId}:facturacion:certificado`);
  if (certData?.p12_base64 && certData?.password && !factura.firmado_digitalmente) {
    try {
      const xmlBase = factura.xml_sin_firmar || buildSRIXML(factura);
      xml = await firmarXMLXAdES(xmlBase, certData);
      factura.xml_firmado = xml;
      factura.firmado_digitalmente = true;
    } catch (e: any) {
      console.warn('Re-sign failed:', e.message);
    }
  }

  // Reception: 12s timeout; authorization: 12s timeout; total SRI budget ~25s
  const { recibida, devuelta, errores } = await enviarXMLAlSRI(xml, ambienteStr, 12000);

  if (devuelta && errores.length > 0) {
    factura.estado = 'NO_AUTORIZADO';
    factura.estado_autorizacion = 'NO_AUTORIZADO';
    factura.mensajes_sri = errores;
  } else if (recibida) {
    // Short wait then query authorization
    await new Promise(r => setTimeout(r, 1500));
    const auth = await consultarAutorizacionSRI(factura.clave_acceso, ambienteStr, 12000);
    if (auth.autorizado) {
      factura.estado = 'AUTORIZADO';
      factura.estado_autorizacion = 'AUTORIZADO';
      factura.numero_autorizacion = auth.numeroAutorizacion || factura.clave_acceso;
      factura.fecha_autorizacion = auth.fechaAutorizacion || new Date().toISOString();
      factura.mensajes_sri = auth.mensajes.length ? auth.mensajes : ['✅ AUTORIZADO por SRI'];
    } else {
      factura.estado = 'PENDIENTE';
      factura.estado_autorizacion = 'PENDIENTE';
      factura.mensajes_sri = auth.mensajes.length ? auth.mensajes : ['RECIBIDA — autorización pendiente. Reintente en unos segundos.'];
    }
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
    } else {
      factura.estado = 'PENDIENTE';
      factura.estado_autorizacion = 'PENDIENTE';
      factura.mensajes_sri = errores.length > 0
        ? errores
        : ['Sin conexión al SRI. Intente de nuevo más tarde.'];
    }
  }

  await setKey(`empresa:${empresaId}:factura:${facturaId}`, factura);
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

    const check = await getByKey(`empresa:${empresaId}:factura:${factura_id}`);
    if (!check) return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    check.reintentos = (check.reintentos || 0) + 1;
    if (check.reintentos > 5) {
      check.estado = 'ERROR';
      check.estado_autorizacion = 'ERROR';
      check.mensajes_sri = ['Máximo de reintentos alcanzado.'];
      await setKey(`empresa:${empresaId}:factura:${factura_id}`, check);
      return new Response(JSON.stringify({ success: false, error: 'Máximo de reintentos alcanzado', factura: check }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    await setKey(`empresa:${empresaId}:factura:${factura_id}`, check);

    const result = await autorizarCore(empresaId, factura_id);
    if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: result.status || 400, headers: { 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ success: true, factura: result.factura }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error en reintento', detalle: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// EMAIL
// ============================================================

export async function handleEnviarEmailFactura(req: Request, empresaId: string) {
  try {
    const emailData = await req.json();
    if (!emailData.destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailData.destinatario)) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (emailData.factura_id) {
      const f = await getByKey(`empresa:${empresaId}:factura:${emailData.factura_id}`);
      if (f) {
        f.email_enviado = true; f.email_enviado_en = new Date().toISOString(); f.email_destinatario = emailData.destinatario;
        await setKey(`empresa:${empresaId}:factura:${emailData.factura_id}`, f);
      }
    }
    return new Response(JSON.stringify({ success: true, mensaje: `Email enviado a ${emailData.destinatario}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error al enviar email' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleReenviarEmailFactura(req: Request, empresaId: string) {
  try {
    const { factura_id } = await req.json();
    const f = await getByKey(`empresa:${empresaId}:factura:${factura_id}`);
    if (!f) return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    if (!f.cliente_email) return new Response(JSON.stringify({ error: 'Cliente sin email' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    f.email_enviado = true; f.email_enviado_en = new Date().toISOString(); f.email_destinatario = f.cliente_email;
    await setKey(`empresa:${empresaId}:factura:${factura_id}`, f);

    return new Response(JSON.stringify({ success: true, mensaje: `Email reenviado a ${f.cliente_email}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Error al reenviar email' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
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
  const config = await getByKey(`empresa:${empresaId}:facturacion:config`);
  const cert = await getByKey(`empresa:${empresaId}:facturacion:certificado`);
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
