import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Settings, Building2, Users, Activity, RefreshCw,
  Shield, ChevronDown, CheckCircle, XCircle, Zap,
  TrendingUp, Utensils, Crown, Calendar, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

const PLANES = [
  {
    codigo: 'basico',
    nombre: 'Básico',
    precio: 49,
    color: 'from-blue-500 to-cyan-500',
    icon: Zap,
    modulos: 'POS + Inventario',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  {
    codigo: 'profesional',
    nombre: 'Profesional',
    precio: 129,
    color: 'from-purple-500 to-pink-500',
    icon: TrendingUp,
    modulos: 'Todos los módulos',
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  {
    codigo: 'restaurante',
    nombre: 'Restaurante',
    precio: 99,
    color: 'from-orange-500 to-red-500',
    icon: Utensils,
    modulos: 'POS + Cocina + Mesas',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  {
    codigo: 'enterprise',
    nombre: 'Enterprise',
    precio: 299,
    color: 'from-yellow-500 to-amber-500',
    icon: Crown,
    modulos: 'Todo ilimitado',
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
];

function getPlanBadge(planTipo: string) {
  const plan = PLANES.find(p => p.codigo === planTipo);
  return plan ? plan.badge : 'bg-gray-500/20 text-gray-600 border-gray-500/30';
}

function getPlanNombre(planTipo: string) {
  const plan = PLANES.find(p => p.codigo === planTipo);
  return plan ? plan.nombre : planTipo;
}

interface Empresa {
  id: string;
  nombre: string;
  ruc_nit: string;
  email: string;
  plan_tipo: string;
  estado: string;
  fecha_registro: string;
  fecha_expiracion: string | null;
  modulos_activos: Record<string, boolean>;
}

interface GestionModalProps {
  empresa: Empresa;
  onClose: () => void;
  onSave: () => void;
  token: string;
  projectId: string;
}

function GestionModal({ empresa, onClose, onSave, token, projectId }: GestionModalProps) {
  const [planSeleccionado, setPlanSeleccionado] = useState(empresa.plan_tipo);
  const [fechaExpiracion, setFechaExpiracion] = useState(
    empresa.fecha_expiracion
      ? new Date(empresa.fecha_expiracion).toISOString().split('T')[0]
      : ''
  );
  const [loading, setLoading] = useState(false);

  const guardar = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/empresas/${empresa.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_tipo: planSeleccionado,
            fecha_expiracion: fechaExpiracion ? new Date(fechaExpiracion).toISOString() : undefined,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al actualizar');
      }
      toast.success(`Plan de ${empresa.nombre} actualizado a ${getPlanNombre(planSeleccionado)}`);
      onSave();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-[#F97316]/30 rounded-2xl w-full max-w-lg shadow-2xl shadow-[#F97316]/10">
        {/* Header */}
        <div className="p-6 border-b border-[#F97316]/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FB923C] to-[#F97316] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-gray-900" />
            </div>
            <div>
              <h2 className="text-gray-900 font-bold text-lg">{empresa.nombre}</h2>
              <p className="text-gray-600 text-sm">RUC: {empresa.ruc_nit}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Selector de plan */}
          <div>
            <Label className="text-gray-600 mb-3 block">Plan de Suscripción</Label>
            <div className="grid grid-cols-2 gap-3">
              {PLANES.map((plan) => {
                const Icon = plan.icon;
                const isSelected = planSeleccionado === plan.codigo;
                return (
                  <button
                    key={plan.codigo}
                    onClick={() => setPlanSeleccionado(plan.codigo)}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-[#F97316] bg-[#F97316]/10 scale-[1.02]'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-[#F97316]" />
                    )}
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center mb-2`}>
                      <Icon className="w-4 h-4 text-gray-900" />
                    </div>
                    <p className="text-gray-900 font-semibold text-sm">{plan.nombre}</p>
                    <p className="text-gray-600 text-xs">{plan.modulos}</p>
                    <p className="text-[#F97316] font-bold text-sm mt-1">${plan.precio}/mes</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fecha de expiración */}
          <div>
            <Label htmlFor="fecha-exp" className="text-gray-600 mb-2 block flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Fecha de expiración del plan
            </Label>
            <Input
              id="fecha-exp"
              type="date"
              value={fechaExpiracion}
              onChange={(e) => setFechaExpiracion(e.target.value)}
              className="bg-gray-50 border-[#F97316]/20 text-gray-900"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#F97316]/20 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-600 text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-[#FB923C] to-[#F97316] text-white hover:opacity-90"
          >
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const { token, user } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<Empresa | null>(null);
  const [projectId, setProjectId] = useState('');
  const [reparando, setReparando] = useState<string | null>(null);
  const [resultadoReparacion, setResultadoReparacion] = useState<any>(null);
  const [empresaReparar, setEmpresaReparar] = useState('');
  const [infoKV, setInfoKV] = useState<any>(null);
  const [inspeccionKV, setInspeccionKV] = useState<any>(null);

  const callAdmin = async (pid: string, endpoint: string, method = 'GET') => {
    const { publicAnonKey } = await import('/utils/supabase/info');
    const res = await fetch(`https://${pid}.supabase.co/functions/v1/server${endpoint}`, {
      method,
      headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
    });
    return res.json();
  };

  const ejecutarDiagnostico = async () => {
    setReparando('diagnostico');
    setResultadoReparacion(null);
    try {
      const data = await callAdmin(projectId, '/admin/diagnostico-completo');
      setResultadoReparacion({ tipo: 'diagnostico', data });
      setInfoKV(data.datos_por_empresa_kv || {});
      // Auto-seleccionar la empresa con más datos
      const conDatos = Object.entries(data.datos_por_empresa_kv || {})
        .sort(([,a]: any, [,b]: any) => (b.productos + b.ventas) - (a.productos + a.ventas));
      if (conDatos.length > 0 && !empresaReparar) setEmpresaReparar(conDatos[0][0]);
    } catch (e: any) {
      toast.error('Error en diagnóstico: ' + e.message);
    } finally { setReparando(null); }
  };

  const ejecutarInspeccion = async (eid: string) => {
    setReparando('inspeccion-' + eid);
    setInspeccionKV(null);
    try {
      const data = await callAdmin(projectId, `/admin/inspeccionar-kv?empresa_id=${eid}`);
      setInspeccionKV({ empresa_id: eid, ...data });
      setResultadoReparacion({ tipo: 'inspeccion', data });
    } catch (e: any) {
      toast.error('Error al inspeccionar KV: ' + e.message);
    } finally { setReparando(null); }
  };

  const ejecutarColumnasSql = async (eid: string) => {
    setReparando('columnas-' + eid);
    try {
      const data = await callAdmin(projectId, `/admin/columnas-sql`);
      setResultadoReparacion({ tipo: 'columnas_sql', data });
    } catch (e: any) {
      toast.error('Error al consultar columnas SQL: ' + e.message);
    } finally { setReparando(null); }
  };

  const ejecutarFixPrecios = async () => {
    const eid = empresaReparar;
    if (!eid) { toast.error('Selecciona una empresa primero'); return; }
    setReparando('precios');
    try {
      const data = await callAdmin(projectId, `/admin/fix-precios?empresa_id=${eid}`);
      setResultadoReparacion({ tipo: 'fix-precios', data });
      toast.success('✅ Precios actualizados desde KV');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally { setReparando(null); }
  };

  const ejecutarRestaurar = async (eid: string) => {
    if (!eid) { toast.error('Selecciona una empresa'); return; }
    if (!confirm(`⚠️ RESTAURACIÓN COMPLETA de empresa ${eid}\n\nEsto restaurará:\n• Productos (con precios)\n• Recetas/Fichas técnicas\n• Ventas históricas\n• Compras\n• Clientes\n• Proveedores (con RUC)\n• Bodegas\n\n¿Continuar?`)) return;
    setReparando('restaurar-' + eid);
    try {
      const data = await callAdmin(projectId, `/admin/restaurar-completo?empresa_id=${eid}`, 'POST');
      setResultadoReparacion({ tipo: 'restaurar', empresa: eid, data });
      toast.success('✅ Restauración completa desde KV');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally { setReparando(null); }
  };

  useEffect(() => {
    if (user?.rol !== 'super_admin') return;
    import('/utils/supabase/info').then(({ projectId: pid }) => {
      setProjectId(pid);
      fetchEmpresas(pid);
      fetchStats(pid);
    });
  }, []);

  const fetchEmpresas = async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${pid}.supabase.co/functions/v1/server/admin/empresas`,
        { headers: { 'Authorization': `Bearer ${token}`, 'X-User-Token': token! } }
      );
      if (res.ok) {
        const data = await res.json();
        setEmpresas(data.empresas || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (pid: string) => {
    try {
      const res = await fetch(
        `https://${pid}.supabase.co/functions/v1/server/admin/estadisticas`,
        { headers: { 'Authorization': `Bearer ${token}`, 'X-User-Token': token! } }
      );
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const cambiarEstado = async (empresaId: string, nuevoEstado: string) => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/admin/empresas/${empresaId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-User-Token': token!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estado: nuevoEstado }),
        }
      );
      if (res.ok) {
        toast.success(`Empresa ${nuevoEstado === 'activo' ? 'activada' : 'suspendida'}`);
        fetchEmpresas(projectId);
      }
    } catch (e) {
      toast.error('Error al actualizar estado');
    }
  };

  if (user?.rol !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-white border-red-500/30 max-w-md">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-gray-900 text-2xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-gray-600">Solo Super Administradores pueden acceder a este módulo</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1 flex items-center gap-3">
            <Settings className="w-8 h-8 text-[#FB923C]" />
            Panel Super Administrador
          </h1>
          <p className="text-gray-600">Gestión global de empresas y planes</p>
        </div>
        <Button
          onClick={() => fetchEmpresas(projectId)}
          variant="outline"
          className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/10 gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-[#FB923C]/20 to-[#F97316]/20 border-[#FB923C]/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FB923C]/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#FB923C]" />
            </div>
            <div>
              <p className="text-gray-600 text-xs">Total Empresas</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_empresas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-gray-600 text-xs">Activas</p>
              <p className="text-2xl font-bold text-green-400">{stats?.empresas_activas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-gray-600 text-xs">Suspendidas</p>
              <p className="text-2xl font-bold text-orange-400">{stats?.empresas_suspendidas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-[#F97316]/20 to-blue-500/20 border-[#F97316]/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#F97316]/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-[#F97316]" />
            </div>
            <div>
              <p className="text-gray-600 text-xs">Total Usuarios</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_usuarios ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribución por plan */}
      {stats?.por_plan && Object.keys(stats.por_plan).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PLANES.map((plan) => {
            const count = stats.por_plan[plan.codigo] || 0;
            const Icon = plan.icon;
            return (
              <Card key={plan.codigo} className="bg-white border-gray-100">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4 text-gray-900" />
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs">{plan.nombre}</p>
                    <p className="text-gray-900 font-bold">{count} empresa{count !== 1 ? 's' : ''}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabla de empresas */}
      <Card className="bg-white border-[#F97316]/20">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#F97316]" />
            Gestión de Empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-gray-600">Cargando empresas...</div>
          ) : empresas.length === 0 ? (
            <div className="text-center py-12 text-gray-600">No hay empresas registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#F97316]/20 hover:bg-transparent">
                    <TableHead className="text-gray-600">Empresa</TableHead>
                    <TableHead className="text-gray-600">RUC / NIT</TableHead>
                    <TableHead className="text-gray-600">Plan</TableHead>
                    <TableHead className="text-gray-600">Estado</TableHead>
                    <TableHead className="text-gray-600">Registro</TableHead>
                    <TableHead className="text-gray-600">Expiración</TableHead>
                    <TableHead className="text-gray-600 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresas.map((empresa) => (
                    <TableRow key={empresa.id} className="border-[#F97316]/10 hover:bg-gray-50">
                      <TableCell>
                        <div>
                          <p className="text-gray-900 font-medium">{empresa.nombre}</p>
                          <p className="text-gray-600 text-xs">{empresa.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600 font-mono text-sm">{empresa.ruc_nit}</TableCell>
                      <TableCell>
                        <Badge className={`capitalize ${getPlanBadge(empresa.plan_tipo)}`}>
                          {getPlanNombre(empresa.plan_tipo)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            empresa.estado === 'activo'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                          }
                        >
                          {empresa.estado === 'activo' ? '● Activa' : '● Suspendida'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 text-sm">
                        {new Date(empresa.fecha_registro).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {empresa.fecha_expiracion ? (
                          <span className={
                            new Date(empresa.fecha_expiracion) < new Date()
                              ? 'text-red-400'
                              : 'text-gray-600'
                          }>
                            {new Date(empresa.fecha_expiracion).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 justify-end">
                          {/* Cambiar plan */}
                          <Button
                            size="sm"
                            onClick={() => setEmpresaSeleccionada(empresa)}
                            className="bg-[#FB923C]/20 text-[#FB923C] border border-[#FB923C]/30 hover:bg-[#FB923C]/30 text-xs"
                          >
                            Gestionar
                          </Button>
                          {/* Suspender / Activar */}
                          {empresa.estado === 'activo' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cambiarEstado(empresa.id, 'suspendido')}
                              className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs"
                            >
                              Suspender
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cambiarEstado(empresa.id, 'activo')}
                              className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs"
                            >
                              Activar
                            </Button>
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

      {/* ── Panel de Recuperación de Datos ─────────────────────────────── */}
      <Card className="bg-red-950/30 border-red-500/40">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            🛠️ Herramientas de Recuperación de Datos
          </CardTitle>
          <p className="text-gray-600 text-sm">
            Los datos originales en KV están intactos. Restauración completa: productos, recetas, ventas, compras, clientes, proveedores y bodegas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Paso 1: Diagnóstico */}
          <div className="flex items-center gap-3">
            <Button
              onClick={ejecutarDiagnostico}
              disabled={!!reparando || !projectId}
              className="bg-blue-600 hover:bg-blue-700 text-gray-900"
            >
              {reparando === 'diagnostico' ? '⏳ Analizando...' : '🔍 Paso 1: Diagnóstico'}
            </Button>
            <span className="text-gray-600 text-xs">Detecta qué empresas tienen datos en KV</span>
          </div>

          {/* Paso 2: Por empresa */}
          {infoKV && Object.keys(infoKV).length > 0 && (
            <div className="space-y-3 border border-orange-500/30 rounded-lg p-4">
              <p className="text-orange-300 text-sm font-semibold">Paso 2: Selecciona empresa</p>
              <div className="space-y-2">
                {Object.entries(infoKV).map(([eid, datos]: [string, any]) => {
                  const total = (datos.productos || 0) + (datos.ventas || 0) + (datos.recetas || 0);
                  if (total === 0) return null;
                  const empresaInfo = empresas.find(e => e.id === eid);
                  return (
                    <div key={eid} className="flex flex-col gap-2 bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-gray-900 font-medium text-sm">
                            {empresaInfo?.nombre || 'Empresa'} — <span className="text-gray-600 text-xs">{eid.substring(0,8)}...</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {datos.productos} productos · {datos.recetas} recetas · {datos.ventas} ventas · {datos.compras} compras
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            onClick={() => ejecutarInspeccion(eid)}
                            disabled={!!reparando}
                            className="bg-yellow-700 hover:bg-yellow-800 text-gray-900 text-xs"
                            size="sm"
                          >
                            {reparando === 'inspeccion-' + eid ? '⏳...' : '🔬 Inspeccionar KV'}
                          </Button>
                          <Button
                            onClick={() => ejecutarColumnasSql(eid)}
                            disabled={!!reparando}
                            className="bg-blue-700 hover:bg-blue-800 text-gray-900 text-xs"
                            size="sm"
                          >
                            {reparando === 'columnas-' + eid ? '⏳...' : '📋 Columnas SQL'}
                          </Button>
                          <Button
                            onClick={() => ejecutarRestaurar(eid)}
                            disabled={!!reparando}
                            className="bg-green-700 hover:bg-green-800 text-gray-900 text-xs"
                            size="sm"
                          >
                            {reparando === 'restaurar-' + eid ? '⏳ Restaurando...' : '♻️ Restaurar TODO'}
                          </Button>
                        </div>
                      </div>
                      {/* Panel de inspección si aplica */}
                      {inspeccionKV?.empresa_id === eid && (
                        <div className="mt-2 space-y-1 text-xs">
                          <p className="text-yellow-400 font-semibold">Campos detectados en KV:</p>
                          {['productos','recetas','ventas','compras','proveedores','bodegas'].map(tabla => {
                            const info = inspeccionKV[tabla];
                            if (!info || info.total === 0) return null;
                            return (
                              <div key={tabla} className="bg-black/30 rounded px-2 py-1">
                                <span className="text-gray-600">{tabla} ({info.total}):</span>{' '}
                                <span className="text-green-400">{info.campos_muestra?.join(', ') || '—'}</span>
                                {info.muestra?.[0] && (
                                  <div className="text-gray-600 mt-0.5">
                                    precio: <span className={info.muestra[0].precio || info.muestra[0].precio_venta ? 'text-green-400' : 'text-red-400'}>
                                      {info.muestra[0].precio_venta ?? info.muestra[0].precio ?? '(vacío)'}
                                    </span>
                                    {tabla === 'proveedores' && <> | ruc: <span className={info.muestra[0].ruc ? 'text-green-400' : 'text-red-400'}>{info.muestra[0].ruc ?? '(vacío)'}</span></>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resultado */}
          {resultadoReparacion && (
            <div className="bg-black/40 rounded-lg p-4 text-xs font-mono text-green-300 max-h-96 overflow-auto">
              <div className="text-gray-600 mb-2">
                Resultado — {resultadoReparacion.tipo}
                {resultadoReparacion.empresa ? ` (${resultadoReparacion.empresa.substring(0,8)}...)` : ''}:
              </div>
              {resultadoReparacion.tipo === 'restaurar' && resultadoReparacion.data?.resultado && (
                <div className="space-y-1 mb-3">
                  {Object.entries(resultadoReparacion.data.resultado).map(([tabla, estado]: [string, any]) => (
                    <div key={tabla} className={`flex justify-between ${String(estado).startsWith('✅') ? 'text-green-400' : String(estado).startsWith('⚠️') ? 'text-yellow-400' : 'text-red-400'}`}>
                      <span>{tabla}:</span><span>{String(estado)}</span>
                    </div>
                  ))}
                </div>
              )}
              <pre className="text-gray-600 text-[10px]">{JSON.stringify(resultadoReparacion.data, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal gestión de empresa */}
      {empresaSeleccionada && projectId && (
        <GestionModal
          empresa={empresaSeleccionada}
          token={token!}
          projectId={projectId}
          onClose={() => setEmpresaSeleccionada(null)}
          onSave={() => fetchEmpresas(projectId)}
        />
      )}
    </div>
  );
}
