import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { FileCheck, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { projectId } from '/utils/supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

// ── Catálogo de tipos de retención ──────────────────────────────────────────
const TIPOS_IR = [
  { label: 'Ninguna',                        codigo: '',    porcentaje: 0 },
  { label: 'Bienes (1%)',                    codigo: '312', porcentaje: 1 },
  { label: 'Servicios (2%)',                 codigo: '341', porcentaje: 2 },
  { label: 'Honorarios profesionales (8%)',  codigo: '342', porcentaje: 8 },
  { label: 'Honorarios profesionales (10%)', codigo: '303', porcentaje: 10 },
  { label: 'Manual',                         codigo: 'manual', porcentaje: 0 },
];

const TIPOS_IVA = [
  { label: 'Ninguna',          codigo: '',       porcentaje: 0 },
  { label: 'Bienes (30%)',     codigo: '721',    porcentaje: 30 },
  { label: 'Servicios (70%)',  codigo: '723',    porcentaje: 70 },
  { label: 'Honorarios (100%)',codigo: '725',    porcentaje: 100 },
  { label: 'Manual',           codigo: 'manual', porcentaje: 0 },
];

interface RetenciónDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  compra: {
    id: string;
    numero_factura?: string;
    numero?: string;
    fecha?: string;
    created_at?: string;
    subtotal?: number;
    iva?: number;
    total_iva?: number;
    total_compra?: number;
    total?: number;
    proveedor?: {
      nombre?: string;
      ruc?: string;
      identificacion?: string;
      tipo_identificacion?: string;
    };
    metadata?: any;
  };
  onSuccess?: (retencion: any) => void;
}

export function RetenciónDialog({ open, onOpenChange, compra, onSuccess }: RetenciónDialogProps) {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Datos proveedor (de la compra) ──────────────────────────────────────
  const provNombre = compra.proveedor?.nombre
    || compra.metadata?.proveedor_nombre
    || compra.metadata?.info_sri?.razonSocialEmisor
    || '';
  const provRUC = compra.proveedor?.ruc
    || compra.proveedor?.identificacion
    || compra.metadata?.proveedor_ruc
    || compra.metadata?.info_sri?.rucEmisor
    || '';
  const provTipo = compra.proveedor?.tipo_identificacion || '04';

  // ── Base imponible IR = total sin impuestos (subtotal) ──────────────────
  const baseIR = Number(
    compra.metadata?.total_sin_impuestos
    || compra.subtotal
    || (compra.total_compra ? compra.total_compra / 1.15 : 0)
  );
  // ── Base IVA = iva pagado en la compra ──────────────────────────────────
  const baseIVA = Number(
    compra.metadata?.total_iva
    || compra.iva
    || compra.total_iva
    || 0
  );

  // ── Estado del formulario ────────────────────────────────────────────────
  const [tipoIR,        setTipoIR]        = useState('');
  const [codigoIR,      setCodigoIR]      = useState('');
  const [porcentajeIR,  setPorcentajeIR]  = useState('');
  const [baseIRVal,     setBaseIRVal]     = useState(baseIR.toFixed(2));

  const [tipoIVA,       setTipoIVA]       = useState('');
  const [codigoIVA,     setCodigoIVA]     = useState('');
  const [porcentajeIVA, setPorcentajeIVA] = useState('');
  const [baseIVAVal,    setBaseIVAVal]    = useState(baseIVA.toFixed(2));

  const [loading, setLoading] = useState(false);

  // Recalcular al cambiar compra o al abrir
  useEffect(() => {
    setBaseIRVal(baseIR.toFixed(2));
    setBaseIVAVal(baseIVA.toFixed(2));
    setTipoIR('');
    setCodigoIR('');
    setPorcentajeIR('');
    setTipoIVA('');
    setCodigoIVA('');
    setPorcentajeIVA('');
  }, [compra.id, open]);

  // Sincronizar preset IR
  const handleTipoIRChange = (val: string) => {
    setTipoIR(val);
    const preset = TIPOS_IR.find(t => t.label === val);
    if (preset && preset.codigo !== 'manual') {
      setCodigoIR(preset.codigo);
      setPorcentajeIR(preset.porcentaje > 0 ? preset.porcentaje.toString() : '');
    } else if (preset?.codigo === 'manual') {
      setCodigoIR('');
      setPorcentajeIR('');
    } else {
      setCodigoIR('');
      setPorcentajeIR('');
    }
  };

  // Sincronizar preset IVA
  const handleTipoIVAChange = (val: string) => {
    setTipoIVA(val);
    const preset = TIPOS_IVA.find(t => t.label === val);
    if (preset && preset.codigo !== 'manual') {
      setCodigoIVA(preset.codigo);
      setPorcentajeIVA(preset.porcentaje > 0 ? preset.porcentaje.toString() : '');
    } else if (preset?.codigo === 'manual') {
      setCodigoIVA('');
      setPorcentajeIVA('');
    } else {
      setCodigoIVA('');
      setPorcentajeIVA('');
    }
  };

  const valorRetIR  = tipoIR  && tipoIR  !== 'Ninguna' ? Math.round(Number(baseIRVal)  * (Number(porcentajeIR)  / 100) * 100) / 100 : 0;
  const valorRetIVA = tipoIVA && tipoIVA !== 'Ninguna' ? Math.round(Number(baseIVAVal) * (Number(porcentajeIVA) / 100) * 100) / 100 : 0;
  const totalRetenido = valorRetIR + valorRetIVA;

  const handleEmitir = async () => {
    if ((!tipoIR || tipoIR === 'Ninguna') && (!tipoIVA || tipoIVA === 'Ninguna')) {
      toast.error('Selecciona al menos un tipo de retención (IR o IVA)');
      return;
    }
    if (tipoIR && tipoIR !== 'Ninguna' && (!codigoIR || !porcentajeIR)) {
      toast.error('Completa el código y porcentaje de retención IR');
      return;
    }
    if (tipoIVA && tipoIVA !== 'Ninguna' && (!codigoIVA || !porcentajeIVA)) {
      toast.error('Completa el código y porcentaje de retención IVA');
      return;
    }

    const impuestos: any[] = [];

    if (tipoIR && tipoIR !== 'Ninguna' && codigoIR && porcentajeIR) {
      impuestos.push({
        codigo: '1',          // 1 = Renta
        codigo_retencion: codigoIR,
        descripcion: tipoIR,
        base_imponible: Number(baseIRVal),
        porcentaje: Number(porcentajeIR),
        valor_retenido: valorRetIR,
        cod_doc_sustento: '01',
        num_doc_sustento: compra.numero_factura || '',
        fecha_emision_doc_sustento: compra.fecha || '',
      });
    }

    if (tipoIVA && tipoIVA !== 'Ninguna' && codigoIVA && porcentajeIVA) {
      impuestos.push({
        codigo: '2',          // 2 = IVA
        codigo_retencion: codigoIVA,
        descripcion: tipoIVA,
        base_imponible: Number(baseIVAVal),
        porcentaje: Number(porcentajeIVA),
        valor_retenido: valorRetIVA,
        cod_doc_sustento: '01',
        num_doc_sustento: compra.numero_factura || '',
        fecha_emision_doc_sustento: compra.fecha || '',
      });
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/facturacion/retenciones`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          compra_id:                 compra.id,
          proveedor_identificacion:  provRUC,
          proveedor_tipo_id:         provTipo,
          proveedor_razon_social:    provNombre,
          doc_sustento_tipo:         '01',
          doc_sustento_numero:       compra.numero_factura || compra.numero || '',
          doc_sustento_fecha:        compra.fecha || compra.created_at?.split('T')[0] || '',
          impuestos,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al emitir retención');
        return;
      }

      const r = data.retencion;
      if (r.estado === 'AUTORIZADO') {
        toast.success(`✅ Retención ${r.numero_retencion} AUTORIZADA por el SRI`);
      } else if (r.estado === 'NO_AUTORIZADO') {
        toast.error(`❌ SRI rechazó la retención: ${(data.errores || r.mensajes_sri || []).join(', ')}`);
      } else {
        toast.warning(`⏱ Retención ${r.numero_retencion} pendiente de autorización`);
      }

      onSuccess?.(r);
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Error de red: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const isManualIR  = tipoIR  === 'Manual';
  const isManualIVA = tipoIVA === 'Manual';
  const hayIR  = tipoIR  && tipoIR  !== 'Ninguna';
  const hayIVA = tipoIVA && tipoIVA !== 'Ninguna';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#F97316]/20 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-[#F97316]" />
            Emitir Comprobante de Retención
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

          {/* Info de la compra */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Proveedor:</span>
              <span className="font-medium text-gray-900">{provNombre || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">RUC/ID:</span>
              <span className="font-mono text-gray-700">{provRUC || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">N° Factura:</span>
              <span className="font-mono text-gray-700">{compra.numero_factura || compra.numero || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fecha:</span>
              <span className="text-gray-700">{compra.fecha ? new Date(compra.fecha).toLocaleDateString('es-EC') : compra.created_at ? new Date(compra.created_at).toLocaleDateString('es-EC') : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal (sin IVA):</span>
              <span className="text-gray-900">${baseIR.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">IVA pagado:</span>
              <span className="text-gray-900">${baseIVA.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-gray-500">Total compra:</span>
              <span className="text-[#F97316]">${Number(compra.total_compra || compra.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Retención IR */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="font-semibold text-gray-800 text-sm">Retención Impuesto a la Renta (IR)</div>

            <div>
              <Label className="text-gray-700 text-xs mb-1 block">Tipo de Retención IR</Label>
              <Select value={tipoIR} onValueChange={handleTipoIRChange}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-900 h-9">
                  <SelectValue placeholder="Sin retención IR" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {TIPOS_IR.map(t => (
                    <SelectItem key={t.label} value={t.label} className="text-gray-900">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hayIR && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-gray-700 text-xs mb-1 block">Código SRI</Label>
                  <Input
                    value={codigoIR}
                    onChange={e => setCodigoIR(e.target.value)}
                    readOnly={!isManualIR}
                    className={`h-9 text-sm ${isManualIR ? 'bg-white border-[#F97316]/30' : 'bg-gray-50 border-gray-200'} text-gray-900`}
                    placeholder="312"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 text-xs mb-1 block">Base Imponible</Label>
                  <Input
                    value={baseIRVal}
                    onChange={e => setBaseIRVal(e.target.value)}
                    className="h-9 text-sm bg-white border-[#F97316]/30 text-gray-900"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 text-xs mb-1 block">Porcentaje %</Label>
                  <Input
                    value={porcentajeIR}
                    onChange={e => setPorcentajeIR(e.target.value)}
                    readOnly={!isManualIR}
                    className={`h-9 text-sm ${isManualIR ? 'bg-white border-[#F97316]/30' : 'bg-gray-50 border-gray-200'} text-gray-900`}
                    placeholder="1"
                  />
                </div>
              </div>
            )}

            {hayIR && porcentajeIR && (
              <div className="flex justify-between text-sm bg-orange-50 rounded p-2">
                <span className="text-gray-600">Valor retenido IR:</span>
                <span className="font-bold text-[#F97316]">${valorRetIR.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Retención IVA */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="font-semibold text-gray-800 text-sm">Retención IVA</div>

            <div>
              <Label className="text-gray-700 text-xs mb-1 block">Tipo de Retención IVA</Label>
              <Select value={tipoIVA} onValueChange={handleTipoIVAChange}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-900 h-9">
                  <SelectValue placeholder="Sin retención IVA" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {TIPOS_IVA.map(t => (
                    <SelectItem key={t.label} value={t.label} className="text-gray-900">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hayIVA && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-gray-700 text-xs mb-1 block">Código SRI</Label>
                  <Input
                    value={codigoIVA}
                    onChange={e => setCodigoIVA(e.target.value)}
                    readOnly={!isManualIVA}
                    className={`h-9 text-sm ${isManualIVA ? 'bg-white border-[#F97316]/30' : 'bg-gray-50 border-gray-200'} text-gray-900`}
                    placeholder="721"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 text-xs mb-1 block">Base (IVA pagado)</Label>
                  <Input
                    value={baseIVAVal}
                    onChange={e => setBaseIVAVal(e.target.value)}
                    className="h-9 text-sm bg-white border-[#F97316]/30 text-gray-900"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 text-xs mb-1 block">Porcentaje %</Label>
                  <Input
                    value={porcentajeIVA}
                    onChange={e => setPorcentajeIVA(e.target.value)}
                    readOnly={!isManualIVA}
                    className={`h-9 text-sm ${isManualIVA ? 'bg-white border-[#F97316]/30' : 'bg-gray-50 border-gray-200'} text-gray-900`}
                    placeholder="30"
                  />
                </div>
              </div>
            )}

            {hayIVA && porcentajeIVA && (
              <div className="flex justify-between text-sm bg-orange-50 rounded p-2">
                <span className="text-gray-600">Valor retenido IVA:</span>
                <span className="font-bold text-[#F97316]">${valorRetIVA.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Total */}
          {(hayIR || hayIVA) && (
            <div className="flex justify-between items-center bg-[#F97316]/10 rounded-lg p-3 border border-[#F97316]/20">
              <span className="font-bold text-gray-900">Total Retenido:</span>
              <span className="font-bold text-[#F97316] text-lg">${totalRetenido.toFixed(2)}</span>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-gray-200 text-gray-700"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEmitir}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-[#F97316] to-[#C2410C] text-white font-semibold"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Emitiendo...</>
              ) : (
                <><FileCheck className="w-4 h-4 mr-2" />Emitir Retención</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
