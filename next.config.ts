import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit charge ses .afm (métriques de polices) via require relatif au
  // dossier du package. En mode bundlé, webpack remplace ces chemins par
  // /ROOT/... et le fichier n'est pas embarqué. On externalise donc pdfkit
  // pour qu'il soit utilisé directement depuis node_modules au runtime.
  // svg-to-pdfkit dépend de pdfkit : même externalisation pour éviter un
  // mismatch d'instance entre les deux modules.
  serverExternalPackages: ["pdfkit", "svg-to-pdfkit", "qrcode"],

  // Redirections de la Phase 2 (regroupement des routes EVA).
  // Les anciennes URLs continuent de fonctionner via une redirection 308
  // permanente (préserve les favoris des salariés et les liens partagés).
  async redirects() {
    return [
      // EVA Flow : directors et api-keys passent sous /admin/flow/*
      {
        source: "/admin/directors",
        destination: "/admin/flow/directors",
        permanent: true,
      },
      {
        source: "/admin/directors/:path*",
        destination: "/admin/flow/directors/:path*",
        permanent: true,
      },
      {
        source: "/admin/api-keys",
        destination: "/admin/flow/api-keys",
        permanent: true,
      },
      {
        source: "/admin/api-keys/:path*",
        destination: "/admin/flow/api-keys/:path*",
        permanent: true,
      },
      // EVA Newsletter : préparation passe sous /admin/newsletter/preparation
      {
        source: "/admin/preparation",
        destination: "/admin/newsletter/preparation",
        permanent: true,
      },
      {
        source: "/admin/preparation/:path*",
        destination: "/admin/newsletter/preparation/:path*",
        permanent: true,
      },
      // EVA Lien : l'ancien /admin/links (mixte newsletter + download)
      // redirige vers /admin/lien (vue download). Les anciens utilisateurs
      // qui voulaient newsletter passeront par le hub.
      {
        source: "/admin/links",
        destination: "/admin/lien",
        permanent: true,
      },
      {
        source: "/admin/links/:path*",
        destination: "/admin/lien/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
