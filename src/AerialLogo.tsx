/**
 * Aerial brand components using Rephen font.
 * Rephen is loaded via @font-face in index.css from /fonts/rephen.ttf.
 */

interface AerialMarkProps {
  size?: number;
  className?: string;
}

/**
 * Premium 'L' Monogram
 * A single 'L' in Rephen font on an Apple-style white squircle background.
 */
function MonogramL() {
  return (
    <>
      <defs>
        <style>{`@font-face { font-family: 'Rephen'; src: url('/fonts/rephen.ttf') format('truetype'); }`}</style>
      </defs>
      
      {/* Dynamic background with Apple-like squircle curves */}
      <rect width="44" height="44" rx="10" fill="currentColor" />
      
      {/* 'L' in Rephen */}
      <text
        x="22"
        y="32"
        fontFamily="Rephen, serif"
        fontSize="30"
        fill="var(--background)"
        textAnchor="middle"
        style={{ fontFamily: 'Rephen, serif' }}
      >L</text>
    </>
  );
}

/**
 * The Aerial icon mark
 */
export function AerialMark({ size = 32, className = '' }: AerialMarkProps) {
  return (
    <svg
      viewBox="0 0 44 44"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Aerial"
    >
      <MonogramL />
    </svg>
  );
}

interface AerialWordmarkProps {
  className?: string;
  showMark?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm:  { fontSize: 13, markSize: 20, gap: 6,  dot: 4,  tracking: 3.5 },
  md:  { fontSize: 16, markSize: 24, gap: 8,  dot: 5,  tracking: 4   },
  lg:  { fontSize: 24, markSize: 32, gap: 10, dot: 7,  tracking: 6   },
  xl:  { fontSize: 36, markSize: 48, gap: 14, dot: 10, tracking: 9   },
};

/**
 * Full wordmark: optional mark + "AERIAL" in Rephen + indigo dot.
 */
export function AerialWordmark({ className = '', showMark = false, size = 'md' }: AerialWordmarkProps) {
  const s = sizeMap[size];
  const textW = s.fontSize * 16.5; // approx width of "AERIAL PREMIUM" + letter-spacing
  const totalW = (showMark ? s.markSize + s.gap : 0) + textW + s.dot + 4;
  const h = s.fontSize * 1.4;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${h}`}
      height={h}
      width={totalW}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Aerial"
    >
      {showMark && (
        <svg x="0" y={(h - s.markSize) / 2} width={s.markSize} height={s.markSize} viewBox="0 0 44 44">
          <MonogramL />
        </svg>
      )}

      {/* AERIAL wordmark */}
      <text
        x={showMark ? s.markSize + s.gap : 0}
        y={h * 0.85}
        fontFamily="Rephen, serif"
        fontSize={s.fontSize}
        letterSpacing={s.tracking}
        fill="currentColor"
        style={{ fontFamily: 'Rephen, serif' }}
      >AERIAL PREMIUM</text>

      {/* Indigo dot */}
      <circle
        cx={totalW - 2}
        cy={h * 0.3}
        r={s.dot / 3.5}
        fill="#6366f1"
      />
    </svg>
  );
}

/**
 * Loading screen stack: large monogram mark + AERIAL wordmark below + horizon line.
 */
export function AerialLogoStack({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* Large Monogram */}
      <svg
        viewBox="0 0 44 44"
        width={80}
        height={80}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <MonogramL />
      </svg>

      {/* AERIAL wordmark below */}
      <svg
        viewBox="0 0 400 28"
        width={400}
        height={28}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <style>{`@font-face { font-family: 'Rephen'; src: url('/fonts/rephen.ttf') format('truetype'); }`}</style>
        </defs>
        <text
          x="0"
          y="22"
          fontFamily="Rephen, serif"
          fontSize="22"
          letterSpacing="10"
          fill="currentColor"
          style={{ fontFamily: 'Rephen, serif' }}
        >AERIAL PREMIUM</text>
      </svg>

      {/* Thin horizon accent */}
      <div className="w-20 h-px bg-foreground/12 mt-1" />
    </div>
  );
}
