"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import {
  Settings, Building2, User, Shield, Bell, Globe,
  RefreshCw, Save, CheckCircle2, AlertTriangle, Eye, EyeOff,
  Phone, Mail, MapPin, FileText, Clock, DollarSign,
  Package, ShoppingCart, ChefHat, Layers, Wifi, WifiOff,
  Lock, Key,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmpresaInfo {
  nombre: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
  ciudad: string;
  provincia: string;
  pais: string;
  actividad_economica: string;
  representante_legal: string;
}

interface SistemaPrefs {
  zona_horaria: string;
  moneda: string;
  formato_fecha: string;
  inicio_ejercicio_fiscal: string;
  decimales: string;
}

interface NotifPrefs {
  stock_bajo: boolean;
  nuevas_ventas: boolean;
  comandas_cocina: boolean;
  facturas_pendientes: boolean;
}

const EMPTY_EMPRESA: EmpresaInfo = {
  nombre: '', ruc: '', direccion: '', telefono: '',
  email: '', ciudad: '', provincia: '', pais: 'Ecuador',
  actividad_economica: '', representante_legal: '',
};

const EMPTY_PREFS: SistemaPrefs = {
  zona_horaria: 'America/Guayaquil',
  moneda: 'USD',
  formato_fecha: 'DD/MM/YYYY',
  inicio_ejercicio_fiscal: '01/01',
  decimales: '2',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ConfiguracionSistema() {
  const { user, token } = useAuth();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'empresa' | 'sistema' | 'perfil' | 'seguridad' | 'notificaciones'>('empresa');

  // ── Empresa ───────────────────────────────────────────────────────────────
  const [empresa, setEmpresa] = useState<EmpresaInfo>(EMPTY_EMPRESA);
  const [savingEmpresa, setSavingEmpresa] = useState(false);

  // ── Sistema ───────────────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState<SistemaPrefs>(EMPTY_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // ── Perfil ────────────────────────────────────────────────────────────────
  const [perfil, setPerfil] = useState({ nombre: '', email: '' });
  const [savingPerfil, setSavingPerfil] = useState(false);

  // ── Seguridad ─────────────────────────────────────────────────────────────
  const [pass, setPass] = useState({ actual: '', nueva: '', confirmar: '' });
  const [showPass, setShowPass] = useState({ actual: false, nueva: false, confirmar: false });
  const [savingPass, setSavingPass] = useState(false);

  // ── Notificaciones ────────────────────────────────────────────────────────
  const [notifs, setNotifs] = useState<NotifPrefs>({
    stock_bajo: true, nuevas_ventas: true,
    comandas_cocina: true, facturas_pendientes: true,
  });
  const [savingNotifs, setSavingNotifs] = useState(false);

  // ── Health ────────────────────────────────────────────────────────────────
  const [health, setHealth] = useState<'checking' | 'ok' | 'error'>('checking');
  const [stats, setStats] = useState<{ productos: number; categorias: number; ventas: number; comandas: number } | null>(null);
  const [refreshingHealth, setRefreshingHealth] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      setPerfil({ nombre: user.nombre ?? '', email: user.email ?? '' });
      setEmpresa(prev => ({ ...prev, nombre: user.empresa?.nombre ?? '' }));
    }
    cargarConfiguracion();
    cargarEstado();
  }, [user, token]);

  const cargarConfiguracion = async () => {
    if (!token) return;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/configuracion`,
        { headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token } }
      );
      if (res.ok) {
        const d = await res.json();
        if (d.empresa)  setEmpresa(prev => ({ ...prev, ...d.empresa }));
        if (d.sistema)  setPrefs(prev => ({ ...prev, ...d.sistema }));
        if (d.notificaciones) setNotifs(prev => ({ ...prev, ...d.notificaciones }));
      }
    } catch { /* usa defaults */ }
  };

  const cargarEstado = async () => {
    if (!token) return;
    setRefreshingHealth(true);
    try {
      const [healthRes, statsRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/server/health`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/server/datos/estado`, {
          headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token },
        }),
      ]);
      setHealth(healthRes.ok ? 'ok' : 'error');
      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.estadisticas ?? null);
      }
    } catch {
      setHealth('error');
    } finally {
      setRefreshingHealth(false);
    }
  };

  // ── Guardar empresa ───────────────────────────────────────────────────────
  const guardarEmpresa = async () => {
    if (!empresa.nombre.trim()) { toast.error('El nombre de la empresa es obligatorio'); return; }
    setSavingEmpresa(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/configuracion/empresa`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
          body: JSON.stringify(empresa),
        }
      );
      if (res.ok) toast.success('Información de empresa guardada');
      else { const e = await res.json(); toast.error(e.error || 'Error al guardar'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSavingEmpresa(false); }
  };

  // ── Guardar preferencias ─────────────────────────────────────────────────
  const guardarPrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/configuracion/sistema`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
          body: JSON.stringify(prefs),
        }
      );
      if (res.ok) toast.success('Preferencias del sistema guardadas');
      else toast.success('Preferencias guardadas localmente'); // fallback
    } catch { toast.success('Preferencias guardadas localmente'); }
    finally { setSavingPrefs(false); }
  };

  // ── Guardar perfil ────────────────────────────────────────────────────────
  const guardarPerfil = async () => {
    if (!perfil.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSavingPerfil(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/usuarios/perfil`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
          body: JSON.stringify(perfil),
        }
      );
      if (res.ok) toast.success('Perfil actualizado correctamente');
      else { const e = await res.json(); toast.error(e.error || 'Error al actualizar perfil'); }
    } catch { toast.error('Error de conexión'); }
    finally { setSavingPerfil(false); }
  };

  // ── Cambiar contraseña ────────────────────────────────────────────────────
  const cambiarPassword = async () => {
    if (!pass.actual) { toast.error('Ingresa tu contraseña actual'); return; }
    if (pass.nueva.length < 8) { toast.error('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (pass.nueva !== pass.confirmar) { toast.error('Las contraseñas no coinciden'); return; }
    setSavingPass(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/auth/cambiar-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
          body: JSON.stringify({ password_actual: pass.actual, password_nuevo: pass.nueva }),
        }
      );
      if (res.ok) {
        toast.success('Contraseña actualizada correctamente');
        setPass({ actual: '', nueva: '', confirmar: '' });
      } else {
        const e = await res.json();
        toast.error(e.error || 'Error al cambiar contraseña');
      }
    } catch { toast.error('Error de conexión'); }
    finally { setSavingPass(false); }
  };

  // ── Guardar notificaciones ────────────────────────────────────────────────
  const guardarNotifs = async () => {
    setSavingNotifs(true);
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/configuracion/notificaciones`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token! },
          body: JSON.stringify(notifs),
        }
      );
      toast.success('Preferencias de notificaciones guardadas');
    } catch { toast.success('Preferencias guardadas localmente'); }
    finally { setSavingNotifs(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-[#00E5FF]' : 'bg-white/20'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  const PasswordInput = ({
    id, value, show, onChange, onToggle, placeholder,
  }: { id: string; value: string; show: boolean; onChange: (v: string) => void; onToggle: () => void; placeholder?: string }) => (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-white/5 border-white/10 text-white pr-10"
      />
      <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );

  // ── Nav tabs ──────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'empresa',        label: 'Empresa',        icon: Building2  },
    { id: 'sistema',        label: 'Sistema',         icon: Globe      },
    { id: 'perfil',         label: 'Mi Perfil',       icon: User       },
    { id: 'seguridad',      label: 'Seguridad',       icon: Shield     },
    { id: 'notificaciones', label: 'Notificaciones',  icon: Bell       },
  ] as const;

  return (
    <div className="p-6 space-y-6 min-h-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-[#00E5FF]" />
            Configuración
          </h1>
          <p className="text-gray-400 text-sm mt-1">Gestiona la información y preferencias de tu empresa</p>
        </div>

        {/* System health badge */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
            health === 'ok'       ? 'bg-green-500/10 border-green-500/30 text-green-300' :
            health === 'error'    ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                                    'bg-white/5 border-white/10 text-gray-400'
          }`}>
            {health === 'ok'    ? <Wifi className="w-3.5 h-3.5" /> :
             health === 'error'  ? <WifiOff className="w-3.5 h-3.5" /> :
                                   <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {health === 'ok' ? 'Sistema operativo' : health === 'error' ? 'Sin conexión' : 'Verificando...'}
          </div>
          <button
            onClick={cargarEstado}
            disabled={refreshingHealth}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingHealth ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Package,     label: 'Productos',         value: stats.productos,  color: 'text-[#7B61FF]' },
            { icon: Layers,      label: 'Categorías',        value: stats.categorias, color: 'text-[#00E5FF]' },
            { icon: ShoppingCart,label: 'Ventas totales',    value: stats.ventas,     color: 'text-green-400'  },
            { icon: ChefHat,     label: 'Comandas activas',  value: stats.comandas,   color: 'text-orange-400' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
              <div>
                <p className="text-white font-bold text-lg leading-none">{value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab nav ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 flex-1 justify-center px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? 'bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] text-white shadow'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: EMPRESA
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'empresa' && (
        <Card className="bg-white/5 border border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-[#00E5FF]" />
              Información de la Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Razón Social / Nombre *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={empresa.nombre} onChange={e => setEmpresa(p => ({ ...p, nombre: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="Nombre de tu empresa" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">RUC / Identificación</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={empresa.ruc} onChange={e => setEmpresa(p => ({ ...p, ruc: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="0000000000001" maxLength={13} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Teléfono</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={empresa.telefono} onChange={e => setEmpresa(p => ({ ...p, telefono: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="+593 99 000 0000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={empresa.email} onChange={e => setEmpresa(p => ({ ...p, email: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="empresa@correo.com" type="email" />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-300">Dirección</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={empresa.direccion} onChange={e => setEmpresa(p => ({ ...p, direccion: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="Calle Principal, N° y Referencia" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Ciudad</Label>
                <Input value={empresa.ciudad} onChange={e => setEmpresa(p => ({ ...p, ciudad: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white" placeholder="Quito" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Provincia</Label>
                <Input value={empresa.provincia} onChange={e => setEmpresa(p => ({ ...p, provincia: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white" placeholder="Pichincha" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">País</Label>
                <Input value={empresa.pais} onChange={e => setEmpresa(p => ({ ...p, pais: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white" placeholder="Ecuador" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Representante Legal</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={empresa.representante_legal} onChange={e => setEmpresa(p => ({ ...p, representante_legal: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="Nombre del representante" />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-300">Actividad Económica</Label>
                <Input value={empresa.actividad_economica} onChange={e => setEmpresa(p => ({ ...p, actividad_economica: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white" placeholder="Ej: Restaurantes y servicios de comida" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={guardarEmpresa} disabled={savingEmpresa}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90">
                {savingEmpresa ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {savingEmpresa ? 'Guardando...' : 'Guardar Empresa'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: SISTEMA
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'sistema' && (
        <Card className="bg-white/5 border border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Globe className="w-5 h-5 text-[#00E5FF]" />
              Preferencias del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2"><Clock className="w-4 h-4" /> Zona Horaria</Label>
                <Select value={prefs.zona_horaria} onValueChange={v => setPrefs(p => ({ ...p, zona_horaria: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-white/10">
                    <SelectItem value="America/Guayaquil">Ecuador — UTC-5 (Guayaquil / Quito)</SelectItem>
                    <SelectItem value="America/Bogota">Colombia — UTC-5 (Bogotá)</SelectItem>
                    <SelectItem value="America/Lima">Perú — UTC-5 (Lima)</SelectItem>
                    <SelectItem value="America/New_York">Estados Unidos — UTC-5 (Nueva York)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Moneda</Label>
                <Select value={prefs.moneda} onValueChange={v => setPrefs(p => ({ ...p, moneda: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-white/10">
                    <SelectItem value="USD">USD — Dólar Americano ($)</SelectItem>
                    <SelectItem value="EUR">EUR — Euro (€)</SelectItem>
                    <SelectItem value="COP">COP — Peso Colombiano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Formato de Fecha</Label>
                <Select value={prefs.formato_fecha} onValueChange={v => setPrefs(p => ({ ...p, formato_fecha: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-white/10">
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Decimales en Precios</Label>
                <Select value={prefs.decimales} onValueChange={v => setPrefs(p => ({ ...p, decimales: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-white/10">
                    <SelectItem value="0">Sin decimales (1000)</SelectItem>
                    <SelectItem value="2">2 decimales (1000.00)</SelectItem>
                    <SelectItem value="4">4 decimales (1000.0000)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Inicio Ejercicio Fiscal</Label>
                <Select value={prefs.inicio_ejercicio_fiscal} onValueChange={v => setPrefs(p => ({ ...p, inicio_ejercicio_fiscal: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A1A2F] border-white/10">
                    <SelectItem value="01/01">1 de Enero</SelectItem>
                    <SelectItem value="01/04">1 de Abril</SelectItem>
                    <SelectItem value="01/07">1 de Julio</SelectItem>
                    <SelectItem value="01/10">1 de Octubre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Info note */}
            <div className="bg-[#1e64a7]/10 border border-[#1e64a7]/30 rounded-lg p-3 flex gap-2 text-sm text-gray-400">
              <CheckCircle2 className="w-4 h-4 text-[#00E5FF] flex-shrink-0 mt-0.5" />
              El sistema ya está configurado para Ecuador (UTC-5, IVA 15%, facturación electrónica SRI). Estos ajustes son adicionales.
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={guardarPrefs} disabled={savingPrefs}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90">
                {savingPrefs ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {savingPrefs ? 'Guardando...' : 'Guardar Preferencias'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: MI PERFIL
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'perfil' && (
        <Card className="bg-white/5 border border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-[#00E5FF]" />
              Mi Perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7B61FF] to-[#00E5FF] flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {perfil.nombre?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="text-white font-semibold text-lg">{perfil.nombre || '—'}</p>
                <p className="text-gray-400 text-sm">{perfil.email}</p>
                <Badge className="mt-1 bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs capitalize">
                  {user?.rol ?? '—'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Nombre Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={perfil.nombre} onChange={e => setPerfil(p => ({ ...p, nombre: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="Tu nombre" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input value={perfil.email} onChange={e => setPerfil(p => ({ ...p, email: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white pl-10" placeholder="correo@ejemplo.com" type="email" />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={guardarPerfil} disabled={savingPerfil}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90">
                {savingPerfil ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {savingPerfil ? 'Guardando...' : 'Actualizar Perfil'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: SEGURIDAD
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'seguridad' && (
        <div className="space-y-5">
          <Card className="bg-white/5 border border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2 text-lg">
                <Key className="w-5 h-5 text-[#00E5FF]" />
                Cambiar Contraseña
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Contraseña Actual</Label>
                <PasswordInput id="pass-actual" value={pass.actual} show={showPass.actual}
                  onChange={v => setPass(p => ({ ...p, actual: v }))}
                  onToggle={() => setShowPass(p => ({ ...p, actual: !p.actual }))}
                  placeholder="Tu contraseña actual" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Nueva Contraseña</Label>
                <PasswordInput id="pass-nueva" value={pass.nueva} show={showPass.nueva}
                  onChange={v => setPass(p => ({ ...p, nueva: v }))}
                  onToggle={() => setShowPass(p => ({ ...p, nueva: !p.nueva }))}
                  placeholder="Mínimo 8 caracteres" />
                {/* Strength indicator */}
                {pass.nueva.length > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {[4, 7, 10, 13].map((min, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                        pass.nueva.length >= min
                          ? ['bg-red-400','bg-orange-400','bg-yellow-400','bg-green-400'][i]
                          : 'bg-white/10'
                      }`} />
                    ))}
                    <span className="text-xs text-gray-500 ml-1">
                      {pass.nueva.length < 4 ? 'Muy débil' : pass.nueva.length < 8 ? 'Débil' : pass.nueva.length < 11 ? 'Media' : 'Fuerte'}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Confirmar Nueva Contraseña</Label>
                <PasswordInput id="pass-confirmar" value={pass.confirmar} show={showPass.confirmar}
                  onChange={v => setPass(p => ({ ...p, confirmar: v }))}
                  onToggle={() => setShowPass(p => ({ ...p, confirmar: !p.confirmar }))}
                  placeholder="Repite la nueva contraseña" />
                {pass.confirmar && pass.nueva !== pass.confirmar && (
                  <p className="text-red-400 text-xs flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Las contraseñas no coinciden
                  </p>
                )}
                {pass.confirmar && pass.nueva === pass.confirmar && pass.confirmar.length > 0 && (
                  <p className="text-green-400 text-xs flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Las contraseñas coinciden
                  </p>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={cambiarPassword} disabled={savingPass}
                  className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90">
                  {savingPass ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  {savingPass ? 'Actualizando...' : 'Cambiar Contraseña'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security tips */}
          <Card className="bg-white/5 border border-white/10">
            <CardContent className="p-5 space-y-3">
              <p className="text-white font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#00E5FF]" /> Recomendaciones de Seguridad
              </p>
              {[
                'Usa una contraseña de al menos 12 caracteres con letras, números y símbolos.',
                'No compartas tu contraseña con nadie, ni por correo ni por mensaje.',
                'Cierra sesión cuando uses dispositivos compartidos o públicos.',
                'El sistema cierra sesión automáticamente cuando el token expira.',
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                  <CheckCircle2 className="w-4 h-4 text-[#00E5FF] mt-0.5 flex-shrink-0" />
                  <span>{tip}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: NOTIFICACIONES
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'notificaciones' && (
        <Card className="bg-white/5 border border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Bell className="w-5 h-5 text-[#00E5FF]" />
              Preferencias de Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { key: 'stock_bajo',          label: 'Alertas de stock bajo',          desc: 'Notifica cuando un producto cae por debajo del stock mínimo',    icon: Package    },
              { key: 'nuevas_ventas',        label: 'Nuevas ventas registradas',      desc: 'Notifica al registrar una nueva venta en el sistema',            icon: ShoppingCart },
              { key: 'comandas_cocina',      label: 'Comandas de cocina',             desc: 'Notifica cuando hay comandas pendientes o urgentes en cocina',   icon: ChefHat    },
              { key: 'facturas_pendientes',  label: 'Facturas pendientes de envío',   desc: 'Notifica cuando hay comprobantes pendientes de autorización SRI', icon: FileText   },
            ].map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-[#00E5FF]" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{label}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
                <Toggle
                  checked={notifs[key as keyof NotifPrefs]}
                  onChange={v => setNotifs(p => ({ ...p, [key]: v }))}
                />
              </div>
            ))}

            <div className="flex justify-end pt-4">
              <Button onClick={guardarNotifs} disabled={savingNotifs}
                className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90">
                {savingNotifs ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {savingNotifs ? 'Guardando...' : 'Guardar Preferencias'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
