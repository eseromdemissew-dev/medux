interface Props {
  size?: number;
  className?: string;
  showText?: boolean;
}

export function MeduxLogo({ size = 36, className = "", showText = false }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Medux logo">
        <defs>
          <linearGradient id="meduxGrad" x1="0" y1="0" x2="64" y2="64">
            <stop offset="0%" stopColor="#7B5CF6" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="32" r="14" stroke="url(#meduxGrad)" strokeWidth="4" fill="none" />
        <circle cx="44" cy="32" r="14" stroke="url(#meduxGrad)" strokeWidth="4" fill="none" />
        <path d="M14 44 L32 22 L50 44" stroke="url(#meduxGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {showText && (
        <span className="text-xl font-bold tracking-tight text-gradient">Medux</span>
      )}
    </div>
  );
}
