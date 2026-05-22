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
  FileDown
} from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  secuencial: number;
  clave_acceso: string;
  fecha_emision: string;
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
        setFacturas(data.facturas || []);
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

  const enviarPorEmail = async (factura: Factura) => {
    if (!factura.cliente_email) {
      toast.error('Cliente no tiene email registrado');
      return;
    }

    setIsLoading(true);
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
            factura_id: factura.id
          }),
        }
      );

      if (response.ok) {
        toast.success(`Email enviado a ${factura.cliente_email}`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error enviando email');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error de conexión');
    } finally {
      setIsLoading(false);
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
    montoTotal: facturas.reduce((sum, f) => sum + f.total, 0)
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-[#0A1A2F] to-[#0F2744]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A1A2F] to-[#1e64a7] p-6 border-b border-[#00E5FF]/20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <FileText className="w-8 h-8 text-[#00E5FF]" />
              Consulta de Facturas Electrónicas
            </h1>
            <p className="text-sm text-gray-300 mt-2">
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
              className="bg-gradient-to-r from-[#00E5FF] to-[#1e64a7] hover:from-[#00E5FF]/80 hover:to-[#1e64a7]/80"
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
          <Card className="bg-[#0A1A2F]/60 border-[#00E5FF]/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Facturas</p>
                  <p className="text-2xl font-bold text-white">{totales.todas}</p>
                </div>
                <FileText className="w-10 h-10 text-[#00E5FF]/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/60 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Autorizadas</p>
                  <p className="text-2xl font-bold text-green-400">{totales.autorizadas}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/60 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-400">{totales.pendientes}</p>
                </div>
                <Clock className="w-10 h-10 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A1A2F]/60 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Con Errores</p>
                  <p className="text-2xl font-bold text-red-400">{totales.errores}</p>
                </div>
                <XCircle className="w-10 h-10 text-red-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-[#1e64a7]/20 to-[#00E5FF]/20 border-[#00E5FF]/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Monto Total</p>
                  <p className="text-2xl font-bold text-[#00E5FF]">${totales.montoTotal.toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 text-[#00E5FF]/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 pb-4">
        <Card className="bg-[#0A1A2F]/60 border-[#00E5FF]/20">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label className="text-white text-sm mb-2 block">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Número, clave, cliente..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="pl-10 bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-white text-sm mb-2 block">Estado</Label>
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                  <SelectTrigger className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white">
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
                <Label className="text-white text-sm mb-2 block">Desde</Label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white"
                />
              </div>

              <div>
                <Label className="text-white text-sm mb-2 block">Hasta</Label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Facturas */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        <Card className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 h-full">
          <CardContent className="p-0">
            <ScrollArea className="h-full">
              <div className="divide-y divide-[#00E5FF]/10">
                {facturasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>No se encontraron facturas</p>
                  </div>
                ) : (
                  facturasFiltradas.map((factura) => (
                    <div
                      key={factura.id}
                      className="p-4 hover:bg-[#00E5FF]/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-white font-bold text-lg">
                              {factura.numero_factura}
                            </h3>
                            {getEstadoBadge(factura.estado)}
                            <Badge variant="outline" className="border-[#00E5FF]/30 text-gray-400">
                              {factura.ambiente === 'pruebas' ? '🧪 Pruebas' : '🚀 Producción'}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-400">Cliente</p>
                              <p className="text-white font-medium">{factura.cliente_razon_social}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Identificación</p>
                              <p className="text-white">{factura.cliente_identificacion}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Fecha Emisión</p>
                              <p className="text-white">
                                {new Date(factura.fecha_emision).toLocaleString('es-EC', {
                                  dateStyle: 'short',
                                  timeStyle: 'short'
                                })}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400">Total</p>
                              <p className="text-[#00E5FF] font-bold text-lg">
                                ${factura.total.toFixed(2)}
                              </p>
                            </div>
                          </div>

                          {factura.numero_autorizacion && (
                            <div className="mt-2 text-xs">
                              <p className="text-gray-400">
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
                            className="border-[#00E5FF]/20 text-white hover:bg-[#00E5FF]/10"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verRIDE(factura)}
                            className="border-[#00E5FF]/20 text-white hover:bg-[#00E5FF]/10"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => descargarXML(factura)}
                            className="border-[#00E5FF]/20 text-white hover:bg-[#00E5FF]/10"
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                          {factura.cliente_email && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => enviarPorEmail(factura)}
                              disabled={isLoading}
                              className="border-[#00E5FF]/20 text-white hover:bg-[#00E5FF]/10"
                            >
                              <Mail className="w-4 h-4" />
                            </Button>
                          )}
                          {/* Mostrar Reintentar para TODOS los estados — permite re-verificar facturas
                              marcadas incorrectamente como AUTORIZADO por bug anterior */}
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
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/20 max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#00E5FF]" />
              RIDE - Factura Electrónica
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {facturaSeleccionada && (
              <div className="overflow-y-auto max-h-[calc(90vh-150px)]">
                <RIDE factura={facturaSeleccionada} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-[#00E5FF]/20">
              <Button
                onClick={() => window.print()}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button
                onClick={() => setDialogRIDE(false)}
                variant="outline"
                className="border-[#00E5FF]/20 text-white"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalles */}
      <Dialog open={dialogDetalles} onOpenChange={setDialogDetalles}>
        <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">
              Detalles de la Factura
            </DialogTitle>
          </DialogHeader>
          
          {facturaSeleccionada && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-sm">Número</Label>
                  <p className="text-white font-bold">{facturaSeleccionada.numero_factura}</p>
                </div>
                <div>
                  <Label className="text-gray-400 text-sm">Estado</Label>
                  <div className="mt-1">{getEstadoBadge(facturaSeleccionada.estado)}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-400 text-sm">Clave de Acceso</Label>
                  <p className="text-white font-mono text-xs break-all">
                    {facturaSeleccionada.clave_acceso}
                  </p>
                </div>
                {facturaSeleccionada.numero_autorizacion && (
                  <div className="col-span-2">
                    <Label className="text-gray-400 text-sm">Número de Autorización</Label>
                    <p className="text-green-400 font-mono text-xs">
                      {facturaSeleccionada.numero_autorizacion}
                    </p>
                  </div>
                )}
              </div>

              <Separator className="bg-[#00E5FF]/20" />

              <div>
                <Label className="text-gray-400 text-sm mb-2 block">Items</Label>
                <div className="bg-[#0A1A2F]/60 border border-[#00E5FF]/20 rounded-lg p-3 max-h-40 overflow-auto">
                  {facturaSeleccionada.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm py-1">
                      <span className="text-white">
                        {item.cantidad}x {item.nombre}
                      </span>
                      <span className="text-gray-400">${item.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-[#1e64a7]/20 to-[#00E5FF]/20 border border-[#00E5FF]/20 rounded-lg p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Subtotal:</span>
                  <span className="text-white">${facturaSeleccionada.subtotal.toFixed(2)}</span>
                </div>
                {facturaSeleccionada.descuento > 0 && (
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Descuento:</span>
                    <span className="text-red-400">-${facturaSeleccionada.descuento.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">IVA 15%:</span>
                  <span className="text-white">${facturaSeleccionada.iva.toFixed(2)}</span>
                </div>
                <Separator className="bg-[#00E5FF]/20 my-2" />
                <div className="flex justify-between">
                  <span className="text-white font-bold text-lg">Total:</span>
                  <span className="text-[#00E5FF] font-bold text-2xl">
                    ${facturaSeleccionada.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Mensajes SRI */}
              {(facturaSeleccionada as any).mensajes_sri?.length > 0 && (
                <div>
                  <Label className="text-gray-400 text-sm mb-2 block">Mensajes SRI</Label>
                  <div className={`rounded-lg p-3 text-xs font-mono space-y-1 ${
                    facturaSeleccionada.estado === 'AUTORIZADO' ? 'bg-green-500/10 border border-green-500/20' :
                    facturaSeleccionada.estado === 'NO_AUTORIZADO' ? 'bg-red-500/10 border border-red-500/20' :
                    'bg-yellow-500/10 border border-yellow-500/20'
                  }`}>
                    {(facturaSeleccionada as any).mensajes_sri.map((msg: string, idx: number) => (
                      <p key={idx} className={
                        facturaSeleccionada.estado === 'AUTORIZADO' ? 'text-green-300' :
                        facturaSeleccionada.estado === 'NO_AUTORIZADO' ? 'text-red-300' :
                        'text-yellow-300'
                      }>{msg}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug: raw SRI response (only shown for non-authorized) */}
              {facturaSeleccionada.estado !== 'AUTORIZADO' && (facturaSeleccionada as any).debug_sri_response && (
                <div>
                  <Label className="text-gray-400 text-sm mb-2 block">Respuesta raw SRI (debug)</Label>
                  <pre className="bg-[#060f1e] border border-[#00E5FF]/10 rounded-lg p-2 text-[10px] text-gray-400 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                    {(facturaSeleccionada as any).debug_sri_response}
                  </pre>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() => setDialogDetalles(false)}
                  variant="outline"
                  className="border-[#00E5FF]/20 text-white"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
