import { permanentRedirect } from "next/navigation";

// /admin/dashboard est conservée en redirection 308 vers le nouveau hub /admin
// (Phase 1 de la réorganisation EVA — préservation des favoris des salariés).
export default function DashboardRedirect(): never {
  permanentRedirect("/admin");
}
