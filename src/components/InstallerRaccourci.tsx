"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

// Création du raccourci EVA sur l'écran d'accueil (même parcours que wisio).
// Android/Chrome : notre explication, puis la fenêtre du téléphone qui dit « Installer
// l'application » (ses mots, impossibles à changer) — ce n'est qu'un raccourci.
// iPhone, ou navigateur sans fenêtre d'installation : les étapes à suivre.

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type EvaWindow = Window & { __evaInstallPrompt?: InstallPrompt | null };

const EVENTS = ["eva-install-ready", "beforeinstallprompt", "appinstalled"];

function subscribe(onChange: () => void) {
  EVENTS.forEach((e) => window.addEventListener(e, onChange));
  return () => EVENTS.forEach((e) => window.removeEventListener(e, onChange));
}

const getPrompt = () => (window as EvaWindow).__evaInstallPrompt ?? null;

type Contexte = "installe" | "ios" | "autre";
function getContexte(): Contexte {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installe";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "autre";
}

const ETAPES_IOS = [
  "Ouvrez cette page dans Safari.",
  "Touchez l'icône Partager, en bas de l'écran.",
  "Choisissez « Sur l'écran d'accueil », puis « Ajouter ».",
];
const ETAPES_MENU = [
  "Ouvrez le menu ⋮ de votre navigateur.",
  "Choisissez « Ajouter à l'écran d'accueil » (ou « Installer l'application » : c'est le même raccourci).",
  "Validez.",
];

const BOUTON = "block w-full py-4 px-6 text-lg font-medium text-center rounded-full shadow-lg transition-colors bg-accent text-brand hover:bg-white";

export default function InstallerRaccourci() {
  const prompt = useSyncExternalStore(subscribe, getPrompt, () => null);
  const contexte = useSyncExternalStore<Contexte | null>(() => () => {}, getContexte, () => null);
  const [fait, setFait] = useState(false);

  if (contexte === null) return null;

  if (contexte === "installe" || fait) {
    return (
      <div className="space-y-6 text-center">
        <p className="text-white/80">
          {fait ? "C'est fait : l'icône EVA est sur votre écran d'accueil." : "EVA est déjà sur votre écran d'accueil."}
        </p>
        <Link href="/admin" className={BOUTON}>Ouvrir EVA</Link>
      </div>
    );
  }

  const creer = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choix = await prompt.userChoice.catch(() => null);
    (window as EvaWindow).__evaInstallPrompt = null;
    if (choix?.outcome === "accepted") setFait(true);
  };

  if (prompt && contexte !== "ios") {
    return (
      <div className="space-y-6">
        <p className="text-white/80 text-center">
          Votre téléphone va vous proposer d&apos;« installer l&apos;application » : ce n&apos;est qu&apos;un
          raccourci vers EVA, posé sur votre écran d&apos;accueil. Rien n&apos;est téléchargé.
        </p>
        <button type="button" onClick={creer} className={`${BOUTON} cursor-pointer`}>
          Créer le raccourci
        </button>
      </div>
    );
  }

  return (
    <ol className="space-y-3 list-decimal list-inside text-white/80">
      {(contexte === "ios" ? ETAPES_IOS : ETAPES_MENU).map((etape) => (
        <li key={etape}>{etape}</li>
      ))}
    </ol>
  );
}
