import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AlertTriangle, Lock } from 'lucide-react';

interface DeleteConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
  title: string;
  description: string;
  itemName: string;
  warningMessage?: string;
}

export function DeleteConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  warningMessage
}: DeleteConfirmationModalProps) {
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('Debes ingresar tu contraseña para confirmar');
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      await onConfirm(password);
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-white border-red-500/30 text-gray-900 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <DialogTitle className="text-xl text-red-500">{title}</DialogTitle>
              <DialogDescription className="text-gray-600">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Item a eliminar */}
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Estás a punto de eliminar:</p>
            <p className="text-gray-900 font-semibold">{itemName}</p>
          </div>

          {/* Mensaje de advertencia personalizado */}
          {warningMessage && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200">{warningMessage}</p>
              </div>
            </div>
          )}

          {/* Campo de contraseña */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#F97316]" />
              Confirma tu contraseña para continuar
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-gray-50 border-[#F97316]/20 text-gray-900"
              placeholder="Ingresa tu contraseña"
              autoFocus
              required
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>

          {/* Advertencia final */}
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded">
            <p className="text-xs text-gray-600">
              ⚠️ Esta acción quedará registrada en auditoría y no se puede deshacer.
            </p>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isDeleting}
              className="flex-1 border-gray-600 hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isDeleting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-gray-900"
            >
              {isDeleting ? 'Eliminando...' : 'Confirmar Eliminación'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
