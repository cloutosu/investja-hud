import { motion } from 'framer-motion';

export type GlyphPhase = 'processing' | 'success' | 'error';

// One ring that spins while work is in flight, closes into a full circle on success and
// hands over to a drawn emerald checkmark. Errors draw a red X instead.
export function StatusGlyph({
  phase,
  size = 28,
  stroke = 2.5,
  color,
}: {
  phase: GlyphPhase;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const ok = phase === 'success';
  const isErr = phase === 'error';

  // Force vivid emerald green on success, vibrant red on error, or currentColor/specified color
  const strokeColor = color || (isErr ? 'var(--loss)' : ok ? '#00f59b' : 'currentColor');

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke={strokeColor}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={ok ? { filter: 'drop-shadow(0 0 4px rgba(0, 245, 155, 0.75))' } : undefined}
    >
      {isErr ? (
        <>
          <motion.path
            d="M9 9l10 10"
            stroke="var(--loss)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.25 }}
          />
          <motion.path
            d="M19 9L9 19"
            stroke="var(--loss)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.25, delay: 0.1 }}
          />
        </>
      ) : (
        <>
          <motion.circle
            cx="14"
            cy="14"
            r="11"
            stroke={ok ? '#00f59b' : 'currentColor'}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            initial={{ pathLength: 0.28, rotate: 0 }}
            animate={ok ? { pathLength: 1, rotate: 0, opacity: 0.85 } : { pathLength: 0.28, rotate: 360 }}
            transition={ok ? { duration: 0.45, ease: [0.22, 1, 0.36, 1] } : { repeat: Infinity, ease: 'linear', duration: 0.9 }}
          />
          <motion.path
            d="M8.5 14.5l4 4 7-8.5"
            stroke="#00f59b"
            strokeWidth={stroke + 0.6}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: ok ? 0.25 : 0, duration: 0.4, ease: 'easeOut' }}
          />
        </>
      )}
    </motion.svg>
  );
}
