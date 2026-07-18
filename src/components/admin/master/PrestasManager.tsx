"use client";

// EVA Master — liste des prestas : créer (nom + lien Drive), ouvrir, supprimer.
// Structure propre à EVA MASTER (API /api/admin/master). Style aligné sur le
// portail EVA (cartes blanches, accent bleu, texte navy/gris).

import { useEffect, useState } from "react";
import Link from "next/link";

const EVA_DARK = "#1f2244";
const EVA_ACCENT = "#7dcef5";
const EVA_MUTED = "#727485";
const BORDER = "#e5e7eb";

type Presta = {
  id: string;
  slug: string;
  name: string;
  driveUrl: string;
  driveStatus: string;
  createdAt: string;
  _count: { conferences: number };
};

export default function PrestasManager() {
  const [prestas, setPrestas] = useState<Presta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/master");
      const data = await res.json();
      setPrestas(data.prestas || []);
    } catch {
      setError("Impossible de charger les prestas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !driveUrl.trim()) {
      setError("Le nom et le lien Drive sont requis.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, driveUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de la création.");
        return;
      }
      setName("");
      setDriveUrl("");
      setShowForm(false);
      await load();
    } catch {
      setError("Erreur réseau lors de la création.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(presta: Presta) {
    const ok = window.confirm(
      `Supprimer la presta « ${presta.name} » ?\n\nToutes ses données (conférences, logs, marquage stocké côté serveur) seront effacées. Cette action est irréversible.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/master?id=${presta.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Erreur lors de la suppression.");
        return;
      }
      await load();
    } catch {
      setError("Erreur réseau lors de la suppression.");
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: EVA_MUTED }}>
            EVA Master
          </p>
          <h1 className="text-2xl font-bold" style={{ color: EVA_DARK }}>
            Prestas
          </h1>
          <p className="mt-1 text-sm" style={{ color: EVA_MUTED }}>
            Captation → films, shorts, newsletter. Marquage des conférences et livrables.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: EVA_ACCENT, color: EVA_DARK }}
        >
          {showForm ? "Annuler" : "+ Nouvelle presta"}
        </button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-lg border bg-white space-y-4"
          style={{ borderColor: BORDER }}
        >
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: EVA_DARK }}>
              Nom de la presta
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CDC — 20 et 21 juin"
              className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:ring-2"
              style={{ borderColor: BORDER, color: EVA_DARK }}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: EVA_DARK }}>
              Lien du dossier Drive
            </label>
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:ring-2"
              style={{ borderColor: BORDER, color: EVA_DARK }}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: EVA_DARK, color: "white" }}
            >
              {submitting ? "Création…" : "Créer la presta"}
            </button>
            <span className="text-xs" style={{ color: EVA_MUTED }}>
              À la création, evaremote transmettra le lien à EVA CORE (stubbé en v1).
            </span>
          </div>
        </form>
      )}

      {error && (
        <div className="text-sm px-4 py-3 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="text-sm animate-pulse" style={{ color: EVA_MUTED }}>
          Chargement…
        </div>
      ) : prestas.length === 0 ? (
        <div
          className="text-center py-16 rounded-lg border border-dashed"
          style={{ borderColor: BORDER, color: EVA_MUTED }}
        >
          <p className="text-sm">Aucune presta pour l&apos;instant.</p>
          <p className="text-sm mt-1">
            Créez-en une avec « + Nouvelle presta » (nom + lien Drive).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {prestas.map((presta) => (
            <div
              key={presta.id}
              className="group h-full p-5 rounded-lg border bg-white transition-all hover:shadow-md flex flex-col"
              style={{ borderColor: BORDER }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold leading-snug" style={{ color: EVA_DARK }}>
                  {presta.name}
                </h2>
                <button
                  onClick={() => handleDelete(presta)}
                  title="Supprimer la presta"
                  className="shrink-0 text-xs px-2 py-1 rounded-md transition-colors opacity-0 group-hover:opacity-100 hover:bg-red-50"
                  style={{ color: "#b91c1c" }}
                >
                  Supprimer
                </button>
              </div>
              <p className="text-sm mt-2 flex-1" style={{ color: EVA_MUTED }}>
                {presta._count.conferences} conférence
                {presta._count.conferences > 1 ? "s" : ""}
                {" · "}
                {presta.driveStatus === "read"
                  ? "Drive lu (lexique + jingles prêts)"
                  : "Drive lié"}
              </p>
              <Link
                href={`/admin/master/${presta.slug}`}
                className="mt-4 text-sm font-medium"
                style={{ color: EVA_DARK }}
              >
                Ouvrir →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
