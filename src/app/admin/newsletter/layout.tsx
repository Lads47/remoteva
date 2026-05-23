"use client";

// Layout de l'univers EVA Newsletter (Phase 2 réorganisation EVA).
// Onglets : Liens (page principale) et Préparation/Lexiques.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/newsletter", label: "Liens", match: "exact" as const },
  { href: "/admin/newsletter/preparation", label: "Préparation", match: "startsWith" as const },
];

export default function NewsletterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          EVA Newsletter
        </h1>
        <p className="text-sm mt-1" style={{ color: "#727485" }}>
          Résumés de conférences en direct, génération HTML, lexiques de préparation.
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
