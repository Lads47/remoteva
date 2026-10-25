import Link from "next/link";

// Sous-menu de l'Administration (super-administrateurs).
const TABS = [
  { href: "/admin/users", label: "Comptes" },
  { href: "/admin/users/reseaux", label: "Réseaux sociaux" },
];

export default function AdminTabs({ current }: { current: string }) {
  return (
    <nav className="flex gap-1 border-b" style={{ borderColor: "var(--line)" }}>
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderColor: active ? "var(--brand)" : "transparent",
              color: active ? "var(--ink)" : "var(--muted)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
