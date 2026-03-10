'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif";

interface NavProps {
  showJoinInput?: boolean;
}

export function Nav({ showJoinInput }: NavProps) {
  const router = useRouter();
  const [lobbyCode, setLobbyCode] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const handleJoin = () => {
    const code = lobbyCode.trim();
    if (code) {
      router.push(`/lobby/${code}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <nav
      style={{
        height: 56,
        backgroundColor: '#0D0D0D',
        borderBottom: '1px solid #1A1A1A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Left: Logo */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => router.push('/')}
      >
        <Image
          src="/brand/logo-icon.png"
          alt="Battle Trade"
          width={24}
          height={24}
          style={{ height: 24, width: 'auto' }}
        />
        <span
          style={{
            fontFamily: B,
            fontSize: 18,
            color: '#F5A0D0',
            letterSpacing: '0.05em',
            lineHeight: 1,
          }}
        >
          BATTLE TRADE
        </span>
      </div>

      {/* Center: Desktop links */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
        className="nav-center-links"
      >
        {[
          { label: 'MARKETS', href: '/markets' },
          { label: 'LEARN', href: '/learn' },
        ].map((link) => (
          <span
            key={link.label}
            onClick={() => router.push(link.href)}
            onMouseEnter={() => setHoveredLink(link.label)}
            onMouseLeave={() => setHoveredLink(null)}
            style={{
              fontFamily: B,
              fontSize: 14,
              color: hoveredLink === link.label ? '#FFF' : '#888',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'color 0.15s',
            }}
          >
            {link.label}
          </span>
        ))}
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Desktop actions */}
        <div className="nav-desktop-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => router.push('/profile')}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#FFF';
              e.currentTarget.style.color = '#FFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1A1A1A';
              e.currentTarget.style.color = '#888';
            }}
            style={{
              fontFamily: B,
              fontSize: 12,
              color: '#888',
              backgroundColor: 'transparent',
              border: '1px solid #1A1A1A',
              borderRadius: 0,
              padding: '6px 14px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'all 0.15s',
            }}
          >
            PROFILE
          </button>

          {showJoinInput ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                placeholder="LOBBY CODE"
                value={lobbyCode}
                onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                style={{
                  fontFamily: M,
                  fontSize: 11,
                  color: '#FFF',
                  backgroundColor: '#0A0A0A',
                  border: '1px solid #1A1A1A',
                  borderRadius: 0,
                  padding: '6px 10px',
                  width: 120,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleJoin}
                style={{
                  fontFamily: B,
                  fontSize: 12,
                  color: '#0A0A0A',
                  backgroundColor: '#F5A0D0',
                  border: 'none',
                  borderRadius: 0,
                  padding: '7px 14px',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                }}
              >
                ENTER
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push('/markets')}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F7B0DA';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F5A0D0';
              }}
              style={{
                fontFamily: B,
                fontSize: 12,
                color: '#0A0A0A',
                backgroundColor: '#F5A0D0',
                border: 'none',
                borderRadius: 0,
                padding: '7px 16px',
                cursor: 'pointer',
                letterSpacing: '0.05em',
                fontWeight: 700,
                transition: 'background-color 0.15s',
              }}
            >
              PLAY NOW
            </button>
          )}
        </div>

        {/* Mobile: hamburger + play now */}
        <div className="nav-mobile-actions" style={{ display: 'none', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => router.push('/markets')}
            style={{
              fontFamily: B,
              fontSize: 11,
              color: '#0A0A0A',
              backgroundColor: '#F5A0D0',
              border: 'none',
              borderRadius: 0,
              padding: '6px 12px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              fontWeight: 700,
            }}
          >
            PLAY NOW
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ display: 'block', width: 18, height: 2, backgroundColor: '#888' }} />
            <span style={{ display: 'block', width: 18, height: 2, backgroundColor: '#888' }} />
            <span style={{ display: 'block', width: 18, height: 2, backgroundColor: '#888' }} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: 0,
            right: 0,
            backgroundColor: '#0D0D0D',
            borderBottom: '1px solid #1A1A1A',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            zIndex: 99,
          }}
        >
          {[
            { label: 'MARKETS', href: '/markets' },
            { label: 'LEARN', href: '/learn' },
            { label: 'PROFILE', href: '/profile' },
          ].map((link) => (
            <span
              key={link.label}
              onClick={() => {
                router.push(link.href);
                setMenuOpen(false);
              }}
              style={{
                fontFamily: B,
                fontSize: 14,
                color: '#888',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {link.label}
            </span>
          ))}
          {showJoinInput && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                placeholder="LOBBY CODE"
                value={lobbyCode}
                onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                style={{
                  fontFamily: M,
                  fontSize: 11,
                  color: '#FFF',
                  backgroundColor: '#0A0A0A',
                  border: '1px solid #1A1A1A',
                  borderRadius: 0,
                  padding: '6px 10px',
                  flex: 1,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleJoin}
                style={{
                  fontFamily: B,
                  fontSize: 12,
                  color: '#0A0A0A',
                  backgroundColor: '#F5A0D0',
                  border: 'none',
                  borderRadius: 0,
                  padding: '7px 14px',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                }}
              >
                ENTER
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-center-links { display: none !important; }
          .nav-desktop-actions { display: none !important; }
          .nav-mobile-actions { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
