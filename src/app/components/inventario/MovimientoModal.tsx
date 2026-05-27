import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';

interface MovimientoModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productos: any[];
  bodegas: any[];
  token: string;
}

const EMPTY = {
  tipo: 'entrada',
  producto_id: '',
  bodega_id: '',
  cantidad: '',
  costo_total: '',
  costo_unitario: 0,
  referencia: '',
  observaciones: ''
};

export function MovimientoModal({ open, onClose, onSuccess, productos, bodegas, token }: MovimientoModalProps) {
  const [form, setForm] = useState({ ...EMPTY });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setForm({ ...EMPTY });
  }, [open]);

  // Auto-calcula costo unitario cuando cambian cantidad o costo total
  const cantidad = Number(form.cantidad) || 0;
  const costoTotal = Number(form.costo_total) || 0;
  const costoUnitario = cantidad > 0 && costoTotal > 0 ? costoTotal / cantidad : 0;

  const productoSeleccionado = productos.find(p => p.id === form.producto_id);

  const getAuthHeaders = async () => {
    const { publicAnonKey } = await import('/utils/supabase/info');
    return {
      'Authorization': `Bearer ${publicAnonKey}`,
      'X-User-Token': token || '',
      'Content-Type': 'application/json'
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.producto_id) return toast.error('Selecciona un producto');
    if (!form.bodega_id) return toast.error('Selecciona una bodega');
    if (cantidad <= 0) return toast.error('Ingresa una cantidad válida');

    setIsSubmitting(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();

      const payload = {
        tipo: form.tipo,
        producto_id: form.producto_id,
        bodega_id: form.bodega_id,
        cantidad,
        costo_unitario: costoUnitario,
        referencia: form.referencia,
        observaciones: form.observaciones
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/inventario/movimientos`,
        { method: 'POST', headers, body: JSON.stringify(payload) }
      );

      if (response.ok) {
        toast.success('Movimiento registrado — stock actualizado');
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al registrar movimiento');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const esEntrada = form.tipo === 'entrada';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-[#F97316]/30 text-gray-900 max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo Movimiento de Inventario</DialogTitle>
          <DialogDescription>Registra entradas, salidas o ajustes de stock.</DialogDescription>
        </DialogHeader>

        {bodegas.length === 0 && (
          <div className="bg-orange-500/20 border border-orange-500/30 rounded-lg p-3 text-sm text-orange-300">
            ⚠️ No hay bodegas registradas. Crea una bodega primero en la pestaña <strong>Bodegas</strong>.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Tipo */}
          <div className="space-y-1">
            <Label>Tipo de Movimiento *</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                <SelectItem value="entrada">Entrada (Compra / Ingreso)</SelectItem>
                <SelectItem value="salida">Salida (Consumo / Venta)</SelectItem>
                <SelectItem value="ajuste">Ajuste de Inventario</SelectItem>
                <SelectItem value="transferencia">Transferencia entre Bodegas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Producto */}
          <div className="space-y-1">
            <Label>Producto *</Label>
            <Select value={form.producto_id} onValueChange={v => setForm(f => ({ ...f, producto_id: v }))}>
              <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                <SelectValue placeholder="Seleccionar producto..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#F97316]/30 text-gray-900 max-h-60">
                {productos.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre} {p.unidad_medida ? `(${p.unidad_medida})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bodega */}
          <div className="space-y-1">
            <Label>Bodega *</Label>
            <Select value={form.bodega_id} onValueChange={v => setForm(f => ({ ...f, bodega_id: v }))}>
              <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                <SelectValue placeholder="Seleccionar bodega..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                {bodegas.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cantidad */}
          <div className="space-y-1">
            <Label>
              Cantidad *
              {productoSeleccionado?.unidad_medida && (
                <span className="text-gray-600 font-normal ml-1">({productoSeleccionado.unidad_medida})</span>
              )}
            </Label>
            <Input
              type="number" step="0.001" min="0"
              value={form.cantidad}
              onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
              className="bg-gray-50 border-[#F97316]/20 text-gray-900"
              placeholder="0"
              required
            />
          </div>

          {/* Costo — solo para entrada */}
          {esEntrada && (
            <div className="rounded-lg border border-[#F97316]/20 bg-[#F97316]/5 p-4 space-y-3">
              <p className="text-xs text-[#F97316] font-semibold uppercase tracking-wide">Costo de la compra</p>

              <div className="space-y-1">
                <Label>Costo Total de la Compra ($)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.costo_total}
                  onChange={e => setForm(f => ({ ...f, costo_total: e.target.value }))}
                  className="bg-gray-50 border-[#F97316]/20 text-gray-900"
                  placeholder="Ej: 35.80"
                />
                <p className="text-xs text-gray-600">Total que pagaste al proveedor por esta cantidad</p>
              </div>

              {costoUnitario > 0 && (
                <div className="flex items-center justify-between bg-[#F97316]/10 rounded px-3 py-2">
                  <span className="text-sm text-gray-600">
                    Costo por {productoSeleccionado?.unidad_medida || 'unidad'}:
                  </span>
                  <span className="text-[#F97316] font-bold text-lg">
                    ${costoUnitario.toFixed(4)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Referencia */}
          <div className="space-y-1">
            <Label>Referencia</Label>
            <Input
              value={form.referencia}
              onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
              className="bg-gray-50 border-[#F97316]/20 text-gray-900"
              placeholder="Ej: Factura 001-001-000123"
            />
          </div>

          {/* Observaciones */}
          <div className="space-y-1">
            <Label>Observaciones</Label>
            <Textarea
              value={form.observaciones}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              className="bg-gray-50 border-[#F97316]/20 text-gray-900"
              rows={2}
              placeholder="Notas adicionales..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-[#F97316]/20 text-gray-600">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold">
              {isSubmitting ? 'Registrando...' : 'Registrar Movimiento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
