"use client";

// Page d'attente pour les comptes non encore validés (Phase 4 EVA).
// Affichée quand un user authentifié a status="pending" : il est connecté
// mais aucun univers ne lui est encore accessible.

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

export default function PendingPage() {
  const router = useRouter();

  const handleLogout = async () => {
    // Même si l'appel échoue, on renvoie vers le login
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 py-12">
      <div
        className="p-6 rounded-lg border text-center"
        style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
      >
        <h1 className="text-2xl font-bold mb-3" style={{ color: "#1f2244" }}>
          Compte en attente de validation
        </h1>
        <p className="text-sm" style={{ color: "#727485" }}>
          Votre inscription a bien été enregistrée. Un super-administrateur
          doit encore valider votre compte et vous attribuer les univers EVA
          auxquels vous aurez accès.
        </p>
        <p className="text-sm mt-3" style={{ color: "#727485" }}>
          Vous serez prévenu par email dès que votre accès sera ouvert.
        </p>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleLogout}
          className="text-sm px-4 py-2 border border-gray-300 rounded-full transition-colors hover:bg-gray-50"
          style={{ color: "#1f2244" }}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
