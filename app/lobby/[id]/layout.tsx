import type { Metadata } from 'next';
import { getServerSupabase } from '@/lib/supabase-server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sb = getServerSupabase();
  const { data: lobby } = await sb.from('lobbies').select('name, status').eq('id', id).single();

  const name = lobby?.name ?? 'Battle Trade Lobby';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://battletrade.gg';
  const ogUrl = `${baseUrl}/api/og?lobby=${id}`;

  return {
    title: name,
    description: `${name} — Live trading arena on Battle Trade`,
    openGraph: {
      title: name,
      description: `${name} — Live trading arena on Battle Trade`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description: `${name} — Live trading arena on Battle Trade`,
      images: [ogUrl],
    },
  };
}

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
