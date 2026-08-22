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

// Cette page ne sert qu'à la PREMIÈRE installation. Ensuite, EVA Pilot va
// chercher ses mises à jour lui-même et se remplace tout seul : personne n'a
// plus à repasser par ici.
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
        <li>Décompressez l&apos;archive, n&apos;importe où.</li>
        <li>
          Double-cliquez sur{" "}
          <strong style={{ color: "var(--ink)" }}>
            Installer EVA Pilot.cmd
          </strong>
          . Il pose un dossier, une icône sur le Bureau, et associe les fichiers{" "}
          <code>.evapilot</code>. Aucun droit administrateur, aucun prérequis :
          l&apos;archive contient tout.
        </li>
        <li>Lancez EVA Pilot par l&apos;icône du Bureau.</li>
      </ol>

      <h2 className="text-lg font-semibold mt-6" style={{ color: "var(--ink)" }}>
        Ensuite, les mises à jour se font toutes seules
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Dans EVA Pilot :{" "}
        <strong style={{ color: "var(--ink)" }}>Fichier → Mise à jour</strong>,
        puis <strong style={{ color: "var(--ink)" }}>Télécharger</strong> et{" "}
        <strong style={{ color: "var(--ink)" }}>
          Mettre à jour et redémarrer
        </strong>
        . L&apos;application se ferme, se remplace et se rouvre. Comptez une
        minute — et jamais pendant un direct.
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
