'use client'

import { generateMockData, type LobbyState } from '@/lib/battle-trade-types'

export default function BroadcastPreviewPage() {
  const lobbyState = generateMockData()

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-[32px]">
      <h1 className="font-heading text-[32px] text-white mb-[8px]">BROADCAST PREVIEW</h1>
      <p className="font-body text-[14px] text-[#555] mb-[32px]">
        Preview all three broadcast views. Each runs at 1920×1080.
      </p>

      <div className="space-y-[48px]">
        {[
          { label: 'OBS OVERLAY', href: '/lobby/demo/broadcast', description: 'Main stream overlay — leaderboard, ticker, event overlays' },
          { label: 'CAST MODE', href: '/lobby/demo/cast', description: 'Commentator dashboard — standings, narrative feed, intel panel' },
          { label: 'STAGE SCREEN', href: '/lobby/demo/stage', description: 'Venue display — pre-show countdown, standings, champion reveal' },
        ].map(({ label, href, description }) => (
          <a
            key={href}
            href={href}
            className="block border border-[#1A1A1A] p-[24px] hover:border-[#F5A0D0] transition-colors"
          >
            <span className="font-heading text-[20px] text-[#F5A0D0] tracking-[0.1em]">{label}</span>
            <p className="font-body text-[13px] text-[#555] mt-[8px]">{description}</p>
            <span className="font-mono text-[11px] text-[#333] mt-[12px] block">{href}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
