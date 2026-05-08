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

  const handleConfirmar = () => {
    // Si es consumidor final, usar datos por defecto
    if (tipoId === '07') {
      onConfirmar({
        identificacion: CONSUMIDOR_FINAL.identificacion,
        tipo_identificacion: CONSUMIDOR_FINAL.tipo,
        razon_social: CONSUMIDOR_FINAL.razon_social
      });
      return;
    }

    // Validar identificación según tipo
    if (!identificacion) {
      toast.error('Ingrese el número de identificación');
      return;
    }

    if (tipoId === '04') { // RUC
      if (!validarRUC(identificacion)) {
        toast.error('RUC inválido');
        return;
      }
    } else if (tipoId === '05') { // Cédula
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
      email: email || undefined
    });
  };

  const handleClose = () => {
    setTipoId('07');
    setIdentificacion('');
    setRazonSocial('');
    setEmail('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A1A2F] border-[#00E5FF]/20 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-xl flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#00E5FF]" />
            Datos para Factura Electrónica
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-lg p-3">
            <p className="text-sm text-gray-300">
              ¿Requiere factura con identificación específica?
            </p>
          </div>

          {/* Tipo de identificación */}
          <div>
            <Label className="text-white mb-2 block">Tipo de Identificación</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0A1A2F] border-[#00E5FF]/20">
                <SelectItem value="07" className="text-white">Consumidor Final</SelectItem>
                <SelectItem value="05" className="text-white">Cédula</SelectItem>
                <SelectItem value="04" className="text-white">RUC</SelectItem>
                <SelectItem value="06" className="text-white">Pasaporte</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoId !== '07' && (
            <>
              {/* Número de identificación */}
              <div>
                <Label className="text-white mb-2 block">
                  {tipoId === '04' ? 'RUC' : tipoId === '05' ? 'Cédula' : 'Pasaporte'}
                </Label>
                <Input
                  value={identificacion}
                  onChange={(e) => setIdentificacion(e.target.value)}
                  className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white"
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
                <Label className="text-white mb-2 block">Nombre o Razón Social</Label>
                <Input
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white"
                  placeholder="Ej: Juan Pérez o Mi Empresa S.A."
                />
              </div>

              {/* Email */}
              <div>
                <Label className="text-white mb-2 block">Email (Opcional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-[#0A1A2F]/60 border-[#00E5FF]/20 text-white"
                  placeholder="cliente@ejemplo.com"
                />
                <p className="text-xs text-gray-400 mt-1">
                  La factura se enviará a este correo
                </p>
              </div>
            </>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1 border-[#00E5FF]/20 text-white"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            
            {tipoId === '07' ? (
              <Button
                onClick={onOmitir}
                className="flex-1 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white"
              >
                Continuar sin Factura
              </Button>
            ) : null}
            
            <Button
              onClick={handleConfirmar}
              className="flex-1 bg-gradient-to-r from-[#00E5FF] to-[#1e64a7] hover:from-[#00E5FF]/80 hover:to-[#1e64a7]/80 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Generar Factura
            </Button>
          </div>

          {tipoId === '07' && (
            <div className="text-center">
              <Button
                variant="ghost"
                onClick={onOmitir}
                className="text-gray-400 hover:text-white text-sm"
              >
                O continuar sin factura
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}