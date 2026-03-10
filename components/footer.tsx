'use client';

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif";

const LINKS = [
  { label: 'ABOUT', href: '/about' },
  { label: 'DOCS', href: '/docs' },
  { label: 'DISCORD', href: 'https://discord.gg/battletrade' },
  { label: 'X', href: 'https://x.com/battletrade' },
];

export function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid #1A1A1A',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      {/* Left */}
      <span
        style={{
          fontFamily: B,
          fontSize: 14,
          color: '#555',
          letterSpacing: '0.05em',
        }}
      >
        BATTLE TRADE
      </span>

      {/* Center links */}
      <div style={{ display: 'flex', gap: 20 }}>
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.href.startsWith('http') ? '_blank' : undefined}
            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            style={{
              fontFamily: S,
              fontSize: 11,
              color: '#555',
              textDecoration: 'none',
              letterSpacing: '0.03em',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#888';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#555';
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Right */}
      <span
        style={{
          fontFamily: S,
          fontSize: 10,
          color: '#333',
          letterSpacing: '0.03em',
        }}
      >
        POWERED BY CRACKED LABS
      </span>
    </footer>
  );
}
