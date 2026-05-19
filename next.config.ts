import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit charge ses .afm (métriques de polices) via require relatif au
  // dossier du package. En mode bundlé, webpack remplace ces chemins par
  // /ROOT/... et le fichier n'est pas embarqué. On externalise donc pdfkit
  // pour qu'il soit utilisé directement depuis node_modules au runtime.
  // svg-to-pdfkit dépend de pdfkit : même externalisation pour éviter un
  // mismatch d'instance entre les deux modules.
  serverExternalPackages: ["pdfkit", "svg-to-pdfkit"],
};

export default nextConfig;
