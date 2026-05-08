import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';

interface ProveedorModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  proveedor?: any;
  token: string;
}

export function ProveedorModal({ open, onClose, onSuccess, proveedor, token }: ProveedorModalProps) {
  const [formData, setFormData] = useState({
    ruc_nit: '',
    nombre: '',
    contacto: '',
    email: '',
    telefono: '',
    direccion: '',
    dias_credito: 0,
    limite_credito: 0,
    activo: true
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
    if (proveedor) {
      setFormData({
        ruc_nit: proveedor.ruc_nit || '',
        nombre: proveedor.nombre || '',
        contacto: proveedor.contacto || '',
        email: proveedor.email || '',
        telefono: proveedor.telefono || '',
        direccion: proveedor.direccion || '',
        dias_credito: proveedor.dias_credito || 0,
        limite_credito: proveedor.limite_credito || 0,
        activo: proveedor.activo !== false
      });
    } else {
      setFormData({
        ruc_nit: '',
        nombre: '',
        contacto: '',
        email: '',
        telefono: '',
        direccion: '',
        dias_credito: 0,
        limite_credito: 0,
        activo: true
      });
    }
  }, [proveedor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { projectId } = await import('/utils/supabase/info');
      const headers = await getAuthHeaders();
      
      const url = proveedor 
        ? `https://${projectId}.supabase.co/functions/v1/server/proveedores/${proveedor.id}`
        : `https://${projectId}.supabase.co/functions/v1/server/proveedores`;
      
      const method = proveedor ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(proveedor ? 'Proveedor actualizado' : 'Proveedor creado exitosamente');
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al guardar proveedor');
      }
    } catch (error) {
      console.error('Error guardando proveedor:', error);
      toast.error('Error al guardar proveedor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
          <DialogDescription>
            {proveedor ? 'Actualiza la información del proveedor' : 'Añade un nuevo proveedor'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>RUC/NIT *</Label>
              <Input
                value={formData.ruc_nit}
                onChange={(e) => setFormData({ ...formData, ruc_nit: e.target.value })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
                placeholder="Ej: 1234567890001"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nombre / Razón Social *</Label>
            <Input
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="bg-white/5 border-[#00E5FF]/20 text-white"
              placeholder="Ej: Distribuidora ABC S.A."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
                placeholder="proveedor@ejemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
                placeholder="+593 99 999 9999"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dirección</Label>
            <Textarea
              value={formData.direccion}
              onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              className="bg-white/5 border-[#00E5FF]/20 text-white"
              placeholder="Dirección completa del proveedor"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Persona de Contacto</Label>
            <Input
              value={formData.contacto}
              onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
              className="bg-white/5 border-[#00E5FF]/20 text-white"
              placeholder="Nombre del contacto"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Días de Crédito</Label>
              <Input
                type="number"
                value={formData.dias_credito}
                onChange={(e) => setFormData({ ...formData, dias_credito: parseInt(e.target.value) || 0 })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Límite de Crédito ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.limite_credito}
                onChange={(e) => setFormData({ ...formData, limite_credito: parseFloat(e.target.value) || 0 })}
                className="bg-white/5 border-[#00E5FF]/20 text-white"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label>Proveedor Activo</Label>
            <Switch
              checked={formData.activo}
              onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
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
              {isSubmitting ? 'Guardando...' : proveedor ? 'Actualizar' : 'Crear Proveedor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}