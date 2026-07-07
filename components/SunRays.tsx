/**
 * A small sun resting in the panel corner, with soft rays
 * slowly sweeping out of it. Position the square element so
 * its CENTER sits on the corner (e.g. -top-[450px] -right-[450px]
 * for a 900px square). Purely decorative, pointer-transparent.
 */
export function SunRays({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`hero-rays ${className ?? ""}`}>
      <span />
    </span>
  );
}
