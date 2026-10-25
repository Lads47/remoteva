// /raccourci — poser EVA sur l'écran d'accueil d'un téléphone. Page publique : c'est
// l'adresse du QR code. Sur ordinateur, elle affiche ce QR code à scanner.

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import InstallerRaccourci from "@/components/InstallerRaccourci";

export const metadata: Metadata = { title: "EVA sur votre téléphone — Les Ateliers du Stream" };

const URL_RACCOURCI = `${process.env.PUBLIC_BASE_URL ?? "https://evaremote.com"}/raccourci`;

export default async function RaccourciPage() {
  const qr = await QRCode.toString(URL_RACCOURCI, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1f2244", light: "#ffffff" },
  });

  return (
    <main className="min-h-screen flex flex-col" data-theme="dark" style={{ backgroundColor: "var(--page)" }}>
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-[72px] flex items-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo-eva-v2.png" alt="EVA" width={40} height={40} className="h-10 w-auto" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pt-10 pb-16">
        <Image src="/icon-192.png" alt="" width={96} height={96} className="w-24 h-24 mb-6" priority />
        <h1 className="text-2xl sm:text-3xl font-semibold text-white text-center">EVA sur votre téléphone</h1>
        <p className="mt-3 mb-10 text-center text-base sm:text-lg text-white/70 max-w-md">
          Un raccourci sur votre écran d&apos;accueil, qui ouvre vos univers EVA comme une application.
        </p>

        <div className="w-full max-w-4xl grid gap-10 md:grid-cols-2 md:items-center">
          <div className="w-full max-w-md mx-auto">
            <InstallerRaccourci />
          </div>

          {/* Sur ordinateur : le QR code à scanner avec le téléphone */}
          <div className="hidden md:flex flex-col items-center gap-4">
            <div
              className="w-56 h-56 rounded-2xl bg-white p-3 shadow-lg [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="text-sm text-white/60 text-center">
              Scannez avec l&apos;appareil photo de votre téléphone.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
