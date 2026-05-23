"use client";

// Layout de l'univers EVA Flow (Phase 1 réorganisation EVA).
// Compromis Phase 1 validé : les onglets "Réalisateurs" et "Clés API"
// pointent vers les routes actuelles /admin/directors et /admin/api-keys,
// qui vivent en dehors de ce layout. Au clic, on sort visuellement de la
// navigation Flow. Le déplacement effectif sous /admin/flow/* est prévu en
// Phase 2.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/flow", label: "Événements", match: "exact" as const },
  { href: "/admin/directors", label: "Réalisateurs", match: "startsWith" as const },
  { href: "/admin/api-keys", label: "Clés API", match: "startsWith" as const },
];

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-xs underline"
          style={{ color: "#727485" }}
        >
          ← Hub EVA
        </Link>
        <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
          EVA Flow
        </h1>
        <p className="text-sm mt-1" style={{ color: "#727485" }}>
          Captation vidéo : événements, conférences, réalisateurs, clés API.
        </p>
      </div>

      {/* Barre d'onglets contextuelle */}
      <div className="mb-6 border-b" style={{ borderColor: "#e5e7eb" }}>
        <nav className="flex gap-1 flex-wrap -mb-px">
          {TABS.map((tab) => {
            const active =
              tab.match === "exact"
                ? pathname === tab.href
                : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                style={{
                  borderBottomColor: active ? "#1f2244" : "transparent",
                  color: active ? "#1f2244" : "#727485",
                  backgroundColor: active ? "#fafbff" : "transparent",
                  fontWeight: active ? 600 : 500,
                }}
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
