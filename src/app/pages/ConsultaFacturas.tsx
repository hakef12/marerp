// v2 - fix: normalizar campos numéricos post-migración KV
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { ExportButtons } from '../components/ExportButtons';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';
import { RIDE } from '../components/facturacion/RIDE';
import { printHtml, cssTermico, esc } from '../utils/printThermal';
import {
  FileText,
  Search,
  Download,
  Eye,
  Send,
  RefreshCw,
  Filter,
  Calendar,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Mail,
  FileDown,
  RotateCcw,
  X,
} from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  secuencial: number;
  clave_acceso: string;
  fecha_emision: string;
  hora_emision?: string;
  cliente_identificacion: string;
  cliente_razon_social: string;
  cliente_email?: string;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  estado: 'PENDIENTE' | 'AUTORIZADO' | 'NO_AUTORIZADO' | 'ERROR';
  numero_autorizacion?: string;
  fecha_autorizacion?: string;
  xml_firmado?: string;
  ambiente: 'pruebas' | 'produccion';
  mensajes_sri?: string[];
  items?: any[];
  created_at: string;
}

export default function ConsultaFacturas() {
  const { token } = useAuth();
  
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [facturasFiltradas, setFacturasFiltradas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<Factura | null>(null);
  const [dialogRIDE, setDialogRIDE] = useState(false);
  const [dialogDetalles, setDialogDetalles] = useState(false);

  // Nota de Crédito
  const [dialogNC, setDialogNC] = useState(false);
  const [facturaParaNC, setFacturaParaNC] = useState<any>(null);
  const [ncMotivo, setNcMotivo] = useState('');
  const [ncTipo, setNcTipo] = useState<'total'|'parcial'>('total');
  const [ncMontoParcial, setNcMontoParcial] = useState('');
  const [ncEmitiendo, setNcEmitiendo] = useState(false);

  // Email dialog
  const [dialogEmail, setDialogEmail] = useState(false);
  const [facturaParaEmail, setFacturaParaEmail] = useState<Factura | null>(null);
  const [emailDestino, setEmailDestino] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  useEffect(() => {
    cargarFacturas();
  }, []);

  useEffect(() => {
    aplicarFiltros();
  }, [facturas, busqueda, filtroEstado, fechaInicio, fechaFin]);

  const cargarFacturas = async () => {
    setIsLoading(true);
    try {
      console.log('📄 Cargando facturas...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/facturacion/facturas`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Facturas cargadas:', data.facturas?.length || 0);
        // Normalizar campos numéricos para evitar undefined.toFixed() crash
        const normalizadas = (data.facturas || []).map((f: any) => ({
          ...f,
          subtotal:  Number(f.subtotal ?? f.subtotal_iva ?? 0),
          iva:       Number(f.iva ?? 0),
          total:     Number(f.total ?? 0),
          descuento: Number(f.descuento ?? f.total_descuento ?? 0),
          mensajes_sri: Array.isArray(f.mensajes_sri) ? f.mensajes_sri : [],
          fecha_emision: f.fecha_emision || f.created_at || '',
          hora_emision: f.hora_emision || '',
          cliente_razon_social: f.cliente_razon_social || f.cliente_nombre || 'Sin nombre',
          cliente_identificacion: f.cliente_identificacion || '-',
          numero_factura: f.numero_factura || f.id || '-',
          clave_acceso: f.clave_acceso || '',
          estado: f.estado || f.estado_autorizacion || 'PENDIENTE',
          ambiente: f.ambiente || 'pruebas',
        }));
        setFacturas(normalizadas);
      } else {
        const error = await response.json();
        console.error('❌ Error cargando facturas:', error);
        toast.error('Error al cargar facturas');
      }
    } catch (error) {
      console.error('❌ Error de red:', error);
      toast.error('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const aplicarFiltros = () => {
    let resultado = [...facturas];

    // Filtro por búsqueda
    if (busqueda) {
      resultado = resultado.filter(f => 
        f.numero_factura.toLowerCase().includes(busqueda.toLowerCase()) ||
        f.clave_acceso.includes(busqueda) ||
        f.cliente_razon_social.toLowerCase().includes(busqueda.toLowerCase()) ||
        f.cliente_identificacion.includes(busqueda)
      );
    }

    // Filtro por estado
    if (filtroEstado !== 'todos') {
      resultado = resultado.filter(f => f.estado === filtroEstado);
    }

    // Filtro por fecha
    if (fechaInicio) {
      resultado = resultado.filter(f => 
        new Date(f.fecha_emision) >= new Date(fechaInicio)
      );
    }
    if (fechaFin) {
      resultado = resultado.filter(f => 
        new Date(f.fecha_emision) <= new Date(fechaFin)
      );
    }

    setFacturasFiltradas(resultado);
  };

  const verRIDE = (factura: Factura) => {
    setFacturaSeleccionada(factura);
    setDialogRIDE(true);
  };

  const verDetalles = (factura: Factura) => {
    setFacturaSeleccionada(factura);
    setDialogDetalles(true);
  };

  const descargarXML = (factura: Factura) => {
    if (!factura.xml_firmado) {
      toast.error('XML no disponible');
      return;
    }

    const blob = new Blob([factura.xml_firmado], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factura_${factura.numero_factura}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('XML descargado');
  };

  /** Abre el dialog de email pre-rellenando con el email del cliente si existe */
  const abrirDialogEmail = (factura: Factura) => {
    setFacturaParaEmail(factura);
    setEmailDestino(factura.cliente_email || '');
    setDialogEmail(true);
  };

  /** Envía realmente el email via Resend */
  const confirmarEnvioEmail = async () => {
    if (!facturaParaEmail) return;
    if (!emailDestino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
      toast.error('Ingresa un email válido');
      return;
    }

    setEnviandoEmail(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/facturacion/reenviar-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            factura_id: facturaParaEmail.id,
            destinatario: emailDestino,
          }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        toast.success(`✅ Factura enviada a ${emailDestino}`);
        // Actualizar la lista local para reflejar email_enviado
        setFacturas(prev => prev.map(f =>
          f.id === facturaParaEmail.id
            ? { ...f, email_enviado: true, cliente_email: emailDestino } as any
            : f
        ));
        setDialogEmail(false);
      } else {
        // Mostrar el error completo (incluye mensajes de Resend como "domain not verified")
        const errMsg = data.error || 'Error enviando email';
        const errDetalle = data.detalle ? ` — ${data.detalle}` : '';
        toast.error(`${errMsg}${errDetalle}`, { duration: 8000 });
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const reintentarAutorizacion = async (factura: Factura) => {
    setIsLoading(true);
    toast.info('Consultando autorización con el SRI...');
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/facturacion/reintentar`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            factura_id: factura.id
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const estado = data.factura?.estado;
        const msgs: string[] = data.factura?.mensajes_sri || [];
        const primerMsg = msgs.find((m: string) => m.length > 0) || '';
        if (estado === 'AUTORIZADO') {
          toast.success(`✅ Factura AUTORIZADA por el SRI${data.factura?.numero_autorizacion ? ' — N° ' + data.factura.numero_autorizacion.substring(0, 20) + '...' : ''}`);
        } else if (estado === 'NO_AUTORIZADO') {
          toast.error(`❌ SRI rechazó la factura${primerMsg ? ': ' + primerMsg.replace(/^[⚠️❌📋🔶]\s*/, '') : ''}`, { duration: 8000 });
        } else {
          // PENDIENTE — show SRI message if it tells us something useful
          const infoMsg = primerMsg.replace(/^[⚠️❌📋🔶]\s*/, '') || 'El SRI aún está procesando. Reintente en unos segundos.';
          toast.info(`⏳ ${infoMsg}`, { duration: 5000 });
        }
        await cargarFacturas();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al reintentar');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const emitirNotaCredito = async () => {
    if (!facturaParaNC || !ncMotivo.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    if (ncTipo === 'parcial' && (!ncMontoParcial || Number(ncMontoParcial) <= 0)) {
      toast.error('Ingresa el monto parcial a acreditar');
      return;
    }
    setNcEmitiendo(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/facturacion/notas-credito`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factura_id: facturaParaNC.id,
            motivo: ncMotivo,
            tipo: ncTipo,
            monto_parcial: ncTipo === 'parcial' ? Number(ncMontoParcial) : undefined,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        const estado = data.estado_autorizacion || data.estado;
        if (estado === 'AUTORIZADO') {
          toast.success(`✅ Nota de Crédito ${data.numero_nc} AUTORIZADA por el SRI`);
        } else {
          toast.info(`⏳ Nota de Crédito ${data.numero_nc} enviada — estado: ${estado}`);
        }
        setDialogNC(false);
        setNcMotivo(''); setNcMontoParcial(''); setNcTipo('total');
        await cargarFacturas();
      } else {
        toast.error(data.error || 'Error al emitir nota de crédito');
      }
    } catch (e: any) {
      toast.error('Error de conexión: ' + e.message);
    } finally {
      setNcEmitiendo(false);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const badges = {
      'AUTORIZADO': <Badge className="bg-green-500/20 text-green-400 border-green-500/50">✓ Autorizado</Badge>,
      'PENDIENTE': <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">⏳ Pendiente</Badge>,
      'NO_AUTORIZADO': <Badge className="bg-red-500/20 text-red-400 border-red-500/50">✗ No Autorizado</Badge>,
      'ERROR': <Badge className="bg-red-500/20 text-red-400 border-red-500/50">⚠ Error</Badge>,
    };
    return badges[estado as keyof typeof badges] || <Badge>Desconocido</Badge>;
  };

  const totales = {
    todas: facturas.length,
    autorizadas: facturas.filter(f => f.estado === 'AUTORIZADO').length,
    pendientes: facturas.filter(f => f.estado === 'PENDIENTE').length,
    errores: facturas.filter(f => f.estado === 'ERROR' || f.estado === 'NO_AUTORIZADO').length,
    montoTotal: facturas.reduce((sum, f) => sum + (Number(f.total) || 0), 0)
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-[#111111]">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-50 to-[#C2410C] p-6 border-b border-[#F97316]/20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-[#F97316]" />
              Consulta de Facturas Electrónicas
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Gestión y consulta de comprobantes electrónicos SRI
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButtons
              variant="compact"
              onExportExcel={() => exportToExcel(
                facturasFiltradas.map(f => ({
                  'N° Factura': f.numero_factura,
                  'Fecha': f.fecha_emision,
                  'Cliente': f.cliente_razon_social,
                  'RUC/Cédula': f.cliente_identificacion,
                  'Subtotal': f.subtotal,
                  'IVA': f.iva,
                  'Total': f.total,
                  'Estado': f.estado,
                  'N° Autorización': f.numero_autorizacion || '',
                  'Ambiente': f.ambiente,
                })),
                'facturas_electronicas',
                'Facturas',
              )}
              onExportPDF={() => exportToPDF(
                facturasFiltradas,
                [
                  { header: 'N° Factura', key: 'numero_factura' },
                  { header: 'Fecha', key: 'fecha_emision' },
                  { header: 'Cliente', key: 'cliente_razon_social' },
                  { header: 'Total', key: 'total' },
                  { header: 'Estado', key: 'estado' },
                ],
                'Consulta de Facturas Electrónicas',
                'facturas_electronicas',
              )}
            />
            <Button
              onClick={cargarFacturas}
              disabled={isLoading}
              className="bg-gradient-to-r from-[#F97316] to-[#C2410C] hover:from-[#F97316]/80 hover:to-[#C2410C]/80"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-white border-[#F97316]/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total Facturas</p>
                  <p className="text-2xl font-bold text-gray-900">{totales.todas}</p>
                </div>
                <FileText className="w-10 h-10 text-[#F97316]/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Autorizadas</p>
                  <p className="text-2xl font-bold text-green-400">{totales.autorizadas}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-400">{totales.pendientes}</p>
                </div>
                <Clock className="w-10 h-10 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Con Errores</p>
                  <p className="text-2xl font-bold text-red-400">{totales.errores}</p>
                </div>
                <XCircle className="w-10 h-10 text-red-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-[#C2410C]/20 to-[#F97316]/20 border-[#F97316]/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Monto Total</p>
                  <p className="text-2xl font-bold text-[#F97316]">${(totales.montoTotal || 0).toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 text-[#F97316]/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 pb-4">
        <Card className="bg-white border-[#F97316]/20">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label className="text-gray-900 text-sm mb-2 block">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <Input
                    placeholder="Número, clave, cliente..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="pl-10 bg-white border-[#F97316]/20 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-900 text-sm mb-2 block">Estado</Label>
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                  <SelectTrigger className="bg-white border-[#F97316]/20 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="AUTORIZADO">Autorizado</SelectItem>
                    <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                    <SelectItem value="NO_AUTORIZADO">No Autorizado</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-900 text-sm mb-2 block">Desde</Label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="bg-white border-[#F97316]/20 text-gray-900"
                />
              </div>

              <div>
                <Label className="text-gray-900 text-sm mb-2 block">Hasta</Label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="bg-white border-[#F97316]/20 text-gray-900"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Facturas */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        <Card className="bg-white border-[#F97316]/20 h-full">
          <CardContent className="p-0">
            <ScrollArea className="h-full">
              <div className="divide-y divide-[#F97316]/10">
                {facturasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>No se encontraron facturas</p>
                  </div>
                ) : (
                  facturasFiltradas.map((factura) => (
                    <div
                      key={factura.id}
                      className="p-4 hover:bg-[#F97316]/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-gray-900 font-bold text-lg">
                              {factura.numero_factura}
                            </h3>
                            {getEstadoBadge(factura.estado)}
                            <Badge variant="outline" className="border-[#F97316]/30 text-gray-600">
                              {factura.ambiente === 'pruebas' ? '🧪 Pruebas' : '🚀 Producción'}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Cliente</p>
                              <p className="text-gray-900 font-medium">{factura.cliente_razon_social}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Identificación</p>
                              <p className="text-gray-900">{factura.cliente_identificacion}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Fecha Emisión</p>
                              <p className="text-gray-900">
                                {factura.fecha_emision
                                ? (() => {
                                    try {
                                      // Combinar fecha + hora para interpretar como hora local Ecuador
                                      // "2026-05-27T14:30:00" (sin Z) → hora local → correcto
                                      const iso = factura.hora_emision
                                        ? `${factura.fecha_emision}T${factura.hora_emision}`
                                        : `${factura.fecha_emision}T12:00:00`;
                                      return new Date(iso).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
                                    } catch { return factura.fecha_emision; }
                                  })()
                                : '—'
                              }
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Total</p>
                              <p className="text-[#F97316] font-bold text-lg">
                                ${(Number(factura.total) || 0).toFixed(2)}
                              </p>
                            </div>
                          </div>

                          {factura.numero_autorizacion && (
                            <div className="mt-2 text-xs">
                              <p className="text-gray-600">
                                Autorización: <span className="text-green-400">{factura.numero_autorizacion}</span>
                              </p>
                            </div>
                          )}

                          {/* Solo mostrar mensajes SRI cuando la factura NO está autorizada */}
                          {factura.estado !== 'AUTORIZADO' && factura.mensajes_sri && factura.mensajes_sri.length > 0 && (
                            <div className="mt-2">
                              {factura.mensajes_sri.map((msg, idx) => (
                                <p key={idx} className={`text-xs ${
                                  factura.estado === 'NO_AUTORIZADO' || factura.estado === 'ERROR'
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                                }`}>
                                  ⚠ {msg}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verDetalles(factura)}
                            className="border-[#F97316]/20 text-gray-900 hover:bg-[#F97316]/10"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verRIDE(factura)}
                            className="border-[#F97316]/20 text-gray-900 hover:bg-[#F97316]/10"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => descargarXML(factura)}
                            className="border-[#F97316]/20 text-gray-900 hover:bg-[#F97316]/10"
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => abrirDialogEmail(factura)}
                            disabled={isLoading}
                            title={factura.cliente_email ? `Enviar a ${factura.cliente_email}` : 'Enviar por email'}
                            className={`border-[#F97316]/20 hover:bg-[#F97316]/10 ${(factura as any).email_enviado ? 'text-green-600' : 'text-gray-900'}`}
                          >
                            <Mail className="w-4 h-4" />
                          </Button>
                          {/* Nota de Crédito — solo para facturas autorizadas */}
                          {(factura.estado === 'AUTORIZADO' || (factura as any).estado_autorizacion === 'AUTORIZADO') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setFacturaParaNC(factura); setDialogNC(true); setNcMotivo(''); setNcTipo('total'); setNcMontoParcial(''); }}
                              title="Emitir Nota de Crédito"
                              className="border-red-300 text-red-500 hover:bg-red-50"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                          {/* Reintentar autorización */}
                          {(factura.estado === 'ERROR' || factura.estado === 'PENDIENTE' || factura.estado === 'NO_AUTORIZADO' || factura.estado === 'AUTORIZADO') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reintentarAutorizacion(factura)}
                              disabled={isLoading}
                              title={factura.estado === 'AUTORIZADO' ? 'Verificar autorización con SRI' : 'Reintentar autorización con el SRI'}
                              className={factura.estado === 'AUTORIZADO'
                                ? 'border-green-500/20 text-green-400 hover:bg-green-500/10'
                                : 'border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/10'}
                            >
                              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Dialog RIDE */}
      <Dialog open={dialogRIDE} onOpenChange={setDialogRIDE}>
        <DialogContent className="bg-white border-[#F97316]/20 max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#F97316]" />
              RIDE - Factura Electrónica
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {facturaSeleccionada && (
              <div className="overflow-y-auto max-h-[calc(90vh-150px)]">
                <RIDE factura={facturaSeleccionada} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-[#F97316]/20">
              <Button
                variant="outline"
                className="border-[#F97316]/20 text-gray-900"
                onClick={() => setDialogRIDE(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalles */}
      <Dialog open={dialogDetalles} onOpenChange={setDialogDetalles}>
        <DialogContent className="bg-white border-[#F97316]/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl">
              Detalles de la Factura
            </DialogTitle>
          </DialogHeader>
          
          {facturaSeleccionada && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-600 text-sm">Número</Label>
                  <p className="text-gray-900 font-bold">{facturaSeleccionada.numero_factura}</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Estado</Label>
                  <div className="mt-1">{getEstadoBadge(facturaSeleccionada.estado)}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-600 text-sm">Clave de Acceso</Label>
                  <p className="text-gray-900 font-mono text-xs break-all">
                    {facturaSeleccionada.clave_acceso}
                  </p>
                </div>
                {facturaSeleccionada.numero_autorizacion && (
                  <div className="col-span-2">
                    <Label className="text-gray-600 text-sm">Número de Autorización</Label>
                    <p className="text-green-400 font-mono text-xs">
                      {facturaSeleccionada.numero_autorizacion}
                    </p>
                  </div>
                )}
              </div>

              <Separator className="bg-[#F97316]/20" />

              <div>
                <Label className="text-gray-600 text-sm mb-2 block">Items</Label>
                <div className="bg-white border border-[#F97316]/20 rounded-lg p-3 max-h-40 overflow-auto">
                  {facturaSeleccionada.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm py-1">
                      <span className="text-gray-900">
                        {item.cantidad}x {item.nombre || item.descripcion || 'Producto'}
                      </span>
                      <span className="text-gray-600">${(Number(item.subtotal) || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-[#C2410C]/20 to-[#F97316]/20 border border-[#F97316]/20 rounded-lg p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="text-gray-900">${(Number(facturaSeleccionada.subtotal) || 0).toFixed(2)}</span>
                </div>
                {(Number(facturaSeleccionada.descuento) || 0) > 0 && (
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Descuento:</span>
                    <span className="text-red-400">-${(Number(facturaSeleccionada.descuento) || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">IVA 15%:</span>
                  <span className="text-gray-900">${(Number(facturaSeleccionada.iva) || 0).toFixed(2)}</span>
                </div>
                <Separator className="bg-[#F97316]/20 my-2" />
                <div className="flex justify-between">
                  <span className="text-gray-900 font-bold text-lg">Total:</span>
                  <span className="text-[#F97316] font-bold text-2xl">
                    ${(Number(facturaSeleccionada.total) || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Mensajes SRI */}
              {(facturaSeleccionada as any).mensajes_sri?.length > 0 && (
                <div>
                  <Label className="text-gray-600 text-sm mb-2 block">Mensajes SRI</Label>
                  <div className={`rounded-lg p-3 text-xs font-mono space-y-1 ${
                    facturaSeleccionada.estado === 'AUTORIZADO' ? 'bg-green-500/10 border border-green-500/20' :
                    facturaSeleccionada.estado === 'NO_AUTORIZADO' ? 'bg-red-500/10 border border-red-500/20' :
                    'bg-yellow-500/10 border border-yellow-500/20'
                  }`}>
                    {(facturaSeleccionada as any).mensajes_sri.map((msg: string, idx: number) => (
                      <p key={idx} className={
                        facturaSeleccionada.estado === 'AUTORIZADO' ? 'text-green-700' :
                        facturaSeleccionada.estado === 'NO_AUTORIZADO' ? 'text-red-600' :
                        'text-yellow-700'
                      }>{msg}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug: raw SRI response (only shown for non-authorized) */}
              {facturaSeleccionada.estado !== 'AUTORIZADO' && (facturaSeleccionada as any).debug_sri_response && (
                <div>
                  <Label className="text-gray-600 text-sm mb-2 block">Respuesta raw SRI (debug)</Label>
                  <pre className="bg-gray-50 border border-[#F97316]/10 rounded-lg p-2 text-[10px] text-gray-600 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                    {(facturaSeleccionada as any).debug_sri_response}
                  </pre>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() => setDialogDetalles(false)}
                  variant="outline"
                  className="border-[#F97316]/20 text-gray-900"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Enviar factura por email ── */}
      <Dialog open={dialogEmail} onOpenChange={setDialogEmail}>
        <DialogContent className="bg-white border-[#F97316]/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#F97316]" />
              Enviar Factura por Email
            </DialogTitle>
          </DialogHeader>

          {facturaParaEmail && (
            <div className="space-y-4 pt-2">
              {/* Resumen de la factura */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Factura</span>
                  <span className="font-semibold text-gray-900">{facturaParaEmail.numero_factura}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cliente</span>
                  <span className="text-gray-900">{facturaParaEmail.cliente_razon_social || 'Consumidor Final'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-[#C2410C]">${Number(facturaParaEmail.total || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Campo email */}
              <div className="space-y-2">
                <Label className="text-gray-700">
                  Email de destino <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  value={emailDestino}
                  onChange={e => setEmailDestino(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmarEnvioEmail()}
                  className="bg-gray-50 border-gray-200 text-gray-900"
                  autoFocus
                />
                {facturaParaEmail.cliente_email && facturaParaEmail.cliente_email !== emailDestino && (
                  <button
                    className="text-xs text-[#F97316] hover:underline"
                    onClick={() => setEmailDestino(facturaParaEmail.cliente_email!)}
                  >
                    Usar email del cliente: {facturaParaEmail.cliente_email}
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Se enviará el RIDE de la factura como email HTML al destinatario indicado.
              </p>

              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogEmail(false)}
                  disabled={enviandoEmail}
                  className="border-gray-200 text-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmarEnvioEmail}
                  disabled={enviandoEmail || !emailDestino}
                  className="bg-[#F97316] hover:bg-[#ea6c0d] text-white"
                >
                  {enviandoEmail
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Enviando…</>
                    : <><Send className="w-4 h-4 mr-2" />Enviar</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MODAL: NOTA DE CRÉDITO ─────────────────────────────────────────── */}
      <Dialog open={dialogNC} onOpenChange={v => { if (!v) { setDialogNC(false); setNcMotivo(''); } }}>
        <DialogContent className="bg-white border-[#F97316]/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-red-500" />
              Emitir Nota de Crédito
            </DialogTitle>
          </DialogHeader>

          {facturaParaNC && (
            <div className="space-y-4 mt-2">
              {/* Info factura original */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
                <div className="font-bold text-gray-900">Factura: {facturaParaNC.numero_factura}</div>
                <div className="text-gray-600 mt-0.5">
                  {facturaParaNC.cliente_razon_social} · Total: <strong>${Number(facturaParaNC.total||0).toFixed(2)}</strong>
                </div>
                <div className="text-xs text-green-600 mt-1">✅ {facturaParaNC.numero_autorizacion || 'Autorizada'}</div>
              </div>

              {/* Tipo de nota de crédito */}
              <div>
                <Label className="text-xs text-gray-600 block mb-2">Tipo de nota de crédito</Label>
                <div className="flex gap-2">
                  <button onClick={() => setNcTipo('total')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${ncTipo==='total' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
                    Anulación total<br/>
                    <span className="font-normal text-xs">${Number(facturaParaNC.total||0).toFixed(2)}</span>
                  </button>
                  <button onClick={() => setNcTipo('parcial')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${ncTipo==='parcial' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                    Ajuste parcial<br/>
                    <span className="font-normal text-xs">Monto a acreditar</span>
                  </button>
                </div>
              </div>

              {/* Monto parcial */}
              {ncTipo === 'parcial' && (
                <div>
                  <Label className="text-xs text-gray-600">Monto a acreditar (máx. ${Number(facturaParaNC.total||0).toFixed(2)})</Label>
                  <input type="number" value={ncMontoParcial}
                    onChange={e => setNcMontoParcial(e.target.value)}
                    max={Number(facturaParaNC.total||0)}
                    placeholder="0.00"
                    className="w-full mt-1 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900 font-mono"/>
                </div>
              )}

              {/* Motivo */}
              <div>
                <Label className="text-xs text-gray-600">Motivo <span className="text-red-500">*</span></Label>
                <select value={ncMotivo} onChange={e => setNcMotivo(e.target.value)}
                  className="w-full mt-1 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900">
                  <option value="">— Seleccionar motivo —</option>
                  <option value="Error en facturación">Error en facturación</option>
                  <option value="Devolución de mercadería">Devolución de mercadería</option>
                  <option value="Descuento no aplicado">Descuento no aplicado</option>
                  <option value="Error en precio">Error en precio</option>
                  <option value="Error en cantidad">Error en cantidad</option>
                  <option value="Anulación de venta">Anulación de venta</option>
                  <option value="Otro">Otro</option>
                </select>
                {ncMotivo === 'Otro' && (
                  <input className="w-full mt-2 border border-orange-200 rounded px-3 py-2 text-sm bg-white text-gray-900"
                    placeholder="Describir el motivo…"
                    onChange={e => setNcMotivo(e.target.value === 'Otro' ? '' : e.target.value)}/>
                )}
              </div>

              {/* Advertencia */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <strong>⚠️ Importante:</strong> La nota de crédito será enviada al SRI para autorización.
                Una vez autorizada, queda registrada y no se puede deshacer.
                El SRI requiere conservar la nota de crédito junto con la factura original.
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialogNC(false)} className="flex-1 border-gray-200 text-gray-700">
                  Cancelar
                </Button>
                <Button onClick={emitirNotaCredito} disabled={ncEmitiendo || !ncMotivo}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-500 text-white">
                  {ncEmitiendo
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin"/>Enviando al SRI…</>
                    : <><RotateCcw className="w-4 h-4 mr-2"/>Emitir Nota de Crédito</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
