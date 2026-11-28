// EVA Mark — page de téléchargement du logiciel de repères de régie.
//
// EVA Mark n'est pas une application web : c'est un petit logiciel Windows qui
// tourne sur les PC de régie vMix (dépôt eva-mark). Cette page est sa vitrine
// interne, comme l'était celle d'EVA Pilot avant evadif : elle lit le manifeste
// publié par le canal de mise à jour et donne le lien de téléchargement.
//
// ═══ POURQUOI L'ADRESSE DU CANAL EST DANS L'ENVIRONNEMENT ═══
//
// Ce dépôt est PUBLIC. Le canal, lui, est un dossier au nom imprévisible :
// l'écrire ici le rendrait inutile. L'adresse complète de latest.json vit donc
// dans EVA_MARK_CHANNEL_URL, posée sur le compose du VPS, comme les autres
// secrets.
//
// Le canal est servi par un nginx à lui (container eva-mark-dl, routé par
// Traefik sur evaremote.com/eva-mark/) : si le manifeste est injoignable, la
// page le dit et rien d'autre ne casse. Une version y apparaît dès que
// tools/publier.ps1 (dépôt eva-mark) l'a mise en ligne : rien à faire ici.
//
// Habillage : l'univers « mark » est en sombre (UNIVERSE_THEME, admin/layout),
// comme le logiciel, qui reprend le gris de régie d'EVAPILOT.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Le manifeste change à chaque publication : jamais de rendu statique.
export const dynamic = "force-dynamic";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const ACCENT = "var(--accent)";
const BRAND = "var(--brand)";

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
  const url = process.env.EVA_MARK_CHANNEL_URL;
  if (!url) {
    return {
      ok: false,
      reason:
        "L'adresse du canal n'est pas configurée sur ce serveur (EVA_MARK_CHANNEL_URL).",
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
      return { ok: false, reason: "Le manifeste publié est illisible." };
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
  return `${(Math.round((bytes / 1024 / 1024) * 10) / 10).toLocaleString("fr-FR")} Mo`;
}

function dateFr(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

export default async function MarkPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const result = await readManifest();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: INK }}>
          EVA Mark
        </h1>
        <p className="mt-1 text-sm max-w-3xl" style={{ color: MUTED }}>
          Repères de régie vMix. Le bouton <strong style={{ color: INK }}>MARK</strong> du
          Stream Deck note l&apos;heure de chaque début et fin de conférence ; EVA Mark note
          aussi l&apos;enregistrement et les synthés à l&apos;antenne. Un fichier texte par
          projet, lu ensuite par EVA Edit.
        </p>
      </div>

      {result.ok ? (
        <>
          <DerniereVersion release={result.manifest} />
          <Installation />
          <Historique versions={result.manifest.history ?? []} />
        </>
      ) : (
        <Card>
          <p className="font-medium" style={{ color: INK }}>
            Aucun téléchargement disponible pour le moment.
          </p>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            {result.reason}
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-6 rounded-lg border"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}
    >
      {children}
    </div>
  );
}

function DerniereVersion({ release }: { release: Release }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Version {release.version}
          </h2>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Publiée le {dateFr(release.released_at)} · {megaoctets(release.size_bytes)} ·
            Windows 10 ou 11
          </p>
        </div>

        <a
          href={release.url}
          className="px-5 py-3 rounded-md text-sm font-semibold"
          style={{ backgroundColor: ACCENT, color: BRAND }}
        >
          Télécharger
        </a>
      </div>

      {release.changelog ? (
        <div
          className="mt-5 pt-5 border-t text-sm whitespace-pre-line leading-relaxed"
          style={{ borderColor: "var(--line)", color: INK }}
        >
          {release.changelog}
        </div>
      ) : null}

      {release.sha256 ? (
        <p className="mt-5 text-xs font-mono break-all" style={{ color: MUTED }}>
          SHA-256 : {release.sha256}
        </p>
      ) : null}
    </Card>
  );
}

function Titre({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold mt-6 first:mt-0" style={{ color: INK }}>
      {children}
    </h2>
  );
}

function Fort({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: INK }}>{children}</strong>;
}

// Cette page sert à la PREMIÈRE installation : ensuite EVA Mark signale lui-même
// les nouvelles versions (Fichier → Mise à jour). Quand la forme de distribution
// change, cette page change avec — c'est la seule que le technicien lit.
function Installation() {
  return (
    <Card>
      <Titre>Installer, la première fois</Titre>
      <ol className="mt-3 space-y-2 text-sm list-decimal list-inside" style={{ color: MUTED }}>
        <li>
          Téléchargez le fichier ci-dessus et <Fort>double-cliquez dessus</Fort>, puis{" "}
          <Fort>Installer</Fort> et <Fort>Terminer</Fort>. Aucun droit administrateur.
        </li>
        <li>
          Si Windows affiche <em>« Windows a protégé votre ordinateur »</em> :{" "}
          <Fort>Informations complémentaires</Fort>, puis <Fort>Exécuter quand même</Fort>.
          C&apos;est normal tant que le programme n&apos;est pas signé.
        </li>
        <li>
          EVA Mark apparaît dans le menu Démarrer, sur le Bureau et dans{" "}
          <Fort>Paramètres → Applications</Fort>, d&apos;où on le désinstalle.
        </li>
        <li>
          Dans vMix : <Fort>Settings → Web Controller</Fort> activé, port <Fort>8088</Fort>.
        </li>
      </ol>

      <Titre>Les boutons du Stream Deck</Titre>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Action <Fort>Système → Raccourci clavier</Fort> sur une touche, une par bouton :{" "}
        <Fort>MARK</Fort> = <Fort>Ctrl + Alt + F12</Fort> (un repère, début ou fin décidé au
        montage), <Fort>MARK IN</Fort> = <Fort>Ctrl + Alt + F11</Fort> (un début, certain),{" "}
        <Fort>MARK OUT</Fort> = <Fort>Ctrl + Alt + F10</Fort> (une fin, certaine),{" "}
        <Fort>SHORT</Fort> = <Fort>Ctrl + Alt + F9</Fort> (un extrait vertical : au montage, une
        séquence « Short » de 2 minutes en 9:16 autour du repère). Seul MARK est
        indispensable ; les autres servent s&apos;il y a la place sur le Stream Deck, ou à la
        souris quand vMix a deux écrans. Ils marchent même quand vMix est au premier plan ; chaque
        appui compte, sans filtre.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Pour changer une combinaison : menu <Fort>Raccourci</Fort> d&apos;EVA Mark, clic sur le
        bouton, puis la nouvelle combinaison — elle est essayée et gardée tout de suite. Réglez
        ensuite la même sur le Stream Deck.
      </p>

      <Titre>Companion et plugins du Stream Deck : les commandes API</Titre>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Depuis la 1.6.0, les mêmes boutons par des adresses web, comme l&apos;API de vMix :{" "}
        <Fort>http://127.0.0.1:8090/api/mark</Fort>, <Fort>/api/in</Fort>,{" "}
        <Fort>/api/out</Fort>, <Fort>/api/short</Fort> (et <Fort>/api/etat</Fort>, qui répond
        sans rien écrire). Chaque adresse fait exactement ce que fait le bouton, quelle que soit la
        fenêtre au premier plan — même vMix lancé en administrateur, qui bloque les touches du
        Stream Deck.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        <Fort>Companion</Fort> : module <Fort>Generic: HTTP Requests</Fort>, action{" "}
        <Fort>GET</Fort> avec l&apos;adresse. <Fort>Stream Deck</Fort> : un plugin qui envoie une
        requête web, avec la même adresse. Pour vérifier : collez l&apos;adresse dans un
        navigateur, EVA Mark répond « MARK OK » et l&apos;heure. Le menu{" "}
        <Fort>Raccourci → Commandes API</Fort> donne les adresses à copier, le port, et la case
        pour un Companion installé sur un autre PC du réseau (Windows demande alors une fois
        d&apos;ouvrir son pare-feu).
      </p>

      <Titre>Pendant la prestation</Titre>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Un double-clic ouvre EVA Mark tout de suite, sans rien demander : il reprend le dernier
        dossier de projet. Pour un nouveau projet d&apos;enregistrement :{" "}
        <Fort>Fichier → Nouveau projet</Fort> (Ctrl+N) — c&apos;est là, et seulement là, que
        l&apos;on choisit le dossier, et c&apos;est lui qui est gardé pour les lancements suivants.
        Le compteur repart à zéro.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        <Fort>Un fichier de repères par projet</Fort> : <Fort>marks_&lt;nom du PC&gt;.txt</Fort>{" "}
        dans le dossier du projet. Chaque lancement le continue (la séance s&apos;ajoute à la
        suite) : un redémarrage en pleine journée ne coupe pas le projet en deux. Choisir le
        dossier d&apos;un projet existant dans Nouveau projet le reprend. Plusieurs régies peuvent
        écrire dans le même dossier partagé : chacune a son fichier.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        La fenêtre a deux panneaux, comme EVAPILOT : <Fort>INFOS</Fort> (compteur avec ses IN,
        OUT et SHORT, dernier événement, vMix, dossier, fichier) et <Fort>RÉGIE</Fort> :{" "}
        <Fort>MARK</Fort> en orange, <Fort>MARK IN</Fort> en vert, <Fort>MARK OUT</Fort> en rouge
        et <Fort>SHORT</Fort> en violet. Un clic pose le
        repère, comme le Stream Deck. Sans projet choisi, ou si
        le dernier dossier est absent (clé USB), les repères vont dans{" "}
        <Fort>Documents\EVA Mark</Fort>, et la fenêtre le dit.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Après des essais, avant la vraie prestation :{" "}
        <Fort>Fichier → Reset du fichier de repères</Fort> (en dernier dans le menu) efface tout le
        fichier du projet, toutes séances comprises, après une confirmation. Le fichier repart à
        zéro, au même endroit, avec ce qui est en cours dans vMix.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Ce que le fichier note de vMix, pour le montage : l&apos;enregistrement et{" "}
        <Fort>le chemin exact de la vidéo enregistrée</Fort> (vMix 30), les synthés à
        l&apos;antenne, le MultiCorder, et <Fort>le découpage du direct</Fort> : pendant
        l&apos;enregistrement, chaque changement de plan (caméra, PowerPoint, vidéo…), à la
        seconde près.
      </p>

      <Titre>Ensuite, les mises à jour</Titre>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Dans <Fort>Fichier → Mise à jour</Fort>, EVA Mark dit si vous êtes à jour ou si une
        nouvelle version est à télécharger. <Fort>Télécharger</Fort> pose le programme
        d&apos;installation dans <Fort>Téléchargements</Fort> et ouvre le dossier : fermez EVA
        Mark, puis double-cliquez dessus. Vos réglages sont gardés. Comptez une minute — et{" "}
        <Fort>jamais pendant un direct</Fort>.
      </p>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Un poste encore en 1.0.0 n&apos;a pas ce menu : installez-lui une fois la dernière
        version depuis cette page.
      </p>
    </Card>
  );
}

// Les deux versions précédentes restent en ligne : si une publication se révèle
// mauvaise, on réinstalle la précédente sans rien reconstruire.
function Historique({ versions }: { versions: Release[] }) {
  if (versions.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold" style={{ color: INK }}>
        Versions précédentes
      </h2>
      <p className="mt-1 text-sm" style={{ color: MUTED }}>
        Conservées pour revenir en arrière si une version pose problème.
      </p>

      <div className="mt-4 space-y-3">
        {versions.map((v) => (
          <div
            key={v.version}
            className="p-4 rounded-lg border flex flex-wrap items-start justify-between gap-4"
            style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--line)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: INK }}>
                Version {v.version}
              </p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>
                {dateFr(v.released_at)} · {megaoctets(v.size_bytes)}
              </p>
              {v.changelog ? (
                <p className="text-xs mt-2 whitespace-pre-line" style={{ color: MUTED }}>
                  {v.changelog}
                </p>
              ) : null}
            </div>
            <a
              href={v.url}
              className="px-4 py-2 rounded-md text-sm font-medium border"
              style={{ color: INK, borderColor: "var(--line)" }}
            >
              Télécharger
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
