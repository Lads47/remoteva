"use client";

// Page de gestion des comptes EVA (Phase 4 réorganisation).
// Réservée aux super-administrateurs. L'API renvoie 403 si non-super-admin,
// le proxy ne bloque pas cette route (transverse), et le hub ne montre le
// lien qu'aux super-admins ; cette page est une défense supplémentaire.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: "pending" | "validated";
  isSuperAdmin: boolean;
  createdAt: string;
  validatedAt: string | null;
  universes: string[];
}

const EVA_DARK = "#1f2244";
const EVA_ACCENT = "#7dcef5";
const EVA_MUTED = "#727485";

const ALL_UNIVERSES = [
  { id: "lien", label: "EVA Lien" },
  { id: "newsletter", label: "EVA Newsletter" },
  { id: "flow", label: "EVA Flow" },
  { id: "stream", label: "EVA Stream" },
  { id: "formations", label: "EVA Formations" },
  { id: "scoring", label: "EVA Scoring (studio)" },
  { id: "master", label: "EVA Master" },
  { id: "pilot", label: "EVA Pilot (téléchargement)" },
];

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, { universes: string[]; isSuperAdmin: boolean }>>({});

  useEffect(() => {
    const ac = new AbortController();
    void fetchUsers(ac.signal);
    return () => ac.abort();
  }, []);

  const fetchUsers = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ users?: AdminUser[] }>("/api/admin/users", { signal });
      const list: AdminUser[] = data.users || [];
      setUsers(list);
      setEdits(
        Object.fromEntries(
          list.map((u) => [u.id, { universes: u.universes, isSuperAdmin: u.isSuperAdmin }])
        )
      );
    } catch (err) {
      if (isAbortError(err)) return;
      if (err instanceof ApiError && err.status === 403) {
        setFeedback({ kind: "err", text: "Réservé aux super-administrateurs." });
        setUsers([]);
        return;
      }
      setFeedback({ kind: "err", text: "Erreur de chargement." });
    } finally {
      setLoading(false);
    }
  };

  const toggleUniverse = (userId: string, universe: string) => {
    setEdits((prev) => {
      const current = prev[userId] || { universes: [], isSuperAdmin: false };
      const universes = current.universes.includes(universe)
        ? current.universes.filter((u) => u !== universe)
        : [...current.universes, universe];
      return { ...prev, [userId]: { ...current, universes } };
    });
  };

  const toggleSuperAdmin = (userId: string) => {
    setEdits((prev) => {
      const current = prev[userId] || { universes: [], isSuperAdmin: false };
      return { ...prev, [userId]: { ...current, isSuperAdmin: !current.isSuperAdmin } };
    });
  };

  const save = async (user: AdminUser, opts: { validate?: boolean }) => {
    setFeedback(null);
    const edit = edits[user.id] || { universes: user.universes, isSuperAdmin: user.isSuperAdmin };
    try {
      await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: {
          id: user.id,
          universes: edit.universes,
          isSuperAdmin: edit.isSuperAdmin,
          status: opts.validate ? "validated" : undefined,
        },
      });
      setFeedback({ kind: "ok", text: opts.validate ? "Compte validé." : "Modifications enregistrées." });
      await fetchUsers();
    } catch (err) {
      setFeedback({ kind: "err", text: apiErrorMessage(err, "Erreur de connexion.") });
    }
  };

  const remove = async (user: AdminUser) => {
    if (!confirm(`Supprimer définitivement ${user.email} ?`)) return;
    try {
      await apiFetch(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
      setFeedback({ kind: "ok", text: "Compte supprimé." });
      await fetchUsers();
    } catch (err) {
      setFeedback({ kind: "err", text: apiErrorMessage(err, "Erreur de connexion.") });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: EVA_MUTED }}>Chargement...</div>
      </div>
    );
  }

  const pending = users.filter((u) => u.status === "pending");
  const validated = users.filter((u) => u.status === "validated");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-xs underline" style={{ color: EVA_MUTED }}>
          ← Hub EVA
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: EVA_DARK }}>
          Gestion des comptes
        </h1>
        <p className="mt-1 text-sm" style={{ color: EVA_MUTED }}>
          Valider les inscriptions, attribuer les univers EVA, gérer les super-administrateurs.
        </p>
      </div>

      {feedback && (
        <div
          className="p-3 rounded text-sm"
          style={{
            backgroundColor: feedback.kind === "ok" ? "#e8f9f0" : "#fef2f2",
            color: feedback.kind === "ok" ? "#1f6e3a" : "#b91c1c",
          }}
        >
          {feedback.text}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3" style={{ color: EVA_DARK }}>
          En attente de validation ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="p-4 rounded border text-sm" style={{ borderColor: "#e5e7eb", color: EVA_MUTED }}>
            Aucun compte en attente.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                edit={edits[u.id] || { universes: u.universes, isSuperAdmin: u.isSuperAdmin }}
                onToggleUniverse={(uv) => toggleUniverse(u.id, uv)}
                onToggleSuperAdmin={() => toggleSuperAdmin(u.id)}
                onSave={() => save(u, { validate: true })}
                onDelete={() => remove(u)}
                primaryAction="Valider"
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3" style={{ color: EVA_DARK }}>
          Comptes validés ({validated.length})
        </h2>
        {validated.length === 0 ? (
          <div className="p-4 rounded border text-sm" style={{ borderColor: "#e5e7eb", color: EVA_MUTED }}>
            Aucun compte validé.
          </div>
        ) : (
          <div className="space-y-3">
            {validated.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                edit={edits[u.id] || { universes: u.universes, isSuperAdmin: u.isSuperAdmin }}
                onToggleUniverse={(uv) => toggleUniverse(u.id, uv)}
                onToggleSuperAdmin={() => toggleSuperAdmin(u.id)}
                onSave={() => save(u, {})}
                onDelete={() => remove(u)}
                primaryAction="Enregistrer"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UserCard({
  user,
  edit,
  onToggleUniverse,
  onToggleSuperAdmin,
  onSave,
  onDelete,
  primaryAction,
}: {
  user: AdminUser;
  edit: { universes: string[]; isSuperAdmin: boolean };
  onToggleUniverse: (u: string) => void;
  onToggleSuperAdmin: () => void;
  onSave: () => void;
  onDelete: () => void;
  primaryAction: string;
}) {
  const internal = user.email.endsWith("@lesateliersdustream.fr");
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <div className="p-4 rounded-lg border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <strong style={{ color: EVA_DARK }}>{displayName}</strong>
            {internal && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: EVA_ACCENT, color: EVA_DARK }}
              >
                interne
              </span>
            )}
            {user.isSuperAdmin && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#1f2244", color: "white" }}
              >
                super-admin
              </span>
            )}
          </div>
          <div className="text-sm mt-0.5" style={{ color: EVA_MUTED }}>
            {user.email}
          </div>
          <div className="text-xs mt-1" style={{ color: EVA_MUTED }}>
            Inscrit le {new Date(user.createdAt).toLocaleDateString("fr-FR")}
            {user.validatedAt && ` — validé le ${new Date(user.validatedAt).toLocaleDateString("fr-FR")}`}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-xs text-white rounded-full"
            style={{ backgroundColor: EVA_DARK }}
          >
            {primaryAction}
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs text-red-600 hover:text-red-800 border border-red-200 rounded-full"
          >
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t" style={{ borderColor: "#f3f4f6" }}>
        <div className="text-xs font-medium mb-2" style={{ color: EVA_MUTED }}>
          Univers EVA autorisés
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_UNIVERSES.map((u) => {
            const checked = edit.universes.includes(u.id);
            return (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer text-xs"
                style={{
                  borderColor: checked ? EVA_DARK : "#e5e7eb",
                  backgroundColor: checked ? "#fafbff" : "white",
                  color: EVA_DARK,
                  fontWeight: checked ? 600 : 400,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleUniverse(u.id)}
                  className="h-3 w-3"
                />
                {u.label}
              </label>
            );
          })}
        </div>

        <div className="mt-3">
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer" style={{ color: EVA_DARK }}>
            <input
              type="checkbox"
              checked={edit.isSuperAdmin}
              onChange={onToggleSuperAdmin}
            />
            Super-administrateur (accès complet et gestion des comptes)
          </label>
        </div>
      </div>
    </div>
  );
}
