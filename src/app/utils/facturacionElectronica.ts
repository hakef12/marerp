/**
 * Utilidades para facturación electrónica SRI Ecuador
 */

// Generar clave de acceso de 49 dígitos
export function generarClaveAcceso(params: {
  fecha: Date;
  tipoComprobante: string; // '01' = Factura
  ruc: string;
  ambiente: '1' | '2'; // 1=Pruebas, 2=Producción
  establecimiento: string; // 001
  puntoEmision: string; // 001
  secuencial: number; // 000000123
  codigoNumerico: string; // 8 dígitos aleatorios
  tipoEmision: '1' | '2'; // 1=Normal, 2=Contingencia
}): string {
  const { fecha, tipoComprobante, ruc, ambiente, establecimiento, puntoEmision, secuencial, codigoNumerico, tipoEmision } = params;
  
  // Formato: ddmmaaaa + tipo + ruc + ambiente + serie + secuencial + código + tipo emisión
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear());
  
  const secuencialStr = String(secuencial).padStart(9, '0');
  
  const claveBase = 
    dia + mes + anio +
    tipoComprobante +
    ruc +
    ambiente +
    establecimiento + puntoEmision +
    secuencialStr +
    codigoNumerico +
    tipoEmision;
  
  // Calcular dígito verificador (módulo 11)
  const digitoVerificador = calcularModulo11(claveBase);
  
  return claveBase + digitoVerificador;
}

// Calcular dígito verificador módulo 11 (SRI v2.26)
function calcularModulo11(clave: string): string {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  let factor = 0;

  for (let i = clave.length - 1; i >= 0; i--) {
    suma += parseInt(clave[i]) * factores[factor];
    factor = (factor + 1) % factores.length;
  }

  // SRI spec v2.26: d=11→'0', d=10→'1', else String(d)
  const d = 11 - (suma % 11);
  if (d === 11) return '0';
  if (d === 10) return '1';
  return String(d);
}

// Generar código numérico aleatorio de 8 dígitos
export function generarCodigoNumerico(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Generar número de factura formateado
export function generarNumeroFactura(establecimiento: string, puntoEmision: string, secuencial: number): string {
  return `${establecimiento}-${puntoEmision}-${String(secuencial).padStart(9, '0')}`;
}

// Códigos de formas de pago según SRI v2.26
export const FORMAS_PAGO = {
  EFECTIVO: { codigo: '01', descripcion: 'Efectivo' },
  TARJETA_DEBITO: { codigo: '16', descripcion: 'Tarjeta de Débito' },
  TARJETA_CREDITO: { codigo: '19', descripcion: 'Tarjeta de Crédito' },
  TRANSFERENCIA: { codigo: '20', descripcion: 'Otros con utilización del sistema financiero' },
  OTROS: { codigo: '20', descripcion: 'Otros con utilización del sistema financiero' },
};

// Tipos de identificación según SRI
export const TIPOS_IDENTIFICACION = {
  RUC: { codigo: '04', descripcion: 'RUC' },
  CEDULA: { codigo: '05', descripcion: 'Cédula' },
  PASAPORTE: { codigo: '06', descripcion: 'Pasaporte' },
  CONSUMIDOR_FINAL: { codigo: '07', descripcion: 'Consumidor Final' },
};

// Identificación para consumidor final
export const CONSUMIDOR_FINAL = {
  identificacion: '9999999999999',
  tipo: TIPOS_IDENTIFICACION.CONSUMIDOR_FINAL.codigo,
  razon_social: 'Consumidor Final',
};

// Generar XML de factura según especificaciones SRI v2.1.0
export function generarXMLFactura(factura: any): string {
  const fecha = new Date(factura.fecha_emision + 'T00:00:00');
  // SRI requiere formato dd/mm/aaaa
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = String(fecha.getFullYear());
  const fechaStr = `${dd}/${mm}/${yyyy}`;

  // Campos opcionales infoTributaria (v2.1.0)
  const agenteRetencionXML = factura.agente_retencion
    ? `\n    <agenteRetencion>${escapeXML(String(factura.agente_retencion))}</agenteRetencion>`
    : '';
  const rimpeXML = factura.regimen_rimpe || factura.contribuyente_rimpe
    ? `\n    <contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>${factura.ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXML(factura.razon_social)}</razonSocial>
    <nombreComercial>${escapeXML(factura.nombre_comercial || factura.razon_social)}</nombreComercial>
    <ruc>${factura.ruc}</ruc>
    <claveAcceso>${factura.clave_acceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${factura.codigo_establecimiento}</estab>
    <ptoEmi>${factura.punto_emision}</ptoEmi>
    <secuencial>${String(factura.secuencial).padStart(9, '0')}</secuencial>
    <dirMatriz>${escapeXML(factura.direccion_matriz)}</dirMatriz>${agenteRetencionXML}${rimpeXML}
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fechaStr}</fechaEmision>
    <dirEstablecimiento>${escapeXML(factura.direccion_establecimiento || factura.direccion_matriz)}</dirEstablecimiento>
    ${factura.contribuyente_especial ? `<contribuyenteEspecial>${escapeXML(factura.contribuyente_especial)}</contribuyenteEspecial>` : ''}
    <obligadoContabilidad>${factura.obligado_contabilidad ? 'SI' : 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${factura.cliente_tipo_identificacion}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXML(factura.cliente_razon_social)}</razonSocialComprador>
    <identificacionComprador>${factura.cliente_identificacion}</identificacionComprador>
    <totalSinImpuestos>${factura.subtotal_iva + factura.subtotal_0}</totalSinImpuestos>
    <totalDescuento>${factura.total_descuento}</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>${factura.subtotal_iva}</baseImponible>
        <tarifa>15.00</tarifa>
        <valor>${factura.iva}</valor>
      </totalImpuesto>
      ${factura.subtotal_0 > 0 ? `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>${factura.subtotal_0}</baseImponible>
        <tarifa>0.00</tarifa>
        <valor>0.00</valor>
      </totalImpuesto>
      ` : ''}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${factura.total}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      ${factura.formas_pago.map((pago: any) => `
      <pago>
        <formaPago>${pago.codigo}</formaPago>
        <total>${pago.total}</total>
      </pago>
      `).join('')}
    </pagos>
  </infoFactura>
  <detalles>
    ${factura.items.map((item: any, idx: number) => {
      // Soporte multi-tarifa IVA: 0% (codigoPorcentaje=0) o 15% (codigoPorcentaje=4)
      const tarifaIva = Number(item.tarifa_iva ?? 15);
      const codPct    = tarifaIva > 0 ? '4' : '0';
      const tarifaStr = tarifaIva > 0 ? '15.00' : '0.00';
      const ivaValor  = tarifaIva > 0 ? (item.subtotal * 0.15).toFixed(2) : '0.00';
      return `
    <detalle>
      <codigoPrincipal>${idx + 1}</codigoPrincipal>
      <descripcion>${escapeXML(item.descripcion)}</descripcion>
      <cantidad>${item.cantidad}</cantidad>
      <precioUnitario>${Number(item.precio_unitario).toFixed(6)}</precioUnitario>
      <descuento>${Number(item.descuento || 0).toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${Number(item.subtotal).toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${codPct}</codigoPorcentaje>
          <tarifa>${tarifaStr}</tarifa>
          <baseImponible>${Number(item.subtotal).toFixed(2)}</baseImponible>
          <valor>${ivaValor}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
    }).join('')}
  </detalles>
  <infoAdicional>
    ${factura.cliente_email ? `<campoAdicional nombre="Email">${escapeXML(factura.cliente_email)}</campoAdicional>` : ''}
    ${factura.telefono ? `<campoAdicional nombre="Telefono">${factura.telefono}</campoAdicional>` : ''}
  </infoAdicional>
</factura>`;
}

// Escapar caracteres especiales XML
function escapeXML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Validar RUC ecuatoriano
export function validarRUC(ruc: string): boolean {
  if (!ruc || ruc.length !== 13) return false;

  const digits = ruc.split('').map(Number);
  if (digits.some(isNaN)) return false;

  const provincia = digits[0] * 10 + digits[1];
  if (provincia < 1 || provincia > 24) return false;

  const tercerDigito = digits[2];

  if (tercerDigito < 6) {
    // Persona Natural: módulo 10 (igual que cédula), dígito verificador en posición 9
    const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      let v = digits[i] * coef[i];
      if (v >= 10) v -= 9;
      suma += v;
    }
    const residuo = suma % 10;
    const verificador = residuo === 0 ? 0 : 10 - residuo;
    if (verificador !== digits[9]) return false;
    // Los últimos 3 dígitos = número de establecimiento (>= 001)
    return (digits[10] * 100 + digits[11] * 10 + digits[12]) >= 1;

  } else if (tercerDigito === 9) {
    // Persona Jurídica / Sociedad Privada: módulo 11, dígito verificador en posición 9
    const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 9; i++) suma += digits[i] * coef[i];
    const residuo = suma % 11;
    const verificador = residuo === 0 ? 0 : 11 - residuo;
    if (verificador !== digits[9]) return false;
    return (digits[10] * 100 + digits[11] * 10 + digits[12]) >= 1;

  } else if (tercerDigito === 6) {
    // Empresa Pública: módulo 11, dígito verificador en posición 8
    const coef = [3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 8; i++) suma += digits[i] * coef[i];
    const residuo = suma % 11;
    const verificador = residuo === 0 ? 0 : 11 - residuo;
    return verificador === digits[8];

  } else {
    // 3er dígito 7 u 8 no es válido en Ecuador
    return false;
  }
}

// Validar Cédula ecuatoriana
export function validarCedula(cedula: string): boolean {
  if (!cedula || cedula.length !== 10) return false;
  
  // Provincia válida
  const provincia = parseInt(cedula.substring(0, 2));
  if (provincia < 1 || provincia > 24) return false;
  
  // Verificar dígito verificador
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula.charAt(i)) * coeficientes[i];
    if (valor >= 10) valor = valor - 9;
    suma += valor;
  }
  
  const residuo = suma % 10;
  const digitoVerificador = residuo === 0 ? 0 : 10 - residuo;
  
  return digitoVerificador === parseInt(cedula.charAt(9));
}
