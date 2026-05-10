import { useState, useEffect } from 'react';
import {
  Plus, Edit2, PowerOff, Power, Shield, ShoppingCart, Package,
  ChefHat, Calculator, Users, BarChart3, FileText, Settings,
  Mail, Briefcase, UserCog, Search, X, Eye, EyeOff, RefreshCw, Warehouse,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { ROLES_INFO, MODULOS_POR_ROL, ROLES_ADMIN, labelRol, badgeRol } from '../utils/permisos';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useBodega } from '../context/BodegaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

interface Usuario {
  id: string;
  nombre_completo: string;
  email: string;
  rol: string;
  puesto?: string;
  activo: boolean;
  ultimo_acceso?: string;
  created_at: string;
  modulos_acceso: string[];
  bodega_id?: string | null;
  bodega_nombre?: string | null;
}

// ── Icono por módulo ────────────────────────────────────────────
const MODULO_ICON: Record<string, any> = {
  dashboard:        BarChart3,
  pos:              ShoppingCart,
  inventario:       Package,
  cocina:           ChefHat,
  ingenieria_menu:  ChefHat,
  facturacion:      FileText,
  facturacion_config: Settings,
  contabilidad:     Calculator,
  rrhh:             Users,
  bi:               BarChart3,
  auditoria:        Shield,
  proyectos:        Briefcase,
  configuracion:    Settings,
  usuarios:         UserCog,
};

const MODULO_LABEL: Record<string, string> = {
  dashboard:        'Dashboard',
  pos:              'Punto de Venta',
  inventario:       'Inventario',
  cocina:           'Cocina (KDS)',
  ingenieria_menu:  'Ing. Menú',
  facturacion:      'Facturación',
  facturacion_config:'Config. Facturación',
  contabilidad:     'Contabilidad',
  rrhh:             'RRHH',
  bi:               'Business Intelligence',
  auditoria:        'Auditoría',
  proyectos:        'Proyectos',
  configuracion:    'Configuración',
  usuarios:         'Usuarios',
};

// Roles que puede asignar un gerente/admin (no super_admin)
const ROLES_ASIGNABLES = ['cajero', 'bodeguero', 'contador', 'cocinero', 'rrhh', 'auditor', 'gerente'];

export default function Usuarios() {
  const { user, token } = useAuth();
  const { bodegas } = useBodega();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [limitesPlan, setLimitesPlan] = useState<any>(null);
  const [busqueda, setBusqueda] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    rol: 'cajero',
    puesto: '',
    bodega_id: '',
    bodega_nombre: '',
  });

  const esAdmin = ROLES_ADMIN.includes(user?.rol ?? '');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [usuariosRes, limitesRes] = await Promise.all([
        api.get('/usuarios', token),
        api.get('/empresa/plan-limites', token),
      ]);
      setUsuarios(usuariosRes.usuarios || []);
      setLimitesPlan(limitesRes);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const abrirCrear = () => {
    if (limitesPlan?.limites_alcanzados?.usuarios) {
      toast.error(`Límite de ${limitesPlan.plan.max_usuarios} usuarios alcanzado`, {
        description: 'Actualiza tu plan para agregar más usuarios',
      });
      return;
    }
    setEditingUser(null);
    setFormData({ nombre_completo: '', email: '', password: '', rol: 'cajero', puesto: '', bodega_id: '', bodega_nombre: '' });
    setShowPassword(false);
    setShowModal(true);
  };

  const abrirEditar = (u: Usuario) => {
    setEditingUser(u);
    setFormData({ nombre_completo: u.nombre_completo, email: u.email, password: '', rol: u.rol, puesto: u.puesto || '', bodega_id: u.bodega_id || '', bodega_nombre: u.bodega_nombre || '' });
    setShowPassword(false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        await api.put(`/usuarios/${editingUser.id}`, {
          nombre_completo: formData.nombre_completo,
          rol: formData.rol,
          puesto: formData.puesto,
          bodega_id: formData.bodega_id || null,
          bodega_nombre: formData.bodega_nombre || null,
        }, token);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/usuarios', {
          ...formData,
          bodega_id: formData.bodega_id || null,
          bodega_nombre: formData.bodega_nombre || null,
        }, token);
        toast.success('Usuario creado exitosamente');
      }
      setShowModal(false);
      cargarDatos();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActivar = async (u: Usuario) => {
    if (u.id === user?.id) { toast.error('No puedes desactivar tu propia cuenta'); return; }
    const accion = u.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a ${u.nombre_completo}?`)) return;
    try {
      if (u.activo) {
        await api.delete(`/usuarios/${u.id}`, token);
        toast.success('Usuario desactivado');
      } else {
        await api.post(`/usuarios/${u.id}/reactivar`, {}, token);
        toast.success('Usuario reactivado');
      }
      cargarDatos();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado del usuario');
    }
  };

  const usuariosFiltrados = usuarios.filter(u =>
    u.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.rol.toLowerCase().includes(busqueda.toLowerCase())
  );

  const activos = usuarios.filter(u => u.activo).length;
  const maxUsuarios = limitesPlan?.plan?.max_usuarios;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
          <p className="text-gray-400">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Gestión de Usuarios</h1>
          <p className="text-gray-400 text-sm">
            Usuarios de <span className="text-[#00E5FF]">{user?.empresa?.nombre}</span> •
            Cuenta gerente: <span className="text-white font-medium">{user?.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            variant="compact"
            onExportExcel={() => exportToExcel(
              usuarios.map(u => ({
                'Nombre': u.nombre_completo,
                'Email': u.email,
                'Rol': labelRol(u.rol),
                'Puesto': u.puesto || '-',
                'Estado': u.activo ? 'Activo' : 'Inactivo',
                'Último acceso': u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString() : '-',
                'Creado': new Date(u.created_at).toLocaleDateString(),
              })),
              'Usuarios',
              'Usuarios'
            )}
            onExportPDF={() => exportToPDF(
              usuarios.map(u => ({
                nombre: u.nombre_completo,
                email: u.email,
                rol: labelRol(u.rol),
                estado: u.activo ? 'Activo' : 'Inactivo',
                puesto: u.puesto || '-',
              })),
              [
                { header: 'Nombre', key: 'nombre' },
                { header: 'Email', key: 'email' },
                { header: 'Rol', key: 'rol' },
                { header: 'Estado', key: 'estado' },
                { header: 'Puesto', key: 'puesto' },
              ],
              'Gestión de Usuarios',
              'Usuarios'
            )}
          />
          {esAdmin && (
            <Button onClick={abrirCrear}
              className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90 shadow-lg shadow-[#00E5FF]/20">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          )}
        </div>
      </div>

      {/* ── Indicador de plan ────────────────────────────────── */}
      {limitesPlan && (
        <Card className="bg-gradient-to-r from-[#1e64a7]/15 to-[#00E5FF]/10 border-[#00E5FF]/25">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-white font-semibold text-lg">Plan {limitesPlan.plan.nombre}</p>
                <p className="text-gray-400 text-sm mt-0.5">
                  <span className={activos >= (maxUsuarios ?? 9999) ? 'text-red-400 font-semibold' : 'text-[#00E5FF] font-semibold'}>
                    {activos}
                  </span>
                  {' '}de{' '}
                  <span className="text-white font-semibold">
                    {maxUsuarios === 9999 || maxUsuarios === 999 ? 'ilimitados' : maxUsuarios}
                  </span>
                  {' '}usuarios activos
                </p>
              </div>
              <div className="flex items-center gap-3">
                {limitesPlan.limites_alcanzados?.usuarios && (
                  <span className="px-3 py-1.5 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded-lg text-sm">
                    ⚠ Límite alcanzado
                  </span>
                )}
                {(maxUsuarios !== 9999 && maxUsuarios !== 999) && (
                  <div className="w-40">
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          limitesPlan.limites_alcanzados?.usuarios
                            ? 'bg-gradient-to-r from-orange-500 to-red-500'
                            : 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]'
                        }`}
                        style={{ width: `${Math.min((activos / maxUsuarios) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-right">{Math.round((activos / maxUsuarios) * 100)}% usado</p>
                  </div>
                )}
                <button onClick={cargarDatos} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Buscador ─────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar usuario, email o rol..."
          className="pl-9 bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white placeholder:text-gray-600"
        />
      </div>

      {/* ── Lista de usuarios ─────────────────────────────────── */}
      {usuariosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UserCog className="w-12 h-12 text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg font-medium">No hay usuarios</p>
          <p className="text-gray-600 text-sm mt-1">
            {busqueda ? 'Ningún usuario coincide con la búsqueda' : 'Crea el primer usuario con el botón de arriba'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {usuariosFiltrados.map(u => (
            <UsuarioCard
              key={u.id}
              usuario={u}
              esYo={u.id === user?.id || u.email === user?.email}
              esAdmin={esAdmin}
              onEditar={() => abrirEditar(u)}
              onToggle={() => toggleActivar(u)}
            />
          ))}
        </div>
      )}

      {/* ── Guía de roles ────────────────────────────────────── */}
      <Card className="bg-[#0A1A2F]/40 border-[#00E5FF]/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#00E5FF]" />
            Roles disponibles y sus módulos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ROLES_ASIGNABLES.map(rol => {
              const info = ROLES_INFO[rol];
              const modulos = MODULOS_POR_ROL[rol] ?? [];
              return (
                <div key={rol} className="bg-white/5 rounded-lg p-3 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${info?.badge}`}>
                      {info?.label}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs mb-2">{info?.descripcion}</p>
                  <div className="flex flex-wrap gap-1">
                    {modulos.filter(m => m !== 'dashboard').map(m => (
                      <span key={m} className="px-1.5 py-0.5 bg-[#00E5FF]/10 text-[#00E5FF] text-[10px] rounded border border-[#00E5FF]/20">
                        {MODULO_LABEL[m] ?? m}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Modal Crear / Editar ──────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg bg-[#0A1A2F]/98 border-[#00E5FF]/40 shadow-2xl">
            <CardHeader className="border-b border-white/5 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-xl">
                  {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                </CardTitle>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-1">
                {editingUser ? 'Cambia el rol o datos del usuario' : 'Crea un acceso para un miembro del equipo'}
              </p>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Nombre */}
                <div>
                  <Label className="text-gray-300 mb-1.5 block">Nombre Completo *</Label>
                  <Input
                    value={formData.nombre_completo}
                    onChange={e => setFormData({ ...formData, nombre_completo: e.target.value })}
                    required placeholder="Ej: María García López"
                    className="bg-white/5 border-[#00E5FF]/20 text-white"
                  />
                </div>

                {/* Email */}
                <div>
                  <Label className="text-gray-300 mb-1.5 block">Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required disabled={!!editingUser}
                    placeholder="usuario@empresa.com"
                    className="bg-white/5 border-[#00E5FF]/20 text-white disabled:opacity-40"
                  />
                  {!!editingUser && (
                    <p className="text-xs text-gray-600 mt-1">El email no se puede cambiar</p>
                  )}
                </div>

                {/* Password (solo crear) */}
                {!editingUser && (
                  <div>
                    <Label className="text-gray-300 mb-1.5 block">Contraseña * (mín. 6 caracteres)</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        required minLength={6}
                        placeholder="Contraseña segura"
                        className="bg-white/5 border-[#00E5FF]/20 text-white pr-10"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Cargo */}
                <div>
                  <Label className="text-gray-300 mb-1.5 block">Cargo / Puesto</Label>
                  <Input
                    value={formData.puesto}
                    onChange={e => setFormData({ ...formData, puesto: e.target.value })}
                    placeholder="Ej: Cajero Principal, Chef de Cocina"
                    className="bg-white/5 border-[#00E5FF]/20 text-white"
                  />
                </div>

                {/* Rol */}
                <div>
                  <Label className="text-gray-300 mb-1.5 block">Rol *</Label>
                  <select
                    value={formData.rol}
                    onChange={e => setFormData({ ...formData, rol: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-[#00E5FF]/20 rounded-md text-white focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/30"
                  >
                    {ROLES_ASIGNABLES.map(rol => (
                      <option key={rol} value={rol} className="bg-[#0A1A2F]">
                        {ROLES_INFO[rol]?.label} — {ROLES_INFO[rol]?.descripcion}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview módulos del rol seleccionado */}
                {formData.rol && (
                  <div className="bg-[#00E5FF]/5 border border-[#00E5FF]/15 rounded-lg p-3">
                    <p className="text-[#00E5FF] text-xs font-semibold mb-2">
                      Módulos a los que tendrá acceso:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(MODULOS_POR_ROL[formData.rol] ?? []).map(m => {
                        const Icon = MODULO_ICON[m] ?? Settings;
                        return (
                          <span key={m} className="flex items-center gap-1 px-2 py-0.5 bg-[#00E5FF]/10 border border-[#00E5FF]/20 text-[#00E5FF] text-[11px] rounded-full">
                            <Icon className="w-3 h-3" />
                            {MODULO_LABEL[m] ?? m}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sucursal asignada (solo para roles de ubicación fija) */}
                {['cajero', 'bodeguero', 'cocinero'].includes(formData.rol) && (
                  <div>
                    <Label className="text-gray-300 mb-1.5 block">Sucursal asignada</Label>
                    {bodegas.length === 0 ? (
                      <p className="text-xs text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                        No hay sucursales/bodegas configuradas aún. Créalas primero en el módulo de Inventario.
                      </p>
                    ) : (
                      <>
                        <Select
                          value={formData.bodega_id || '__none__'}
                          onValueChange={v => {
                            if (v === '__none__') {
                              setFormData(f => ({ ...f, bodega_id: '', bodega_nombre: '' }));
                            } else {
                              const b = bodegas.find(b => b.id === v);
                              setFormData(f => ({ ...f, bodega_id: v, bodega_nombre: b?.nombre || '' }));
                            }
                          }}
                        >
                          <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                            <SelectValue placeholder="Sin asignar (acceso a todas)" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                            <SelectItem value="__none__" className="text-gray-400">Sin asignar (acceso a todas)</SelectItem>
                            {bodegas.map(b => (
                              <SelectItem key={b.id} value={b.id} className="text-white">
                                {b.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-600 mt-1">
                          Si asignas una sucursal, el usuario solo podrá ver y operar en esa ubicación.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Botones */}
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}
                    className="flex-1 border-gray-600 text-gray-400 hover:text-white">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}
                    className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90">
                    {submitting
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Guardando...</>
                      : editingUser ? 'Actualizar Usuario' : 'Crear Usuario'
                    }
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de usuario ────────────────────────────────────────
function UsuarioCard({
  usuario, esYo, esAdmin, onEditar, onToggle,
}: {
  usuario: Usuario;
  esYo: boolean;
  esAdmin: boolean;
  onEditar: () => void;
  onToggle: () => void;
}) {
  const info = ROLES_INFO[usuario.rol];
  const modulos = (usuario.modulos_acceso || MODULOS_POR_ROL[usuario.rol] || []).filter(m => m !== 'dashboard');

  return (
    <Card className={`bg-[#0A1A2F]/60 border-[#00E5FF]/15 hover:border-[#00E5FF]/35 transition-all ${!usuario.activo ? 'opacity-55' : ''}`}>
      <CardContent className="p-5 space-y-4">

        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg text-white ${
              !usuario.activo ? 'bg-gray-600/50' : 'bg-gradient-to-br from-[#1e64a7] to-[#00E5FF]'
            }`}>
              {usuario.nombre_completo.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-white font-semibold text-sm truncate">{usuario.nombre_completo}</p>
                {esYo && <span className="text-[10px] bg-[#00E5FF]/20 text-[#00E5FF] px-1.5 rounded border border-[#00E5FF]/30">Tú</span>}
              </div>
              <p className="text-gray-500 text-xs truncate">{usuario.puesto || 'Sin cargo'}</p>
            </div>
          </div>

          {/* Acciones */}
          {esAdmin && !esYo && (
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={onEditar} title="Editar"
                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-blue-400 transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={onToggle} title={usuario.activo ? 'Desactivar' : 'Reactivar'}
                className={`p-1.5 hover:bg-white/10 rounded-lg transition-colors ${
                  usuario.activo ? 'text-gray-500 hover:text-red-400' : 'text-gray-600 hover:text-green-400'
                }`}>
                {usuario.activo ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Email */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{usuario.email}</span>
        </div>

        {/* Sucursal asignada */}
        {usuario.bodega_nombre && (
          <div className="flex items-center gap-2 text-xs text-yellow-400/80">
            <Warehouse className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{usuario.bodega_nombre}</span>
          </div>
        )}

        {/* Rol + estado */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeRol(usuario.rol)}`}>
            {labelRol(usuario.rol)}
          </span>
          {!usuario.activo && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
              Inactivo
            </span>
          )}
        </div>

        {/* Módulos accesibles */}
        <div>
          <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-1.5">Módulos asignados</p>
          <div className="flex flex-wrap gap-1">
            {modulos.length === 0 ? (
              <span className="text-gray-600 text-xs">Sin módulos adicionales</span>
            ) : modulos.map(m => {
              const Icon = MODULO_ICON[m] ?? Settings;
              return (
                <span key={m} className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 border border-white/10 text-gray-400 text-[10px] rounded">
                  <Icon className="w-2.5 h-2.5" />
                  {MODULO_LABEL[m] ?? m}
                </span>
              );
            })}
          </div>
        </div>

        {/* Último acceso */}
        {usuario.ultimo_acceso && (
          <p className="text-gray-600 text-[10px] border-t border-white/5 pt-2">
            Último acceso: {new Date(usuario.ultimo_acceso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
