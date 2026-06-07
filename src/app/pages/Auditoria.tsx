import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Shield, Activity, AlertTriangle, Eye, Download, FileSpreadsheet, FileText, Calendar, RefreshCw, XCircle } from 'lucide-react';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function Auditoria() {
  const { token, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [anomalias, setAnomalias] = useState<any[]>([]);
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const [kpis, setKpis] = useState<any>(null);

  // Filtros de fecha y búsqueda
  // Fecha de hoy en horario de Ecuador (UTC-5) — evita que entre 19:00 y 23:59
  // hora local el filtro por defecto muestre "mañana" (fecha UTC) en vez de hoy.
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin]       = useState(hoy);
  const [busqueda, setBusqueda]       = useState('');

  useEffect(() => {
    if (token) {
      fetchAuditoriaData();
    }
  }, [token, filtroModulo]);

  const fetchAuditoriaData = async () => {
    if (!token) {
      console.log('⏳ No hay token, esperando...');
      return;
    }

    try {
      setIsLoading(true);
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      
      // Construir parámetros de filtro
      const params = new URLSearchParams();
      if (filtroModulo !== 'todos') params.append('modulo', filtroModulo);
      if (fechaInicio)              params.append('desde', fechaInicio);
      if (fechaFin)                 params.append('hasta', fechaFin + 'T23:59:59');
      params.append('limite', '500');

      // Obtener logs de auditoría
      const logsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/auditoria/logs?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token
          }
        }
      );

      if (logsResponse.status === 401) {
        console.error('Token expirado en auditoría');
        logout();
        return;
      }

      if (logsResponse.ok) {
        const data = await logsResponse.json();
        console.log('📋 Logs de auditoría recibidos:', data.logs?.length || 0);
        setLogs(data.logs || []);
      } else {
        const error = await logsResponse.text();
        console.error('Error cargando logs:', error);
      }

      // Obtener KPIs de auditoría
      const kpisResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/auditoria/kpis`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-User-Token': token
          }
        }
      );

      if (kpisResponse.ok) {
        const data = await kpisResponse.json();
        console.log('📊 KPIs de auditoría recibidos:', data);
        setKpis(data);
        setAnomalias(data.anomalias || []);
      }

    } catch (error) {
      console.error('Error cargando datos de auditoría:', error);
      toast.error('Error al cargar datos de auditoría');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrado local por búsqueda de texto (sobre los logs ya cargados)
  const logsVisibles = logs.filter(log => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    const usuario  = (log.usuarios?.nombre_completo || '').toLowerCase();
    const desc     = (log.descripcion || '').toLowerCase();
    const accion   = (log.accion || '').toLowerCase();
    const modulo   = (log.modulo || '').toLowerCase();
    const ip       = (log.ip_address || '').toLowerCase();
    return usuario.includes(q) || desc.includes(q) || accion.includes(q) || modulo.includes(q) || ip.includes(q);
  });

  const getAccionBadge = (accion: string) => {
    const styles = {
      crear: 'bg-green-500/20 text-green-400 border-green-500/30',
      editar: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      eliminar: 'bg-red-500/20 text-red-400 border-red-500/30',
      login: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };
    return styles[accion as keyof typeof styles] || 'bg-gray-500/20 text-gray-600 border-gray-500/30';
  };

  const getSeveridadBadge = (severidad: string) => {
    const styles = {
      critica: 'bg-red-500/20 text-red-400 border-red-500/30',
      alta: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      media: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      baja: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return styles[severidad as keyof typeof styles] || styles.media;
  };

  const exportToExcel = () => {
    const rows = logsVisibles.map(log => ({
      'Fecha/Hora': new Date(log.created_at).toLocaleString('es-ES'),
      'Usuario':    log.usuarios?.nombre_completo || 'Sistema',
      'Acción':     log.accion,
      'Módulo':     log.modulo,
      'Tabla':      log.tabla || '',
      'Descripción':log.descripcion || '',
      'IP':         log.ip_address || '',
      'Resultado':  log.resultado || '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs de Auditoría');
    XLSX.writeFile(workbook, `auditoria_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Logs exportados a Excel');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Reporte de Auditoría', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 14, 22);
    (doc as any).autoTable({
      head: [['Fecha/Hora', 'Usuario', 'Acción', 'Módulo', 'Descripción', 'IP']],
      body: logsVisibles.map(log => [
        new Date(log.created_at).toLocaleString('es-ES'),
        log.usuarios?.nombre_completo || 'Sistema',
        log.accion,
        log.modulo,
        log.descripcion || `${log.accion} en ${log.tabla}`,
        log.ip_address || '-'
      ]),
      startY: 27,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] }
    });
    doc.save(`auditoria_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Logs exportados a PDF');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8 text-[#F97316]" />
          Módulo de Auditoría
        </h1>
        <p className="text-gray-600">Seguimiento y control de actividades del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Eventos Hoy</CardTitle>
            <Activity className="w-5 h-5 text-[#F97316]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{kpis?.total_hoy ?? 0}</div>
            <p className="text-xs text-gray-400 mt-1">Últimas 24 h</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Anomalías</CardTitle>
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-400">{anomalias.length}</div>
            <p className="text-xs text-gray-400 mt-1">{anomalias.length === 0 ? 'Sin alertas activas' : 'Requieren atención'}</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Eventos (7 días)</CardTitle>
            <Eye className="w-5 h-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">{kpis?.total_7d ?? 0}</div>
            <p className="text-xs text-gray-400 mt-1">{kpis?.eliminaciones_hoy ? `${kpis.eliminaciones_hoy} eliminaciones hoy` : 'Actividad semanal'}</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#F97316]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Errores Registrados</CardTitle>
            <XCircle className="w-5 h-5 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{kpis?.errores_hoy ?? 0}</div>
            <p className="text-xs text-gray-400 mt-1">Últimas 24 h</p>
          </CardContent>
        </Card>
      </div>

      {/* Anomalías */}
      {anomalias.length > 0 && (
        <Card className="bg-white border-orange-500/30">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Anomalías Detectadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {anomalias.map((anomalia) => (
                <div key={anomalia.id} className="p-4 rounded-lg bg-gray-50 border border-orange-500/20">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getSeveridadBadge(anomalia.severidad)}>
                          {anomalia.severidad}
                        </Badge>
                        <span className="text-gray-600 text-sm">{anomalia.modulo}</span>
                      </div>
                      <p className="text-gray-900">{anomalia.descripcion}</p>
                    </div>
                    <span className="text-gray-600 text-xs">
                      {new Date(anomalia.fecha_deteccion).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log de Actividades */}
      <Card className="bg-white border-[#F97316]/20">
        <CardHeader>
          <div className="flex flex-col gap-4">
            {/* Título + exportar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#F97316]" />
                Registro de Actividades
                <span className="text-sm font-normal text-gray-400 ml-1">({logsVisibles.length} registros)</span>
              </CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
                  onClick={fetchAuditoriaData}
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-green-500/20 text-green-700 border-green-500/30 hover:bg-green-500/30"
                  onClick={exportToExcel}
                  disabled={isLoading || logsVisibles.length === 0}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-red-500/20 text-red-700 border-red-500/30 hover:bg-red-500/30"
                  onClick={exportToPDF}
                  disabled={isLoading || logsVisibles.length === 0}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-end">
              {/* Módulo */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Módulo</label>
                <Select value={filtroModulo} onValueChange={setFiltroModulo}>
                  <SelectTrigger className="w-44 bg-gray-50 border-gray-200 text-gray-900 h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="todos">Todos los módulos</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="inventario">Inventario</SelectItem>
                    <SelectItem value="contabilidad">Contabilidad</SelectItem>
                    <SelectItem value="cocina">Cocina</SelectItem>
                    <SelectItem value="facturacion">Facturación</SelectItem>
                    <SelectItem value="auditoria">Auditoría</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fecha inicio */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Desde</label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={e => setFechaInicio(e.target.value)}
                  className="h-9 bg-gray-50 border-gray-200 text-gray-900 w-40"
                />
              </div>

              {/* Fecha fin */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Hasta</label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                  className="h-9 bg-gray-50 border-gray-200 text-gray-900 w-40"
                />
              </div>

              {/* Buscar */}
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-gray-500 mb-1 block">Buscar</label>
                <Input
                  placeholder="Usuario, acción, descripción..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="h-9 bg-gray-50 border-gray-200 text-gray-900"
                />
              </div>

              <Button
                size="sm"
                className="bg-[#F97316] hover:bg-[#ea6c0d] text-white h-9"
                onClick={fetchAuditoriaData}
                disabled={isLoading}
              >
                Buscar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scroll-top">
            <Table>
              <TableHeader>
                <TableRow className="border-[#F97316]/20 hover:bg-transparent">
                  <TableHead className="text-gray-600">Fecha/Hora</TableHead>
                  <TableHead className="text-gray-600">Usuario</TableHead>
                  <TableHead className="text-gray-600">Acción</TableHead>
                  <TableHead className="text-gray-600">Módulo</TableHead>
                  <TableHead className="text-gray-600">Descripción</TableHead>
                  <TableHead className="text-gray-600">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-600 py-8">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#F97316]"></div>
                        Cargando registros...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logsVisibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-600 py-8">
                      <Shield className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-400" />
                      <p>{logs.length === 0 ? 'No hay registros de actividad' : 'Ningún registro coincide con el filtro'}</p>
                      <p className="text-sm mt-2 text-gray-400">{logs.length === 0 ? 'Las acciones del sistema se registrarán aquí' : `${logs.length} registros en total — ajusta los filtros`}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logsVisibles.slice(0, 200).map((log) => (
                    <TableRow key={log.id} className="border-[#F97316]/10 hover:bg-gray-50">
                      <TableCell className="text-gray-600 text-sm whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('es-ES', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="text-gray-900">
                        {log.usuarios?.nombre_completo || 'Sistema'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getAccionBadge(log.accion)}>
                          {log.accion}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 capitalize">{log.modulo}</TableCell>
                      <TableCell className="text-gray-600 text-sm max-w-md truncate">
                        {log.descripcion || `${log.accion} en ${log.tabla}`}
                      </TableCell>
                      <TableCell className="text-gray-600 text-xs">
                        {log.ip_address || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {logsVisibles.length > 200 && (
            <p className="text-gray-500 text-sm text-center mt-4">
              Mostrando los primeros 200 de {logsVisibles.length} registros filtrados
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}