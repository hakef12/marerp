import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { X, Plus, Trash2, Package, DollarSign, TrendingUp } from 'lucide-react';

interface RecetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  receta?: any;
}

export default function RecetaModal({ isOpen, onClose, onSuccess, receta }: RecetaModalProps) {
  const { token } = useAuth();
  const [productos, setProductos] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    categoria: 'Platos Principales',
    producto_id: '',
    porciones: 1,
    tiempo_preparacion: 0,
    dificultad: 'media',
    precio_sugerido: 0,
    instrucciones: '',
  });

  const [ingredientes, setIngredientes] = useState<any[]>([{
    insumo_id: '', 
    cantidad: 0,
    unidad_medida: 'und',
    costo_unitario: 0,
    notas: ''
  }]);

  const [metodoPrecio, setMetodoPrecio] = useState<'foodcost' | 'manual'>('foodcost');
  const [foodCostPorcentaje, setFoodCostPorcentaje] = useState(30); 

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

  useEffect(() => {
    if (receta) {
      setFormData({
        nombre: receta.nombre || '',
        descripcion: receta.descripcion || '',
        categoria: receta.categoria || 'Platos Principales',
        producto_id: receta.producto_id ? String(receta.producto_id) : '',
        porciones: receta.porciones || 1,
        tiempo_preparacion: receta.tiempo_preparacion || 0,
        dificultad: receta.dificultad || 'media',
        precio_sugerido: receta.precio_sugerido || 0,
        instrucciones: receta.instrucciones || '',
      });

      // ✅ EXTRACCIÓN A PRUEBA DE BALAS: Convierte los IDs a String obligatoriamente
      const ingredientesList = receta.ingredientes || receta.receta_ingredientes || [];
      
      if (ingredientesList.length > 0) {
        setIngredientes(ingredientesList.map((ing: any) => {
          const rawId = ing.insumo_id || ing.producto_id || ing.insumo?.id || ing.productos?.id || '';
          return {
            insumo_id: String(rawId), // String() obliga a que el Select de React lo reconozca
            cantidad: parseFloat(ing.cantidad) || 0,
            unidad_medida: ing.unidad_medida || 'und',
            costo_unitario: parseFloat(ing.costo_unitario) || 0,
            notas: ing.notas || ''
          };
        }));
      } else {
        setIngredientes([{ insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }]);
      }
    } else {
      setFormData({ nombre: '', descripcion: '', categoria: 'Platos Principales', producto_id: '', porciones: 1, tiempo_preparacion: 0, dificultad: 'media', precio_sugerido: 0, instrucciones: '' });
      setIngredientes([{ insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }]);
    }
  }, [receta]);

  const agregarIngrediente = () => setIngredientes([...ingredientes, { insumo_id: '', cantidad: 0, unidad_medida: 'und', costo_unitario: 0, notas: '' }]);
  const eliminarIngrediente = (index: number) => { if (ingredientes.length > 1) setIngredientes(ingredientes.filter((_, i) => i !== index)); };

  const actualizarIngrediente = (index: number, field: string, value: any) => {
    const nuevosIngredientes = [...ingredientes];
    nuevosIngredientes[index] = { ...nuevosIngredientes[index], [field]: value };

    if (field === 'insumo_id') { 
      const producto = productos.find(p => String(p.id) === String(value));
      if (producto) nuevosIngredientes[index].costo_unitario = parseFloat(producto.precio_compra) || parseFloat(producto.costo_promedio) || 0;
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
  const margen = formData.precio_sugerido && costoPorPorcion > 0 ? ((formData.precio_sugerido - costoPorPorcion) / costoPorPorcion) * 100 : 0;

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
            <div className="bg-gradient-to-br from-[#1e64a7]/20 to-[#00E5FF]/20 rounded-lg p-4 border border-[#00E5FF]/30">
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><DollarSign className="w-5 h-5 text-[#00E5FF]" /> Costos</h3>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-300">Costo Ingredientes:</span><span className="text-xl font-bold">${costoTotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-300">Porciones:</span><span className="text-xl font-bold text-[#00E5FF]">{formData.porciones}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-gray-300 font-bold">Costo / Porción:</span><span className="text-2xl font-black text-[#7B61FF]">${costoPorPorcion.toFixed(4)}</span></div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-[#7B61FF]/20 to-[#00E5FF]/20 rounded-lg p-4 border border-[#7B61FF]/30">
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#7B61FF]" /> Precio</h3>
              <div className="mb-3">
                <Label className="text-gray-300 text-sm">Método</Label>
                <div className="flex gap-2 mt-1">
                  <Button type="button" onClick={() => setMetodoPrecio('foodcost')} className={`flex-1 ${metodoPrecio === 'foodcost' ? 'bg-[#00E5FF]' : 'bg-gray-700'}`} size="sm">Food Cost</Button>
                  <Button type="button" onClick={() => setMetodoPrecio('manual')} className={`flex-1 ${metodoPrecio === 'manual' ? 'bg-[#00E5FF]' : 'bg-gray-700'}`} size="sm">Manual</Button>
                </div>
              </div>
              <div>
                <Input type="number" step="0.01" value={formData.precio_sugerido} onChange={(e) => setFormData({ ...formData, precio_sugerido: parseFloat(e.target.value) || 0 })} className="bg-[#1a3a52] text-white font-bold text-xl" disabled={metodoPrecio === 'foodcost'} />
              </div>
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