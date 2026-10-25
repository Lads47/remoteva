"use client";

// Administration > Réseaux sociaux : les comptes dont les publications s'affichent sur
// l'accueil (uniquement les nôtres). Page réservée aux super-administrateurs par le
// proxy (/admin/users/*) et par chaque route /api/admin/social/*.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminTabs from "@/components/admin/AdminTabs";
import { ApiError, apiErrorMessage, apiFetch } from "@/lib/api-client";

type Account = {
  id: string;
  network: string;
  brand: string;
  handle: string;
  avatar: string | null;
  active: boolean;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  posts: number;
};

type Post = {
  id: string;
  brand: string;
  network: string;
  caption: string | null;
  image: string | null;
  permalink: string;
  publishedAt: string;
  hidden: boolean;
};

const MARQUES = ["Les Ateliers du Stream", "wisio", "EVA Pilot"];
const RESEAUX: Record<string, string> = { instagram: "Instagram", linkedin: "LinkedIn" };

const card = "rounded-lg border p-5";
const cardStyle = { backgroundColor: "var(--surface)", borderColor: "var(--line)" };
const bouton = "text-sm px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50";
const boutonPlein = "text-sm px-4 py-2 rounded-full font-medium text-white disabled:opacity-50";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";

export default function ReseauxPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ network: "instagram", brand: MARQUES[0], token: "" });

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        apiFetch<{ accounts: Account[] }>("/api/admin/social/accounts"),
        apiFetch<{ posts: Post[] }>("/api/admin/social/posts"),
      ]);
      setAccounts(a.accounts);
      setPosts(p.posts);
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof ApiError && err.status === 403 ? "Réservé aux super-administrateurs." : "Erreur de chargement." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: ok });
      await load();
    } catch (err) {
      setMessage({ kind: "err", text: apiErrorMessage(err, "L'opération a échoué.") });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const ajouter = (e: React.FormEvent) => {
    e.preventDefault();
    void act(
      "ajout",
      () => apiFetch("/api/admin/social/accounts", { method: "POST", body: form }),
      "Compte relié : ses publications sont récupérées."
    ).then(() => setForm((f) => ({ ...f, token: "" })));
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-xs underline" style={{ color: "var(--muted)" }}>← Hub EVA</Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--ink)" }}>Réseaux sociaux de l&apos;accueil</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Les 20 dernières publications de nos comptes, toutes marques mêlées, s&apos;affichent sur evaremote.com. Relevées toutes les heures.
        </p>
      </div>

      <AdminTabs current="/admin/users/reseaux" />

      {message && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: message.kind === "ok" ? "#e8f9f0" : "#fef2f2", color: message.kind === "ok" ? "#1f6e3a" : "#b91c1c" }}>
          {message.text}
        </div>
      )}

      {/* Comptes reliés */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>Comptes reliés</h2>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Chargement…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Aucun compte pour l&apos;instant : ajoutez-en un ci-dessous.</p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className={`${card} flex flex-wrap items-center gap-4`} style={cardStyle}>
              {a.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- image locale servie par notre route
                <img src={a.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full" style={{ backgroundColor: "var(--surface-2)" }} />
              )}
              <div className="flex-1 min-w-[12rem]">
                <div className="font-semibold" style={{ color: "var(--ink)" }}>
                  {a.brand} <span className="font-normal" style={{ color: "var(--muted)" }}>· {RESEAUX[a.network] ?? a.network} · @{a.handle}</span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {a.active ? "Affiché sur l'accueil" : "Désactivé"} · {a.posts} publication{a.posts > 1 ? "s" : ""} · dernière relève {fmt(a.lastSyncAt)} · jeton valable jusqu&apos;au {fmt(a.tokenExpiresAt)}
                </div>
                {a.lastError && <div className="text-xs mt-1" style={{ color: "#b91c1c" }}>Dernière erreur : {a.lastError}</div>}
              </div>
              <div className="flex gap-2">
                <button className={bouton} style={{ borderColor: "var(--line)", color: "var(--ink)" }} disabled={busy !== null}
                  onClick={() => act(`sync-${a.id}`, () => apiFetch(`/api/admin/social/accounts/${a.id}/sync`, { method: "POST" }), "Publications actualisées.")}>
                  {busy === `sync-${a.id}` ? "…" : "Actualiser"}
                </button>
                <button className={bouton} style={{ borderColor: "var(--line)", color: "var(--ink)" }} disabled={busy !== null}
                  onClick={() => act(`actif-${a.id}`, () => apiFetch(`/api/admin/social/accounts/${a.id}`, { method: "PATCH", body: { active: !a.active } }), a.active ? "Compte retiré de l'accueil." : "Compte de nouveau affiché.")}>
                  {a.active ? "Désactiver" : "Activer"}
                </button>
                <button className={bouton} style={{ borderColor: "#fecaca", color: "#b91c1c" }} disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`Supprimer ${a.brand} (@${a.handle}) et ses publications de l'accueil ?`)) return;
                    void act(`suppr-${a.id}`, () => apiFetch(`/api/admin/social/accounts/${a.id}`, { method: "DELETE" }), "Compte supprimé.");
                  }}>
                  Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Ajouter un compte */}
      <section className={card} style={cardStyle}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--ink)" }}>Ajouter un compte</h2>
        <form onSubmit={ajouter} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm" style={{ color: "var(--ink)" }}>
            Réseau
            <select className="mt-1 w-full rounded border px-3 py-2" style={{ borderColor: "var(--line)" }}
              value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
              <option value="instagram">Instagram</option>
              <option value="linkedin" disabled>LinkedIn — en attente de l&apos;autorisation de LinkedIn</option>
            </select>
          </label>
          <label className="text-sm" style={{ color: "var(--ink)" }}>
            Marque
            <input list="marques" className="mt-1 w-full rounded border px-3 py-2" style={{ borderColor: "var(--line)" }}
              value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required maxLength={80} />
            <datalist id="marques">{MARQUES.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="text-sm sm:col-span-2" style={{ color: "var(--ink)" }}>
            Jeton d&apos;accès Instagram
            <textarea className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs" rows={3} style={{ borderColor: "var(--line)" }}
              value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required minLength={20}
              placeholder="Collez ici le jeton généré dans le tableau de bord Meta" autoComplete="off" spellCheck={false} />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-4 flex-wrap">
            <details className="text-xs" style={{ color: "var(--muted)" }}>
              <summary className="cursor-pointer">Où trouver ce jeton ?</summary>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>developers.facebook.com → votre application EVA → Instagram → « Configuration de l&apos;API avec la connexion Instagram ».</li>
                <li>« Générer des jetons d&apos;accès » → « Ajouter un compte » → connectez le compte Instagram (professionnel) de la marque.</li>
                <li>« Générer le jeton » en face du compte, copiez-le et collez-le ici.</li>
              </ol>
              <p className="mt-2">Le jeton est vérifié auprès d&apos;Instagram, chiffré, puis renouvelé tout seul avant son expiration.</p>
            </details>
            <button type="submit" className={boutonPlein} style={{ backgroundColor: "var(--brand)" }} disabled={busy !== null}>
              {busy === "ajout" ? "Vérification…" : "Relier le compte"}
            </button>
          </div>
        </form>
      </section>

      {/* Publications */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>Publications récupérées</h2>
        {posts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune publication pour l&apos;instant.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <div key={p.id} className={`${card} !p-3 flex gap-3`} style={{ ...cardStyle, opacity: p.hidden ? 0.5 : 1 }}>
                {p.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- image locale servie par notre route
                  <img src={p.image} alt="" className="w-16 h-16 rounded object-cover shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{p.brand} · {fmt(p.publishedAt)}</div>
                  <div className="text-sm line-clamp-2" style={{ color: "var(--ink)" }}>{p.caption ?? "(sans texte)"}</div>
                  <div className="flex gap-3 mt-1 text-xs">
                    <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--muted)" }}>Voir</a>
                    <button className="underline disabled:opacity-50" style={{ color: p.hidden ? "#1f6e3a" : "#b91c1c" }} disabled={busy !== null}
                      onClick={() => act(`post-${p.id}`, () => apiFetch(`/api/admin/social/posts/${encodeURIComponent(p.id)}`, { method: "PATCH", body: { hidden: !p.hidden } }), p.hidden ? "Publication de nouveau affichée." : "Publication masquée sur l'accueil.")}>
                      {p.hidden ? "Afficher" : "Masquer"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
