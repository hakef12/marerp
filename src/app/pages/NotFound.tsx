import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { AlertCircle, Home } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="bg-white border-[#F97316]/30 max-w-md w-full">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#C2410C] to-[#F97316] flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-gray-900" />
          </div>
          
          <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Página No Encontrada</h2>
          <p className="text-gray-600 mb-8">
            La página que buscas no existe o has perdido el acceso a ella.
          </p>
          
          <Button
            onClick={() => navigate('/')}
            className="bg-gradient-to-r from-[#C2410C] to-[#F97316] hover:shadow-lg hover:shadow-[#F97316]/30"
          >
            <Home className="w-4 h-4 mr-2" />
            Volver al Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
