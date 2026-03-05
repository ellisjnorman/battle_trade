'use client'

export function Scanlines() {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        background: `repeating-linear-gradient(
          transparent,
          transparent 1px,
          rgba(0, 0, 0, 0.03) 1px,
          rgba(0, 0, 0, 0.03) 2px
        )`,
        backgroundSize: '2px 2px',
        zIndex: 999,
      }}
    />
  )
}
