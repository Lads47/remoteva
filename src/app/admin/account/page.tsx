"use client";

import { useState } from "react";
import { apiFetch, apiErrorMessage } from "@/lib/api-client";

// Page Mon compte - Changement de mot de passe
export default function AccountPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    if (newPassword.length < 6) {
      setError("Le nouveau mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setLoading(true);

    try {
      await apiFetch("/api/account/password", {
        method: "PUT",
        body: { currentPassword, newPassword },
      });

      setSuccess("Mot de passe modifié avec succès");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(apiErrorMessage(err, "Erreur de connexion"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Mon compte</h1>
        <p className="mt-1" style={{ color: "#727485" }}>
          Gérez vos paramètres de compte
        </p>
      </div>

      {/* Formulaire changement de mot de passe */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-md">
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Changer le mot de passe
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
              Mot de passe actuel
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
              Nouveau mot de passe
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
              placeholder="Minimum 6 caractères"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
              Confirmer le nouveau mot de passe
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 py-2 px-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm py-2 px-3 rounded" style={{ backgroundColor: "#e8f9f0", color: "#1f2244" }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-white rounded-full text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#1f2244" }}
          >
            {loading ? "Modification..." : "Modifier le mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
