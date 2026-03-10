'use client';

import { useToastStore } from '@/lib/toast-store';

const B = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' } as const;
const S = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" } as const;

const TYPE_COLORS: Record<string, string> = {
  success: '#00FF88',
  error: '#FF3333',
  attack: '#F5A0D0',
  defense: '#00BFFF',
  info: '#555',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toastSlideIn { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toastFadeOut { from { opacity: 1; } to { opacity: 0; transform: translateX(20px); } }
      `}</style>
      <div style={{ position: 'fixed', top: 56, right: 12, zIndex: 10001, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 340, pointerEvents: 'none' }}>
        {toasts.map((t) => {
          const bg = TYPE_COLORS[t.type] ?? '#555';
          return (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: '#0D0D0D',
                border: `1px solid ${bg}`,
                borderLeft: `3px solid ${bg}`,
                boxShadow: `0 0 12px ${bg}33`,
                animation: 'toastSlideIn 200ms ease-out',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              {t.icon && <span style={{ fontSize: 16, flexShrink: 0 }}>{t.icon}</span>}
              <span style={{ ...S, fontSize: 12, color: bg, flex: 1 }}>{t.message}</span>
              <span style={{ ...B, fontSize: 10, color: '#444', flexShrink: 0 }}>✕</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
