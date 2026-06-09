import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { Calculator, TrendingUp, AlertTriangle, Info, Beef, Apple, Coffee, Package, ChefHat, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { useAuth } from '../../context/AuthContext';

const CATEGORIAS_ALIMENTOS = [
  { id: "Proteínas y Carnes", icon: <Beef className="w-4 h-4" /> },
  { id: "Frutas y Verduras", icon: <Apple className="w-4 h-4" /> },
  { id: "Lácteos y Huevos", icon: <Package className="w-4 h-4" /> },
  { id: "Abarrotes y Secos", icon: <Package className="w-4 h-4" /> },
  { id: "Bebidas y Licores", icon: <Coffee className="w-4 h-4" /> },
  { id: "Salsas y Condimentos", icon: <Package className="w-4 h-4" /> },
  { id: "Panadería y Repostería", icon: <Package className="w-4 h-4" /> },
  { id: "Insumos y Empaques", icon: <Package className="w-4 h-4" /> },
  { id: "Plato Terminado", icon: <ChefHat className="w-4 h-4" /> }
];

interface ProductoModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  producto?: any;
  categorias: any[];
  token: string;
  onLimiteAlcanzado?: (mensaje: string) => void;
}

const EMPTY_FORM = {
  codigo: '',
  codigo_barras: '',
  nombre: '',
  descripcion: '',
  categoria_id: '',
  tipo: 'producto',
  precio_compra: 0,
  precio_venta: 0,
  porcentaje_iva: 15,
  impuesto_incluido: false,
  unidad_medida: 'unidad',
  gestiona_inventario: true,
  stock_minimo: 0,
  stock_maximo: 0,
  punto_pedido: 0,
  consumo_promedio_diario: 0,
  lead_time_dias: 0,
  disponible: true,
  es_receta: false
};

function formFromProducto(p: any) {
  return {
    codigo: p.codigo || '',
    codigo_barras: p.codigo_barras || '',
    nombre: p.nombre || '',
    descripcion: p.descripcion || '',
    categoria_id: p.categoria_id || '',
    tipo: p.tipo || 'producto',
    precio_compra: p.precio_compra || 0,
    precio_venta: p.precio_venta || 0,
    porcentaje_iva: p.porcentaje_iva ?? 15,
    impuesto_incluido: p.impuesto_incluido || false,
    unidad_medida: p.unidad_medida || 'unidad',
    gestiona_inventario: p.gestiona_inventario !== false,
    stock_minimo: p.stock_minimo || 0,
    stock_maximo: p.stock_maximo || 0,
    punto_pedido: p.punto_pedido || 0,
    consumo_promedio_diario: p.consumo_promedio_diario || 0,
    lead_time_dias: p.lead_time_dias || 0,
    disponible: p.disponible !== false,
    es_receta: p.es_receta || false
  };
}

export function ProductoModal({ open, onClose, onSuccess, producto, categorias, token, onLimiteAlcanzado }: ProductoModalProps) {
  const { user } = useAuth();

  const [formData, setFormData] = useState(() => producto ? formFromProducto(producto) : { ...EMPTY_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cuando cambia el producto o el modal abre/cierra, resetear el formulario
  useEffect(() => {
    if (producto) {
      setFormData(formFromProducto(producto));
    } else {
      setFormData({ ...EMPTY_FORM });
    }
  }, [producto, open]);

  const generarCodigo = (categoriaId: string, tipo: string) => {
    const cleanCat = categoriaId.normalize("NFD").replace(/\p{M}/gu, "");
    const catPrefix = cleanCat.substring(0, 3).toUpperCase();
    const tipoPrefix = tipo.substring(0, 3).toUpperCase();
    const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
    return `${catPrefix}-${tipoPrefix}-${randomSuffix}`;
  };

  const handleSelectCategoria = (catId: string) => {
    setFormData(prev => ({
      ...prev,
      categoria_id: catId,
      codigo: generarCodigo(catId, prev.tipo)
    }));
  };

  const handleSelectTipo = (tipo: string) => {
    setFormData(prev => ({
      ...prev,
      tipo,
      ...(prev.categoria_id ? { codigo: generarCodigo(prev.categoria_id, tipo) } : {})
    }));
  };

  const calcularParametrosInventario = () => {
    const { consumo_promedio_diario, lead_time_dias, stock_minimo } = formData;
    if (consumo_promedio_diario > 0 && lead_time_dias > 0) {
      const puntoPedidoCalculado = (consumo_promedio_diario * lead_time_dias) + stock_minimo;
      const stockMaximoCalculado = puntoPedidoCalculado * 2;
      setFormData(prev => ({
        ...prev,
        punto_pedido: Math.ceil(puntoPedidoCalculado),
        stock_maximo: Math.ceil(stockMaximoCalculado)
      }));
      toast.success('Parámetros calculados automáticamente');
    } else {
      toast.error('Ingresa consumo diario y lead time para calcular');
    }
  };

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
    if (!formData.categoria_id) return toast.error("Selecciona una categoría alimenticia");

    setIsSubmitting(true);

    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();

      const url = producto
        ? `https://${projectId}.supabase.co/functions/v1/server/productos/${producto.id}`
        : `https://${projectId}.supabase.co/functions/v1/server/productos`;

      const method = producto ? 'PUT' : 'POST';

      const payloadToSave = {
        ...formData,
        // empresa_id lo sobreescribe el backend con auth.empresaId — solo enviamos como referencia
        empresa_id: user?.empresa?.id ?? user?.empresa_id ?? undefined,
      };

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payloadToSave)
      });

      if (response.ok) {
        toast.success(producto ? 'Producto actualizado' : 'Producto creado exitosamente');
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        if (error.codigo === 'LIMITE_ALCANZADO') {
          onClose();
          onLimiteAlcanzado?.(error.error);
        } else {
          toast.error(error.error || 'Error al guardar producto');
        }
      }
    } catch (error) {
      toast.error('Error de conexión al guardar producto');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-[#F97316]/30 text-gray-900 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{producto ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
          <DialogDescription>
            {producto ? 'Actualiza los detalles del producto' : 'Añade un nuevo producto a tu inventario'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código * {!producto && <span className="text-xs text-[#F97316]">(Auto-generado)</span>}</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  className="bg-gray-50 border-[#F97316]/20 text-[#F97316] font-black tracking-widest uppercase flex-1"
                  placeholder="Selecciona Categoría y Tipo"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Código de Barras</Label>
              <Input value={formData.codigo_barras} onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" placeholder="Ej: 7501234567890" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nombre del Producto *</Label>
            <Input value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" placeholder="Ej: Tomate Riñón" required />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" rows={2} />
          </div>

          {/* SELECTOR DE CATEGORÍAS */}
          <div className="space-y-3 pt-2">
            <Label className="text-base text-[#F97316]">Categoría de Alimentos *</Label>
            {formData.categoria_id && !CATEGORIAS_ALIMENTOS.find(c => c.id === formData.categoria_id) && (
              <div className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded px-3 py-2">
                Categoría actual: <strong>{categorias.find((c: any) => c.id === formData.categoria_id)?.nombre || formData.categoria_id}</strong> — selecciona una de abajo para cambiarla.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {CATEGORIAS_ALIMENTOS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategoria(cat.id)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                    formData.categoria_id === cat.id
                      ? 'border-[#F97316] bg-[#F97316]/20 text-[#F97316]'
                      : 'border-[#F97316]/20 bg-gray-50 text-gray-600 hover:border-[#F97316]/50'
                  }`}
                >
                  <div className={formData.categoria_id === cat.id ? 'text-[#F97316]' : 'text-gray-600'}>
                    {cat.icon}
                  </div>
                  <span className="text-left leading-tight text-xs font-medium">{cat.id}</span>
                  {formData.categoria_id === cat.id && <CheckCircle className="w-4 h-4 ml-auto text-[#F97316]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={formData.tipo} onValueChange={handleSelectTipo}>
                <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                  <SelectItem value="producto">Producto</SelectItem>
                  <SelectItem value="insumo">Insumo</SelectItem>
                  <SelectItem value="servicio">Servicio</SelectItem>
                  <SelectItem value="combo">Combo</SelectItem>
                  <SelectItem value="platillo">Platillo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Unidad de Medida</Label>
              <Select value={formData.unidad_medida} onValueChange={(value) => setFormData({ ...formData, unidad_medida: value })}>
                <SelectTrigger className="bg-gray-50 border-[#F97316]/20 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#F97316]/30 text-gray-900">
                  <SelectItem value="unidad">Unidad</SelectItem>
                  <SelectItem value="kilogramo">Kilogramo (kg)</SelectItem>
                  <SelectItem value="gramo">Gramo (g)</SelectItem>
                  <SelectItem value="litro">Litro (l)</SelectItem>
                  <SelectItem value="mililitro">Mililitro (ml)</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="l">l</SelectItem>
                  <SelectItem value="caja">Caja</SelectItem>
                  <SelectItem value="paquete">Paquete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Precio Compra</Label>
              <Input type="number" step="0.01" value={formData.precio_compra} onChange={(e) => setFormData({ ...formData, precio_compra: parseFloat(e.target.value) || 0 })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
            </div>

            <div className="space-y-2">
              <Label>Precio Venta *</Label>
              <Input type="number" step="0.01" value={formData.precio_venta} onChange={(e) => setFormData({ ...formData, precio_venta: parseFloat(e.target.value) || 0 })} className="bg-gray-50 border-[#F97316]/20 text-[#F97316] font-bold" required />
            </div>

            <div className="space-y-2">
              <Label>IVA (%)</Label>
              <Input type="number" step="0.01" value={formData.porcentaje_iva} onChange={(e) => setFormData({ ...formData, porcentaje_iva: parseFloat(e.target.value) || 0 })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stock Mínimo (Seguridad)</Label>
            <Input type="number" value={formData.stock_minimo} onChange={(e) => setFormData({ ...formData, stock_minimo: parseFloat(e.target.value) || 0 })} className="bg-gray-50 border-[#F97316]/20 text-gray-900 w-1/2" placeholder="Ej: 10" />
            <p className="text-xs text-gray-600 mt-1"><Info className="w-3 h-3 inline mr-1" />Stock de seguridad para evitar roturas</p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-2 rounded bg-gray-50 border border-[#F97316]/10"><Label>Impuesto Incluido en Precio</Label><Switch checked={formData.impuesto_incluido} onCheckedChange={(checked) => setFormData({ ...formData, impuesto_incluido: checked })} /></div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-50 border border-[#F97316]/10"><Label>Gestionar Inventario</Label><Switch checked={formData.gestiona_inventario} onCheckedChange={(checked) => setFormData({ ...formData, gestiona_inventario: checked })} /></div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-50 border border-[#F97316]/10"><Label>Producto con Receta (Fórmula)</Label><Switch checked={formData.es_receta} onCheckedChange={(checked) => setFormData({ ...formData, es_receta: checked })} /></div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-50 border border-[#F97316]/10"><Label>Disponible para Venta</Label><Switch checked={formData.disponible} onCheckedChange={(checked) => setFormData({ ...formData, disponible: checked })} /></div>
          </div>

          {formData.gestiona_inventario && (
            <Card className="bg-[#C2410C]/10 border-[#F97316]/30 mt-4">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-gray-900 font-semibold flex items-center gap-2"><Calculator className="w-4 h-4 text-[#F97316]" />Gestión Avanzada de Inventario</h4>
                    <p className="text-xs text-gray-600 mt-1">Configura los parámetros para control automático de reorden</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-sm">Consumo Promedio Diario</Label><Input type="number" step="0.01" value={formData.consumo_promedio_diario} onChange={(e) => setFormData({ ...formData, consumo_promedio_diario: parseFloat(e.target.value) || 0 })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" /></div>
                  <div className="space-y-2"><Label className="text-sm">Lead Time (días)</Label><Input type="number" value={formData.lead_time_dias} onChange={(e) => setFormData({ ...formData, lead_time_dias: parseInt(e.target.value) || 0 })} className="bg-gray-50 border-[#F97316]/20 text-gray-900" /></div>
                </div>

                <Button type="button" onClick={calcularParametrosInventario} className="w-full bg-[#F97316]/20 hover:bg-[#F97316]/30 text-[#F97316] border border-[#F97316]/30">
                  <Calculator className="w-4 h-4 mr-2" />Calcular Automáticamente
                </Button>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-sm flex items-center gap-2"><TrendingUp className="w-3 h-3 text-yellow-400" />Punto de Pedido</Label><Input type="number" value={formData.punto_pedido} onChange={(e) => setFormData({ ...formData, punto_pedido: parseInt(e.target.value) || 0 })} className="bg-gray-50 border-yellow-500/20 text-gray-900" /></div>
                  <div className="space-y-2"><Label className="text-sm flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-green-400" />Stock Máximo</Label><Input type="number" value={formData.stock_maximo} onChange={(e) => setFormData({ ...formData, stock_maximo: parseInt(e.target.value) || 0 })} className="bg-gray-50 border-green-500/20 text-gray-900" /></div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-[#F97316]/20 text-gray-600 hover:text-gray-900 hover:bg-gray-50">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-[#C2410C] to-[#F97316] text-white font-bold">{isSubmitting ? 'Guardando...' : producto ? 'Actualizar' : 'Crear Producto'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
