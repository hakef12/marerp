// Kitchen Display System — vista de cocina con cronómetros en tiempo real
import { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { printHtml, cssTermico, esc } from '../utils/printThermal';
import {
  Bell, Flame, CheckCircle, Clock, Users, Printer, RefreshCw,
} from 'lucide-react';

interface KDSViewProps {
  comandasPorEstado: { pendiente: any[]; en_preparacion: any[]; lista: any[] };
  stats: { pendientes: number; enPreparacion: number; listas: number; urgentes: number; tiempoPromedio: number };
  getEstadoBadge: (estado: string) => string;
  formatTime: (seconds: number) => string;
  getElapsedTime: (fechaCreacion: string, fechaInicio?: string) => number;
  getTimeColor: (seconds: number) => string;
  cambiarEstado: (id: string, estado: string) => void;
  onRefresh?: () => void;
}

/** Imprime una comanda desde el KDS */
function imprimirComandaKDS(comanda: any) {
  const ancho = (parseInt(localStorage.getItem('print_ancho') || '58') as 58 | 80) === 80 ? 80 : 58;
  const tipoLabel = comanda.mesa
    ? `Mesa ${comanda.mesa}`
    : comanda.tipo_servicio === 'para_llevar' ? 'Para Llevar' : 'Delivery';
  const fecha = new Date(comanda.created_at || Date.now());
  const hora  = fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const fechaStr = fecha.toLocaleDateString('es-EC');

  const items: any[] = comanda.items || [];
  const itemsHtml = items.map(item => `
    <div class="item" style="margin:3px 0;">
      <div class="bold" style="font-size:${ancho === 58 ? '12px' : '13px'}">
        ${esc(String(item.cantidad))}x ${esc(item.nombre || item.producto?.nombre || '—')}
      </div>
      ${item.notas ? `<div style="font-style:italic;font-size:9px;margin-left:10px;">⚑ ${esc(item.notas)}</div>` : ''}
    </div>
  `).join('');

  const html = `
    <div class="huge" style="border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:5px;">★ COMANDA ★</div>
    <div class="c bold" style="font-size:${ancho === 58 ? '13px' : '15px'};margin-bottom:2px;">${esc(tipoLabel)}</div>
    ${comanda.cliente ? `<div class="c sm">Cliente: ${esc(comanda.cliente)}</div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="lbl">Orden:</span><span class="val bold">${esc(comanda.numero_orden || comanda.id?.slice(0, 8))}</span></div>
    <div class="row"><span class="lbl">Fecha:</span><span class="val">${fechaStr}</span></div>
    <div class="row"><span class="lbl">Hora:</span><span class="val bold">${hora}</span></div>
    <div class="sep"></div>
    <div class="bold" style="margin-bottom:3px;">ITEMS:</div>
    ${itemsHtml}
    ${comanda.notas ? `
      <div class="sep"></div>
      <div style="border:1px dashed #000;padding:3px;">
        <div class="bold sm">Notas:</div>
        <div style="font-size:9px;">${esc(comanda.notas)}</div>
      </div>` : ''}
    <div class="sep"></div>
    <div class="c sm">★★★ COCINA ★★★</div>
    <div class="feed"></div>
  `;
  printHtml(html, `Comanda ${comanda.numero_orden || comanda.id?.slice(0, 8)}`, ancho);
}

export default function CocinaKDS({
  comandasPorEstado,
  stats,
  getEstadoBadge,
  formatTime,
  getElapsedTime,
  getTimeColor,
  cambiarEstado,
  onRefresh,
}: KDSViewProps) {

  // ── Sonido de alerta para comandas nuevas ─────────────────────────────────
  const prevPendientesRef = useRef(stats.pendientes);
  useEffect(() => {
    if (stats.pendientes > prevPendientesRef.current) {
      // Reproducir beep con AudioContext
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch { /* silencioso si AudioContext no disponible */ }
    }
    prevPendientesRef.current = stats.pendientes;
  }, [stats.pendientes]);

  // ── Helper seguro para elapsed time ──────────────────────────────────────
  const safeElapsed = (fechaCreacion: string, fechaInicio?: string) => {
    try {
      const t = getElapsedTime(fechaCreacion, fechaInicio);
      return isNaN(t) ? 0 : Math.max(0, t);
    } catch { return 0; }
  };

  // URGENTE si > 15 min esperando
  const URGENTE_SEG = 15 * 60;

  return (
    <div className="space-y-4">
      {/* Barra superior: stats rápidos + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-orange-400 font-bold">
            <Bell className="w-4 h-4" /> {stats.pendientes} pendientes
          </span>
          <span className="flex items-center gap-1 text-blue-400 font-bold">
            <Flame className="w-4 h-4" /> {stats.enPreparacion} cocinando
          </span>
          <span className="flex items-center gap-1 text-green-400 font-bold">
            <CheckCircle className="w-4 h-4" /> {stats.listas} listas
          </span>
          {stats.urgentes > 0 && (
            <span className="flex items-center gap-1 text-red-400 font-bold animate-pulse">
              🚨 {stats.urgentes} URGENTE{stats.urgentes > 1 ? 'S' : ''}
            </span>
          )}
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}
            className="border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/10">
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        )}
      </div>

      {/* Grid de 3 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── PENDIENTES ────────────────────────────────────────────────── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-orange-400" />
            <h3 className="text-gray-900 font-bold">Pendientes</h3>
            <Badge className="bg-orange-500/20 text-orange-400">{stats.pendientes}</Badge>
          </div>
          <ScrollArea className="flex-1 h-[calc(100vh-380px)]">
            <div className="space-y-3 pr-2">
              {comandasPorEstado.pendiente.length === 0 ? (
                <Card className="bg-white border-[#F97316]/20">
                  <CardContent className="p-6 text-center text-gray-400">
                    <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Sin comandas pendientes
                  </CardContent>
                </Card>
              ) : (
                comandasPorEstado.pendiente.map((comanda: any) => {
                  const fechaBase = comanda.created_at || comanda.fecha_creacion || new Date().toISOString();
                  const elapsed   = safeElapsed(fechaBase);
                  const urgente   = elapsed >= URGENTE_SEG;
                  return (
                    <Card key={comanda.id}
                      className={`bg-white border-2 transition-all ${urgente ? 'border-red-500/60 shadow-lg shadow-red-500/20' : 'border-orange-500/30'}`}>
                      <CardHeader className="pb-2 bg-gradient-to-r from-orange-500/10 to-transparent">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-gray-900 text-lg font-bold flex items-center gap-2 flex-wrap">
                              {comanda.mesa ? `Mesa ${comanda.mesa}` : comanda.numero_orden || comanda.id?.slice(0, 8) || '—'}
                              {urgente && <Badge className="bg-red-500 text-white text-xs">🚨 URGENTE</Badge>}
                            </CardTitle>
                            {comanda.cliente && (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                <Users className="w-3 h-3" /> {comanda.cliente}
                              </p>
                            )}
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <div className={`text-xl font-black ${getTimeColor(elapsed)}`}>
                              {formatTime(elapsed)}
                            </div>
                            <p className="text-xs text-gray-400">esperando</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-3 space-y-2">
                        {(comanda.items || []).map((item: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-gray-900 font-semibold text-sm">
                              <span className="text-[#F97316] font-black mr-1">{item.cantidad}x</span>
                              {item.nombre || item.producto?.nombre || '—'}
                            </p>
                            {item.notas && (
                              <p className="text-orange-500 text-xs italic mt-0.5">📝 {item.notas}</p>
                            )}
                          </div>
                        ))}
                        {comanda.notas && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-yellow-700 text-xs">
                            💬 {comanda.notas}
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button
                            onClick={() => cambiarEstado(comanda.id, 'en_preparacion')}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-sm"
                          >
                            <Flame className="w-4 h-4 mr-1" /> Iniciar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => imprimirComandaKDS(comanda)}
                            className="border-gray-200 text-gray-500 hover:text-gray-900"
                            title="Reimprimir comanda"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── EN PREPARACIÓN ───────────────────────────────────────────── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-5 h-5 text-blue-400" />
            <h3 className="text-gray-900 font-bold">En Preparación</h3>
            <Badge className="bg-blue-500/20 text-blue-400">{stats.enPreparacion}</Badge>
          </div>
          <ScrollArea className="flex-1 h-[calc(100vh-380px)]">
            <div className="space-y-3 pr-2">
              {comandasPorEstado.en_preparacion.length === 0 ? (
                <Card className="bg-white border-[#F97316]/20">
                  <CardContent className="p-6 text-center text-gray-400">
                    <Flame className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Sin comandas en preparación
                  </CardContent>
                </Card>
              ) : (
                comandasPorEstado.en_preparacion.map((comanda: any) => {
                  const fechaBase = comanda.created_at || comanda.fecha_creacion || new Date().toISOString();
                  const elapsed   = safeElapsed(fechaBase, comanda.fecha_inicio);
                  return (
                    <Card key={comanda.id}
                      className="bg-white border-blue-500/40 border-2 shadow-sm shadow-blue-500/10">
                      <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/10 to-transparent">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-gray-900 text-lg font-bold">
                              {comanda.mesa ? `Mesa ${comanda.mesa}` : comanda.numero_orden || comanda.id?.slice(0, 8) || '—'}
                            </CardTitle>
                            {comanda.cliente && (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                <Users className="w-3 h-3" /> {comanda.cliente}
                              </p>
                            )}
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <div className={`text-xl font-black ${getTimeColor(elapsed)}`}>
                              {formatTime(elapsed)}
                            </div>
                            <p className="text-xs text-gray-400">cocinando</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-3 space-y-2">
                        {(comanda.items || []).map((item: any, i: number) => (
                          <div key={i} className="bg-blue-50 rounded-lg px-3 py-2">
                            <p className="text-gray-900 font-semibold text-sm">
                              <span className="text-blue-500 font-black mr-1">{item.cantidad}x</span>
                              {item.nombre || item.producto?.nombre || '—'}
                            </p>
                            {item.notas && (
                              <p className="text-blue-500 text-xs italic mt-0.5">📝 {item.notas}</p>
                            )}
                          </div>
                        ))}
                        {comanda.notas && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700 text-xs">
                            💬 {comanda.notas}
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button
                            onClick={() => cambiarEstado(comanda.id, 'lista')}
                            className="flex-1 bg-gradient-to-r from-green-600 to-green-500 text-white font-bold text-sm"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" /> Lista ✓
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => imprimirComandaKDS(comanda)}
                            className="border-gray-200 text-gray-500 hover:text-gray-900"
                            title="Reimprimir comanda"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── LISTAS PARA SERVIR ───────────────────────────────────────── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <h3 className="text-gray-900 font-bold">Listas para Servir</h3>
            <Badge className="bg-green-500/20 text-green-400">{stats.listas}</Badge>
          </div>
          <ScrollArea className="flex-1 h-[calc(100vh-380px)]">
            <div className="space-y-3 pr-2">
              {comandasPorEstado.lista.length === 0 ? (
                <Card className="bg-white border-[#F97316]/20">
                  <CardContent className="p-6 text-center text-gray-400">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Sin comandas listas
                  </CardContent>
                </Card>
              ) : (
                comandasPorEstado.lista.map((comanda: any) => {
                  const fechaInicio = comanda.created_at || comanda.fecha_creacion || new Date().toISOString();
                  const fechaFin    = comanda.fecha_completado || new Date().toISOString();
                  let tiempoTotal = 0;
                  try { tiempoTotal = Math.max(0, Math.floor((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 1000)); } catch { /**/ }

                  return (
                    <Card key={comanda.id}
                      className="bg-white border-green-500/40 border-2 shadow-sm shadow-green-500/10">
                      <CardHeader className="pb-2 bg-gradient-to-r from-green-500/10 to-transparent">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-gray-900 text-lg font-bold flex items-center gap-2 flex-wrap">
                              {comanda.mesa ? `Mesa ${comanda.mesa}` : comanda.numero_orden || comanda.id?.slice(0, 8) || '—'}
                              <Badge className="bg-green-500 text-white text-xs">✓ LISTA</Badge>
                            </CardTitle>
                            {comanda.cliente && (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                <Users className="w-3 h-3" /> {comanda.cliente}
                              </p>
                            )}
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <div className="text-xl font-black text-green-400">{formatTime(tiempoTotal)}</div>
                            <p className="text-xs text-gray-400">tiempo total</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-3 space-y-2">
                        {(comanda.items || []).map((item: any, i: number) => (
                          <div key={i} className="bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                            <p className="text-gray-900 font-semibold text-sm">
                              <span className="text-green-500 font-black mr-1">✓ {item.cantidad}x</span>
                              {item.nombre || item.producto?.nombre || '—'}
                            </p>
                          </div>
                        ))}
                        <Button
                          onClick={() => cambiarEstado(comanda.id, 'entregada')}
                          variant="outline"
                          className="w-full mt-1 border-green-500/40 text-green-600 hover:bg-green-50 font-bold text-sm"
                        >
                          Marcar como Entregada →
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

      </div>
    </div>
  );
}
