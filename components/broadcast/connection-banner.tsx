'use client'

interface ConnectionBannerProps {
  isConnected: boolean
}

export function ConnectionBanner({ isConnected }: ConnectionBannerProps) {
  if (isConnected) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[32px] flex items-center justify-center font-heading text-[14px] tracking-[0.05em]"
      style={{
        backgroundColor: '#FF3333',
        color: '#FFFFFF',
        zIndex: 1000,
      }}
    >
      CONNECTION LOST
    </div>
  )
}
