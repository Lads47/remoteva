"use client";

// Layout commun aux paramètres globaux : intégration Sellsy, templates Drive,
// questionnaire d'éval à chaud. Affiche un onglet horizontal au-dessus
// du contenu de la sous-route active.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "sellsy", label: "⚙ Sellsy", hint: "Pipeline + mapping des étapes" },
  { slug: "drive", label: "📄 Templates Drive", hint: "Convention, contrat, convocation, CGV, RI" },
  { slug: "questionnaire", label: "📝 Questionnaire éval", hint: "Évaluation à chaud" },
];

export default function ParametresCommunsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/formations" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
          Paramètres communs
        </h1>
        <p className="text-sm font-jetbrains mt-1" style={{ color: "#727485" }}>
          Configuration partagée entre toutes les formations : intégration Sellsy, templates Drive,
          et questionnaire de satisfaction.
        </p>
      </div>

      {/* Barre d'onglets */}
      <div className="mb-6 border-b" style={{ borderColor: "#e5e7eb" }}>
        <nav className="flex gap-1 flex-wrap -mb-px">
          {TABS.map((tab) => {
            const href = `/admin/formations/parametres-communs/${tab.slug}`;
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={tab.slug}
                href={href}
                className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
                style={{
                  borderBottomColor: active ? "#1f2244" : "transparent",
                  color: active ? "#1f2244" : "#727485",
                  backgroundColor: active ? "#fafbff" : "transparent",
                  fontWeight: active ? 600 : 500,
                }}
                title={tab.hint}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
