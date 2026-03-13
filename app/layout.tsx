import type { Metadata, Viewport } from "next";
import { Bebas_Neue, JetBrains_Mono, DM_Sans } from "next/font/google";
import ToastContainer from "@/components/toast-container";
import Providers from "@/components/providers";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Battle Trade",
    template: "%s | Battle Trade",
  },
  description: "The future of finance is multiplayer. Trading as a spectator sport.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://battletrade.gg"),
  openGraph: {
    type: "website",
    siteName: "Battle Trade",
    title: "Battle Trade",
    description: "The future of finance is multiplayer. Trading as a spectator sport.",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Battle Trade",
    description: "The future of finance is multiplayer. Trading as a spectator sport.",
    images: ["/api/og"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${jetbrainsMono.variable} ${dmSans.variable}`}>
      <head>
        {/* Suppress wallet extension errors (MetaMask, Phantom) before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var w=window;
            w.addEventListener('error',function(e){
              var m=e.message||'',s=e.filename||'';
              if(m.indexOf('MetaMask')!==-1||m.indexOf('Failed to connect')!==-1||s.indexOf('inpage.js')!==-1){e.preventDefault();e.stopImmediatePropagation()}
            },true);
            w.addEventListener('unhandledrejection',function(e){
              var r=e.reason,m=(r&&r.message)||String(r||'');
              if(m.indexOf('MetaMask')!==-1||m.indexOf('metamask')!==-1||m.indexOf('inpage.js')!==-1||m.indexOf('Failed to connect')!==-1){e.preventDefault();e.stopImmediatePropagation()}
            },true);
          })();
        `}} />
      </head>
      <body suppressHydrationWarning className="font-body antialiased bg-bt-background text-white">
        <Providers>{children}</Providers>
        <ToastContainer />
      </body>
    </html>
  );
}
