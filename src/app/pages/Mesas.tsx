import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useNavigate } from 'react-router';
import {
  Users, Clock, DollarSign, RefreshCw, X, ChefHat,
  UserCheck, AlertCircle, CheckCircle2, Coffee, Utensils,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

// ─── Types ────────────────────────────────────────────────────

type EstadoMesa = 'libre' | 'ocupada' | 'reservada' | 'esperando_cuenta';

interface Mesa {
  id: string;
  numero: number;
  nombre: string;
  capacidad: number;
  zona: string;
  estado: EstadoMesa;
  mesero_id: string | null;
  mesero_nombre: string | null;
  hora_ocupacion: string | null;
  consumo_acumulado: number;
  numero_comanda: string | null;
  personas: number;
  nota: string | null;
  minutos_ocupada?: number;
}

// ─── Estado visual ────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoMesa, { label: string; color: string; border: string; bg: string; dot: string; icon: any }> = {
  libre:            { label: 'Libre',             color: 'text-green-400',  border: 'border-green-500/40',  bg: 'bg-green-500/10',  dot: 'bg-green-400',  icon: CheckCircle2 },
  ocupada:          { label: 'Ocupada',           color: 'text-red-400',    border: 'border-red-500/40',    bg: 'bg-red-500/10',    dot: 'bg-red-400',    icon: Users },
  reservada:        { label: 'Reservada',         color: 'text-yellow-400', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', icon: Clock },
  esperando_cuenta: { label: 'Esp. Cuenta',       color: 'text-blue-400',   border: 'border-blue-500/40',   bg: 'bg-blue-500/10',   dot: 'bg-blue-400',   icon: DollarSign },
};

function formatTiempo(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function apiH(token: string) {
  return { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token, 'Content-Type': 'application/json' };
}
const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

// ─── Componente Mesa Card ─────────────────────────────────────

function MesaCard({ mesa, onClick }: { mesa: Mesa; onClick: () => void }) {
  const cfg = ESTADO_CONFIG[mesa.estado];
  const Icon = cfg.icon;

  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-square rounded-2xl border-2 ${cfg.border} ${cfg.bg} hover:scale-105 transition-all duration-200 flex flex-col items-center justify-center gap-1 p-3 group`}
    >
      {/* Dot indicator */}
      <span className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${cfg.dot} ${mesa.estado === 'ocupada' ? 'animate-pulse' : ''}`} />

      {/* Número */}
      <div className={`text-3xl font-black ${cfg.color}`}>{mesa.numero}</div>

      {/* Zona */}
      <div className="text-gray-500 text-[10px] font-medium uppercase tracking-wider">{mesa.zona}</div>

      {/* Estado */}
      <div className={`flex items-center gap-1 ${cfg.color} text-xs font-semibold`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </div>

      {/* Info ocupada */}
      {mesa.estado !== 'libre' && (
        <div className="mt-1 space-y-0.5 w-full">
          {mesa.mesero_nombre && (
            <p className="text-gray-400 text-[10px] truncate text-center">{mesa.mesero_nombre}</p>
          )}
          {(mesa.minutos_ocupada ?? 0) > 0 && (
            <p className={`text-[10px] text-center font-semibold ${(mesa.minutos_ocupada ?? 0) > 60 ? 'text-orange-400' : 'text-gray-400'}`}>
              ⏱ {formatTiempo(mesa.minutos_ocupada ?? 0)}
            </p>
          )}
          {mesa.consumo_acumulado > 0 && (
            <p className="text-[#00E5FF] text-[11px] text-center font-bold">
              ${mesa.consumo_acumulado.toFixed(2)}
            </p>
          )}
          {mesa.personas > 0 && (
            <p className="text-gray-500 text-[10px] text-center">👥 {mesa.personas}</p>
          )}
        </div>
      )}

      {/* Capacidad */}
      <div className="absolute bottom-2 left-3 text-gray-700 text-[9px]">{mesa.capacidad} pers.</div>
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────

export default function Mesas() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Mesa | null>(null);
  const [modal, setModal] = useState<'accion' | 'ocupar' | 'transferir' | 'reservar' | null>(null);
  const [zonaFiltro, setZonaFiltro] = useState<string>('todas');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('todos');

  // Formulario ocupar
  const [fPersonas, setFPersonas] = useState('2');
  const [fMesero, setFMesero] = useState(user?.nombre ?? '');
  const [fNota, setFNota] = useState('');

  const fetchMesas = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/mesas`, { headers: apiH(token) });
      if (res.ok) {
        const data = await res.json();
        setMesas(data.mesas || []);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    fetchMesas();
    const interval = setInterval(fetchMesas, 30000); // refrescar cada 30 s
    return () => clearInterval(interval);
  }, [fetchMesas]);

  const post = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: apiH(token!), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  const handleOcupar = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/ocupar`, {
        mesero_nombre: fMesero || user?.nombre,
        personas: Number(fPersonas) || 1,
        nota: fNota || undefined,
      });
      toast.success(`Mesa ${selected.numero} ocupada`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleLiberar = async () => {
    if (!selected) return;
    if (!confirm(`¿Liberar Mesa ${selected.numero}? Se perderá el consumo acumulado.`)) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/liberar`, {});
      toast.success(`Mesa ${selected.numero} liberada`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEsperandoCuenta = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/esperando-cuenta`, {});
      toast.success(`Mesa ${selected.numero} — esperando cuenta`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReservar = async () => {
    if (!selected) return;
    try {
      await post(`${BASE}/mesas/${selected.id}/reservar`, { nota: fNota, personas: Number(fPersonas) || 0 });
      toast.success(`Mesa ${selected.numero} reservada`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleTransferir = async () => {
    if (!selected || !fMesero.trim()) return toast.error('Ingresa el nombre del mesero');
    try {
      await post(`${BASE}/mesas/${selected.id}/transferir`, { mesero_nombre: fMesero });
      toast.success(`Mesa ${selected.numero} transferida a ${fMesero}`);
      setModal(null); setSelected(null);
      fetchMesas();
    } catch (e: any) { toast.error(e.message); }
  };

  const irAlPOS = () => {
    if (!selected) return;
    navigate(`/pos?mesa=${selected.numero}`);
    setModal(null); setSelected(null);
  };

  // Cobrar: marca como esperando_cuenta (si aún no lo está) y abre POS
  const irAlPOSCobrar = async () => {
    if (!selected) return;
    if (selected.estado === 'ocupada') {
      try {
        await post(`${BASE}/mesas/${selected.id}/esperando-cuenta`, {});
      } catch { /* continuar igual */ }
    }
    navigate(`/pos?mesa=${selected.numero}`);
    setModal(null); setSelected(null);
  };

  // Zonas únicas
  const zonas = ['todas', ...Array.from(new Set(mesas.map(m => m.zona)))];

  const mesasFiltradas = mesas.filter(m => {
    const okZona = zonaFiltro === 'todas' || m.zona === zonaFiltro;
    const okEstado = estadoFiltro === 'todos' || m.estado === estadoFiltro;
    return okZona && okEstado;
  });

  // Resumen
  const libre     = mesas.filter(m => m.estado === 'libre').length;
  const ocupada   = mesas.filter(m => m.estado === 'ocupada').length;
  const reservada = mesas.filter(m => m.estado === 'reservada').length;
  const espera    = mesas.filter(m => m.estado === 'esperando_cuenta').length;
  const consumoTotal = mesas.filter(m => m.estado === 'ocupada').reduce((s, m) => s + m.consumo_acumulado, 0);

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Plano de Mesas</h1>
          <p className="text-gray-400 text-sm">Vista en tiempo real · se actualiza cada 30 s</p>
        </div>
        <button onClick={fetchMesas} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-[#00E5FF]/20 text-gray-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00E5FF]' : ''}`} />
          <span className="text-sm">Actualizar</span>
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Libres',   val: libre,   color: 'text-green-400',  bg: 'bg-green-500/10'  },
          { label: 'Ocupadas', val: ocupada, color: 'text-red-400',    bg: 'bg-red-500/10'    },
          { label: 'Reservadas',val:reservada,color:'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Esp. Cuenta',val:espera, color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
          { label: 'Consumo en curso', val: `$${consumoTotal.toFixed(2)}`, color: 'text-[#00E5FF]', bg: 'bg-[#00E5FF]/10' },
        ].map(k => (
          <Card key={k.label} className={`${k.bg} border-0`}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${k.color}`}>{k.val}</p>
              <p className="text-gray-500 text-xs mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Leyenda + Filtros ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Leyenda */}
        <div className="flex flex-wrap gap-3">
          {(Object.entries(ESTADO_CONFIG) as [EstadoMesa, typeof ESTADO_CONFIG[EstadoMesa]][]).map(([estado, cfg]) => (
            <button
              key={estado}
              onClick={() => setEstadoFiltro(estadoFiltro === estado ? 'todos' : estado)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                estadoFiltro === estado
                  ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                  : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Zona */}
        <select
          value={zonaFiltro}
          onChange={e => setZonaFiltro(e.target.value)}
          className="ml-auto px-3 py-1.5 bg-[#0A1A2F]/60 border border-[#00E5FF]/20 text-white rounded-lg text-sm focus:outline-none focus:border-[#00E5FF]"
        >
          {zonas.map(z => <option key={z} value={z} className="bg-[#0A1A2F]">{z === 'todas' ? 'Todas las zonas' : z}</option>)}
        </select>
      </div>

      {/* ── Grid de mesas ──────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {mesasFiltradas.map(m => (
            <MesaCard
              key={m.id}
              mesa={m}
              onClick={() => { setSelected(m); setFMesero(user?.nombre ?? ''); setFNota(''); setFPersonas('2'); setModal('accion'); }}
            />
          ))}
          {mesasFiltradas.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">
              <Utensils className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No hay mesas con el filtro seleccionado</p>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Acción sobre mesa ────────────────────────── */}
      {selected && modal === 'accion' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-[#0A1A2F]/98 border-[#00E5FF]/40 shadow-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-white text-xl font-bold">Mesa {selected.numero}</h2>
                  <p className="text-gray-400 text-sm">{selected.zona} · Cap. {selected.capacidad}</p>
                </div>
                <button onClick={() => { setModal(null); setSelected(null); }} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Estado actual */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${ESTADO_CONFIG[selected.estado].bg} ${ESTADO_CONFIG[selected.estado].border} border`}>
                <span className={`w-2.5 h-2.5 rounded-full ${ESTADO_CONFIG[selected.estado].dot}`} />
                <span className={`font-semibold text-sm ${ESTADO_CONFIG[selected.estado].color}`}>
                  {ESTADO_CONFIG[selected.estado].label}
                </span>
                {selected.mesero_nombre && <span className="text-gray-400 text-xs ml-auto">{selected.mesero_nombre}</span>}
              </div>

              {/* Info si está ocupada */}
              {selected.estado !== 'libre' && (
                <div className="bg-white/5 rounded-lg p-3 mb-4 space-y-1 text-sm">
                  {(selected.minutos_ocupada ?? 0) > 0 && <div className="flex justify-between text-gray-400"><span>Tiempo</span><span className={`font-medium ${(selected.minutos_ocupada ?? 0) > 60 ? 'text-orange-400' : 'text-white'}`}>{formatTiempo(selected.minutos_ocupada ?? 0)}</span></div>}
                  {selected.personas > 0 && <div className="flex justify-between text-gray-400"><span>Personas</span><span className="text-white font-medium">{selected.personas}</span></div>}
                  {selected.consumo_acumulado > 0 && <div className="flex justify-between text-gray-400"><span>Consumo</span><span className="text-[#00E5FF] font-bold">${selected.consumo_acumulado.toFixed(2)}</span></div>}
                  {selected.nota && <div className="text-gray-500 text-xs italic">📝 {selected.nota}</div>}
                </div>
              )}

              {/* Acciones */}
              <div className="space-y-2">
                {/* ── Mesa LIBRE ────────────────────────────── */}
                {selected.estado === 'libre' && <>
                  <Button className="w-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90" onClick={() => setModal('ocupar')}>
                    <Users className="w-4 h-4 mr-2" /> Ocupar Mesa
                  </Button>
                  <Button variant="outline" className="w-full border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10" onClick={() => setModal('reservar')}>
                    <Clock className="w-4 h-4 mr-2" /> Reservar
                  </Button>
                </>}

                {/* ── Mesa OCUPADA ───────────────────────────── */}
                {selected.estado === 'ocupada' && <>
                  {/* Acción principal: Cobrar — marca esp. cuenta + abre POS */}
                  <Button
                    className="w-full bg-gradient-to-r from-green-700 to-green-500 hover:opacity-90 font-bold text-base py-6"
                    onClick={irAlPOSCobrar}
                  >
                    <DollarSign className="w-5 h-5 mr-2" /> Cobrar Mesa
                  </Button>
                  <Button className="w-full bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/20" onClick={irAlPOS}>
                    <Coffee className="w-4 h-4 mr-2" /> Agregar productos (POS)
                  </Button>
                  <Button variant="outline" className="w-full border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={() => { setFMesero(''); setModal('transferir'); }}>
                    <UserCheck className="w-4 h-4 mr-2" /> Transferir Mesero
                  </Button>
                  <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleLiberar}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Liberar sin cobrar
                  </Button>
                </>}

                {/* ── Mesa ESPERANDO CUENTA ──────────────────── */}
                {selected.estado === 'esperando_cuenta' && <>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5 text-center mb-1">
                    <p className="text-blue-400 text-xs font-semibold">⏳ El cliente está esperando la cuenta</p>
                  </div>
                  {/* Botón principal: ir al POS a completar el cobro */}
                  <Button
                    className="w-full bg-gradient-to-r from-green-700 to-green-500 hover:opacity-90 font-bold text-base py-6"
                    onClick={irAlPOS}
                  >
                    <DollarSign className="w-5 h-5 mr-2" /> Ir al POS — Cobrar
                  </Button>
                  <Button variant="outline" className="w-full border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={() => { setFMesero(''); setModal('transferir'); }}>
                    <UserCheck className="w-4 h-4 mr-2" /> Transferir Mesero
                  </Button>
                  <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleLiberar}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Liberar sin cobrar
                  </Button>
                </>}

                {/* ── Mesa RESERVADA ─────────────────────────── */}
                {selected.estado === 'reservada' && <>
                  <Button className="w-full bg-gradient-to-r from-[#1e64a7] to-[#00E5FF] hover:opacity-90" onClick={() => setModal('ocupar')}>
                    <Users className="w-4 h-4 mr-2" /> Convertir a Ocupada
                  </Button>
                  <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleLiberar}>
                    <X className="w-4 h-4 mr-2" /> Cancelar Reserva
                  </Button>
                </>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Ocupar ──────────────────────────────────── */}
      {selected && modal === 'ocupar' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-[#0A1A2F]/98 border-[#00E5FF]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white text-lg font-bold">Ocupar Mesa {selected.numero}</h2>
                <button onClick={() => setModal('accion')} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Mesero</Label>
                <Input value={fMesero} onChange={e => setFMesero(e.target.value)} placeholder="Nombre del mesero" className="bg-white/5 border-[#00E5FF]/20 text-white" />
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Personas</Label>
                <Input type="number" min="1" value={fPersonas} onChange={e => setFPersonas(e.target.value)} className="bg-white/5 border-[#00E5FF]/20 text-white" />
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Nota (opcional)</Label>
                <Input value={fNota} onChange={e => setFNota(e.target.value)} placeholder="Ej: cumpleaños, alérgico a mariscos..." className="bg-white/5 border-[#00E5FF]/20 text-white" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-400" onClick={() => setModal('accion')}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]" onClick={handleOcupar}>Confirmar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Transferir ─────────────────────────────── */}
      {selected && modal === 'transferir' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-[#0A1A2F]/98 border-[#00E5FF]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white text-lg font-bold">Transferir Mesa {selected.numero}</h2>
                <button onClick={() => setModal('accion')} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-gray-400 text-sm">Actualmente asignada a: <span className="text-white font-medium">{selected.mesero_nombre || 'Sin asignar'}</span></p>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Nuevo mesero</Label>
                <Input value={fMesero} onChange={e => setFMesero(e.target.value)} placeholder="Nombre del nuevo mesero" className="bg-white/5 border-[#00E5FF]/20 text-white" autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-400" onClick={() => setModal('accion')}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-purple-600 to-purple-400" onClick={handleTransferir}>Transferir</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Modal: Reservar ───────────────────────────────── */}
      {selected && modal === 'reservar' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm bg-[#0A1A2F]/98 border-[#00E5FF]/40 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white text-lg font-bold">Reservar Mesa {selected.numero}</h2>
                <button onClick={() => setModal('accion')} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Personas</Label>
                <Input type="number" min="1" value={fPersonas} onChange={e => setFPersonas(e.target.value)} className="bg-white/5 border-[#00E5FF]/20 text-white" />
              </div>
              <div>
                <Label className="text-gray-300 mb-1.5 block">Nota / Cliente</Label>
                <Input value={fNota} onChange={e => setFNota(e.target.value)} placeholder="Ej: Reserva de María García" className="bg-white/5 border-[#00E5FF]/20 text-white" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-600 text-gray-400" onClick={() => setModal('accion')}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-yellow-600 to-yellow-400" onClick={handleReservar}>Reservar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
