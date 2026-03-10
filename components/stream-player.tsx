'use client';

import { useEffect, useRef, useState } from 'react';

interface StreamPlayerProps {
  playbackUrl: string;
  autoplay?: boolean;
  muted?: boolean;
  poster?: string;
}

export function StreamPlayer({
  playbackUrl,
  autoplay = true,
  muted = true,
  poster,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'offline' | 'error'>('loading');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) {
      setStatus('offline');
      return;
    }

    let destroyed = false;

    // Safari supports HLS natively
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl;
      video.addEventListener('loadedmetadata', () => {
        if (!destroyed && autoplay) video.play().catch(() => {});
      });
      video.addEventListener('playing', () => !destroyed && setStatus('playing'));
      video.addEventListener('error', () => !destroyed && setStatus('offline'));
      video.addEventListener('waiting', () => !destroyed && setStatus('loading'));

      return () => {
        destroyed = true;
        video.src = '';
      };
    }

    // Other browsers: use hls.js
    let hls: import('hls.js').default | null = null;

    import('hls.js').then((HlsModule) => {
      if (destroyed) return;
      const Hls = HlsModule.default;

      if (!Hls.isSupported()) {
        setStatus('error');
        return;
      }

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hlsRef.current = hls;

      hls.loadSource(playbackUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!destroyed && autoplay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (destroyed) return;
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setStatus('offline');
            // Retry after a few seconds
            setTimeout(() => {
              if (!destroyed && hls) hls.startLoad();
            }, 5000);
          } else {
            setStatus('error');
          }
        }
      });

      video.addEventListener('playing', () => !destroyed && setStatus('playing'));
      video.addEventListener('waiting', () => !destroyed && setStatus('loading'));
    });

    return () => {
      destroyed = true;
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackUrl, autoplay]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        background: '#000',
        aspectRatio: '16/9',
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        poster={poster}
        controls
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: status === 'offline' ? 'none' : 'block',
        }}
      />

      {/* Battle Trade logo watermark */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          opacity: 0.4,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <img
          src="/brand/logo-main.png"
          alt=""
          style={{ height: 24, width: 'auto' }}
        />
      </div>

      {/* Loading overlay */}
      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 20,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: '2px solid #333',
              borderTopColor: '#F5A0D0',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif",
              fontSize: 14,
              letterSpacing: '0.1em',
              color: '#555',
              marginTop: 12,
            }}
          >
            CONNECTING TO STREAM...
          </span>
        </div>
      )}

      {/* Offline overlay */}
      {status === 'offline' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0A0A0A',
            zIndex: 20,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '2px solid #222',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                background: '#FF3333',
                boxShadow: '0 0 12px rgba(255, 51, 51, 0.6)',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif",
              fontSize: 24,
              letterSpacing: '0.1em',
              color: '#333',
            }}
          >
            STREAM OFFLINE
          </span>
          <span
            style={{
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace",
              fontSize: 11,
              color: '#222',
              marginTop: 8,
            }}
          >
            Waiting for broadcaster...
          </span>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0A0A0A',
            zIndex: 20,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif",
              fontSize: 24,
              letterSpacing: '0.1em',
              color: '#FF3333',
            }}
          >
            STREAM ERROR
          </span>
          <span
            style={{
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace",
              fontSize: 11,
              color: '#333',
              marginTop: 8,
            }}
          >
            HLS playback not supported in this browser
          </span>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
