import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import {
  X, Upload, FileText, CheckCircle, AlertCircle, Truck, Calendar,
  ShoppingCart, RefreshCw, DollarSign, Hash, Percent, Info, Plus, UserPlus,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompraRegistrada: () => void;
  proveedores: any[];
  productos: any[];
  getAuthHeaders: () => Promise<Record<string, string>>;
}

type Step = 'upload' | 'review';

// ── Clasificación inteligente (misma lógica que formulario manual) ─────────────
// Tipos de compra — códigos SRI Ecuador oficiales
const TIPOS_COMPRA_XML = [
  { id: 'inventario',       label: '📦 Inventario',        cuenta: '510102',  afecta_stock: true  },
  { id: 'gasto_servicio',   label: '🌐 Telecom/Internet',  cuenta: '520118',  afecta_stock: false },
  { id: 'gasto_basicos',    label: '💡 Agua/Luz/Gas',      cuenta: '520118',  afecta_stock: false },
  { id: 'gasto_arriendo',   label: '🏠 Arriendo',          cuenta: '520109',  afecta_stock: false },
  { id: 'gasto_publicidad', label: '📢 Publicidad',        cuenta: '520111',  afecta_stock: false },
  { id: 'gasto_operativo',  label: '⚙️ Mantenimiento',    cuenta: '520108',  afecta_stock: false },
  { id: 'activo_fijo',      label: '🏗️ Activo Fijo',      cuenta: '1020106', afecta_stock: false },
] as const;

// Keywords → tipo contable (SRI) — agua/luz/telecom van a la misma cuenta 520118
const KEYWORDS_XML: Record<string, string> = {
  internet: 'gasto_servicio', 'datos moviles': 'gasto_servicio', telefono: 'gasto_servicio',
  celular: 'gasto_servicio', claro: 'gasto_servicio', movistar: 'gasto_servicio',
  cnt: 'gasto_servicio', netlife: 'gasto_servicio', telecomunicaciones: 'gasto_servicio',
  luz: 'gasto_basicos', electrico: 'gasto_basicos', energia: 'gasto_basicos',
  agua: 'gasto_basicos', planilla: 'gasto_basicos', eerssa: 'gasto_basicos',
  arriendo: 'gasto_arriendo', alquiler: 'gasto_arriendo', renta: 'gasto_arriendo',
  publicidad: 'gasto_publicidad', marketing: 'gasto_publicidad', propaganda: 'gasto_publicidad',
  seguro: 'gasto_operativo', mantenimiento: 'gasto_operativo', reparacion: 'gasto_operativo',
  cuchillo: 'activo_fijo', horno: 'activo_fijo', refrigerador: 'activo_fijo',
  computador: 'activo_fijo', laptop: 'activo_fijo', impresora: 'activo_fijo',
  mueble: 'activo_fijo', mesa: 'activo_fijo', equipo: 'activo_fijo',
};
const UMBRAL_ACTIVO_XML = 100;

function autodetectarTipoXML(
  descripcion: string,
  totalItem: number,
  tieneMatch: boolean
): { tipo: string; confianza: 'auto'|'sugerido' } {
  if (tieneMatch) return { tipo: 'inventario', confianza: 'auto' };
  const desc = descripcion.toLowerCase();
  for (const [kw, tipo] of Object.entries(KEYWORDS_XML)) {
    if (desc.includes(kw)) return { tipo, confianza: 'auto' };
  }
  if (totalItem >= UMBRAL_ACTIVO_XML) return { tipo: 'activo_fijo', confianza: 'sugerido' };
  return { tipo: 'gasto_operativo', confianza: 'sugerido' };
}

interface ParsedItem {
  // Del XML (inmutables)
  codigo: string;
  codigo_auxiliar: string;
  descripcion: string;
  cantidad_xml: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  iva: number;
  porcentaje_iva: number;
  codigo_iva: string;
  total: number;
  match: { producto_id: string; nombre: string; score: number; unidad_medida: string } | null;
  auto_matched: boolean;
  // Editables por el usuario
  producto_id_sel: string;
  cantidad_inventario: number;
  costo_total_sel: number;
  a_inventario: boolean;
  // Nuevos campos de clasificación inteligente
  tipo_contable: string;
  confianza: 'auto'|'sugerido'|'manual';
}

interface FacturaSRI {
  numero: string;
  clave_acceso: string;
  numero_autorizacion: string;
  fecha: string;
  total_sin_impuestos: number;
  total_descuento: number;
  total_iva: number;
  importe_total: number;
  forma_pago: string;
  pagos: { codigo: string; descripcion: string; total: number; plazo: string; unidadTiempo: string }[];
  guia_remision: string;
}

export function ImportarXMLModal({
  open, onClose, onCompraRegistrada, proveedores, productos, getAuthHeaders,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]       = useState<Step>('upload');
  const [loading, setLoading] = useState(false);

  const [factura, setFactura]         = useState<FacturaSRI | null>(null);
  const [proveedorXML, setProveedorXML] = useState<{ ruc: string; nombre: string; nombre_comercial: string } | null>(null);
  const [items, setItems]             = useState<ParsedItem[]>([]);

  const [proveedorId, setProveedorId]           = useState('');
  const [tipoPago, setTipoPago]                 = useState<'contado' | 'credito'>('contado');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [observaciones, setObservaciones]       = useState('');
  const [submitting, setSubmitting]             = useState(false);
  const [facturadup, setFacturaDup]             = useState<{ fecha: string; total: number } | null>(null);

  // Lista local de proveedores (se actualiza si se crea uno nuevo sin cerrar el modal)
  const [proveedoresList, setProveedoresList]   = useState<any[]>(proveedores);
  // Mini-formulario inline para crear proveedor
  const [showCrearProv, setShowCrearProv]       = useState(false);
  const [savingProv, setSavingProv]             = useState(false);
  const [nuevoProv, setNuevoProv]               = useState({ ruc_nit: '', nombre: '', telefono: '', email: '' });

  // XML original para poder descargarlo después
  const [xmlRaw, setXmlRaw] = useState('');

  // Sincronizar lista cuando el padre actualiza proveedores
  useEffect(() => { setProveedoresList(proveedores); }, [proveedores]);

  const resetAll = () => {
    setStep('upload');
    setLoading(false);
    setFactura(null);
    setProveedorXML(null);
    setItems([]);
    setProveedorId('');
    setTipoPago('contado');
    setFechaVencimiento('');
    setObservaciones('');
    setFacturaDup(null);
    setXmlRaw('');
    setShowCrearProv(false);
    setNuevoProv({ ruc_nit: '', nombre: '', telefono: '', email: '' });
    if (fileRef.current) fileRef.current.value = '';
  };

  // Abrir mini-form pre-llenado con datos del XML
  const abrirCrearProveedor = () => {
    setNuevoProv({
      ruc_nit:  proveedorXML?.ruc  || '',
      nombre:   proveedorXML?.nombre_comercial || proveedorXML?.nombre || '',
      telefono: '',
      email:    '',
    });
    setShowCrearProv(true);
  };

  // Crear proveedor sin salir del modal
  const handleCrearProveedor = async () => {
    if (!nuevoProv.ruc_nit || !nuevoProv.nombre) {
      toast.error('RUC y Nombre son obligatorios');
      return;
    }
    setSavingProv(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/proveedores`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoProv) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear proveedor');

      toast.success(`✅ Proveedor "${nuevoProv.nombre}" creado`);

      // Refrescar lista de proveedores y auto-seleccionar el nuevo
      const listRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/proveedores`,
        { headers }
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        const lista: any[] = listData.proveedores || listData || [];
        setProveedoresList(lista);
        // Auto-seleccionar por RUC
        const match = lista.find((p: any) =>
          p.ruc_nit === nuevoProv.ruc_nit || p.ruc === nuevoProv.ruc_nit
        );
        if (match) setProveedorId(match.id);
      }

      setShowCrearProv(false);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingProv(false);
    }
  };

  const handleClose = () => { resetAll(); onClose(); };

  // ── Paso 1: leer archivo → parsear → match ──────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const xmlContent = await file.text();
      setXmlRaw(xmlContent); // guardar para adjuntar a la compra
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();

      const parseRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/compras/parsear-xml`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ xmlContent }) }
      );
      const parsed = await parseRes.json();
      if (!parseRes.ok) throw new Error(parsed.error || 'Error al parsear XML');

      const matchRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/compras/match-xml-items`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: parsed.items }) }
      );
      const matched = await matchRes.json();
      if (!matchRes.ok) throw new Error(matched.error || 'Error al hacer matching');

      const editableItems: ParsedItem[] = matched.items.map((item: any) => {
        const { tipo, confianza } = autodetectarTipoXML(
          item.descripcion || '', Number(item.subtotal || 0), !!item.match
        );
        return {
          ...item,
          producto_id_sel:     item.match?.producto_id || '',
          cantidad_inventario: item.cantidad_xml,
          costo_total_sel:     parseFloat((item.subtotal || 0).toFixed(2)),
          a_inventario:        tipo === 'inventario',
          tipo_contable:       tipo,
          confianza,
        };
      });

      setFactura(parsed.factura);
      setProveedorXML(parsed.proveedor);
      setItems(editableItems);

      // Auto-seleccionar proveedor si el RUC coincide
      const provMatch = proveedores.find(
        (p) => p.ruc_nit === parsed.proveedor.ruc || p.ruc === parsed.proveedor.ruc
      );
      if (provMatch) setProveedorId(provMatch.id);

      // Forma de pago sugerida
      if (['credito', 'debito', 'tarjeta_credito'].includes(parsed.factura.forma_pago)) {
        // dejar al usuario elegir
      } else {
        setTipoPago('contado');
      }

      setStep('review');
      toast.success(`XML procesado — ${editableItems.length} ítems encontrados`);
    } catch (err: any) {
      toast.error('Error al procesar XML: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx: number, field: keyof ParsedItem, value: any) =>
    setItems((prev) => {
      const n = [...prev];
      const updated = { ...n[idx], [field]: value };
      // Sync a_inventario when tipo_contable changes
      if (field === 'tipo_contable') {
        updated.a_inventario = value === 'inventario';
        updated.confianza = 'manual';
      }
      n[idx] = updated;
      return n;
    });

  const itemsInventario  = items.filter((i) => i.a_inventario);
  const itemsGasto       = items.filter((i) => !i.a_inventario);
  // El total SIEMPRE es la suma de todos los ítems — igual al valor real de la factura
  const totalTodos       = items.reduce((s, i) => s + (Number(i.costo_total_sel) || 0), 0);
  const ivaTotal         = items.reduce((s, i) => s + (i.iva || 0), 0);
  const totalInventario  = itemsInventario.reduce((s, i) => s + (Number(i.costo_total_sel) || 0), 0);
  const totalGasto       = itemsGasto.reduce((s, i) => s + (Number(i.costo_total_sel) || 0), 0);
  const hayGastos        = itemsGasto.length > 0;
  // Validación: ítems de inventario deben tener producto asignado
  const itemsSinProducto = itemsInventario.filter((i) => !i.producto_id_sel);

  // Código IVA → texto legible
  const labelIva = (codigo: string, pct: number) => {
    if (codigo === '3' || pct === 0) return '0%';
    if (pct > 0) return `${pct}%`;
    const m: Record<string, string> = { '0': '0%', '2': '12%', '3': '0%', '4': '15%', '6': 'exento' };
    return m[codigo] || `${codigo}`;
  };

  // ── Paso 2: registrar ────────────────────────────────────────────────────────
  const handleRegistrar = async () => {
    if (!proveedorId)                  { toast.error('Selecciona un proveedor'); return; }
    if (items.length === 0)            { toast.error('No hay ítems en la factura'); return; }
    if (itemsSinProducto.length > 0)   { toast.error(`Asigna un producto a los ${itemsSinProducto.length} ítem(s) de inventario sin producto`); return; }
    if (tipoPago === 'credito' && !fechaVencimiento) { toast.error('Ingresa la fecha de vencimiento'); return; }

    setSubmitting(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/compras`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proveedor_id:          proveedorId,
            fecha:                 factura!.fecha,
            numero_factura:        factura!.numero,
            observaciones:         observaciones ||
              `Importado XML SRI — ${proveedorXML?.nombre_comercial || proveedorXML?.nombre || ''}`,
            tipo_pago:             tipoPago,
            fecha_vencimiento:     tipoPago === 'credito' ? fechaVencimiento : undefined,
            // Totales reales de la factura (todos los ítems — para asientos correctos)
            total_sin_impuestos:   parseFloat(totalTodos.toFixed(2)),
            total_iva:             parseFloat(ivaTotal.toFixed(2)),
            total_descuento:       parseFloat(factura!.total_descuento.toFixed(2)),
            // Datos fiscales del documento SRI
            numero_autorizacion:   factura!.numero_autorizacion || undefined,
            clave_acceso:          factura!.clave_acceso || undefined,
            info_sri: {
              proveedor_ruc:    proveedorXML?.ruc,
              proveedor_nombre: proveedorXML?.nombre,
              forma_pago_xml:   factura!.forma_pago,
              pagos:            factura!.pagos,
              guia_remision:    factura!.guia_remision || null,
              importe_total_sri: factura!.importe_total,
            },
            // XML original para descarga posterior
            xml_original: xmlRaw || undefined,
            // TODOS los ítems van al backend con tipo_contable para asiento correcto
            items: items.map((i) => ({
              producto_id:        i.a_inventario ? i.producto_id_sel : null,
              descripcion:        i.descripcion,
              cantidad:           Number(i.cantidad_inventario),
              costo_total:        Number(i.costo_total_sel),
              a_inventario:       i.a_inventario,
              tipo_contable:      i.tipo_contable || (i.a_inventario ? 'inventario' : 'gasto_operativo'),
              afecta_stock:       i.a_inventario,
              descripcion_xml:    i.descripcion,
              cantidad_xml:       i.cantidad_xml,
              descuento:          i.descuento,
              iva:                i.iva,
              porcentaje_iva:     i.porcentaje_iva,
              codigo_iva:         i.codigo_iva,
              codigo:             i.codigo,
            })),
          }),
        }
      );
      const data = await res.json();

      // Factura duplicada — mostrar alerta visible en el modal
      if (res.status === 409) {
        setFacturaDup(data.compra_existente);
        toast.error(`⚠ ${data.error}`, { duration: 8000 });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Error al registrar');

      toast.success(`✅ Compra registrada — Fact. ${factura!.numero} — Total $${totalTodos.toFixed(2)} (${itemsInventario.length} al inventario${hayGastos ? `, ${itemsGasto.length} como gasto` : ''})`);
      onCompraRegistrada();
      handleClose();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const autoMatched  = items.filter((i) => i.auto_matched).length;
  const sinMatch     = items.filter((i) => !i.match).length;
  const matchParcial = items.filter((i) => i.match && !i.auto_matched).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white border border-[#F97316]/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between p-5 border-b border-[#F97316]/20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F97316]/15 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-gray-900 font-bold text-lg">Importar Compra desde XML SRI</h2>
              <p className="text-gray-600 text-xs">
                {step === 'upload' ? 'Selecciona el archivo XML de autorización del SRI' : 'Revisa, asigna productos y confirma'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-600 hover:text-gray-900 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center h-56 gap-6">
              <div className="text-center space-y-1">
                <Upload className="w-16 h-16 text-[#F97316]/40 mx-auto mb-3" />
                <h3 className="text-gray-900 font-semibold">Selecciona el XML del SRI</h3>
                <p className="text-gray-600 text-sm">El archivo de autorización con estructura &lt;autorizacion&gt; + CDATA</p>
                <p className="text-gray-600 text-xs">Se extraerán automáticamente: proveedor, número, fecha, ítems, IVA, descuentos y número de autorización</p>
              </div>
              <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml"
                onChange={handleFile} className="hidden" id="xml-file-input" />
              <label htmlFor="xml-file-input">
                <Button asChild disabled={loading}
                  className="bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold cursor-pointer">
                  <span>
                    {loading
                      ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
                      : <><Upload className="w-4 h-4 mr-2" />Seleccionar XML</>}
                  </span>
                </Button>
              </label>
            </div>
          )}

          {/* ── STEP 2: Review ── */}
          {step === 'review' && factura && (
            <div className="space-y-5">

              {/* ── Datos de la factura SRI ── */}
              <div className="bg-gray-50 border border-[#F97316]/20 rounded-xl p-4 space-y-3">
                <p className="text-[#F97316] text-xs font-semibold uppercase tracking-wider">Datos Tributarios de la Factura</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600 text-xs flex items-center gap-1"><Hash className="w-3 h-3" />Factura</p>
                    <p className="text-gray-900 font-mono font-bold">{factura.numero}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />Fecha emisión</p>
                    <p className="text-gray-900 font-medium">{factura.fecha}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs flex items-center gap-1"><Truck className="w-3 h-3" />Proveedor XML</p>
                    <p className="text-gray-900 text-xs font-medium truncate">{proveedorXML?.nombre_comercial || proveedorXML?.nombre}</p>
                    <p className="text-gray-600 text-xs">RUC: {proveedorXML?.ruc}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs flex items-center gap-1"><Info className="w-3 h-3" />Forma de pago XML</p>
                    <p className="text-gray-900 font-medium capitalize">{factura.forma_pago}</p>
                  </div>
                </div>

                {/* Número de autorización */}
                {factura.numero_autorizacion && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5">
                    <p className="text-gray-600 text-xs mb-0.5 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-400" />Número de Autorización SRI
                    </p>
                    <p className="text-green-300 font-mono text-xs break-all">{factura.numero_autorizacion}</p>
                  </div>
                )}

                {/* Totales fiscales */}
                <div className="grid grid-cols-4 gap-3 pt-1">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-gray-600 text-xs">Subtotal sin IVA</p>
                    <p className="text-gray-900 font-bold text-sm">${factura.total_sin_impuestos.toFixed(2)}</p>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2.5 text-center">
                    <p className="text-gray-600 text-xs">Descuento total</p>
                    <p className="text-orange-400 font-bold text-sm">${factura.total_descuento.toFixed(2)}</p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 text-center">
                    <p className="text-gray-600 text-xs flex items-center justify-center gap-1">
                      <Percent className="w-3 h-3" />IVA total
                    </p>
                    <p className="text-yellow-300 font-bold text-sm">${factura.total_iva.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#F97316]/10 border border-[#F97316]/30 rounded-lg p-2.5 text-center">
                    <p className="text-gray-600 text-xs flex items-center justify-center gap-1">
                      <DollarSign className="w-3 h-3" />Total con IVA
                    </p>
                    <p className="text-[#F97316] font-black text-base">${factura.importe_total.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* ── Proveedor & pago ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Proveedor en el sistema *</label>
                  <div className="flex gap-2">
                    <Select value={proveedorId} onValueChange={(v) => { setProveedorId(v); setShowCrearProv(false); }}>
                      <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900 flex-1">
                        <SelectValue placeholder="Seleccionar proveedor..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                        {proveedoresList.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Botón crear proveedor — solo visible si no hay match */}
                    {!proveedorId && (
                      <button
                        onClick={abrirCrearProveedor}
                        title="Crear proveedor con los datos del XML"
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#F97316]/40 text-[#F97316] bg-[#F97316]/10 hover:bg-[#F97316]/20 transition-all text-xs font-semibold whitespace-nowrap"
                      >
                        <UserPlus className="w-4 h-4" /> Crear
                      </button>
                    )}
                  </div>

                  {!proveedorId && !showCrearProv && (
                    <p className="text-xs text-orange-400">
                      ⚠ Selecciona o <button onClick={abrirCrearProveedor} className="underline text-[#F97316]">crea el proveedor</button> que coincide con <strong>{proveedorXML?.nombre_comercial || proveedorXML?.nombre}</strong>
                    </p>
                  )}

                  {/* Mini-formulario inline para crear proveedor */}
                  {showCrearProv && (
                    <div className="mt-2 p-3 bg-[#F97316]/5 border border-[#F97316]/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[#F97316] text-xs font-bold flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Nuevo proveedor
                        </p>
                        <button onClick={() => setShowCrearProv(false)} className="text-gray-600 hover:text-gray-900">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-600">RUC *</label>
                          <Input value={nuevoProv.ruc_nit}
                            onChange={(e) => setNuevoProv({ ...nuevoProv, ruc_nit: e.target.value })}
                            className="h-7 text-xs bg-gray-50 border-[#F97316]/20 text-gray-900"
                            placeholder="RUC / NIT" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-600">Nombre / Razón social *</label>
                          <Input value={nuevoProv.nombre}
                            onChange={(e) => setNuevoProv({ ...nuevoProv, nombre: e.target.value })}
                            className="h-7 text-xs bg-gray-50 border-[#F97316]/20 text-gray-900"
                            placeholder="Nombre" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-600">Teléfono</label>
                          <Input value={nuevoProv.telefono}
                            onChange={(e) => setNuevoProv({ ...nuevoProv, telefono: e.target.value })}
                            className="h-7 text-xs bg-gray-50 border-[#F97316]/20 text-gray-900"
                            placeholder="Opcional" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-600">Email</label>
                          <Input value={nuevoProv.email}
                            onChange={(e) => setNuevoProv({ ...nuevoProv, email: e.target.value })}
                            className="h-7 text-xs bg-gray-50 border-[#F97316]/20 text-gray-900"
                            placeholder="Opcional" />
                        </div>
                      </div>
                      <Button onClick={handleCrearProveedor} disabled={savingProv}
                        className="w-full h-8 text-xs bg-[#F97316] text-black font-bold hover:bg-[#F97316]/80">
                        {savingProv
                          ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Guardando...</>
                          : <><CheckCircle className="w-3 h-3 mr-1" />Guardar proveedor</>}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Tipo de pago a registrar</label>
                  <div className="flex gap-2">
                    {(['contado', 'credito'] as const).map((t) => (
                      <button key={t} onClick={() => setTipoPago(t)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                          tipoPago === t
                            ? t === 'contado' ? 'bg-[#F97316]/15 border-[#F97316] text-[#F97316]'
                                              : 'bg-orange-500/15 border-orange-500 text-orange-400'
                            : 'border-gray-100 text-gray-600 hover:border-white/30'
                        }`}>
                        {t === 'contado' ? 'Contado' : 'Crédito (CxP)'}
                      </button>
                    ))}
                  </div>
                  {tipoPago === 'credito' && (
                    <Input type="date" value={fechaVencimiento}
                      onChange={(e) => setFechaVencimiento(e.target.value)}
                      className="bg-gray-50 border-orange-500/40 text-gray-900 mt-2"
                      placeholder="Fecha de vencimiento" />
                  )}
                </div>
              </div>

              {/* ── Leyenda ── */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" />{autoMatched} auto-matcheado(s)
                </span>
                <span className="flex items-center gap-1.5 text-yellow-400">
                  <AlertCircle className="w-3.5 h-3.5" />{matchParcial} match parcial
                </span>
                <span className="flex items-center gap-1.5 text-red-400">
                  <AlertCircle className="w-3.5 h-3.5" />{sinMatch} sin match
                </span>
                <span className="text-gray-600 ml-auto text-[10px]">
                  🟢 Auto = detectado automáticamente &nbsp;·&nbsp; 🟡 Sugerido = revisa &nbsp;·&nbsp; 🔵 Manual = elegiste tú
                  &nbsp;·&nbsp; ★ Ajusta cantidad si la unidad del XML difiere (1 saco → 50 kg)
                </span>
              </div>

              {/* ── Tabla de ítems ── */}
              <div className="rounded-xl border border-[#F97316]/20 overflow-x-auto">
                <table className="w-full text-xs min-w-[860px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-[#F97316]/20 text-gray-600">
                      <th className="px-2 py-2 w-28 text-center">
                        <span className="text-[10px] leading-tight block">Tipo contable</span>
                      </th>
                      <th className="px-2 py-2 text-left">Descripción en la factura XML</th>
                      <th className="px-2 py-2 text-right w-20">Cant. XML</th>
                      <th className="px-2 py-2 text-left w-52">Producto inventario</th>
                      <th className="px-2 py-2 text-right w-28 text-yellow-300">Cant. stock ★</th>
                      <th className="px-2 py-2 text-right w-28">Subtotal s/IVA</th>
                      <th className="px-2 py-2 text-right w-20">Desc.</th>
                      <th className="px-2 py-2 text-right w-20">IVA</th>
                      <th className="px-2 py-2 text-center w-16">%IVA</th>
                      <th className="px-2 py-2 text-center w-14">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const costoUnitario = item.a_inventario && Number(item.cantidad_inventario) > 0
                        ? Number(item.costo_total_sel) / Number(item.cantidad_inventario)
                        : 0;
                      const cantidadDifiere = item.cantidad_inventario !== item.cantidad_xml;

                      return (
                        <tr key={idx} className={`border-b border-gray-100 ${
                          item.tipo_contable === 'activo_fijo'     ? 'bg-blue-50/40' :
                          item.tipo_contable === 'inventario'      ? (item.auto_matched ? 'bg-green-50/40' : '') :
                          item.tipo_contable?.startsWith('gasto')  ? 'bg-orange-50/30' : ''
                        }`}>
                          {/* Clasificación inteligente */}
                          <td className="px-2 py-1.5 text-center">
                            <select
                              value={item.tipo_contable || 'gasto_operativo'}
                              onChange={e => updateItem(idx, 'tipo_contable', e.target.value)}
                              className="w-full border rounded px-1 py-0.5 text-[10px] bg-white text-gray-900 border-orange-200"
                              style={{ minWidth: 110 }}
                            >
                              {TIPOS_COMPRA_XML.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                              ))}
                            </select>
                            <span className={`text-[9px] px-1 py-0.5 rounded mt-0.5 inline-block font-bold ${
                              item.confianza === 'auto'   ? 'bg-green-100 text-green-700' :
                              item.confianza === 'manual' ? 'bg-blue-100 text-blue-700'   :
                                                           'bg-yellow-100 text-yellow-700'
                            }`}>
                              {item.confianza === 'auto' ? '✓ Auto' : item.confianza === 'manual' ? '✎ Manual' : '? Sugerido'}
                            </span>
                          </td>

                          {/* Descripción XML */}
                          <td className="px-2 py-1.5">
                            <p className="text-gray-900 font-medium leading-tight">{item.descripcion}</p>
                            {item.codigo && <p className="text-gray-600 mt-0.5">Cód: {item.codigo}</p>}
                            <p className="text-gray-600">P.Unit: ${item.precio_unitario.toFixed(4)}</p>
                          </td>

                          {/* Cant. XML (solo lectura) */}
                          <td className="px-2 py-1.5 text-right">
                            <span className="text-gray-600 font-mono">{item.cantidad_xml}</span>
                            <p className="text-gray-600">unid. factura</p>
                          </td>

                          {/* Producto inventario (solo si es stock) */}
                          <td className="px-2 py-1.5">
                            {item.a_inventario ? (
                              <Select value={item.producto_id_sel}
                                onValueChange={(v) => updateItem(idx, 'producto_id_sel', v)}>
                                <SelectTrigger className={`h-7 text-xs border text-gray-900 ${
                                  !item.producto_id_sel ? 'bg-red-500/15 border-red-500/50' :
                                  item.auto_matched    ? 'bg-green-500/10 border-green-500/30' :
                                  item.match           ? 'bg-yellow-500/10 border-yellow-500/30'
                                                       : 'bg-gray-50 border-[#F97316]/20'
                                }`}>
                                  <SelectValue placeholder="⚠ Asignar producto..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                                  {productos.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-orange-400/60 text-[10px] italic px-1">
                                Gasto — no actualiza stock
                              </span>
                            )}
                          </td>

                          {/* ★ Cant. stock — EDITABLE, solo si es inventario */}
                          <td className="px-2 py-1.5">
                            {item.a_inventario ? (
                              <>
                                <Input
                                  type="number" min="0" step="0.001"
                                  value={item.cantidad_inventario}
                                  onChange={(e) => updateItem(idx, 'cantidad_inventario', parseFloat(e.target.value) || 0)}
                                  className={`h-7 text-xs text-right font-mono ${
                                    cantidadDifiere
                                      ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300'
                                      : 'bg-gray-50 border-[#F97316]/20 text-gray-900'
                                  }`}
                                />
                                {costoUnitario > 0 && (
                                  <p className="text-[#F97316] text-right mt-0.5 font-mono text-[10px]">
                                    ${costoUnitario.toFixed(4)}/u
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-600 text-right block px-1">—</span>
                            )}
                          </td>

                          {/* Subtotal sin IVA */}
                          <td className="px-2 py-1.5">
                            <Input
                              type="number" min="0" step="0.01"
                              value={item.costo_total_sel}
                              onChange={(e) => updateItem(idx, 'costo_total_sel', parseFloat(e.target.value) || 0)}
                              disabled={!item.incluir}
                              className="h-7 text-xs text-right font-mono bg-gray-50 border-[#F97316]/20 text-gray-900"
                            />
                          </td>

                          {/* Descuento */}
                          <td className="px-2 py-1.5 text-right">
                            {item.descuento > 0
                              ? <span className="text-orange-400 font-mono">${item.descuento.toFixed(2)}</span>
                              : <span className="text-gray-600">—</span>}
                          </td>

                          {/* IVA del ítem */}
                          <td className="px-2 py-1.5 text-right">
                            {item.iva > 0
                              ? <span className="text-yellow-300 font-mono">${item.iva.toFixed(2)}</span>
                              : <span className="text-gray-600">$0.00</span>}
                          </td>

                          {/* % IVA */}
                          <td className="px-2 py-1.5 text-center">
                            <Badge className={`text-xs ${
                              item.porcentaje_iva > 0
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-gray-500/20 text-gray-600'
                            }`}>
                              {labelIva(item.codigo_iva, item.porcentaje_iva)}
                            </Badge>
                          </td>

                          {/* Score de match */}
                          <td className="px-2 py-1.5 text-center">
                            {item.match ? (
                              <Badge className={`text-xs ${
                                item.auto_matched ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {item.match.score}%
                              </Badge>
                            ) : (
                              <Badge className="text-xs bg-red-500/20 text-red-400">—</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Alerta factura duplicada ── */}
              {facturadup && (
                <div className="bg-red-500/15 border border-red-500/50 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-red-400 font-bold text-sm">Factura ya registrada</p>
                    <p className="text-red-300 text-xs mt-1">
                      La factura <strong>{factura?.numero}</strong> ya existe en el sistema
                      {facturadup.fecha ? ` (registrada el ${facturadup.fecha})` : ''}.
                      Total registrado: <strong>${Number(facturadup.total).toFixed(2)}</strong>
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                      Si necesitas corregirla, elimina la compra existente primero y vuelve a importar.
                    </p>
                  </div>
                  <button onClick={() => setFacturaDup(null)} className="text-red-400 hover:text-gray-900">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── Resumen de totales ── */}
              <div className="space-y-3">
                {/* Desglose cuando hay gastos */}
                {hayGastos && (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-600 mb-2 font-semibold">Desglose del asiento contable que se generará:</p>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-[#F97316]">Débito — Inventario (stock)</span>
                        <span className="text-[#F97316] font-bold">${totalInventario.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-400">Débito — Gastos generales</span>
                        <span className="text-orange-400 font-bold">${totalGasto.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-gray-100 pt-1 flex justify-between">
                        <span className="text-gray-900">Crédito — {tipoPago === 'credito' ? 'CxP Proveedores' : 'Caja/Banco'}</span>
                        <span className="text-gray-900 font-bold">${totalTodos.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <p>
                      <span className="text-[#F97316]">📦 {itemsInventario.length} al stock</span>
                      {hayGastos && <span className="text-orange-400 ml-3">💸 {itemsGasto.length} como gasto</span>}
                    </p>
                    <p className="text-gray-600">Costo unitario = Subtotal s/IVA ÷ Cant. stock</p>
                    {itemsSinProducto.length > 0 && (
                      <p className="text-red-400 font-semibold">⚠ {itemsSinProducto.length} ítem(s) de stock sin producto asignado</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {ivaTotal > 0 && (
                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 text-center">
                        <span className="text-gray-600 text-xs block">IVA total</span>
                        <span className="text-yellow-300 font-bold">${ivaTotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="bg-[#F97316]/10 border border-[#F97316]/30 rounded-lg px-4 py-2 text-center">
                      <span className="text-gray-600 text-xs block">Total real de la factura</span>
                      <span className="text-[#F97316] text-xl font-black">${totalTodos.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-600">Observaciones (opcional)</label>
                <Input value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  placeholder={`Importado XML SRI — ${proveedorXML?.nombre || ''}`} />
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose} className="flex-1 border-[#F97316]/20 text-gray-600">
              Cancelar
            </Button>
          )}
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={resetAll} className="border-[#F97316]/20 text-gray-600">
                ← Cargar otro XML
              </Button>
              <Button
                onClick={handleRegistrar}
                disabled={submitting || items.length === 0 || !proveedorId || itemsSinProducto.length > 0}
                className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold"
              >
                {submitting
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Registrando...</>
                  : <><ShoppingCart className="w-4 h-4 mr-2" />
                      Registrar Compra · ${totalTodos.toFixed(2)} total
                    </>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
