import { useEffect } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '../ui/button';
import { cssTermico, printHtml, esc, type AnchoPapel } from '../../utils/printThermal';

interface RIDEProps {
  /** Si es true, lanza la impresión automáticamente al montar el componente */
  autoImprimir?: boolean;
  factura: {
    razon_social: string;
    nombre_comercial?: string;
    ruc: string;
    direccion_matriz: string;
    direccion_establecimiento?: string;
    telefono?: string;
    obligado_contabilidad: boolean;
    regimen_rimpe: boolean;
    contribuyente_especial?: string;
    agente_retencion?: string;
    numero_factura: string;
    clave_acceso: string;
    fecha_emision: string;
    hora_emision: string;
    cliente_identificacion: string;
    cliente_tipo_identificacion: string;
    cliente_razon_social: string;
    cliente_email?: string;
    items: Array<{
      cantidad: number;
      descripcion: string;
      precio_unitario: number;
      descuento: number;
      subtotal: number;
    }>;
    subtotal_iva: number;
    subtotal_0: number;
    subtotal_no_objeto: number;
    total_descuento: number;
    iva: number;
    total: number;
    formas_pago?: Array<{ codigo: string; descripcion: string; total: number }>;
    estado_autorizacion?: 'PENDIENTE' | 'AUTORIZADO' | 'NO_AUTORIZADO';
    estado?: string;
    fecha_autorizacion?: string;
    numero_autorizacion?: string;
  };
}

/** Genera HTML de RIDE para impresora térmica */
function buildRideHtml(factura: RIDEProps['factura'], ancho: AnchoPapel): string {
  const estadoFinal = factura.estado_autorizacion || (factura as any).estado || 'PENDIENTE';
  const autorizado  = estadoFinal === 'AUTORIZADO';
  const rechazado   = estadoFinal === 'NO_AUTORIZADO';

  // Tabla de ítems — en 58mm omitimos descuento para ahorrar espacio
  const colDesc = ancho === 80;
  const n = (v: any) => (Number(v) || 0).toFixed(2);
  const itemsHtml = (factura.items || []).map(item => `
    <tr>
      <td class="qty">${item.cantidad}</td>
      <td style="padding-right:2px;">${esc(item.descripcion)}</td>
      ${colDesc && Number(item.descuento) > 0 ? `<td class="price">${n(item.descuento)}</td>` : ''}
      <td class="price">${n(item.precio_unitario)}</td>
      <td class="price">${n(item.subtotal)}</td>
    </tr>
  `).join('');

  // Totales
  const totalesHtml = [
    Number(factura.subtotal_iva)  > 0 ? `<div class="row"><span class="lbl">Subtotal IVA 15%</span><span class="val">$${n(factura.subtotal_iva)}</span></div>` : '',
    Number(factura.subtotal_0)    > 0 ? `<div class="row"><span class="lbl">Subtotal IVA 0%</span><span class="val">$${n(factura.subtotal_0)}</span></div>` : '',
    Number(factura.subtotal_no_objeto) > 0 ? `<div class="row"><span class="lbl">No Objeto IVA</span><span class="val">$${n(factura.subtotal_no_objeto)}</span></div>` : '',
    Number(factura.total_descuento) > 0 ? `<div class="row"><span class="lbl">Descuento</span><span class="val">-$${n(factura.total_descuento)}</span></div>` : '',
    `<div class="row"><span class="lbl">IVA 15%</span><span class="val">$${n(factura.iva)}</span></div>`,
    `<div class="sep-solid"></div>`,
    `<div class="row big"><span class="lbl">TOTAL</span><span class="val">$${n(factura.total)}</span></div>`,
  ].filter(Boolean).join('');

  // Formas de pago
  const pagosHtml = (factura.formas_pago?.length
    ? factura.formas_pago
    : [{ descripcion: 'Efectivo', total: factura.total }]
  ).map(p => `<div class="row"><span class="lbl">${esc(p.descripcion)}</span><span class="val">$${n(p.total)}</span></div>`).join('');

  // Estado de autorización
  const estadoHtml = autorizado
    ? `<div style="border:1px solid #000;padding:3px;text-align:center;margin:4px 0;">
        <div class="bold">✓ AUTORIZADO POR EL SRI</div>
        ${factura.fecha_autorizacion ? `<div class="sm">${esc(factura.fecha_autorizacion)}</div>` : ''}
       </div>`
    : rechazado
    ? `<div style="border:1px dashed #000;padding:3px;text-align:center;margin:4px 0;">
        <div class="bold">✗ NO AUTORIZADO</div>
       </div>`
    : `<div style="border:1px dashed #000;padding:3px;text-align:center;margin:4px 0;">
        <div class="bold">⏱ PENDIENTE DE AUTORIZACIÓN</div>
       </div>`;

  return `
    <!-- EMISOR -->
    <div class="c bold" style="font-size:${ancho===58?'12px':'14px'};">${esc(factura.razon_social)}</div>
    ${factura.nombre_comercial && factura.nombre_comercial !== factura.razon_social
      ? `<div class="c sm">${esc(factura.nombre_comercial)}</div>` : ''}
    <div class="c sm">RUC: ${esc(factura.ruc)}</div>
    <div class="c sm">${esc(factura.direccion_matriz)}</div>
    ${factura.telefono ? `<div class="c sm">Tel: ${esc(factura.telefono)}</div>` : ''}
    <div class="sep"></div>

    <!-- LEYENDAS -->
    <div class="c sm">Obligado contabilidad: ${factura.obligado_contabilidad ? 'SI' : 'NO'}</div>
    ${factura.regimen_rimpe ? '<div class="c sm">Contribuyente Régimen RIMPE</div>' : ''}
    ${factura.contribuyente_especial ? `<div class="c sm">Contrib. Especial Nro: ${esc(factura.contribuyente_especial)}</div>` : ''}
    <div class="sep"></div>

    <!-- COMPROBANTE -->
    <div class="c bold" style="font-size:${ancho===58?'13px':'15px'};">FACTURA</div>
    <div class="c bold">${esc(factura.numero_factura)}</div>
    <div class="c sm">Fecha: ${esc(factura.fecha_emision)}</div>
    <div class="sep"></div>

    <!-- CLIENTE -->
    <div class="bold sm">CLIENTE:</div>
    <div class="sm">${esc(factura.cliente_razon_social)}</div>
    <div class="sm">${esc(factura.cliente_tipo_identificacion)}: ${esc(factura.cliente_identificacion)}</div>
    ${factura.cliente_email ? `<div class="sm">${esc(factura.cliente_email)}</div>` : ''}
    <div class="sep"></div>

    <!-- DETALLE -->
    <div class="bold sm">DETALLE:</div>
    <table>
      <thead>
        <tr>
          <th class="qty">Cant</th>
          <th>Descripción</th>
          ${colDesc ? '<th class="price">Desc</th>' : ''}
          <th class="price">P.U.</th>
          <th class="price">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="sep"></div>

    <!-- TOTALES -->
    ${totalesHtml}
    <div class="sep"></div>

    <!-- PAGO -->
    <div class="bold sm">FORMA DE PAGO:</div>
    ${pagosHtml}
    <div class="sep"></div>

    <!-- CLAVE / ESTADO -->
    <div class="bold sm c">CLAVE DE ACCESO:</div>
    <div class="clave">${esc(factura.clave_acceso)}</div>
    ${estadoHtml}
    <div class="sep"></div>

    <!-- PIE -->
    <div class="c sm">Documento electrónico emitido</div>
    <div class="c sm">según normativa vigente del SRI</div>
    <div class="c bold" style="margin-top:4px;">¡Gracias por su compra!</div>

    <!-- Avance para el corte -->
    <div class="feed"></div>
  `;
}

export function RIDE({ factura, autoImprimir = false }: RIDEProps) {
  const ancho = (parseInt(localStorage.getItem('print_ancho') || '58') as AnchoPapel) === 80 ? 80 : 58;

  const handlePrint = () => {
    const html = buildRideHtml(factura, ancho);
    printHtml(html, `Factura ${factura.numero_factura}`, ancho);
  };

  // Auto-imprimir cuando el componente monta (solo si se indica)
  useEffect(() => {
    if (!autoImprimir) return;
    // Pequeño delay para que el diálogo termine de renderizar
    const t = setTimeout(() => handlePrint(), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImprimir]);

  // ── Vista previa en pantalla (no afecta la impresión) ──────────────────────
  const estadoFinal = factura.estado_autorizacion || (factura as any).estado || 'PENDIENTE';

  return (
    <div className="space-y-4">
      {/* Botón imprimir */}
      <div className="flex justify-end gap-2">
        <span className="text-xs text-gray-600 self-center">Papel: {ancho}mm</span>
        <Button onClick={handlePrint} className="bg-gradient-to-r from-[#F97316] to-[#C2410C]">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir {ancho}mm
        </Button>
      </div>

      {/* Vista previa */}
      <div className="bg-white text-black rounded-lg shadow-lg max-w-[340px] mx-auto p-4"
        style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', lineHeight: '1.4' }}>

        <div className="text-center font-bold text-base">{factura.razon_social}</div>
        {factura.nombre_comercial && (
          <div className="text-center text-xs">{factura.nombre_comercial}</div>
        )}
        <div className="text-center text-xs">RUC: {factura.ruc}</div>
        <div className="text-center text-xs">{factura.direccion_matriz}</div>
        {factura.telefono && <div className="text-center text-xs">Tel: {factura.telefono}</div>}

        <div className="border-t border-dashed border-gray-400 my-2" />

        <div className="text-center font-bold">FACTURA</div>
        <div className="text-center font-bold text-sm">{factura.numero_factura}</div>
        <div className="text-center text-xs">Fecha: {factura.fecha_emision}</div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        <div className="text-xs font-bold">CLIENTE:</div>
        <div className="text-xs">{factura.cliente_razon_social}</div>
        <div className="text-xs">{factura.cliente_tipo_identificacion}: {factura.cliente_identificacion}</div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        <div className="text-xs font-bold mb-1">DETALLE:</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left">Cant</th>
              <th className="text-left">Descripción</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(factura.items || []).map((item, i) => (
              <tr key={i}>
                <td>{item.cantidad}</td>
                <td>{item.descripcion || item.nombre}</td>
                <td className="text-right">${(Number(item.subtotal) || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-gray-400 my-2" />

        <div className="flex justify-between text-xs font-bold text-base">
          <span>TOTAL</span>
          <span>${(Number(factura.total) || 0).toFixed(2)}</span>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        <div className={`text-xs text-center p-2 rounded border ${
          estadoFinal === 'AUTORIZADO'   ? 'border-green-400 text-green-700' :
          estadoFinal === 'NO_AUTORIZADO'? 'border-red-400 text-red-700' :
                                           'border-yellow-400 text-yellow-700'
        }`}>
          <div className="font-bold">
            {estadoFinal === 'AUTORIZADO'    && '✓ AUTORIZADO POR EL SRI'}
            {estadoFinal === 'NO_AUTORIZADO' && '✗ NO AUTORIZADO'}
            {estadoFinal !== 'AUTORIZADO' && estadoFinal !== 'NO_AUTORIZADO' && '⏱ PENDIENTE'}
          </div>
          {factura.fecha_autorizacion && (
            <div className="text-xs mt-1">{factura.fecha_autorizacion}</div>
          )}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="text-center text-xs">¡Gracias por su compra!</div>
      </div>
    </div>
  );
}
