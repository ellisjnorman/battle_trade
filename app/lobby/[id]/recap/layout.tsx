import type { Metadata } from 'next';
import { getServerSupabase } from '@/lib/supabase-server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sb = getServerSupabase();
  const { data: lobby } = await sb.from('lobbies').select('name').eq('id', id).single();

  const name = lobby?.name ?? 'Battle Trade';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://battletrade.gg';
  const ogUrl = `${baseUrl}/api/og?lobby=${id}&type=recap`;

  return {
    title: `${name} — Results`,
    openGraph: {
      title: `${name} — Final Results`,
      description: `See who won ${name} on Battle Trade`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} — Final Results`,
      images: [ogUrl],
    },
  };
}

export default function RecapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
