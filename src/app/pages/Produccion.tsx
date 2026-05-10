import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBodega } from '../context/BodegaContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import {
  Factory, ArrowLeftRight, Layers, Plus, Play, CheckCircle2,
  XCircle, RefreshCw, Warehouse, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrdenProduccion {
  id: string;
  numero_orden: string;
  bodega_origen_id: string;
  bodega_origen_nombre: string;
  bodega_destino_id: string;
  bodega_destino_nombre: string;
  producto_nombre: string;
  cantidad: number;
  notas: string;
  estado: 'pendiente' | 'en_proceso' | 'completada' | 'cancelada';
  fecha_creacion: string;
  fecha_esperada: string;
  fecha_completada?: string;
}

interface Transferencia {
  id: string;
  numero_transferencia: string;
  bodega_origen_id: string;
  bodega_origen_nombre: string;
  bodega_destino_id: string;
  bodega_destino_nombre: string;
  producto_nombre: string;
  cantidad: number;
  notas: string;
  estado: 'pendiente' | 'aprobada' | 'completada' | 'rechazada';
  solicitado_por: string;
  fecha_creacion: string;
  fecha_completada?: string;
}

interface LoteProduccion {
  id: string;
  numero_lote: string;
  producto_nombre: string;
  cantidad: number;
  cantidad_real?: number;
  cantidad_planificada?: number;
  merma?: number;
  merma_porcentaje?: string;
  bodega_id: string;
  bodega_nombre: string;
  fecha_produccion: string;
  orden_id: string;
}

interface Merma {
  id: string;
  bodega_id: string;
  bodega_nombre: string;
  producto_nombre: string;
  cantidad_perdida: number;
  merma_porcentaje?: string;
  motivo: string;
  tipo: string;
  fecha: string;
  origen?: string;
}

interface StockBodegaItem {
  bodega_id: string;
  bodega_nombre: string;
  productos: { nombre: string; cantidad: number }[];
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const ORDEN_ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  en_proceso: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  completada: 'bg-green-500/20 text-green-300 border border-green-500/40',
  cancelada:  'bg-red-500/20 text-red-300 border border-red-500/40',
};

const ORDEN_ESTADO_LABEL: Record<string, string> = {
  pendiente:  'Pendiente',
  en_proceso: 'En Proceso',
  completada: 'Completada',
  cancelada:  'Cancelada',
};

const TRANSFER_ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  aprobada:   'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  completada: 'bg-green-500/20 text-green-300 border border-green-500/40',
  rechazada:  'bg-red-500/20 text-red-300 border border-red-500/40',
};

const TRANSFER_ESTADO_LABEL: Record<string, string> = {
  pendiente:  'Pendiente',
  aprobada:   'Aprobada',
  completada: 'Completada',
  rechazada:  'Rechazada',
};

function EstadoBadge({ estado, map, labelMap }: { estado: string; map: Record<string,string>; labelMap: Record<string,string> }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[estado] ?? 'bg-gray-500/20 text-gray-300 border border-gray-500/40'}`}>
      {labelMap[estado] ?? estado}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Produccion() {
  const { token } = useAuth();
  const { bodegas } = useBodega();

  const [ordenes, setOrdenes] = useState<OrdenProduccion[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [lotes, setLotes] = useState<LoteProduccion[]>([]);
  const [mermas, setMermas] = useState<Merma[]>([]);
  const [stockConsolidado, setStockConsolidado] = useState<StockBodegaItem[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stockExpanded, setStockExpanded] = useState(false);

  // Modals
  const [showOrdenModal, setShowOrdenModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showMermaModal, setShowMermaModal] = useState(false);

  // Completar orden with merma
  const [completarOrden, setCompletarOrden] = useState<OrdenProduccion | null>(null);
  const [completarForm, setCompletarForm] = useState({ cantidad_real: 0, merma_cantidad: 0, merma_motivo: '' });

  // Forms
  const [ordenForm, setOrdenForm] = useState({
    bodega_origen_id: '',
    bodega_destino_id: '',
    producto_nombre: '',
    cantidad: '',
    notas: '',
    fecha_esperada: new Date().toISOString().split('T')[0],
  });

  const [transferForm, setTransferForm] = useState({
    bodega_origen_id: '',
    bodega_destino_id: '',
    producto_nombre: '',
    cantidad: '',
    notas: '',
  });

  const [mermaForm, setMermaForm] = useState({
    bodega_id: '',
    producto_nombre: '',
    cantidad_perdida: '',
    motivo: '',
    tipo: 'otro',
  });

  const [submitting, setSubmitting] = useState(false);

  // ─── Fetch helpers ──────────────────────────────────────────────────────────

  const getHeaders = async () => {
    const { publicAnonKey } = await import('/utils/supabase/info');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
      'X-User-Token': token || '',
    };
  };

  const getBaseUrl = async () => {
    const { projectId } = await import('/utils/supabase/info');
    return `https://${projectId}.supabase.co/functions/v1/server`;
  };

  const fetchOrdenes = async () => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/ordenes`, { headers });
      if (!res.ok) throw new Error('Error al obtener órdenes');
      const data = await res.json();
      setOrdenes(data.data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchTransferencias = async () => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/transferencias`, { headers });
      if (!res.ok) throw new Error('Error al obtener transferencias');
      const data = await res.json();
      setTransferencias(data.data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchLotes = async () => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/lotes`, { headers });
      if (!res.ok) throw new Error('Error al obtener lotes');
      const data = await res.json();
      setLotes(data.data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchMermas = async () => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/mermas`, { headers });
      if (!res.ok) throw new Error('Error al obtener mermas');
      const data = await res.json();
      setMermas(data.data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchStockConsolidado = async () => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/stock/consolidado`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setStockConsolidado(data.data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchProductos = async () => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/productos`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setProductos((data.productos || []).filter((p: any) => p.activo !== false));
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchOrdenes(), fetchTransferencias(), fetchLotes(), fetchMermas(), fetchStockConsolidado(), fetchProductos()]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // ─── Orden actions ──────────────────────────────────────────────────────────

  const crearOrden = async () => {
    if (!ordenForm.bodega_origen_id || !ordenForm.bodega_destino_id || !ordenForm.producto_nombre || !ordenForm.cantidad) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    if (ordenForm.bodega_origen_id === ordenForm.bodega_destino_id) {
      toast.error('La bodega origen y destino deben ser diferentes');
      return;
    }
    setSubmitting(true);
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const bodegaOrigen = bodegas.find(b => b.id === ordenForm.bodega_origen_id);
      const bodegaDestino = bodegas.find(b => b.id === ordenForm.bodega_destino_id);
      const res = await fetch(`${base}/produccion/ordenes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...ordenForm,
          cantidad: Number(ordenForm.cantidad),
          bodega_origen_nombre: bodegaOrigen?.nombre ?? '',
          bodega_destino_nombre: bodegaDestino?.nombre ?? '',
        }),
      });
      if (!res.ok) throw new Error('Error al crear orden');
      toast.success('Orden de producción creada');
      setShowOrdenModal(false);
      setOrdenForm({ bodega_origen_id: '', bodega_destino_id: '', producto_nombre: '', cantidad: '', notas: '', fecha_esperada: new Date().toISOString().split('T')[0] });
      await fetchOrdenes();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const iniciarOrden = async (id: string) => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/ordenes/${id}/iniciar`, { method: 'PUT', headers });
      if (!res.ok) throw new Error('Error al iniciar orden');
      toast.success('Orden iniciada');
      await fetchOrdenes();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const cancelarOrden = async (id: string) => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/ordenes/${id}/cancelar`, { method: 'PUT', headers });
      if (!res.ok) throw new Error('Error al cancelar orden');
      toast.success('Orden cancelada');
      await fetchOrdenes();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const abrirCompletarOrden = (orden: OrdenProduccion) => {
    setCompletarOrden(orden);
    setCompletarForm({ cantidad_real: orden.cantidad, merma_cantidad: 0, merma_motivo: '' });
  };

  const confirmarCompletarOrden = async () => {
    if (!completarOrden) return;
    setSubmitting(true);
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/ordenes/${completarOrden.id}/completar`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          cantidad_real: completarForm.cantidad_real,
          merma_cantidad: completarForm.merma_cantidad,
          merma_motivo: completarForm.merma_motivo,
        }),
      });
      if (!res.ok) throw new Error('Error al completar orden');
      const data = await res.json();
      toast.success('Orden completada exitosamente');
      if (data.merma) toast.info(`Merma registrada: ${completarForm.merma_cantidad} unidades`);
      setCompletarOrden(null);
      await Promise.all([fetchOrdenes(), fetchLotes(), fetchTransferencias(), fetchMermas(), fetchStockConsolidado()]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Transferencia actions ──────────────────────────────────────────────────

  const crearTransferencia = async () => {
    if (!transferForm.bodega_origen_id || !transferForm.bodega_destino_id || !transferForm.producto_nombre || !transferForm.cantidad) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    if (transferForm.bodega_origen_id === transferForm.bodega_destino_id) {
      toast.error('La bodega origen y destino deben ser diferentes');
      return;
    }
    setSubmitting(true);
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const bodegaOrigen = bodegas.find(b => b.id === transferForm.bodega_origen_id);
      const bodegaDestino = bodegas.find(b => b.id === transferForm.bodega_destino_id);
      const res = await fetch(`${base}/transferencias`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...transferForm,
          cantidad: Number(transferForm.cantidad),
          bodega_origen_nombre: bodegaOrigen?.nombre ?? '',
          bodega_destino_nombre: bodegaDestino?.nombre ?? '',
        }),
      });
      if (!res.ok) throw new Error('Error al crear transferencia');
      toast.success('Transferencia creada');
      setShowTransferModal(false);
      setTransferForm({ bodega_origen_id: '', bodega_destino_id: '', producto_nombre: '', cantidad: '', notas: '' });
      await fetchTransferencias();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const accionTransferencia = async (id: string, accion: 'aprobar' | 'completar' | 'rechazar') => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/transferencias/${id}/${accion}`, { method: 'PUT', headers });
      if (!res.ok) throw new Error(`Error al ${accion} transferencia`);
      const data = await res.json();
      toast.success(`Transferencia ${accion === 'aprobar' ? 'aprobada' : accion === 'completar' ? 'completada' : 'rechazada'}`);
      if (accion === 'completar' && data.stockResult) {
        if (!data.stockResult.ok) {
          toast.warning(`Aviso: ${data.stockResult.error}`);
        } else {
          toast.info(`Stock origen disponible: ${data.stockResult.stockOrigen}`);
        }
      }
      await Promise.all([fetchTransferencias(), fetchStockConsolidado()]);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ─── Merma actions ──────────────────────────────────────────────────────────

  const registrarMermaManual = async () => {
    if (!mermaForm.bodega_id || !mermaForm.producto_nombre || !mermaForm.cantidad_perdida) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    setSubmitting(true);
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const bodega = bodegas.find(b => b.id === mermaForm.bodega_id);
      const res = await fetch(`${base}/produccion/mermas`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...mermaForm,
          cantidad_perdida: Number(mermaForm.cantidad_perdida),
          bodega_nombre: bodega?.nombre ?? '',
        }),
      });
      if (!res.ok) throw new Error('Error al registrar merma');
      toast.success('Merma registrada exitosamente');
      setShowMermaModal(false);
      setMermaForm({ bodega_id: '', producto_nombre: '', cantidad_perdida: '', motivo: '', tipo: 'otro' });
      await Promise.all([fetchMermas(), fetchStockConsolidado()]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatFecha = (s: string) => {
    if (!s) return '-';
    return new Date(s).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatFechaHora = (s: string) => {
    if (!s) return '-';
    return new Date(s).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Computed merma for completar form
  const mermaComputada = completarOrden
    ? Math.max(0, completarOrden.cantidad - completarForm.cantidad_real)
    : 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 bg-[#0A1A2F] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Factory className="w-6 h-6 text-[#00E5FF]" />
            Producción
          </h1>
          <p className="text-gray-400 text-sm mt-1">Gestión de planta de producción y transferencias entre bodegas</p>
        </div>
        <Button
          onClick={loadAll}
          variant="outline"
          size="sm"
          className="border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/10 gap-2"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stock por Bodega (collapsible) */}
      {bodegas.length > 0 && (
        <Card className="bg-[#0F2640]/80 border-white/5">
          <button
            className="w-full flex items-center justify-between px-5 py-3 text-left"
            onClick={() => setStockExpanded(v => !v)}
          >
            <span className="text-white font-semibold flex items-center gap-2 text-sm">
              <Warehouse className="w-4 h-4 text-[#00E5FF]" />
              Stock por Bodega
              <span className="text-gray-400 font-normal text-xs">(consolidado)</span>
            </span>
            {stockExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {stockExpanded && (
            <div className="px-5 pb-4">
              {stockConsolidado.length === 0 ? (
                <p className="text-gray-500 text-sm py-2">No hay stock registrado aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-400 text-xs">Bodega</TableHead>
                        <TableHead className="text-gray-400 text-xs">Producto</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Cantidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockConsolidado.flatMap(b =>
                        b.productos.length === 0
                          ? [
                              <TableRow key={b.bodega_id + '_empty'} className="border-white/5">
                                <TableCell className="text-gray-300 text-sm">{b.bodega_nombre}</TableCell>
                                <TableCell className="text-gray-500 text-xs italic" colSpan={2}>Sin stock registrado</TableCell>
                              </TableRow>
                            ]
                          : b.productos.map((p, i) => (
                              <TableRow key={b.bodega_id + p.nombre} className="border-white/5 hover:bg-white/5">
                                <TableCell className="text-gray-300 text-sm">{i === 0 ? b.bodega_nombre : ''}</TableCell>
                                <TableCell className="text-white text-sm">{p.nombre}</TableCell>
                                <TableCell className="text-[#00E5FF] text-sm text-right font-mono">{p.cantidad}</TableCell>
                              </TableRow>
                            ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="ordenes" className="w-full">
        <TabsList className="bg-[#0F2640] border border-white/5 rounded-xl p-1 gap-1">
          <TabsTrigger value="ordenes" className="data-[state=active]:bg-[#1e64a7] data-[state=active]:text-white text-gray-400 rounded-lg gap-2 text-sm">
            <Factory className="w-4 h-4" />
            Órdenes de Producción
          </TabsTrigger>
          <TabsTrigger value="transferencias" className="data-[state=active]:bg-[#1e64a7] data-[state=active]:text-white text-gray-400 rounded-lg gap-2 text-sm">
            <ArrowLeftRight className="w-4 h-4" />
            Transferencias
          </TabsTrigger>
          <TabsTrigger value="lotes" className="data-[state=active]:bg-[#1e64a7] data-[state=active]:text-white text-gray-400 rounded-lg gap-2 text-sm">
            <Layers className="w-4 h-4" />
            Lotes de Producción
          </TabsTrigger>
          <TabsTrigger value="mermas" className="data-[state=active]:bg-[#1e64a7] data-[state=active]:text-white text-gray-400 rounded-lg gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Mermas
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Órdenes ─────────────────────────────────────────────────── */}
        <TabsContent value="ordenes" className="mt-4">
          <Card className="bg-[#0F2640]/80 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Factory className="w-5 h-5 text-[#00E5FF]" />
                Órdenes de Producción
                <span className="ml-2 text-sm font-normal text-gray-400">({ordenes.length})</span>
              </CardTitle>
              <Button
                onClick={() => setShowOrdenModal(true)}
                className="bg-[#7B61FF] hover:bg-[#6B51EF] text-white gap-2 text-sm"
                size="sm"
              >
                <Plus className="w-4 h-4" />
                Nueva Orden
              </Button>
            </CardHeader>
            <CardContent>
              {ordenes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay órdenes de producción</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-400 text-xs">Número</TableHead>
                        <TableHead className="text-gray-400 text-xs">Bodega Origen</TableHead>
                        <TableHead className="text-gray-400 text-xs">Bodega Destino</TableHead>
                        <TableHead className="text-gray-400 text-xs">Producto</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Cantidad</TableHead>
                        <TableHead className="text-gray-400 text-xs">Estado</TableHead>
                        <TableHead className="text-gray-400 text-xs">Fecha</TableHead>
                        <TableHead className="text-gray-400 text-xs">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordenes.map(o => (
                        <TableRow key={o.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-[#00E5FF] font-mono text-xs font-semibold">{o.numero_orden}</TableCell>
                          <TableCell className="text-gray-300 text-sm">{o.bodega_origen_nombre}</TableCell>
                          <TableCell className="text-gray-300 text-sm">{o.bodega_destino_nombre}</TableCell>
                          <TableCell className="text-white text-sm font-medium">{o.producto_nombre}</TableCell>
                          <TableCell className="text-white text-sm text-right font-mono">{o.cantidad}</TableCell>
                          <TableCell>
                            <EstadoBadge estado={o.estado} map={ORDEN_ESTADO_BADGE} labelMap={ORDEN_ESTADO_LABEL} />
                          </TableCell>
                          <TableCell className="text-gray-400 text-xs">{formatFecha(o.fecha_creacion)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {o.estado === 'pendiente' && (
                                <button
                                  onClick={() => iniciarOrden(o.id)}
                                  title="Iniciar"
                                  className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {o.estado === 'en_proceso' && (
                                <button
                                  onClick={() => abrirCompletarOrden(o)}
                                  title="Completar"
                                  className="p-1.5 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(o.estado === 'pendiente' || o.estado === 'en_proceso') && (
                                <button
                                  onClick={() => cancelarOrden(o.id)}
                                  title="Cancelar"
                                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Transferencias ──────────────────────────────────────────── */}
        <TabsContent value="transferencias" className="mt-4">
          <Card className="bg-[#0F2640]/80 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-[#00E5FF]" />
                Transferencias
                <span className="ml-2 text-sm font-normal text-gray-400">({transferencias.length})</span>
              </CardTitle>
              <Button
                onClick={() => setShowTransferModal(true)}
                className="bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 text-[#00E5FF] border border-[#00E5FF]/30 gap-2 text-sm"
                size="sm"
              >
                <Plus className="w-4 h-4" />
                Nueva Transferencia
              </Button>
            </CardHeader>
            <CardContent>
              {transferencias.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay transferencias registradas</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-400 text-xs">Número</TableHead>
                        <TableHead className="text-gray-400 text-xs">Desde</TableHead>
                        <TableHead className="text-gray-400 text-xs">Hacia</TableHead>
                        <TableHead className="text-gray-400 text-xs">Producto</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Cantidad</TableHead>
                        <TableHead className="text-gray-400 text-xs">Estado</TableHead>
                        <TableHead className="text-gray-400 text-xs">Solicitado por</TableHead>
                        <TableHead className="text-gray-400 text-xs">Fecha</TableHead>
                        <TableHead className="text-gray-400 text-xs">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transferencias.map(t => (
                        <TableRow key={t.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-[#00E5FF] font-mono text-xs font-semibold">{t.numero_transferencia}</TableCell>
                          <TableCell className="text-gray-300 text-sm">{t.bodega_origen_nombre}</TableCell>
                          <TableCell className="text-gray-300 text-sm">{t.bodega_destino_nombre}</TableCell>
                          <TableCell className="text-white text-sm font-medium">{t.producto_nombre}</TableCell>
                          <TableCell className="text-white text-sm text-right font-mono">{t.cantidad}</TableCell>
                          <TableCell>
                            <EstadoBadge estado={t.estado} map={TRANSFER_ESTADO_BADGE} labelMap={TRANSFER_ESTADO_LABEL} />
                          </TableCell>
                          <TableCell className="text-gray-400 text-xs">{t.solicitado_por || '-'}</TableCell>
                          <TableCell className="text-gray-400 text-xs">{formatFecha(t.fecha_creacion)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {t.estado === 'pendiente' && (
                                <button
                                  onClick={() => accionTransferencia(t.id, 'aprobar')}
                                  title="Aprobar"
                                  className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {t.estado === 'aprobada' && (
                                <button
                                  onClick={() => accionTransferencia(t.id, 'completar')}
                                  title="Completar"
                                  className="p-1.5 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(t.estado === 'pendiente' || t.estado === 'aprobada') && (
                                <button
                                  onClick={() => accionTransferencia(t.id, 'rechazar')}
                                  title="Rechazar"
                                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Lotes ──────────────────────────────────────────────────── */}
        <TabsContent value="lotes" className="mt-4">
          <Card className="bg-[#0F2640]/80 border-white/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#00E5FF]" />
                Lotes de Producción
                <span className="ml-2 text-sm font-normal text-gray-400">({lotes.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lotes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay lotes de producción registrados</p>
                  <p className="text-xs mt-1">Los lotes se generan automáticamente al completar una orden</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-400 text-xs">Número Lote</TableHead>
                        <TableHead className="text-gray-400 text-xs">Producto</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Planificado</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Real</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Merma</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">% Merma</TableHead>
                        <TableHead className="text-gray-400 text-xs">Bodega</TableHead>
                        <TableHead className="text-gray-400 text-xs">Fecha Producción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotes.map(l => (
                        <TableRow key={l.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-[#7B61FF] font-mono text-xs font-semibold">{l.numero_lote}</TableCell>
                          <TableCell className="text-white text-sm font-medium">{l.producto_nombre}</TableCell>
                          <TableCell className="text-gray-400 text-sm text-right font-mono">{l.cantidad_planificada ?? l.cantidad}</TableCell>
                          <TableCell className="text-white text-sm text-right font-mono">{l.cantidad_real ?? l.cantidad}</TableCell>
                          <TableCell className={`text-sm text-right font-mono ${(l.merma ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {l.merma ?? 0}
                          </TableCell>
                          <TableCell className={`text-sm text-right font-mono ${(l.merma ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {l.merma_porcentaje ? `${l.merma_porcentaje}%` : '0.0%'}
                          </TableCell>
                          <TableCell className="text-gray-300 text-sm">
                            <span className="flex items-center gap-1">
                              <Warehouse className="w-3.5 h-3.5 text-gray-500" />
                              {l.bodega_nombre}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-400 text-xs">{formatFecha(l.fecha_produccion)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Mermas ──────────────────────────────────────────────────── */}
        <TabsContent value="mermas" className="mt-4">
          <Card className="bg-[#0F2640]/80 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Control de Mermas
                <span className="ml-2 text-sm font-normal text-gray-400">({mermas.length})</span>
              </CardTitle>
              <Button
                onClick={() => setShowMermaModal(true)}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 gap-2 text-sm"
                size="sm"
              >
                <Plus className="w-4 h-4" />
                Registrar Merma Manual
              </Button>
            </CardHeader>
            <CardContent>
              {mermas.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay mermas registradas</p>
                  <p className="text-xs mt-1">Las mermas se generan al completar órdenes o se registran manualmente</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-400 text-xs">Fecha</TableHead>
                        <TableHead className="text-gray-400 text-xs">Producto</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">Cantidad Perdida</TableHead>
                        <TableHead className="text-gray-400 text-xs text-right">% Merma</TableHead>
                        <TableHead className="text-gray-400 text-xs">Motivo</TableHead>
                        <TableHead className="text-gray-400 text-xs">Tipo</TableHead>
                        <TableHead className="text-gray-400 text-xs">Bodega</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mermas.map(m => (
                        <TableRow key={m.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-gray-400 text-xs">{formatFechaHora(m.fecha)}</TableCell>
                          <TableCell className="text-white text-sm font-medium">{m.producto_nombre}</TableCell>
                          <TableCell className="text-red-400 text-sm text-right font-mono font-semibold">
                            -{m.cantidad_perdida}
                          </TableCell>
                          <TableCell className="text-red-400 text-sm text-right font-mono">
                            {m.merma_porcentaje ? `${m.merma_porcentaje}%` : '-'}
                          </TableCell>
                          <TableCell className="text-gray-300 text-sm max-w-[200px] truncate">{m.motivo || '-'}</TableCell>
                          <TableCell>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              m.tipo === 'produccion' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' :
                              m.tipo === 'transferencia' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                              m.tipo === 'almacenamiento' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' :
                              'bg-gray-500/20 text-gray-300 border border-gray-500/40'
                            }`}>
                              {m.tipo === 'produccion' ? 'Producción' :
                               m.tipo === 'transferencia' ? 'Transferencia' :
                               m.tipo === 'almacenamiento' ? 'Almacenamiento' : 'Otro'}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-400 text-sm">
                            <span className="flex items-center gap-1">
                              <Warehouse className="w-3 h-3 text-gray-600" />
                              {m.bodega_nombre || '-'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Modal: Completar Orden (con merma) ─────────────────────────────── */}
      <Dialog open={!!completarOrden} onOpenChange={open => { if (!open) setCompletarOrden(null); }}>
        <DialogContent className="bg-[#0F2640] border-[#00E5FF]/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              Completar Orden {completarOrden?.numero_orden}
            </DialogTitle>
          </DialogHeader>
          {completarOrden && (
            <div className="space-y-4 py-2">
              <div className="bg-[#0A1A2F] rounded-lg p-3 text-sm text-gray-400">
                <p><span className="text-white">Producto:</span> {completarOrden.producto_nombre}</p>
                <p><span className="text-white">Cantidad planificada:</span> <span className="text-[#00E5FF] font-mono">{completarOrden.cantidad}</span></p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Cantidad real producida *</Label>
                <Input
                  type="number"
                  min="0"
                  max={completarOrden.cantidad}
                  value={completarForm.cantidad_real}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setCompletarForm(f => ({
                      ...f,
                      cantidad_real: val,
                      merma_cantidad: Math.max(0, completarOrden.cantidad - val),
                    }));
                  }}
                  className="bg-[#0A1A2F] border-white/10 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Merma (cantidad perdida)</Label>
                <Input
                  type="number"
                  value={mermaComputada}
                  readOnly
                  className="bg-[#0A1A2F] border-white/10 text-red-400 font-mono cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">Se calcula automáticamente: planificado − real</p>
              </div>
              {mermaComputada > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-gray-300 text-sm">Motivo de merma</Label>
                  <Input
                    value={completarForm.merma_motivo}
                    onChange={e => setCompletarForm(f => ({ ...f, merma_motivo: e.target.value }))}
                    placeholder="Ej: Producto defectuoso, pérdida en proceso..."
                    className="bg-[#0A1A2F] border-white/10 text-white"
                  />
                </div>
              )}
              {mermaComputada > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
                  <p className="text-red-400 font-semibold">Merma: {mermaComputada} unidades ({((mermaComputada / completarOrden.cantidad) * 100).toFixed(1)}%)</p>
                  <p className="text-gray-400 text-xs mt-0.5">Se registrará automáticamente en el control de mermas</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletarOrden(null)} className="border-white/20 text-gray-300 hover:bg-white/5">
              Cancelar
            </Button>
            <Button onClick={confirmarCompletarOrden} disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white">
              {submitting ? 'Completando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Nueva Orden ──────────────────────────────────────────────── */}
      <Dialog open={showOrdenModal} onOpenChange={setShowOrdenModal}>
        <DialogContent className="bg-[#0F2640] border-[#00E5FF]/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Factory className="w-5 h-5 text-[#00E5FF]" />
              Nueva Orden de Producción
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Bodega Origen *</Label>
                <Select value={ordenForm.bodega_origen_id} onValueChange={v => setOrdenForm(f => ({ ...f, bodega_origen_id: v }))}>
                  <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0F2640] border-white/10">
                    {bodegas.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-white hover:bg-white/10">{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Bodega Destino *</Label>
                <Select value={ordenForm.bodega_destino_id} onValueChange={v => setOrdenForm(f => ({ ...f, bodega_destino_id: v }))}>
                  <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0F2640] border-white/10">
                    {bodegas.filter(b => b.id !== ordenForm.bodega_origen_id).map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-white hover:bg-white/10">{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Producto * <span className="text-gray-500 text-xs">(del inventario)</span></Label>
              <Select value={ordenForm.producto_nombre} onValueChange={v => setOrdenForm(f => ({ ...f, producto_nombre: v }))}>
                <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-h-60">
                  {productos.length === 0 && <SelectItem value="-" disabled>No hay productos en inventario</SelectItem>}
                  {productos.map((p: any) => (
                    <SelectItem key={p.id} value={p.nombre}>
                      <span className="text-white">{p.nombre}</span>
                      <span className="text-gray-400 ml-2 text-xs">Stock: {p.stock_actual ?? 0}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Cantidad *</Label>
                <Input
                  type="number"
                  min="1"
                  value={ordenForm.cantidad}
                  onChange={e => setOrdenForm(f => ({ ...f, cantidad: e.target.value }))}
                  placeholder="0"
                  className="bg-[#0A1A2F] border-white/10 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Fecha esperada</Label>
                <Input
                  type="date"
                  value={ordenForm.fecha_esperada}
                  onChange={e => setOrdenForm(f => ({ ...f, fecha_esperada: e.target.value }))}
                  className="bg-[#0A1A2F] border-white/10 text-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Notas</Label>
              <Textarea
                value={ordenForm.notas}
                onChange={e => setOrdenForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones adicionales..."
                className="bg-[#0A1A2F] border-white/10 text-white resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrdenModal(false)} className="border-white/20 text-gray-300 hover:bg-white/5">
              Cancelar
            </Button>
            <Button onClick={crearOrden} disabled={submitting} className="bg-[#7B61FF] hover:bg-[#6B51EF] text-white">
              {submitting ? 'Creando...' : 'Crear Orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Nueva Transferencia ─────────────────────────────────────── */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="bg-[#0F2640] border-[#00E5FF]/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-[#00E5FF]" />
              Nueva Transferencia
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Bodega Origen *</Label>
                <Select value={transferForm.bodega_origen_id} onValueChange={v => setTransferForm(f => ({ ...f, bodega_origen_id: v }))}>
                  <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0F2640] border-white/10">
                    {bodegas.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-white hover:bg-white/10">{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Bodega Destino *</Label>
                <Select value={transferForm.bodega_destino_id} onValueChange={v => setTransferForm(f => ({ ...f, bodega_destino_id: v }))}>
                  <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0F2640] border-white/10">
                    {bodegas.filter(b => b.id !== transferForm.bodega_origen_id).map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-white hover:bg-white/10">{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Producto * <span className="text-gray-500 text-xs">(del inventario)</span></Label>
              <Select value={transferForm.producto_nombre} onValueChange={v => setTransferForm(f => ({ ...f, producto_nombre: v }))}>
                <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-h-60">
                  {productos.length === 0 && <SelectItem value="-" disabled>No hay productos en inventario</SelectItem>}
                  {productos.map((p: any) => (
                    <SelectItem key={p.id} value={p.nombre}>
                      <span className="text-white">{p.nombre}</span>
                      <span className="text-gray-400 ml-2 text-xs">Stock: {p.stock_actual ?? 0}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Cantidad *</Label>
              <Input
                type="number"
                min="1"
                value={transferForm.cantidad}
                onChange={e => setTransferForm(f => ({ ...f, cantidad: e.target.value }))}
                placeholder="0"
                className="bg-[#0A1A2F] border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Notas</Label>
              <Textarea
                value={transferForm.notas}
                onChange={e => setTransferForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones adicionales..."
                className="bg-[#0A1A2F] border-white/10 text-white resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferModal(false)} className="border-white/20 text-gray-300 hover:bg-white/5">
              Cancelar
            </Button>
            <Button onClick={crearTransferencia} disabled={submitting} className="bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 text-[#00E5FF] border border-[#00E5FF]/30">
              {submitting ? 'Creando...' : 'Crear Transferencia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Registrar Merma Manual ──────────────────────────────────── */}
      <Dialog open={showMermaModal} onOpenChange={setShowMermaModal}>
        <DialogContent className="bg-[#0F2640] border-[#00E5FF]/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Registrar Merma Manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Bodega *</Label>
              <Select value={mermaForm.bodega_id} onValueChange={v => setMermaForm(f => ({ ...f, bodega_id: v }))}>
                <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                  <SelectValue placeholder="Seleccionar bodega..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0F2640] border-white/10">
                  {bodegas.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-white hover:bg-white/10">{b.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Producto * <span className="text-gray-500 text-xs">(del inventario)</span></Label>
              <Select value={mermaForm.producto_nombre} onValueChange={v => setMermaForm(f => ({ ...f, producto_nombre: v }))}>
                <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30 max-h-60">
                  {productos.length === 0 && <SelectItem value="-" disabled>No hay productos en inventario</SelectItem>}
                  {productos.map((p: any) => (
                    <SelectItem key={p.id} value={p.nombre}>
                      <span className="text-white">{p.nombre}</span>
                      <span className="text-gray-400 ml-2 text-xs">Stock: {p.stock_actual ?? 0}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Cantidad perdida *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={mermaForm.cantidad_perdida}
                onChange={e => setMermaForm(f => ({ ...f, cantidad_perdida: e.target.value }))}
                placeholder="0"
                className="bg-[#0A1A2F] border-white/10 text-red-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Tipo de merma</Label>
              <Select value={mermaForm.tipo} onValueChange={v => setMermaForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger className="bg-[#0A1A2F] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0F2640] border-white/10">
                  <SelectItem value="produccion" className="text-white hover:bg-white/10">Producción</SelectItem>
                  <SelectItem value="transferencia" className="text-white hover:bg-white/10">Transferencia</SelectItem>
                  <SelectItem value="almacenamiento" className="text-white hover:bg-white/10">Almacenamiento</SelectItem>
                  <SelectItem value="otro" className="text-white hover:bg-white/10">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Motivo</Label>
              <Textarea
                value={mermaForm.motivo}
                onChange={e => setMermaForm(f => ({ ...f, motivo: e.target.value }))}
                placeholder="Describe el motivo de la merma..."
                className="bg-[#0A1A2F] border-white/10 text-white resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMermaModal(false)} className="border-white/20 text-gray-300 hover:bg-white/5">
              Cancelar
            </Button>
            <Button onClick={registrarMermaManual} disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white">
              {submitting ? 'Registrando...' : 'Registrar Merma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
