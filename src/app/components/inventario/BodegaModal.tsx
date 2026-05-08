import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';

interface BodegaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bodega?: any;
  token: string;
}

export function BodegaModal({ open, onClose, onSuccess, bodega, token }: BodegaModalProps) {
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    tipo: 'principal',
    direccion: '',
    responsable: '',
    activa: true
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper para obtener headers de autenticación correctos
  const getAuthHeaders = async () => {
    const { publicAnonKey } = await import('/utils/supabase/info');
    return {
      'Authorization': `Bearer ${publicAnonKey}`,
      'X-User-Token': token || '',
      'Content-Type': 'application/json'
    };
  };

  useEffect(() => {
    if (bodega) {
      setFormData({
        codigo: bodega.codigo || '',
        nombre: bodega.nombre || '',
        tipo: bodega.tipo || 'almacen',
        direccion: bodega.direccion || '',
        responsable: bodega.encargado_id || '',
        activa: bodega.activa !== false
      });
    } else {
      setFormData({
        codigo: '',
        nombre: '',
        tipo: 'almacen',
        direccion: '',
        responsable: '',
        activa: true
      });
    }
  }, [bodega]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const url = bodega 
        ? `https://${projectId}.supabase.co/functions/v1/server/bodegas/${bodega.id}`
        : `https://${projectId}.supabase.co/functions/v1/server/bodegas`;
      
      const method = bodega ? 'PUT' : 'POST';

      console.log('🏭 [BodegaModal] Guardando bodega...');
      console.log('📡 Enviando petición a:', url);
      console.log('📦 Método:', method);
      console.log('📄 Datos:', formData);

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(formData)
      });

      console.log('📨 Respuesta recibida:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Bodega guardada exitosamente:', data);
        toast.success(bodega ? 'Bodega actualizada' : 'Bodega creada exitosamente');
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        console.error('❌ Error del servidor:', error);
        console.error('❌ Response completo:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          error
        });
        
        // Mostrar mensaje específico para error 401
        if (response.status === 401) {
          toast.error('⚠️ Sesión expirada. Por favor cierre sesión e inicie nuevamente.');
          console.error('🔐 Token expirado o inválido - debe hacer login nuevamente');
        } else {
          toast.error(error.error || 'Error al guardar bodega');
        }
      }
    } catch (error) {
      console.error('❌ Error guardando bodega:', error);
      toast.error('Error al guardar bodega: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>{bodega ? 'Editar Bodega' : 'Nueva Bodega'}</DialogTitle>
          <DialogDescription>
            {bodega ? 'Actualiza la información de la bodega' : 'Crea una nueva bodega'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
                placeholder="Ej: BOD001"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                <SelectTrigger className="bg-white/5 border-[#00E5FF]/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/30">
                  <SelectItem value="principal">Principal</SelectItem>
                  <SelectItem value="sucursal">Sucursal</SelectItem>
                  <SelectItem value="cocina">Cocina</SelectItem>
                  <SelectItem value="almacen">Almacén</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="bg-white/5 border-[#00E5FF]/20 text-white"
              placeholder="Ej: Bodega Central"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Dirección</Label>
            <Textarea
              value={formData.direccion}
              onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              className="bg-white/5 border-[#00E5FF]/20 text-white"
              placeholder="Dirección de la bodega"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label>Bodega Activa</Label>
            <Switch
              checked={formData.activa}
              onCheckedChange={(checked) => setFormData({ ...formData, activa: checked })}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-[#1e64a7] to-[#00E5FF]"
            >
              {isSubmitting ? 'Guardando...' : bodega ? 'Actualizar' : 'Crear Bodega'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}