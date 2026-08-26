// EVA Pilot — page de téléchargement du logiciel de diffusion.
//
// EVA Pilot n'est pas une application web : c'est un logiciel Windows qui
// tourne en régie. Cette page est sa vitrine interne — elle lit le manifest
// publié par le canal de mise à jour et donne le lien de téléchargement.
//
// ═══ POURQUOI L'ADRESSE DU CANAL EST DANS L'ENVIRONNEMENT ═══
//
// Ce dépôt est PUBLIC. Le canal, lui, est protégé par un chemin imprévisible :
// l'écrire ici le rendrait inutile. L'adresse complète de latest.json vit donc
// dans EVA_PILOT_CHANNEL_URL, posée sur le compose du VPS, comme les autres
// secrets.
//
// Le canal est servi par un nginx qui lui est propre : si le manifest est
// injoignable, la page le dit et rien d'autre ne casse.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Le manifest change à chaque publication : jamais de rendu statique.
export const dynamic = "force-dynamic";

type Release = {
  version: string;
  kind?: string;
  file_name?: string;
  url: string;
  sha256?: string;
  released_at?: string;
  size_bytes?: number;
  changelog?: string;
};

type Manifest = Release & { history?: Release[] };

async function readManifest(): Promise<
  { ok: true; manifest: Manifest } | { ok: false; reason: string }
> {
  const url = process.env.EVA_PILOT_CHANNEL_URL;
  if (!url) {
    return {
      ok: false,
      reason:
        "L'adresse du canal n'est pas configurée sur ce serveur (EVA_PILOT_CHANNEL_URL).",
    };
  }

  try {
    const res = await fetch(url, { cache: "no-store" });

    // 404 = canal en place, aucune version publiée. Ce n'est pas une panne.
    if (res.status === 404) {
      return { ok: false, reason: "Aucune version n'est encore publiée." };
    }
    if (!res.ok) {
      return { ok: false, reason: `Le canal a répondu ${res.status}.` };
    }

    const manifest = (await res.json()) as Manifest;
    if (!manifest?.version || !manifest?.url) {
      return { ok: false, reason: "Le manifest publié est illisible." };
    }
    return { ok: true, manifest };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Canal injoignable.",
    };
  }
}

function megaoctets(bytes?: number): string {
  if (!bytes) return "—";
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} Mo`;
}

function dateFr(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PilotPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const result = await readManifest();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>
          EVA Pilot
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Diffusion sur vidéoprojecteur — images, vidéos et PowerPoint, sur le
          modèle d&apos;un mélangeur : Préparation, Projection, Take.
        </p>
      </div>

      {result.ok ? (
        <>
          <DerniereVersion release={result.manifest} />
          <Installation />
          <Historique versions={result.manifest.history ?? []} />
        </>
      ) : (
        <div
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--line)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--ink)" }}>
            Aucun téléchargement disponible pour le moment.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            {result.reason}
          </p>
        </div>
      )}
    </div>
  );
}

function DerniereVersion({ release }: { release: Release }) {
  return (
    <div
      className="p-6 rounded-lg border"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
            Version {release.version}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Publiée le {dateFr(release.released_at)} ·{" "}
            {megaoctets(release.size_bytes)} · Windows 10 ou 11, 64 bits
          </p>
        </div>

        <a
          href={release.url}
          className="px-5 py-3 rounded-md text-sm font-semibold"
          style={{ backgroundColor: "var(--brand)", color: "#ffffff" }}
        >
          Télécharger
        </a>
      </div>

      {release.changelog ? (
        <div
          className="mt-5 pt-5 border-t text-sm whitespace-pre-line"
          style={{ borderColor: "var(--line)", color: "var(--ink)" }}
        >
          {release.changelog}
        </div>
      ) : null}

      {release.sha256 ? (
        <p
          className="mt-5 text-xs font-mono break-all"
          style={{ color: "var(--muted)" }}
        >
          SHA-256 : {release.sha256}
        </p>
      ) : null}
    </div>
  );
}

// Cette page sert à la PREMIÈRE installation, et à rien d'autre : ensuite EVA
// Pilot signale elle-même les nouvelles versions.
//
// ⚠ TOUT CE BLOC A ÉTÉ FAUX PENDANT DEUX JOURS. Il décrivait une archive à
// décompresser et un .cmd à lancer, alors que le canal sert un INSTALLEUR
// depuis la 0.2.0 (eva-pilot, décision 0042). L'installeur existait depuis le
// 24/08 sans être publié : on fabriquait une chose et on en distribuait une
// autre, et c'est ici — la seule page que le client lit — que l'écart se
// voyait. Quand la forme de distribution change, cette page change avec.
function Installation() {
  return (
    <div
      className="p-6 rounded-lg border"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}
    >
      <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
        Installer, la première fois
      </h2>
      <ol
        className="mt-3 space-y-2 text-sm list-decimal list-inside"
        style={{ color: "var(--muted)" }}
      >
        <li>
          Téléchargez le fichier ci-dessus et{" "}
          <strong style={{ color: "var(--ink)" }}>double-cliquez dessus</strong>.
        </li>
        <li>
          Windows affiche{" "}
          <em>« Windows a protégé votre ordinateur »</em> : cliquez sur{" "}
          <strong style={{ color: "var(--ink)" }}>
            Informations complémentaires
          </strong>
          , puis <strong style={{ color: "var(--ink)" }}>Exécuter quand même</strong>.
          C&apos;est normal tant que le programme n&apos;est pas signé.
        </li>
        <li>
          Laissez l&apos;installation se faire. Elle pose EVA Pilot, un raccourci
          sur le Bureau, une entrée au menu Démarrer, et associe les fichiers{" "}
          <code>.evapilot</code>. Aucun droit administrateur, aucun prérequis :
          tout est dans le fichier.
        </li>
      </ol>

      <h2 className="text-lg font-semibold mt-6" style={{ color: "var(--ink)" }}>
        Ensuite, les mises à jour
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        EVA Pilot vous signale les nouvelles versions. Dans{" "}
        <strong style={{ color: "var(--ink)" }}>Fichier → Mise à jour</strong>,
        cliquez sur <strong style={{ color: "var(--ink)" }}>Télécharger</strong> :
        le programme d&apos;installation arrive dans votre dossier{" "}
        <strong style={{ color: "var(--ink)" }}>Téléchargements</strong>, qui
        s&apos;ouvre devant vous. Double-cliquez dessus, et vous avez la nouvelle
        version. Si EVA Pilot est encore ouverte, l&apos;installation vous
        demandera de la fermer.
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Comptez une minute — et{" "}
        <strong style={{ color: "var(--ink)" }}>jamais pendant un direct</strong>.
      </p>

      <h2 className="text-lg font-semibold mt-6" style={{ color: "var(--ink)" }}>
        Désinstaller
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Par{" "}
        <strong style={{ color: "var(--ink)" }}>
          Paramètres → Applications → Applications installées
        </strong>
        , comme n&apos;importe quel logiciel. Vos présentations et vos médias ne
        sont pas touchés : ils vivent dans vos dossiers, pas dans celui du
        programme.
      </p>
    </div>
  );
}

// Les deux versions précédentes restent en ligne : si une publication se révèle
// mauvaise en pleine saison, on réinstalle la précédente sans reconstruire quoi
// que ce soit.
function Historique({ versions }: { versions: Release[] }) {
  if (versions.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
        Versions précédentes
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Conservées pour revenir en arrière si une version pose problème.
      </p>

      <div className="mt-4 space-y-3">
        {versions.map((v) => (
          <div
            key={v.version}
            className="p-4 rounded-lg border flex flex-wrap items-center justify-between gap-4"
            style={{
              backgroundColor: "var(--surface-2)",
              borderColor: "var(--line)",
            }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Version {v.version}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {dateFr(v.released_at)} · {megaoctets(v.size_bytes)}
                {v.changelog ? ` · ${v.changelog}` : ""}
              </p>
            </div>
            <a
              href={v.url}
              className="px-4 py-2 rounded-md text-sm font-medium border"
              style={{ color: "var(--ink)", borderColor: "var(--line)" }}
            >
              Télécharger
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
