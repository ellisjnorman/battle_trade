'use client';

import { Suspense } from 'react';
import TradingTerminal from '@/components/cockpit/trading-terminal';

function LoadingState() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="flex flex-col items-center gap-[16px]">
        <div className="w-[8px] h-[8px] bg-[#F5A0D0] animate-pulse" />
        <span
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}
          className="text-[24px] text-[#555]"
        >
          LOADING TERMINAL...
        </span>
      </div>
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TradingTerminal />
    </Suspense>
  );
}
