"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpires, setNewKeyExpires] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchKeys(); }, []);

  async function fetchKeys() {
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (Array.isArray(data.apiKeys)) setKeys(data.apiKeys);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: newKeyName };
      if (newKeyExpires) body.expiresAt = new Date(newKeyExpires).toISOString();

      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      // Reveal plaintext UNE SEULE FOIS
      setRevealedPlaintext(data.plaintext);
      setNewKeyName("");
      setNewKeyExpires("");
      setShowForm(false);
      await fetchKeys();
    } catch (err) {
      console.error(err);
      setError("Erreur connexion");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Révoquer la clé "${name}" ? Les machines qui l'utilisent perdront immédiatement l'accès.`)) return;
    try {
      const res = await fetch(`/api/admin/api-keys?id=${id}`, { method: "DELETE" });
      if (res.ok) await fetchKeys();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCopy() {
    if (!revealedPlaintext) return;
    try {
      await navigator.clipboard.writeText(revealedPlaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* En-tête + breadcrumb fournis par /admin/flow/layout.tsx (Phase 5) */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
          Clés API
        </h2>
        <button
          onClick={() => { setShowForm(true); setError(""); }}
          className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90"
          style={{ backgroundColor: "#1f2244" }}
        >
          + Nouvelle clé
        </button>
      </div>

      {/* Modal de plaintext révélé (une seule fois) */}
      {revealedPlaintext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: "#1f2244" }}>Nouvelle clé créée</h2>
              <p className="mt-2 text-sm p-3 rounded-lg" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
                ⚠️ Cette clé ne sera affichée qu&apos;une seule fois. Copiez-la maintenant et stockez-la dans un endroit sûr.
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs mb-2" style={{ color: "#727485" }}>Clé API (à coller dans le header X-Api-Key) :</p>
              <code className="block text-sm break-all font-mono p-3 bg-white border border-gray-300 rounded" style={{ color: "#1f2244" }}>
                {revealedPlaintext}
              </code>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 px-4 py-2 text-white rounded-lg transition-all hover:opacity-90"
                style={{ backgroundColor: copied ? "#155724" : "#1f2244" }}
              >
                {copied ? "✓ Copié !" : "Copier la clé"}
              </button>
              <button
                onClick={() => setRevealedPlaintext(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ color: "#727485" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulaire création */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>Nouvelle clé API</h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                Nom de la clé *
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Ex : EVA Capture WVP A1"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              <p className="text-xs mt-1" style={{ color: "#727485" }}>
                Donnez un nom descriptif pour identifier la machine qui utilisera cette clé.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                Expiration (optionnel)
              </label>
              <input
                type="date"
                value={newKeyExpires}
                onChange={(e) => setNewKeyExpires(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#1f2244" }}
              >
                {creating ? "Création…" : "Créer la clé"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(""); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ color: "#727485" }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Clés ({keys.length})
        </h2>

        {keys.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <p style={{ color: "#727485" }}>Aucune clé. Cliquez sur &quot;+ Nouvelle clé&quot; pour commencer.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className="bg-white border border-gray-200 rounded-lg p-4"
                style={k.revoked ? { opacity: 0.55 } : {}}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-medium" style={{ color: "#1f2244" }}>{k.name}</h3>
                      {k.revoked && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#fef2f2", color: "#991b1b" }}>
                          RÉVOQUÉE
                        </span>
                      )}
                      {!k.revoked && k.expiresAt && new Date(k.expiresAt) < new Date() && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#fef3cd", color: "#856404" }}>
                          EXPIRÉE
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm space-y-1" style={{ color: "#727485" }}>
                      <div>Préfixe : <code className="font-mono px-1 py-0.5 bg-gray-100 rounded">{k.prefix}…</code></div>
                      <div>Créée le : {new Date(k.createdAt).toLocaleString("fr-FR")}</div>
                      {k.lastUsedAt && <div>Dernière utilisation : {new Date(k.lastUsedAt).toLocaleString("fr-FR")}</div>}
                      {!k.lastUsedAt && <div style={{ color: "#9ca3af" }}>Jamais utilisée</div>}
                      {k.expiresAt && <div>Expire le : {new Date(k.expiresAt).toLocaleString("fr-FR")}</div>}
                    </div>
                  </div>
                  {!k.revoked && (
                    <button
                      onClick={() => handleRevoke(k.id, k.name)}
                      className="text-xs px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 ml-4"
                    >
                      Révoquer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
