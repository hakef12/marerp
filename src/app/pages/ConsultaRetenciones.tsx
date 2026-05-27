import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  FileCheck, RefreshCw, Download, Search, Eye,
  CheckCircle, XCircle, Clock, Printer,
} from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '../components/ui/pagination';

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'ymxurlkqsxbmmkqsuoql';
const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

// ── Helper badge de estado ───────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'AUTORIZADO') return (
    <Badge className="bg-green-500/20 text-green-700 border-green-300">
      <CheckCircle className="w-3 h-3 mr-1" />AUTORIZADO
    </Badge>
  );
  if (estado === 'NO_AUTORIZADO') return (
    <Badge className="bg-red-500/20 text-red-700 border-red-300">
      <XCircle className="w-3 h-3 mr-1" />NO AUTORIZADO
    </Badge>
  );
  return (
    <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-300">
      <Clock className="w-3 h-3 mr-1" />PENDIENTE
    </Badge>
  );
}

// ── RIDE de retención (vista previa + impresión) ─────────────────────────────
function RIDERetencion({ retencion }: { retencion: any }) {
  const impuestos: any[] = retencion.impuestos || [];
  const estado = retencion.estado || 'PENDIENTE';

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) return;
    win.document.write(`
      <html><head><title>Retención ${retencion.numero_retencion}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 11px; width: 300px; margin: 0 auto; }
        .c { text-align: center; }
        .bold { font-weight: bold; }
        .sep { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td { padding: 1px 2px; }
        .total { font-size: 14px; }
        @media print { @page { margin: 0; } }
      </style>
      </head><body>
      <div class="c bold">${retencion.razon_social || ''}</div>
      <div class="c">RUC: ${retencion.ruc || ''}</div>
      <div class="c">${retencion.direccion_matriz || ''}</div>
      <div class="sep"></div>
      <div class="c bold">COMPROBANTE DE RETENCIÓN</div>
      <div class="c bold">${retencion.numero_retencion || ''}</div>
      <div class="c">Fecha: ${retencion.fecha_emision || ''}</div>
      <div class="c">Período: ${retencion.periodo_fiscal || ''}</div>
      <div class="sep"></div>
      <div class="bold">SUJETO RETENIDO:</div>
      <div>${retencion.proveedor_razon_social || ''}</div>
      <div>RUC/ID: ${retencion.proveedor_identificacion || ''}</div>
      <div class="sep"></div>
      <div class="bold">DOC. SUSTENTO:</div>
      <div>Tipo: ${retencion.doc_sustento_tipo === '01' ? 'Factura' : retencion.doc_sustento_tipo || ''}</div>
      <div>N°: ${retencion.doc_sustento_numero || ''}</div>
      <div>Fecha: ${retencion.doc_sustento_fecha || ''}</div>
      <div class="sep"></div>
      <div class="bold">DETALLE:</div>
      <table>
        <tr><th>Imp.</th><th>Cód.</th><th>Base</th><th>%</th><th>Valor</th></tr>
        ${impuestos.map(imp => `
          <tr>
            <td>${imp.codigo === '1' ? 'IR' : 'IVA'}</td>
            <td>${imp.codigo_retencion || ''}</td>
            <td>$${Number(imp.base_imponible).toFixed(2)}</td>
            <td>${Number(imp.porcentaje).toFixed(0)}%</td>
            <td>$${Number(imp.valor_retenido).toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
      <div class="sep"></div>
      <div class="row total"><span class="bold">TOTAL RETENIDO:</span><span class="bold">$${Number(retencion.total_retenido).toFixed(2)}</span></div>
      <div class="sep"></div>
      <div class="c bold">${estado === 'AUTORIZADO' ? '✓ AUTORIZADO POR EL SRI' : estado === 'NO_AUTORIZADO' ? '✗ NO AUTORIZADO' : '⏱ PENDIENTE'}</div>
      ${retencion.fecha_autorizacion ? `<div class="c">${retencion.fecha_autorizacion}</div>` : ''}
      <div class="sep"></div>
      <div class="c">CLAVE DE ACCESO:</div>
      <div style="word-break:break-all;font-size:8px;">${retencion.clave_acceso || ''}</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handlePrint} className="bg-gradient-to-r from-[#F97316] to-[#C2410C] text-white">
          <Printer className="w-4 h-4 mr-2" />Imprimir
        </Button>
      </div>

      {/* Vista previa */}
      <div className="bg-white text-black rounded-lg shadow-lg max-w-[340px] mx-auto p-4"
        style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', lineHeight: '1.4' }}>
        <div className="text-center font-bold">{retencion.razon_social}</div>
        <div className="text-center text-xs">RUC: {retencion.ruc}</div>
        <div className="text-center text-xs">{retencion.direccion_matriz}</div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="text-center font-bold">COMPROBANTE DE RETENCIÓN</div>
        <div className="text-center font-bold text-sm">{retencion.numero_retencion}</div>
        <div className="text-center text-xs">Fecha: {retencion.fecha_emision} | Período: {retencion.periodo_fiscal}</div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="text-xs font-bold">SUJETO RETENIDO:</div>
        <div className="text-xs">{retencion.proveedor_razon_social}</div>
        <div className="text-xs">RUC: {retencion.proveedor_identificacion}</div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="text-xs font-bold">DOC. SUSTENTO: {retencion.doc_sustento_numero}</div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="text-xs font-bold mb-1">IMPUESTOS RETENIDOS:</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left">Impuesto</th>
              <th className="text-right">Base</th>
              <th className="text-right">%</th>
              <th className="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {impuestos.map((imp, i) => (
              <tr key={i}>
                <td>{imp.codigo === '1' ? 'Renta' : 'IVA'} ({imp.codigo_retencion})</td>
                <td className="text-right">${Number(imp.base_imponible).toFixed(2)}</td>
                <td className="text-right">{Number(imp.porcentaje).toFixed(0)}%</td>
                <td className="text-right">${Number(imp.valor_retenido).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="flex justify-between font-bold">
          <span>TOTAL RETENIDO:</span>
          <span>${Number(retencion.total_retenido).toFixed(2)}</span>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className={`text-xs text-center p-2 rounded border ${
          estado === 'AUTORIZADO'    ? 'border-green-400 text-green-700' :
          estado === 'NO_AUTORIZADO' ? 'border-red-400 text-red-700' :
                                       'border-yellow-400 text-yellow-700'
        }`}>
          <div className="font-bold">
            {estado === 'AUTORIZADO'    && '✓ AUTORIZADO POR EL SRI'}
            {estado === 'NO_AUTORIZADO' && '✗ NO AUTORIZADO'}
            {estado === 'PENDIENTE'     && '⏱ PENDIENTE DE AUTORIZACIÓN'}
          </div>
          {retencion.fecha_autorizacion && <div className="mt-1">{retencion.fecha_autorizacion}</div>}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />
        <div className="text-center text-xs break-all">{retencion.clave_acceso}</div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function ConsultaRetenciones() {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [retenciones, setRetenciones] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [page,        setPage]        = useState(1);
  const [pages,       setPages]       = useState(1);
  const [total,       setTotal]       = useState(0);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroFi,    setFiltroFi]    = useState('');
  const [filtroFf,    setFiltroFf]    = useState('');
  const [retencionVista, setRetencionVista] = useState<any>(null);
  const [autorizando, setAutorizando] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroFi)     params.set('fecha_inicio', filtroFi);
      if (filtroFf)     params.set('fecha_fin', filtroFf);

      const res = await fetch(`${BASE}/facturacion/retenciones?${params}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRetenciones(data.retenciones || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setPage(p);
    } catch (e: any) {
      toast.error('Error cargando retenciones: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [token, filtroEstado, filtroFi, filtroFf]);

  useEffect(() => { load(1); }, [filtroEstado, filtroFi, filtroFf]);

  const handleReintentar = async (id: string) => {
    setAutorizando(id);
    try {
      const res = await fetch(`${BASE}/facturacion/retenciones/${id}/autorizar`, {
        method: 'POST', headers,
      });
      const data = await res.json();
      if (data.retencion?.estado === 'AUTORIZADO') {
        toast.success('✅ Retención AUTORIZADA por el SRI');
      } else {
        toast.warning('⏱ Aún pendiente de autorización');
      }
      load(page);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setAutorizando(null);
    }
  };

  const handleDescargarXML = async (r: any) => {
    try {
      const res = await fetch(`${BASE}/facturacion/retenciones/${r.id}/xml`, { headers });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retencion_${r.numero_retencion || r.id}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Error descargando XML: ' + e.message);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-[#F97316]" />
            Comprobantes de Retención
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {total} retención{total !== 1 ? 'es' : ''} registrada{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => load(page)} variant="outline" className="border-[#F97316]/30 text-gray-700">
          <RefreshCw className="w-4 h-4 mr-2" />Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card className="bg-white border-[#F97316]/20">
        <CardContent className="pt-4">
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 bg-white"
              >
                <option value="">Todos los estados</option>
                <option value="AUTORIZADO">Autorizado</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="NO_AUTORIZADO">No autorizado</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Desde:</span>
              <Input type="date" value={filtroFi} onChange={e => setFiltroFi(e.target.value)}
                className="h-8 text-sm bg-white border-gray-200 text-gray-900 w-36" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Hasta:</span>
              <Input type="date" value={filtroFf} onChange={e => setFiltroFf(e.target.value)}
                className="h-8 text-sm bg-white border-gray-200 text-gray-900 w-36" />
            </div>
            {(filtroEstado || filtroFi || filtroFf) && (
              <Button variant="ghost" size="sm" onClick={() => { setFiltroEstado(''); setFiltroFi(''); setFiltroFf(''); }}
                className="text-gray-500 hover:text-gray-800">
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="bg-white border-[#F97316]/20">
        <CardContent className="pt-4">
          {loading ? (
            <div className="text-center py-12 text-gray-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p>Cargando retenciones...</p>
            </div>
          ) : retenciones.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No hay retenciones</p>
              <p className="text-sm mt-1">Genera una desde <strong>Inventario → Compras</strong> con el botón <FileCheck className="w-3 h-3 inline" /></p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[#F97316]/20">
                  <TableHead className="text-gray-600">N° Retención</TableHead>
                  <TableHead className="text-gray-600">Fecha</TableHead>
                  <TableHead className="text-gray-600">Proveedor</TableHead>
                  <TableHead className="text-gray-600">Doc. Sustento</TableHead>
                  <TableHead className="text-gray-600">Estado</TableHead>
                  <TableHead className="text-gray-600 text-right">Total Retenido</TableHead>
                  <TableHead className="text-gray-600 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retenciones.map(r => (
                  <TableRow key={r.id} className="border-[#F97316]/10 hover:bg-gray-50">
                    <TableCell className="font-mono text-xs text-gray-900 font-medium">{r.numero_retencion || '—'}</TableCell>
                    <TableCell className="text-gray-600 text-sm">
                      {r.fecha_emision || new Date(r.created_at).toLocaleDateString('es-EC')}
                    </TableCell>
                    <TableCell className="text-gray-700 text-sm max-w-[180px] truncate">
                      <div className="font-medium">{r.proveedor_razon_social || '—'}</div>
                      <div className="text-xs text-gray-400">{r.proveedor_identificacion}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">{r.doc_sustento_numero || '—'}</TableCell>
                    <TableCell><EstadoBadge estado={r.estado || 'PENDIENTE'} /></TableCell>
                    <TableCell className="text-right font-bold text-[#F97316]">
                      ${Number(r.total_retenido || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Ver RIDE */}
                        <Button size="sm" variant="ghost" onClick={() => setRetencionVista(r)}
                          className="text-gray-600 hover:text-gray-900" title="Ver comprobante">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {/* Descargar XML */}
                        <Button size="sm" variant="ghost" onClick={() => handleDescargarXML(r)}
                          className="text-green-500 hover:text-green-700" title="Descargar XML">
                          <Download className="w-4 h-4" />
                        </Button>
                        {/* Reintentar autorización */}
                        {r.estado !== 'AUTORIZADO' && (
                          <Button size="sm" variant="ghost"
                            onClick={() => handleReintentar(r.id)}
                            disabled={autorizando === r.id}
                            className="text-blue-500 hover:text-blue-700" title="Reintentar autorización SRI">
                            <RefreshCw className={`w-4 h-4 ${autorizando === r.id ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Paginación */}
          {pages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => page > 1 && load(page - 1)}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                  </PaginationItem>
                  {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(p => (
                    <PaginationItem key={p}>
                      <PaginationLink onClick={() => load(p)} isActive={p === page} className="cursor-pointer">{p}</PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext onClick={() => page < pages && load(page + 1)}
                      className={page >= pages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog RIDE */}
      <Dialog open={!!retencionVista} onOpenChange={v => { if (!v) setRetencionVista(null); }}>
        <DialogContent className="bg-white border-[#F97316]/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-[#F97316]" />
              Retención {retencionVista?.numero_retencion}
            </DialogTitle>
          </DialogHeader>
          {retencionVista && <RIDERetencion retencion={retencionVista} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
