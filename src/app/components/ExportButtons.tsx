import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from './ui/button';

interface ExportButtonsProps {
  onExportExcel: () => void;
  onExportPDF: () => void;
  variant?: 'default' | 'compact';
  className?: string;
}

export function ExportButtons({ 
  onExportExcel, 
  onExportPDF, 
  variant = 'default',
  className = '' 
}: ExportButtonsProps) {
  if (variant === 'compact') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <Button
          onClick={onExportExcel}
          variant="outline"
          size="sm"
          className="border-green-500/30 text-green-400 hover:bg-green-500/10"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Excel
        </Button>
        <Button
          onClick={onExportPDF}
          variant="outline"
          size="sm"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          <Download className="w-4 h-4 mr-2" />
          PDF
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${className}`}>
      <Button
        onClick={onExportExcel}
        className="bg-gradient-to-r from-green-600 to-green-500"
      >
        <FileSpreadsheet className="w-4 h-4 mr-2" />
        Exportar Excel
      </Button>
      <Button
        onClick={onExportPDF}
        className="bg-gradient-to-r from-red-600 to-red-500"
      >
        <Download className="w-4 h-4 mr-2" />
        Exportar PDF
      </Button>
    </div>
  );
}
