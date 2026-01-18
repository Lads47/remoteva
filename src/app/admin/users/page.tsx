"use client";

import { useEffect, useState } from "react";

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
}

// Page de gestion des utilisateurs admin
export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showResetForm, setShowResetForm] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Formulaire création
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Formulaire reset
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Erreur chargement utilisateurs:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setNewPassword("");
    setFormError("");
    setShowForm(false);
    setShowResetForm(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Erreur lors de la création");
        return;
      }

      setSuccessMessage("Utilisateur créé avec succès");
      await fetchUsers();
      resetForm();
    } catch {
      setFormError("Erreur de connexion");
    }
  };

  const handleResetPassword = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    setFormError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Erreur lors de la réinitialisation");
        return;
      }

      setSuccessMessage("Mot de passe réinitialisé avec succès");
      resetForm();
    } catch {
      setFormError("Erreur de connexion");
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Supprimer l'utilisateur ${email} ?`)) return;

    setSuccessMessage("");
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erreur lors de la suppression");
        return;
      }

      setSuccessMessage("Utilisateur supprimé");
      await fetchUsers();
    } catch (error) {
      console.error("Erreur suppression:", error);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Utilisateurs</h1>
          <p className="mt-1" style={{ color: "#727485" }}>
            Gérez les comptes administrateurs
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 text-white rounded-full text-sm font-medium transition-colors"
          style={{ backgroundColor: "#1f2244" }}
        >
          Nouvel utilisateur
        </button>
      </div>

      {/* Message de succès */}
      {successMessage && (
        <div className="p-4 rounded-lg text-sm" style={{ backgroundColor: "#e8f9f0", color: "#1f2244" }}>
          {successMessage}
        </div>
      )}

      {/* Formulaire création */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
            Créer un utilisateur
          </h2>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                  placeholder="utilisateur@eva.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                  placeholder="Minimum 6 caractères"
                />
              </div>
            </div>

            {formError && (
              <div className="text-red-600 text-sm bg-red-50 py-2 px-3 rounded">
                {formError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-white rounded-full text-sm font-medium transition-colors"
                style={{ backgroundColor: "#1f2244" }}
              >
                Créer
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-full text-sm font-medium transition-colors"
                style={{ color: "#1f2244" }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des utilisateurs */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8 text-center" style={{ color: "#727485" }}>
            Aucun utilisateur
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200" style={{ backgroundColor: "#f5f5f7" }}>
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: "#727485" }}>
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium hidden sm:table-cell" style={{ color: "#727485" }}>
                    Créé le
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: "#727485" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm" style={{ color: "#1f2244" }}>
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-sm hidden sm:table-cell" style={{ color: "#727485" }}>
                      {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowResetForm(user.id);
                            setNewPassword("");
                            setFormError("");
                          }}
                          className="text-xs transition-colors"
                          style={{ color: "#7dcef5" }}
                        >
                          Réinitialiser MDP
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.email)}
                          className="text-xs text-red-600 hover:text-red-800 transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>

                      {/* Formulaire reset inline */}
                      {showResetForm === user.id && (
                        <form
                          onSubmit={(e) => handleResetPassword(e, user.id)}
                          className="mt-2 flex items-center gap-2 justify-end"
                        >
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm w-32"
                            placeholder="Nouveau MDP"
                          />
                          <button
                            type="submit"
                            className="px-2 py-1 text-xs text-white rounded transition-colors"
                            style={{ backgroundColor: "#1f2244" }}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowResetForm(null)}
                            className="px-2 py-1 text-xs border border-gray-300 rounded"
                          >
                            X
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
