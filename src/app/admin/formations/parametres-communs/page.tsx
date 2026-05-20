// Index des paramètres communs : redirige vers le premier onglet (Sellsy).

import { redirect } from "next/navigation";

export default function ParametresCommunsIndex() {
  redirect("/admin/formations/parametres-communs/sellsy");
}
