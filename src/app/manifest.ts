import type { MetadataRoute } from "next";

// Manifeste du raccourci « EVA » posé sur l'écran d'accueil d'un téléphone (page /raccourci).
// Il ouvre le hub : les univers si l'on est connecté, la page de connexion sinon (proxy).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "EVA — Les Ateliers du Stream",
    short_name: "EVA",
    description: "Services et espaces dédiés des Ateliers du Stream",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#171a34",
    theme_color: "#1f2244",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
