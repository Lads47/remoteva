import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "EVA — Les Ateliers du Stream",
  description: "Outils internes Les Ateliers du Stream : gestion des prestataires, captation et formations.",
  // Raccourci sur l'écran d'accueil de l'iPhone (le manifeste sert Android et Chrome).
  appleWebApp: { capable: true, title: "EVA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1f2244",
};

// Android déclenche « beforeinstallprompt » parfois avant que React soit monté :
// on le garde de côté pour le bouton de /raccourci (même mécanique que wisio).
const CAPTURE_INSTALLATION =
  "(function(){window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__evaInstallPrompt=e;window.dispatchEvent(new Event('eva-install-ready'));});window.addEventListener('appinstalled',function(){window.__evaInstallPrompt=null;});})();";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALLATION }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${montserrat.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
