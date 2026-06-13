/** Shared sumi-e koi glyph + the inline <symbol> definition. */

export function KoiDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="koi" viewBox="0 0 220 220">
        <path d="M156 54c38 16 40 78 -2 100 -30 16 -74 0 -94 -32 -16 -25 4 -58 38 -70 22 -8 42 -8 58 2z" />
        <path d="M64 122C40 112 16 100 6 112c12 12 24 22 36 24 -14 12 -26 30 -20 38 14 -6 32 -28 46 -32 -2 -14 -4 -28 -4 -20z" opacity=".92" />
        <path d="M118 118c-4 22 -20 34 -34 32 12 -12 18 -24 22 -36 6 -2 10 0 12 4z" opacity=".88" />
        <path d="M120 58c10 -16 24 -22 34 -16 -10 4 -18 12 -22 22 -6 0 -10 -2 -12 -6z" opacity=".8" />
        <circle cx="150" cy="80" r="6" fill="var(--paper)" />
        <circle cx="30" cy="150" r="4" opacity=".6" />
        <circle cx="18" cy="138" r="2.4" opacity=".5" />
        <circle cx="42" cy="166" r="2.8" opacity=".55" />
      </symbol>
    </svg>
  )
}

export function Koi({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 220 220" aria-hidden="true">
      <use href="#koi" />
    </svg>
  )
}
