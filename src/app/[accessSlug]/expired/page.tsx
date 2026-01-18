import Link from "next/link";
import Image from "next/image";

// Page affichée lorsqu'un lien est expiré ou inactif - Design inspiré des Ateliers du Stream
export default function ExpiredPage() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icône */}
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16"
            style={{ color: "#727485" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold mb-2" style={{ color: "#1f2244" }}>
          Lien expiré
        </h1>
        <p className="mb-8" style={{ color: "#727485" }}>
          Ce lien d&apos;accès n&apos;est plus disponible.
          <br />
          Veuillez contacter votre interlocuteur EVA pour obtenir un nouveau lien.
        </p>

        {/* Lien retour */}
        <Link
          href="/"
          className="inline-flex items-center text-sm transition-colors"
          style={{ color: "#727485" }}
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Retour à l&apos;accueil
        </Link>

        {/* Pied de page */}
        <div className="mt-12 flex flex-col items-center gap-2">
          <Image
            src="/logo-eva-v2.png"
            alt="EVA"
            width={40}
            height={40}
          />
          <p className="text-sm" style={{ color: "#727485" }}>EVA - Electronic Virtual Assistant</p>
        </div>
      </div>
    </main>
  );
}
