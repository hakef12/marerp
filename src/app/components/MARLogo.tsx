// Logo M.A.R - Modular Administration Resource
// Componente compartido para usar en toda la aplicación

interface MARLogoProps {
  className?: string;
  gradientId?: string; // Para evitar conflictos cuando hay múltiples logos en la misma página
}

export const MARLogo = ({ className = "w-10 h-10", gradientId = "marGradient" }: MARLogoProps) => {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e64a7" stopOpacity={1} />
          <stop offset="50%" stopColor="#00E5FF" stopOpacity={1} />
          <stop offset="100%" stopColor="#7B61FF" stopOpacity={1} />
        </linearGradient>
        <filter id={`${gradientId}-glow`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Hexágono de fondo */}
      <path 
        d="M50 5 L85 25 L85 65 L50 85 L15 65 L15 25 Z" 
        fill={`url(#${gradientId})`}
        opacity="0.2"
      />
      
      {/* Letras M.A.R estilizadas */}
      <g fill={`url(#${gradientId})`} filter={`url(#${gradientId}-glow)`}>
        {/* M */}
        <path d="M20 35 L20 65 L23 65 L23 40 L30 50 L37 40 L37 65 L40 65 L40 35 L30 48 Z" />
        
        {/* A */}
        <path d="M48 35 L42 65 L45 65 L47 57 L57 57 L59 65 L62 65 L56 35 Z M52 40 L56 54 L48 54 Z" />
        
        {/* R */}
        <path d="M68 35 L68 65 L71 65 L71 52 L75 52 L80 65 L83 65 L78 52 C80 51 82 48 82 45 C82 40 78 35 73 35 Z M71 38 L73 38 C76 38 79 40 79 45 C79 47 77 49 73 49 L71 49 Z" />
      </g>
      
      {/* Líneas decorativas */}
      <line x1="20" y1="30" x2="80" y2="30" stroke="#00E5FF" strokeWidth="0.5" opacity="0.5" />
      <line x1="20" y1="70" x2="80" y2="70" stroke="#7B61FF" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
};