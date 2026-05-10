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
  XCircle, RefreshCw, Warehouse,
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
  bodega_id: string;
  bodega_nombre: string;
  fecha_produccion: string;
  orden_id: string;
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
  const [loading, setLoading] = useState(false);

  // Modals
  const [showOrdenModal, setShowOrdenModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

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

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchOrdenes(), fetchTransferencias(), fetchLotes()]);
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

  const accionOrden = async (id: string, accion: 'iniciar' | 'completar' | 'cancelar') => {
    try {
      const [headers, base] = await Promise.all([getHeaders(), getBaseUrl()]);
      const res = await fetch(`${base}/produccion/ordenes/${id}/${accion}`, { method: 'PUT', headers });
      if (!res.ok) throw new Error(`Error al ${accion} orden`);
      toast.success(`Orden ${accion === 'iniciar' ? 'iniciada' : accion === 'completar' ? 'completada' : 'cancelada'} exitosamente`);
      await Promise.all([fetchOrdenes(), fetchLotes(), fetchTransferencias()]);
    } catch (err: any) {
      toast.error(err.message);
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
      toast.success(`Transferencia ${accion === 'aprobar' ? 'aprobada' : accion === 'completar' ? 'completada' : 'rechazada'}`);
      await fetchTransferencias();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatFecha = (s: string) => {
    if (!s) return '-';
    return new Date(s).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

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
                                  onClick={() => accionOrden(o.id, 'iniciar')}
                                  title="Iniciar"
                                  className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {o.estado === 'en_proceso' && (
                                <button
                                  onClick={() => accionOrden(o.id, 'completar')}
                                  title="Completar"
                                  className="p-1.5 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(o.estado === 'pendiente' || o.estado === 'en_proceso') && (
                                <button
                                  onClick={() => accionOrden(o.id, 'cancelar')}
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
                        <TableHead className="text-gray-400 text-xs text-right">Cantidad</TableHead>
                        <TableHead className="text-gray-400 text-xs">Bodega</TableHead>
                        <TableHead className="text-gray-400 text-xs">Fecha Producción</TableHead>
                        <TableHead className="text-gray-400 text-xs">Orden Relacionada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotes.map(l => (
                        <TableRow key={l.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-[#7B61FF] font-mono text-xs font-semibold">{l.numero_lote}</TableCell>
                          <TableCell className="text-white text-sm font-medium">{l.producto_nombre}</TableCell>
                          <TableCell className="text-white text-sm text-right font-mono">{l.cantidad}</TableCell>
                          <TableCell className="text-gray-300 text-sm">
                            <span className="flex items-center gap-1">
                              <Warehouse className="w-3.5 h-3.5 text-gray-500" />
                              {l.bodega_nombre}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-400 text-xs">{formatFecha(l.fecha_produccion)}</TableCell>
                          <TableCell className="text-[#00E5FF]/70 font-mono text-xs">{l.orden_id?.slice(0, 8)}...</TableCell>
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
              <Label className="text-gray-300 text-sm">Producto *</Label>
              <Input
                value={ordenForm.producto_nombre}
                onChange={e => setOrdenForm(f => ({ ...f, producto_nombre: e.target.value }))}
                placeholder="Nombre del producto"
                className="bg-[#0A1A2F] border-white/10 text-white"
              />
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
              <Label className="text-gray-300 text-sm">Producto *</Label>
              <Input
                value={transferForm.producto_nombre}
                onChange={e => setTransferForm(f => ({ ...f, producto_nombre: e.target.value }))}
                placeholder="Nombre del producto"
                className="bg-[#0A1A2F] border-white/10 text-white"
              />
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
    </div>
  );
}
