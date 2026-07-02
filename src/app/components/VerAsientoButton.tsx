import { useState } from 'react';
import { FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { toast } from 'sonner';

/**
 * Botón "Ver asiento contable" reusable. Al clickear busca el asiento
 * generado por la referencia dada (venta_id, compra_id, cxp_id, nomina_id, etc.)
 * y lo muestra en un modal con el detalle de partida doble.
 *
 * Uso:
 *   <VerAsientoButton referencia={venta.id} tipo="venta_pos" label="Ver asiento" />
 */
interface Props {
  referencia: string;
  tipo?: string;
  label?: string;
  size?: 'sm' | 'xs';
  className?: string;
}

export default function VerAsientoButton({ referencia, tipo, label = 'Ver asiento', size = 'sm', className = '' }: Props) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [asiento, setAsiento] = useState<any>(null);
  const [historial, setHistorial] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setOpen(true);
    if (asiento || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ref: referencia });
      if (tipo) params.set('tipo', tipo);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/contabilidad/asiento-por-referencia?${params}`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '' } }
      );
      const d = await res.json();
      if (res.ok) {
        setAsiento(d.asiento);
        setHistorial(d.historial);
      } else {
        setError(d.mensaje || d.error || 'No se encontró asiento contable para esta transacción');
      }
    } catch (e: any) { setError(e.message); toast.error(e.message); }
    finally { setLoading(false); }
  };

  const sizeClasses = size === 'xs'
    ? 'text-xs px-2 py-1'
    : 'text-sm px-3 py-1.5';

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Ver asiento contable generado por esta transacción"
        className={`inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors ${sizeClasses} ${className}`}
      >
        <FileText className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl border border-purple-200 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 border-b border-purple-200">
              <div>
                <h3 className="font-bold text-purple-900 flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Asiento Contable Generado
                </h3>
                <p className="text-xs text-purple-600 mt-0.5">
                  Este asiento se creó automáticamente cuando se registró esta transacción.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading && <p className="text-gray-500 text-sm text-center py-8">Cargando asiento…</p>}

              {error && !loading && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <strong>No se encontró asiento contable.</strong>
                      <p className="mt-1 text-xs">{error}</p>
                      <p className="mt-2 text-xs text-amber-700">
                        Posibles causas: (1) la transacción falló al generar el asiento — revisar logs; (2) la transacción es muy antigua (antes de la implementación de asientos automáticos); (3) el tipo de transacción no genera asiento automático (ej. una simple orden pendiente sin cobro).
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-amber-200 pt-3 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => {
                        setOpen(false);
                        window.location.hash = '#contabilidad-asientos';
                        // Fallback: forzar recarga si estamos en otra pagina
                        setTimeout(() => {
                          if (!window.location.pathname.includes('contabilidad')) {
                            window.location.href = '/contabilidad#asientos';
                          }
                        }, 100);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-xs font-medium transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver todos los asientos (Libro Diario)
                    </button>
                    <button
                      onClick={abrir}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 text-xs font-medium transition-colors"
                    >
                      🔄 Reintentar
                    </button>
                  </div>
                </div>
              )}

              {asiento && !loading && (
                <div className="space-y-4">
                  {/* Metadatos del asiento */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Número</div>
                      <div className="font-mono font-bold text-gray-900">{asiento.numero || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Fecha</div>
                      <div className="font-medium text-gray-900">{asiento.fecha || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Tipo</div>
                      <div className="font-medium text-purple-700">{asiento.tipo || 'diario'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Origen</div>
                      <div className="font-medium text-gray-900">
                        {asiento.origen_automatico ? '🤖 Automático' : '✍️ Manual'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase">Descripción</div>
                    <div className="text-sm text-gray-900">{asiento.descripcion || '—'}</div>
                  </div>

                  {/* Tabla de partida doble */}
                  <div className="border border-purple-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-50">
                        <tr>
                          <th className="text-left py-2 px-3 text-purple-700 font-medium">Código</th>
                          <th className="text-left py-2 px-3 text-purple-700 font-medium">Cuenta</th>
                          <th className="text-right py-2 px-3 text-purple-700 font-medium">Debe</th>
                          <th className="text-right py-2 px-3 text-purple-700 font-medium">Haber</th>
                          <th className="text-left py-2 px-3 text-purple-700 font-medium">Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(asiento.items || []).map((it: any, i: number) => (
                          <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                            <td className="py-2 px-3 font-mono text-xs">{it.cuenta_codigo || '—'}</td>
                            <td className="py-2 px-3 text-gray-900">{it.cuenta_nombre || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">
                              {Number(it.debito || 0) > 0 ? `$${Number(it.debito).toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {Number(it.credito || 0) > 0 ? `$${Number(it.credito).toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-500">{it.descripcion || '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-purple-100 border-t-2 border-purple-300 font-bold">
                          <td colSpan={2} className="py-2 px-3 text-right text-purple-900">TOTALES:</td>
                          <td className="py-2 px-3 text-right font-mono text-purple-900">
                            ${Number(asiento.total_debito || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-purple-900">
                            ${Number(asiento.total_credito || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3">
                            {Math.abs(Number(asiento.total_debito) - Number(asiento.total_credito)) < 0.01
                              ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Balanceado</span>
                              : <span className="text-red-600 text-xs">✗ Descuadrado</span>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Historial (si hay más de un asiento con esta referencia) */}
                  {historial && historial.length > 1 && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase mb-2">
                        Otros asientos vinculados a esta transacción ({historial.length})
                      </div>
                      <div className="space-y-1 text-xs">
                        {historial.map((h: any, i: number) => (
                          <div key={i} className="flex justify-between p-2 bg-gray-50 rounded">
                            <span className="font-mono">{h.numero}</span>
                            <span className="text-gray-500">{h.fecha}</span>
                            <span>{h.tipo}</span>
                            <span className="font-mono">${Number(h.total_debito || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 border-t pt-2">
                    💡 Este asiento se refleja en: <strong>Libro Diario</strong>, <strong>Libro Mayor</strong> de cada cuenta afectada, <strong>Balance General</strong>, <strong>Estado de Resultados</strong> y <strong>Balance de Comprobación</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
