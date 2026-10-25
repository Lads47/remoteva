import type { FeedPost } from "@/lib/social/feed";
import { ilYa, toColumns } from "@/lib/social/feed";

// « Dernières nouvelles » de l'accueil : nos publications, toutes marques mêlées,
// en 3 colonnes (la plus récente en haut à gauche). Images servies par notre serveur.

const RESEAU: Record<string, string> = { instagram: "Instagram", linkedin: "LinkedIn" };

function Icone({ network }: { network: string }) {
  if (network === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.3-.03-3-1.83-3-1.83 0-2.12 1.43-2.12 2.9V21H9z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Carte({ post }: { post: FeedPost }) {
  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-2xl border border-white/10 p-4 transition-colors hover:border-white/30"
      style={{ backgroundColor: "var(--surface)" }}
      aria-label={`${post.brand} sur ${RESEAU[post.network] ?? post.network} (nouvel onglet)`}
    >
      <div className="flex items-center gap-3">
        {post.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- image locale, ratio inconnu d'avance
          <img src={post.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" />
        ) : (
          <div className="w-9 h-9 rounded-full shrink-0" style={{ backgroundColor: "var(--surface-2)" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{post.brand}</div>
          <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
            @{post.handle} · {ilYa(post.publishedAt)}
          </div>
        </div>
        <span className="shrink-0 transition-colors group-hover:text-white" style={{ color: "var(--muted)" }} title={RESEAU[post.network]}>
          <Icone network={post.network} />
        </span>
      </div>

      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element -- image locale, ratio inconnu d'avance
        <img src={post.image} alt="" className="mt-3 w-full rounded-xl object-cover" loading="lazy" />
      )}

      {post.caption && (
        <p className="mt-3 text-sm leading-relaxed text-white/80 whitespace-pre-line line-clamp-6">{post.caption}</p>
      )}

      <div className="mt-3 text-xs transition-colors group-hover:text-white" style={{ color: "var(--accent)" }}>
        Voir sur {RESEAU[post.network] ?? post.network} ↗
      </div>
    </a>
  );
}

export default function SocialFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="w-full max-w-6xl mt-16">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-5" style={{ color: "var(--muted)" }}>
        Dernières nouvelles
      </h2>
      {/* Mobile : une colonne, dans l'ordre. Écran large : 3 colonnes de gauche à droite. */}
      <div className="space-y-5 md:hidden">
        {posts.map((p) => <Carte key={p.id} post={p} />)}
      </div>
      <div className="hidden md:grid grid-cols-3 gap-5 items-start">
        {toColumns(posts, 3).map((col, i) => (
          <div key={i} className="space-y-5">
            {col.map((p) => <Carte key={p.id} post={p} />)}
          </div>
        ))}
      </div>
    </section>
  );
}
