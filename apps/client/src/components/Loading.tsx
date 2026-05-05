interface LoadingProps { message?: string; fullScreen?: boolean }

export default function Loading({ message = 'Loading...', fullScreen = false }: LoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${fullScreen ? 'min-h-screen' : 'py-16'}`}>
      <div className="relative">
        {/* Spinner ring */}
        <div className="w-12 h-12 rounded-full border-3 border-gray-200 border-t-primary animate-spin" />
        {/* Pulsing center dot */}
        <div className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-primary/30 animate-ping" />
      </div>
      {message && (
        <p className="mt-4 text-sm text-muted-foreground font-medium">{message}</p>
      )}
    </div>
  );
}

/** Compact inline loading spinner */
export function Spinner({ size = 20, className = '' }: { size?: number; string?: string }) {
  return (
    <div
      className={`rounded-full border-2 border-gray-200 border-t-primary animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Skeleton loader for content placeholders */
export function Skeleton({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse bg-gray-100 rounded"
          style={{
            height: i === lines - 1 ? '14px' : i === 0 ? '22px' : '18px',
            width: `${i === lines - 1 ? 60 + Math.random() * 40 : 85 + Math.random() * 15}%`,
          }}
        />
      ))}
    </div>
  );
}
