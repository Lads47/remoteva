// EVA Master — liste des prestas (gestion multi-prestas).
// L'accès à l'univers "master" est vérifié par le proxy (src/proxy.ts).

import PrestasManager from "@/components/admin/master/PrestasManager";

export default function MasterPage() {
  return <PrestasManager />;
}
