import { useRef } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '../ui/button';

interface RIDEProps {
  factura: {
    // Datos del emisor
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
    
    // Identificación del comprobante
    numero_factura: string; // Formato: 001-001-000000123
    clave_acceso: string; // 49 dígitos
    fecha_emision: string;
    hora_emision: string;
    
    // Datos del cliente
    cliente_identificacion: string;
    cliente_tipo_identificacion: string; // RUC, CEDULA, PASAPORTE, CONSUMIDOR_FINAL
    cliente_razon_social: string;
    cliente_email?: string;
    
    // Detalle de productos
    items: Array<{
      cantidad: number;
      descripcion: string;
      precio_unitario: number;
      descuento: number;
      subtotal: number;
    }>;
    
    // Totales
    subtotal_iva: number; // Subtotal gravado con IVA
    subtotal_0: number; // Subtotal tarifa 0%
    subtotal_no_objeto: number; // Subtotal no objeto de IVA
    total_descuento: number;
    iva: number;
    total: number;
    
    // Formas de pago
    formas_pago: Array<{
      codigo: string; // 01=Efectivo, 19=Tarjeta Crédito, 20=Tarjeta Débito
      descripcion: string;
      total: number;
    }>;
    
    // Estado
    estado_autorizacion: 'PENDIENTE' | 'AUTORIZADO' | 'NO_AUTORIZADO';
    fecha_autorizacion?: string;
  };
}

export function RIDE({ factura }: RIDEProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    
    const printWindow = window.open('', '', 'width=300,height=600');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Factura ${factura.numero_factura}</title>
        <style>
          @page { 
            size: 80mm auto; 
            margin: 0; 
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 10px;
            line-height: 1.4;
            width: 80mm;
            padding: 5mm;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { 
            border-bottom: 1px dashed #000; 
            margin: 5px 0; 
          }
          .section { margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; }
          .barcode {
            width: 100%;
            height: 50px;
            background: repeating-linear-gradient(
              90deg,
              #000 0px, #000 1px,
              #fff 1px, #fff 2px
            );
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="space-y-4">
      {/* Botón de impresión */}
      <div className="flex justify-end">
        <Button
          onClick={handlePrint}
          className="bg-gradient-to-r from-[#00E5FF] to-[#1e64a7]"
        >
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Factura
        </Button>
      </div>

      {/* Vista previa del RIDE */}
      <div 
        ref={printRef}
        className="bg-white text-black p-6 rounded-lg shadow-lg max-w-[350px] mx-auto"
        style={{ fontFamily: 'Courier New, monospace', fontSize: '12px' }}
      >
        {/* ENCABEZADO - DATOS DEL EMISOR */}
        <div className="text-center mb-4">
          <div className="font-bold text-lg">{factura.razon_social}</div>
          {factura.nombre_comercial && (
            <div className="text-sm">{factura.nombre_comercial}</div>
          )}
          <div className="text-sm mt-2">
            <div>RUC: {factura.ruc}</div>
            <div className="mt-1">{factura.direccion_matriz}</div>
            {factura.direccion_establecimiento && (
              <div>{factura.direccion_establecimiento}</div>
            )}
            {factura.telefono && <div>Tel: {factura.telefono}</div>}
          </div>
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* LEYENDAS OBLIGATORIAS */}
        <div className="text-xs text-center mb-3">
          <div>
            Obligado a llevar contabilidad: {factura.obligado_contabilidad ? 'SI' : 'NO'}
          </div>
          {factura.regimen_rimpe && (
            <div>Contribuyente Régimen RIMPE</div>
          )}
          {factura.contribuyente_especial && (
            <div>Contribuyente Especial Nro: {factura.contribuyente_especial}</div>
          )}
          {factura.agente_retencion && (
            <div>Agente de Retención Resolución: {factura.agente_retencion}</div>
          )}
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* IDENTIFICACIÓN DEL COMPROBANTE */}
        <div className="text-center mb-4">
          <div className="font-bold text-lg">FACTURA</div>
          <div className="font-bold text-base">{factura.numero_factura}</div>
          <div className="text-xs mt-2">
            <div>Fecha: {factura.fecha_emision}</div>
            <div>Hora: {factura.hora_emision}</div>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* DATOS DEL CLIENTE */}
        <div className="text-xs mb-3">
          <div className="font-bold mb-1">DATOS DEL CLIENTE:</div>
          <div>{factura.cliente_razon_social}</div>
          <div>
            {factura.cliente_tipo_identificacion}: {factura.cliente_identificacion}
          </div>
          {factura.cliente_email && <div>Email: {factura.cliente_email}</div>}
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* DETALLE DE PRODUCTOS */}
        <div className="text-xs mb-3">
          <div className="font-bold mb-2">DETALLE:</div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-1">Cant</th>
                <th className="text-left py-1">Descripción</th>
                <th className="text-right py-1">P.Unit</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {factura.items.map((item, idx) => (
                <tr key={idx} className="border-b border-dotted border-gray-200">
                  <td className="py-1">{item.cantidad}</td>
                  <td className="py-1">{item.descripcion}</td>
                  <td className="text-right py-1">${item.precio_unitario.toFixed(2)}</td>
                  <td className="text-right py-1">${item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* TOTALES */}
        <div className="text-xs mb-3">
          <table className="w-full">
            <tbody>
              {factura.subtotal_iva > 0 && (
                <tr>
                  <td className="text-right py-1">Subtotal IVA 15%:</td>
                  <td className="text-right font-bold py-1">${factura.subtotal_iva.toFixed(2)}</td>
                </tr>
              )}
              {factura.subtotal_0 > 0 && (
                <tr>
                  <td className="text-right py-1">Subtotal IVA 0%:</td>
                  <td className="text-right font-bold py-1">${factura.subtotal_0.toFixed(2)}</td>
                </tr>
              )}
              {factura.subtotal_no_objeto > 0 && (
                <tr>
                  <td className="text-right py-1">Subtotal No Objeto IVA:</td>
                  <td className="text-right font-bold py-1">${factura.subtotal_no_objeto.toFixed(2)}</td>
                </tr>
              )}
              {factura.total_descuento > 0 && (
                <tr>
                  <td className="text-right py-1">Descuento:</td>
                  <td className="text-right font-bold py-1">-${factura.total_descuento.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="text-right py-1">IVA 15%:</td>
                <td className="text-right font-bold py-1">${factura.iva.toFixed(2)}</td>
              </tr>
              <tr className="border-t border-gray-400">
                <td className="text-right py-2 font-bold text-sm">TOTAL:</td>
                <td className="text-right font-bold py-2 text-sm">${factura.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* FORMAS DE PAGO */}
        <div className="text-xs mb-3">
          <div className="font-bold mb-1">FORMA DE PAGO:</div>
          {factura.formas_pago.map((pago, idx) => (
            <div key={idx}>
              {pago.descripcion}: ${pago.total.toFixed(2)}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* CLAVE DE ACCESO Y CÓDIGO DE BARRAS */}
        <div className="text-xs mb-3">
          <div className="font-bold mb-1 text-center">CLAVE DE ACCESO:</div>
          <div className="break-all text-center" style={{ fontSize: '9px' }}>
            {factura.clave_acceso}
          </div>
          
          {/* Simulación de código de barras */}
          <div className="mt-3 bg-gradient-to-r from-black via-gray-600 to-black h-12 flex items-center justify-center">
            <span className="text-white text-xs">|||||||||||||||||||||||</span>
          </div>
        </div>

        {/* ESTADO DE AUTORIZACIÓN */}
        <div className={`text-xs text-center p-2 rounded ${
          factura.estado_autorizacion === 'AUTORIZADO' 
            ? 'bg-green-100 text-green-800' 
            : factura.estado_autorizacion === 'NO_AUTORIZADO'
            ? 'bg-red-100 text-red-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          <div className="font-bold">
            {factura.estado_autorizacion === 'AUTORIZADO' && '✓ FACTURA AUTORIZADA'}
            {factura.estado_autorizacion === 'NO_AUTORIZADO' && '✗ NO AUTORIZADO'}
            {factura.estado_autorizacion === 'PENDIENTE' && '⏱ PENDIENTE DE AUTORIZACIÓN'}
          </div>
          {factura.fecha_autorizacion && (
            <div className="mt-1">
              Fecha: {factura.fecha_autorizacion}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* PIE DE PÁGINA */}
        <div className="text-xs text-center">
          <div>Documento electrónico emitido según</div>
          <div>normativa vigente del SRI</div>
          <div className="mt-2">¡Gracias por su compra!</div>
        </div>
      </div>
    </div>
  );
}
