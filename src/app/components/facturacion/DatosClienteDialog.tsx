import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { validarRUC, validarCedula, TIPOS_IDENTIFICACION, CONSUMIDOR_FINAL } from '../../utils/facturacionElectronica';

interface DatosClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmar: (datosCliente: DatosCliente) => void;
  /** Se llama al cancelar el diálogo sin generar factura */
  onOmitir: () => void;
}

export interface DatosCliente {
  identificacion: string;
  tipo_identificacion: string;
  razon_social: string;
  email?: string;
}

export function DatosClienteDialog({ open, onOpenChange, onConfirmar, onOmitir }: DatosClienteDialogProps) {
  const [tipoId, setTipoId] = useState('07'); // Consumidor Final por defecto
  const [identificacion, setIdentificacion] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [email, setEmail] = useState('');

  const resetForm = () => {
    setTipoId('07');
    setIdentificacion('');
    setRazonSocial('');
    setEmail('');
  };

  const handleConfirmar = () => {
    // Consumidor Final: generar factura con datos por defecto
    if (tipoId === '07') {
      onConfirmar({
        identificacion: CONSUMIDOR_FINAL.identificacion,
        tipo_identificacion: CONSUMIDOR_FINAL.tipo,
        razon_social: CONSUMIDOR_FINAL.razon_social,
      });
      resetForm();
      return;
    }

    // Validar identificación según tipo
    if (!identificacion) {
      toast.error('Ingrese el número de identificación');
      return;
    }

    if (tipoId === '04') {
      if (!validarRUC(identificacion)) {
        toast.error('RUC inválido');
        return;
      }
    } else if (tipoId === '05') {
      if (!validarCedula(identificacion)) {
        toast.error('Cédula inválida');
        return;
      }
    }

    if (!razonSocial) {
      toast.error('Ingrese el nombre o razón social');
      return;
    }

    onConfirmar({
      identificacion,
      tipo_identificacion: tipoId,
      razon_social: razonSocial,
      email: email || undefined,
    });
    resetForm();
  };

  // Cancelar = limpiar todo y notificar al padre para que limpie la venta
  const handleCancelar = () => {
    resetForm();
    onOpenChange(false);
    onOmitir();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancelar(); }}>
      <DialogContent
        className="bg-white border-[#F97316]/20 max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#F97316]" />
            Datos para Factura Electrónica
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg p-3">
            <p className="text-sm text-gray-700 font-medium">
              Toda venta genera factura electrónica automáticamente
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Selecciona <strong>Consumidor Final</strong> si el cliente no requiere factura con RUC/cédula
            </p>
          </div>

          {/* Tipo de identificación */}
          <div>
            <Label className="text-gray-900 mb-2 block">Tipo de Identificación</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger className="bg-white border-[#F97316]/20 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#F97316]/20">
                <SelectItem value="07" className="text-gray-900">Consumidor Final</SelectItem>
                <SelectItem value="05" className="text-gray-900">Cédula</SelectItem>
                <SelectItem value="04" className="text-gray-900">RUC</SelectItem>
                <SelectItem value="06" className="text-gray-900">Pasaporte</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoId !== '07' && (
            <>
              {/* Número de identificación */}
              <div>
                <Label className="text-gray-900 mb-2 block">
                  {tipoId === '04' ? 'RUC' : tipoId === '05' ? 'Cédula' : 'Pasaporte'}
                </Label>
                <Input
                  value={identificacion}
                  onChange={(e) => setIdentificacion(e.target.value)}
                  className="bg-white border-[#F97316]/20 text-gray-900"
                  placeholder={
                    tipoId === '04' ? '1234567890001' :
                    tipoId === '05' ? '1234567890' :
                    'AB123456'
                  }
                  maxLength={tipoId === '04' ? 13 : tipoId === '05' ? 10 : 20}
                />
              </div>

              {/* Razón Social / Nombre */}
              <div>
                <Label className="text-gray-900 mb-2 block">Nombre o Razón Social</Label>
                <Input
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  className="bg-white border-[#F97316]/20 text-gray-900"
                  placeholder="Ej: Juan Pérez o Mi Empresa S.A."
                />
              </div>

              {/* Email */}
              <div>
                <Label className="text-gray-900 mb-2 block">Email (Opcional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white border-[#F97316]/20 text-gray-900"
                  placeholder="cliente@ejemplo.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  La factura se enviará automáticamente a este correo
                </p>
              </div>
            </>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancelar}
              className="flex-1 border-gray-200 text-gray-700"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>

            <Button
              onClick={handleConfirmar}
              className="flex-2 bg-gradient-to-r from-[#F97316] to-[#C2410C] hover:from-[#F97316]/90 hover:to-[#C2410C]/90 text-white font-semibold px-6"
            >
              <FileText className="w-4 h-4 mr-2" />
              {tipoId === '07' ? 'Generar Factura (Consumidor Final)' : 'Generar Factura'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
