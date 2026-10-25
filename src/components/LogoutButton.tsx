"use client";

import { apiFetch } from "@/lib/api-client";

// Déconnexion depuis une page rendue côté serveur : on recharge la destination
// pour que le serveur relise la session (l'accueil réaffiche alors « Connexion »).
export default function LogoutButton({ className, style, redirectTo = "/" }: {
  className?: string;
  style?: React.CSSProperties;
  redirectTo?: string;
}) {
  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign(redirectTo);
  };
  return (
    <button type="button" onClick={logout} className={className} style={style}>
      Déconnexion
    </button>
  );
}
