/**
 * Kitchen Display System — pantalla independiente para cocina
 * Abrir en: /kds (nueva ventana/tab, sin sidebar)
 * Lee el token de localStorage igual que el resto de la app.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Bell, Flame, CheckCircle, Clock, Users, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const POLL_INTERVAL = 8000; // 8 segundos

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(seconds: number) {
  if (!seconds || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function elapsed(from: string, now: number) {
  try {
    const t = new Date(from).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Math.floor((now - t) / 1000));
  } catch { return 0; }
}

function timeColor(secs: number) {
  if (secs > 900) return '#f87171'; // rojo >15min
  if (secs > 600) return '#fb923c'; // naranja >10min
  return '#4ade80'; // verde
}

// ─── Comanda card ─────────────────────────────────────────────────────────────

function ComandaCard({
  comanda, now, onAccion, accionLabel, accionColor,
}: {
  comanda: any; now: number; onAccion: () => void; accionLabel: string; accionColor: string;
}) {
  const secs = elapsed(comanda.created_at || comanda.fecha_creacion, now);
  const urgente = secs > 900;

  return (
    <div
      className="rounded-2xl border-2 overflow-hidden flex flex-col"
      style={{
        borderColor: urgente ? '#ef4444' : accionColor + '66',
        backgroundColor: '#0a1220',
        boxShadow: urgente ? '0 0 20px rgba(239,68,68,0.25)' : undefined,
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: accionColor + '18' }}>
        <div>
          <div className="text-white font-black text-xl flex items-center gap-2">
            {comanda.mesa
              ? `Mesa ${comanda.mesa}`
              : comanda.tipo_servicio === 'para_llevar'
              ? '🥡 Para Llevar'
              : comanda.tipo_servicio === 'delivery'
              ? '🛵 Delivery'
              : comanda.numero_orden || '—'}
            {urgente && (
              <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                URGENTE
              </span>
            )}
          </div>
          {comanda.cliente && (
            <div className="text-sm mt-0.5" style={{ color: accionColor }}>
              <Users className="inline w-3 h-3 mr-1" />
              {comanda.cliente}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-0.5">{comanda.numero_orden}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tabular-nums" style={{ color: timeColor(secs) }}>
            {fmt(secs)}
          </div>
          <div className="text-xs text-gray-500">min</div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-3 space-y-2">
        {(comanda.items || []).map((item: any, i: number) => (
          <div key={i} className="bg-white/5 rounded-xl px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black" style={{ color: accionColor }}>
                {item.cantidad}×
              </span>
              <span className="text-white font-bold text-base leading-tight">{item.nombre}</span>
            </div>
            {item.notas && (
              <div className="text-amber-400 text-sm mt-1 ml-1 italic">
                ⚑ {item.notas}
              </div>
            )}
          </div>
        ))}
        {comanda.notas && (
          <div className="border border-yellow-500/30 bg-yellow-500/8 rounded-xl px-3 py-2 text-yellow-300 text-sm">
            💬 {comanda.notas}
          </div>
        )}
      </div>

      {/* Acción */}
      <div className="p-3 pt-0">
        <button
          onClick={onAccion}
          className="w-full py-3 rounded-xl font-bold text-base transition-all hover:brightness-110 active:scale-95"
          style={{ backgroundColor: accionColor, color: '#000' }}
        >
          {accionLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Columna ─────────────────────────────────────────────────────────────────

function Columna({ title, icon, color, count, children }: {
  title: string; icon: React.ReactNode; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div style={{ color }}>{icon}</div>
        <span className="text-white font-bold text-lg">{title}</span>
        <span
          className="ml-auto text-sm font-bold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: color + '25', color }}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <div style={{ color: color + '40' }} className="mb-2">{icon}</div>
            <p className="text-sm">Sin comandas</p>
          </div>
        ) : children}
      </div>
    </div>
  );
}

// ─── KDS Screen ──────────────────────────────────────────────────────────────

export default function KDSScreen() {
  const [comandas, setComandas] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updating, setUpdating] = useState(false);
  const prevCount = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);

  // Reloj interno cada segundo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Beep cuando llega una comanda nueva
  const beep = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch { /* ignorar si no hay permisos de audio */ }
  };

  const fetchComandas = useCallback(async () => {
    const token = localStorage.getItem('erp_token') || '';
    if (!token) return;
    try {
      setUpdating(true);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas`,
        { headers: { Authorization: `Bearer ${publicAnonKey}`, 'X-User-Token': token } }
      );
      if (res.ok) {
        const data = await res.json();
        const activas = (data.comandas || []).filter(
          (c: any) => c.estado !== 'entregada' && c.estado !== 'cancelada'
        );
        const pendientes = activas.filter((c: any) => c.estado === 'pendiente').length;
        if (pendientes > prevCount.current) beep();
        prevCount.current = pendientes;
        setComandas(activas);
        setOnline(true);
        setLastUpdate(new Date());
      } else {
        setOnline(false);
      }
    } catch {
      setOnline(false);
    } finally {
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    fetchComandas();
    const t = setInterval(fetchComandas, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchComandas]);

  const cambiarEstado = async (id: string, estado: string) => {
    if (!id || id === 'undefined') return;
    setComandas(prev => prev.map(c => c.id === id ? { ...c, estado } : c));
    const token = localStorage.getItem('erp_token') || '';
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/cocina/comandas/${id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            'X-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estado }),
        }
      );
    } catch {
      fetchComandas();
    }
  };

  const pendientes = comandas.filter(c => c.estado === 'pendiente');
  const enPrep = comandas.filter(c => c.estado === 'en_preparacion');
  const listas = comandas.filter(c => c.estado === 'lista');

  return (
    <div className="min-h-screen bg-[#060d18] flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex-none flex items-center justify-between px-6 py-3 bg-[#0a1220] border-b border-white/8">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-white tracking-wide">KDS</span>
          <span className="text-gray-500 text-sm">Kitchen Display System</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Hora */}
          <span className="text-white font-mono text-lg tabular-nums">
            {new Date(now).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {/* Estado conexión */}
          <div className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${
            online ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {online ? 'En línea' : 'Sin conexión'}
          </div>

          {/* Botón refresh */}
          <button
            onClick={fetchComandas}
            disabled={updating}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
          </button>

          {lastUpdate && (
            <span className="text-gray-600 text-xs">
              Actualizado {lastUpdate.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── KDS grid ── */}
      <div className="flex-1 grid grid-cols-3 gap-4 p-4 min-h-0">
        {/* Pendientes */}
        <Columna
          title="Pendientes"
          icon={<Bell className="w-5 h-5" />}
          color="#f97316"
          count={pendientes.length}
        >
          {pendientes.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              now={now}
              onAccion={() => cambiarEstado(c.id, 'en_preparacion')}
              accionLabel="🔥 Iniciar preparación"
              accionColor="#3b82f6"
            />
          ))}
        </Columna>

        {/* En preparación */}
        <Columna
          title="En Preparación"
          icon={<Flame className="w-5 h-5" />}
          color="#3b82f6"
          count={enPrep.length}
        >
          {enPrep.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              now={now}
              onAccion={() => cambiarEstado(c.id, 'lista')}
              accionLabel="✓ Lista para servir"
              accionColor="#22c55e"
            />
          ))}
        </Columna>

        {/* Listas */}
        <Columna
          title="Listas para servir"
          icon={<CheckCircle className="w-5 h-5" />}
          color="#22c55e"
          count={listas.length}
        >
          {listas.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              now={now}
              onAccion={() => cambiarEstado(c.id, 'entregada')}
              accionLabel="Entregada ✓"
              accionColor="#6b7280"
            />
          ))}
        </Columna>
      </div>

      {/* ── Footer ── */}
      <div className="flex-none flex items-center justify-between px-6 py-2 bg-[#0a1220] border-t border-white/5 text-xs text-gray-600">
        <span>M.A.R — Kitchen Display System</span>
        <span>Actualización automática cada {POLL_INTERVAL / 1000}s</span>
      </div>
    </div>
  );
}
