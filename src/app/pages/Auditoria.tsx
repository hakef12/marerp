import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Shield, Activity, AlertTriangle, Eye, Download, FileSpreadsheet, FileText } from 'lucide-react';
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
      if (filtroModulo !== 'todos') {
        params.append('modulo', filtroModulo);
      }

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

  const getAccionBadge = (accion: string) => {
    const styles = {
      crear: 'bg-green-500/20 text-green-400 border-green-500/30',
      editar: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      eliminar: 'bg-red-500/20 text-red-400 border-red-500/30',
      login: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };
    return styles[accion as keyof typeof styles] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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
    const worksheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs de Auditoría');
    XLSX.writeFile(workbook, 'logs_auditoria.xlsx');
    toast.success('Logs exportados a Excel');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.autoTable({
      head: [['Fecha/Hora', 'Usuario', 'Acción', 'Módulo', 'Descripción']],
      body: logs.map(log => [
        new Date(log.created_at).toLocaleString(),
        log.usuarios?.nombre_completo || 'Sistema',
        log.accion,
        log.modulo,
        log.descripcion || `${log.accion} en ${log.tabla}`
      ]),
      startY: 20,
      theme: 'grid'
    });
    doc.save('logs_auditoria.pdf');
    toast.success('Logs exportados a PDF');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8 text-[#00E5FF]" />
          Módulo de Auditoría
        </h1>
        <p className="text-gray-400">Seguimiento y control de actividades del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Eventos Hoy</CardTitle>
            <Activity className="w-5 h-5 text-[#00E5FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{logs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Anomalías</CardTitle>
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-400">{anomalias.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Sesiones Activas</CardTitle>
            <Eye className="w-5 h-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">5</div>
          </CardContent>
        </Card>

        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Intentos Fallidos</CardTitle>
            <Shield className="w-5 h-5 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">0</div>
          </CardContent>
        </Card>
      </div>

      {/* Anomalías */}
      {anomalias.length > 0 && (
        <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-orange-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Anomalías Detectadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {anomalias.map((anomalia) => (
                <div key={anomalia.id} className="p-4 rounded-lg bg-white/5 border border-orange-500/20">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getSeveridadBadge(anomalia.severidad)}>
                          {anomalia.severidad}
                        </Badge>
                        <span className="text-gray-400 text-sm">{anomalia.modulo}</span>
                      </div>
                      <p className="text-white">{anomalia.descripcion}</p>
                    </div>
                    <span className="text-gray-400 text-xs">
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
      <Card className="bg-[#0A1A2F]/60 backdrop-blur-xl border-[#00E5FF]/20">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#00E5FF]" />
              Registro de Actividades
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Select value={filtroModulo} onValueChange={setFiltroModulo}>
                <SelectTrigger className="w-48 bg-white/5 border-[#00E5FF]/20 text-white">
                  <SelectValue placeholder="Filtrar módulo" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                  <SelectItem value="todos">Todos los módulos</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="inventario">Inventario</SelectItem>
                  <SelectItem value="contabilidad">Contabilidad</SelectItem>
                  <SelectItem value="cocina">Cocina</SelectItem>
                  <SelectItem value="auditoria">Auditoría</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30"
                onClick={exportToExcel}
                disabled={isLoading || logs.length === 0}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button
                variant="outline"
                className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                onClick={exportToPDF}
                disabled={isLoading || logs.length === 0}
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scroll-top">
            <Table>
              <TableHeader>
                <TableRow className="border-[#00E5FF]/20 hover:bg-transparent">
                  <TableHead className="text-gray-400">Fecha/Hora</TableHead>
                  <TableHead className="text-gray-400">Usuario</TableHead>
                  <TableHead className="text-gray-400">Acción</TableHead>
                  <TableHead className="text-gray-400">Módulo</TableHead>
                  <TableHead className="text-gray-400">Descripción</TableHead>
                  <TableHead className="text-gray-400">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#00E5FF]"></div>
                        Cargando registros...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No hay registros de actividad</p>
                      <p className="text-sm mt-2">Las acciones del sistema se registrarán aquí</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.slice(0, 100).map((log) => (
                    <TableRow key={log.id} className="border-[#00E5FF]/10 hover:bg-white/5">
                      <TableCell className="text-gray-400 text-sm whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('es-ES', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="text-white">
                        {log.usuarios?.nombre_completo || 'Sistema'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getAccionBadge(log.accion)}>
                          {log.accion}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 capitalize">{log.modulo}</TableCell>
                      <TableCell className="text-gray-300 text-sm max-w-md truncate">
                        {log.descripcion || `${log.accion} en ${log.tabla}`}
                      </TableCell>
                      <TableCell className="text-gray-400 text-xs">
                        {log.ip_address || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {logs.length > 100 && (
            <p className="text-gray-400 text-sm text-center mt-4">
              Mostrando los primeros 100 registros de {logs.length} totales
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}