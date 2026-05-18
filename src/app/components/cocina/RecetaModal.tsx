import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { X, Plus, Trash2, Package, DollarSign, TrendingUp, ChefHat } from 'lucide-react';

interface RecetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  receta?: any;
}

export default function RecetaModal({ isOpen, onClose, onSuccess, receta }: RecetaModalProps) {
  const { token } = useAuth();
  const [productos, setProductos] = useState<any[]>([]);

  // Inicialización directa desde la prop — evita la condición de carrera de useEffect
  const buildFormData = (r: any) => r ? {
    nombre: r.nombre || '',
    descripcion: r.descripcion || '',
    categoria: r.categoria || 'Platos Principales',
    producto_id: r.producto_id ? String(r.producto_id) : '',
    porciones: r.porciones || 1,
    tiempo_preparacion: r.tiempo_preparacion || 0,
    dificultad: r.dificultad || 'media',
    precio_sugerido: r.precio_sugerido || 0,
    instrucciones: r.instrucciones || '',
  } : {
    nombre: '', descripcion: '', categoria: 'Platos Principales',
    producto_id: '', porciones: 1, tiempo_preparacion: 0,
    dificultad: 'media', precio_sugerido: 0, instrucciones: '',
  };

  const buildIngredientes = (r: any) => {
    const list = r?.ingredientes || r?.receta_ingredientes || [];
    if (list.length > 0) {
      return list.map((ing: any) => {
        const rawId = ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id || '';
        return {
          insumo_id: String(rawId),
          cantidad: parseFloat(ing.cantidad) || 0,
          unidad_medida: ing.unidad_medida || 'und',
          costo_unitario: parseFloat(ing.costo_unitario) || 0,
          notas: ing.notas || ''
        };
      });
    }
    return [{ insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }];
  };

  const [formData, setFormData] = useState(() => buildFormData(receta));
  const [ingredientes, setIngredientes] = useState<any[]>(() => buildIngredientes(receta));
  const [metodoPrecio, setMetodoPrecio] = useState<'foodcost' | 'manual'>('foodcost');
  const [foodCostPorcentaje, setFoodCostPorcentaje] = useState(30);

  // Re-inicializar cuando cambia la receta (por si el componente se reutiliza sin desmontarse)
  useEffect(() => {
    setFormData(buildFormData(receta));
    setIngredientes(buildIngredientes(receta));
  }, [receta?.id]);

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/productos`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '' } }
        );
        if (response.ok) {
          const data = await response.json();
          setProductos(data.productos || []);
        }
      } catch (error) {}
    };
    if (isOpen && token) fetchProductos();
  }, [isOpen, token]);

  const agregarIngrediente = () => setIngredientes([...ingredientes, { insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }]);
  const eliminarIngrediente = (index: number) => { if (ingredientes.length > 1) setIngredientes(ingredientes.filter((_, i) => i !== index)); };

  const actualizarIngrediente = (index: number, field: string, value: any) => {
    const nuevosIngredientes = [...ingredientes];
    nuevosIngredientes[index] = { ...nuevosIngredientes[index], [field]: value };

    if (field === 'insumo_id') {
      const producto = productos.find(p => String(p.id) === String(value));
      if (producto) {
        // Intentar todos los campos donde puede estar el costo, incluyendo sub-recetas
        nuevosIngredientes[index].costo_unitario =
          parseFloat(producto.precio_compra)  ||  // compras / costo calculado de receta
          parseFloat(producto.costo_receta)   ||  // campo alternativo de sub-receta
          parseFloat(producto.costo_unitario) ||  // campo legacy
          parseFloat(producto.costo_promedio) ||  // promedio ponderado
          0;
      }
    }
    setIngredientes(nuevosIngredientes);
  };

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ((parseFloat(ing.cantidad) || 0) * (parseFloat(ing.costo_unitario) || 0)), 0);
  const costoPorPorcion = formData.porciones > 0 ? costoTotal / formData.porciones : 0;

  useEffect(() => {
    if (metodoPrecio === 'foodcost' && costoPorPorcion > 0) {
      const precioCalculado = costoPorPorcion / (foodCostPorcentaje / 100);
      setFormData(prev => ({ ...prev, precio_sugerido: parseFloat(precioCalculado.toFixed(2)) }));
    }
  }, [costoPorPorcion, foodCostPorcentaje, metodoPrecio]);

  const foodCostReal = formData.precio_sugerido > 0 ? (costoPorPorcion / formData.precio_sugerido) * 100 : 0;
  // Margen bruto = (precio - costo) / precio × 100  (no markup)
  const margen = formData.precio_sugerido > 0 && costoPorPorcion > 0 ? ((formData.precio_sugerido - costoPorPorcion) / formData.precio_sugerido) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre) return toast.error('El nombre de la receta es requerido');
    
    const ingredientesValidos = ingredientes.filter(ing => ing.insumo_id && parseFloat(ing.cantidad) > 0);
    if (ingredientesValidos.length === 0) return toast.error('Debes agregar al menos un ingrediente con cantidad válida');

    try {
      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const body = {
        ...formData,
        porciones: parseInt(formData.porciones as any) || 1,
        precio_sugerido: parseFloat(formData.precio_sugerido as any) || 0,
        ingredientes: ingredientesValidos.map(ing => ({
          insumo_id: ing.insumo_id, 
          cantidad: parseFloat(ing.cantidad) || 0,
          unidad_medida: ing.unidad_medida,
          costo_unitario: parseFloat(ing.costo_unitario) || 0,
          costo_total: (parseFloat(ing.cantidad) || 0) * (parseFloat(ing.costo_unitario) || 0),
          notas: ing.notas
        }))
      };

      const url = receta 
        ? `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas/${receta.id}`
        : `https://${projectId}.supabase.co/functions/v1/server/cocina/recetas`;

      const response = await fetch(url, {
        method: receta ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'X-User-Token': token || '', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(receta ? 'Receta actualizada' : 'Receta creada exitosamente');
        onSuccess();
        onClose();
      } else {
        toast.error('Error al guardar receta');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A1A2F] rounded-xl border border-[#00E5FF]/30 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0A1A2F] border-b border-[#00E5FF]/20 p-6 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-[#00E5FF]" /> {receta ? 'Editar Receta' : 'Nueva Receta'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Nombre de la Receta *</Label>
              <Input value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} className="bg-[#1a3a52] border-[#00E5FF]/20 text-white" required />
            </div>
            <div>
              <Label className="text-gray-300">Producto Final *</Label>
              <Select value={String(formData.producto_id)} onValueChange={(v) => setFormData({ ...formData, producto_id: v })}>
                <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {productos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300">Porciones *</Label>
              <Input type="number" min="1" value={formData.porciones} onChange={(e) => setFormData({ ...formData, porciones: parseInt(e.target.value) || 1 })} className="bg-[#1a3a52] border-[#00E5FF]/20 text-white" required />
            </div>
            <div>
              <Label className="text-gray-300">Tiempo de Preparación (minutos)</Label>
              <Input type="number" min="0" value={formData.tiempo_preparacion} onChange={(e) => setFormData({ ...formData, tiempo_preparacion: parseInt(e.target.value) || 0 })} className="bg-[#1a3a52] border-[#00E5FF]/20 text-white" />
            </div>
            <div>
              <Label className="text-gray-300">Dificultad</Label>
              <Select value={formData.dificultad} onValueChange={(value) => setFormData({ ...formData, dificultad: value })}>
                <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="facil">Fácil</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="dificil">Difícil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300">Categoría</Label>
              <Select value={formData.categoria} onValueChange={(value) => setFormData({ ...formData, categoria: value })}>
                <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entradas">Entradas</SelectItem><SelectItem value="Platos Principales">Platos Principales</SelectItem>
                  <SelectItem value="Guarniciones">Guarniciones</SelectItem><SelectItem value="Postres">Postres</SelectItem>
                  <SelectItem value="Bebidas">Bebidas</SelectItem><SelectItem value="Salsas">Salsas</SelectItem>
                  <SelectItem value="Panadería">Panadería</SelectItem><SelectItem value="Otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Descripción</Label>
            <textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} rows={2} className="w-full bg-[#1a3a52] border border-[#00E5FF]/20 rounded-lg p-3 text-white" />
          </div>

          <div className="border border-[#00E5FF]/20 rounded-lg p-4 bg-[#1a3a52]/20">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Ingredientes</h3>
              <Button type="button" onClick={agregarIngrediente} className="bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]" size="sm"><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
            <div className="space-y-3">
              {ingredientes.map((ingrediente, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end bg-[#0A1A2F]/50 p-3 rounded-lg">
                  <div className="col-span-4">
                    <Label className="text-gray-400 text-xs">Producto del Inventario</Label>
                    {/* ✅ AQUÍ SE USA STRING() PARA GARANTIZAR QUE EL SELECT LO MUESTRE */}
                    <Select value={String(ingrediente.insumo_id)} onValueChange={(value) => actualizarIngrediente(index, 'insumo_id', value)}>
                      <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {productos.map((producto) => (
                          <SelectItem key={producto.id} value={String(producto.id)}>{producto.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-400 text-xs">Cantidad</Label>
                    <Input type="number" step="0.0001" min="0" value={ingrediente.cantidad} onChange={(e) => actualizarIngrediente(index, 'cantidad', e.target.value)} className="bg-[#1a3a52] border-[#00E5FF]/20 text-white text-sm" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-400 text-xs">Unidad</Label>
                    <Select value={ingrediente.unidad_medida} onValueChange={(value) => actualizarIngrediente(index, 'unidad_medida', value)}>
                      <SelectTrigger className="bg-[#1a3a52] border-[#00E5FF]/20 text-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="und">Unidad</SelectItem><SelectItem value="kg">Kilogramo</SelectItem><SelectItem value="g">Gramo</SelectItem><SelectItem value="l">Litro</SelectItem>
                        <SelectItem value="ml">Mililitro</SelectItem><SelectItem value="lb">Libra</SelectItem><SelectItem value="oz">Onza</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-400 text-xs">Costo Unit. ($)</Label>
                    <Input type="number" step="0.01" min="0" value={ingrediente.costo_unitario} onChange={(e) => actualizarIngrediente(index, 'costo_unitario', e.target.value)} className="bg-[#00E5FF]/10 border-[#00E5FF]/30 text-white text-sm font-bold" />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <Button type="button" onClick={() => eliminarIngrediente(index)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10 w-full" disabled={ingredientes.length === 1}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel Costos */}
            <div className="bg-gradient-to-br from-[#1e64a7]/20 to-[#00E5FF]/20 rounded-lg p-4 border border-[#00E5FF]/30">
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><DollarSign className="w-5 h-5 text-[#00E5FF]" /> Costos</h3>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-300">Costo Ingredientes:</span><span className="text-xl font-bold text-white">${costoTotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-300">Porciones:</span><span className="text-xl font-bold text-[#00E5FF]">{formData.porciones}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-2">
                  <span className="text-gray-300 font-bold">Costo / Porción:</span>
                  <span className="text-2xl font-black text-[#7B61FF]">${costoPorPorcion.toFixed(4)}</span>
                </div>
                {formData.producto_id && costoPorPorcion > 0 && (
                  <div className="mt-2 bg-[#7B61FF]/10 border border-[#7B61FF]/30 rounded p-2 flex items-center gap-2 text-xs text-[#7B61FF]">
                    <ChefHat className="w-4 h-4 flex-shrink-0" />
                    <span>Este costo se guardará como precio de compra del producto final</span>
                  </div>
                )}
              </div>
            </div>

            {/* Panel Precio */}
            <div className="bg-gradient-to-br from-[#7B61FF]/20 to-[#00E5FF]/20 rounded-lg p-4 border border-[#7B61FF]/30">
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#7B61FF]" /> Precio Sugerido</h3>
              <div className="mb-3">
                <Label className="text-gray-300 text-sm">Método de cálculo</Label>
                <div className="flex gap-2 mt-1">
                  <Button type="button" onClick={() => setMetodoPrecio('foodcost')} className={`flex-1 ${metodoPrecio === 'foodcost' ? 'bg-[#00E5FF] text-black' : 'bg-gray-700 text-white'}`} size="sm">Food Cost %</Button>
                  <Button type="button" onClick={() => setMetodoPrecio('manual')} className={`flex-1 ${metodoPrecio === 'manual' ? 'bg-[#00E5FF] text-black' : 'bg-gray-700 text-white'}`} size="sm">Manual</Button>
                </div>
              </div>

              {metodoPrecio === 'foodcost' && (
                <div className="mb-3">
                  <Label className="text-gray-300 text-sm">% Food Cost objetivo</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number" min="1" max="100" step="1"
                      value={foodCostPorcentaje}
                      onChange={e => setFoodCostPorcentaje(Math.min(100, Math.max(1, parseInt(e.target.value) || 30)))}
                      className="bg-[#1a3a52] text-white w-24"
                    />
                    <span className="text-gray-400 text-sm">% del costo total</span>
                  </div>
                </div>
              )}

              <div className="mb-3">
                <Label className="text-gray-300 text-sm">Precio sugerido ($)</Label>
                <Input
                  type="number" step="0.01"
                  value={formData.precio_sugerido}
                  onChange={(e) => setFormData({ ...formData, precio_sugerido: parseFloat(e.target.value) || 0 })}
                  className="bg-[#1a3a52] text-white font-bold text-xl mt-1"
                  disabled={metodoPrecio === 'foodcost'}
                />
              </div>

              {/* Indicadores de rentabilidad */}
              {formData.precio_sugerido > 0 && costoPorPorcion > 0 && (
                <div className="space-y-1 border-t border-white/10 pt-3 mt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">% Food Cost real:</span>
                    <span className={`font-bold ${foodCostReal <= 30 ? 'text-green-400' : foodCostReal <= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {foodCostReal.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Margen bruto:</span>
                    <span className="font-bold text-[#00E5FF]">{margen.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Ganancia / porción:</span>
                    <span className="font-bold text-green-400">${(formData.precio_sugerido - costoPorPorcion).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Instrucciones</Label>
            <textarea value={formData.instrucciones} onChange={(e) => setFormData({ ...formData, instrucciones: e.target.value })} rows={4} className="w-full bg-[#1a3a52] border border-[#00E5FF]/20 rounded-lg p-3 text-white" />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
            <Button type="button" onClick={onClose} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">Cancelar</Button>
            <Button type="submit" className="bg-gradient-to-r from-green-600 to-green-500">Guardar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}