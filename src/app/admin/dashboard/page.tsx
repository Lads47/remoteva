"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LinkStats {
  total: number;
  active: number;
  expired: number;
  newsletter: number;
  download: number;
}

// Page tableau de bord admin - Design inspiré des Ateliers du Stream
export default function DashboardPage() {
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/links");
      const data = await res.json();

      if (data.links) {
        const now = new Date();
        const links = data.links;

        setStats({
          total: links.length,
          active: links.filter(
            (l: { isActive: boolean; expiresAt: string }) =>
              l.isActive && new Date(l.expiresAt) > now
          ).length,
          expired: links.filter(
            (l: { expiresAt: string }) => new Date(l.expiresAt) <= now
          ).length,
          newsletter: links.filter(
            (l: { serviceType: string }) => l.serviceType === "newsletter"
          ).length,
          download: links.filter(
            (l: { serviceType: string }) => l.serviceType === "download"
          ).length,
        });
      }
    } catch (error) {
      console.error("Erreur chargement stats:", error);
    } finally {
      setLoading(false);
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
    <div className="space-y-8">
      {/* Titre */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Tableau de bord</h1>
        <p className="mt-1" style={{ color: "#727485" }}>
          Vue d&apos;ensemble des services EVA
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total liens"
          value={stats?.total ?? 0}
          bgColor="#f5f5f7"
          textColor="#1f2244"
        />
        <StatCard
          title="Liens actifs"
          value={stats?.active ?? 0}
          bgColor="#e8f9f0"
          textColor="#1f2244"
        />
        <StatCard
          title="Liens expirés"
          value={stats?.expired ?? 0}
          bgColor="#fef2f2"
          textColor="#1f2244"
        />
        <StatCard
          title="Newsletters"
          value={stats?.newsletter ?? 0}
          bgColor="#e8f4fd"
          textColor="#1f2244"
        />
      </div>

      {/* Actions rapides */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Actions rapides
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/links"
            className="p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <h3 className="font-medium" style={{ color: "#1f2244" }}>Gérer les liens</h3>
            <p className="text-sm mt-1" style={{ color: "#727485" }}>
              Créer, modifier ou désactiver des liens clients
            </p>
          </Link>

          <Link
            href="/admin/links?action=new"
            className="p-4 text-white rounded-lg transition-all"
            style={{ backgroundColor: "#1f2244" }}
          >
            <h3 className="font-medium">Nouveau lien</h3>
            <p className="text-sm mt-1 text-white/70">
              Créer un nouveau lien d&apos;accès client
            </p>
          </Link>
        </div>
      </div>

      {/* Services disponibles */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Services disponibles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-medium" style={{ color: "#1f2244" }}>Newsletter Live</h3>
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}>
                {stats?.newsletter ?? 0} actifs
              </span>
            </div>
            <p className="text-sm mt-2" style={{ color: "#727485" }}>
              Résumés de conférences avec génération HTML
            </p>
          </div>

          <div className="p-4 bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-medium" style={{ color: "#1f2244" }}>Téléchargement</h3>
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "#1f2244", color: "white" }}>
                {stats?.download ?? 0} actifs
              </span>
            </div>
            <p className="text-sm mt-2" style={{ color: "#727485" }}>
              Partage de fichiers volumineux (vidéos, documents)
            </p>
          </div>

          <Link
            href="/admin/preparation"
            className="p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium" style={{ color: "#1f2244" }}>Préparation Newsletter</h3>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white" }}>
                Lexiques
              </span>
            </div>
            <p className="text-sm mt-2" style={{ color: "#727485" }}>
              Créer et gérer les lexiques d&apos;événements
            </p>
          </Link>

          <Link
            href="/admin/flow"
            className="p-4 border-2 rounded-lg hover:shadow-md transition-all"
            style={{ borderColor: "#e74c3c", backgroundColor: "#fdf2f2" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium" style={{ color: "#1f2244" }}>EVA Flow</h3>
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)", color: "white" }}>
                Production
              </span>
            </div>
            <p className="text-sm mt-2" style={{ color: "#727485" }}>
              Gestion des projets de captation vidéo
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Composant carte statistique
function StatCard({
  title,
  value,
  bgColor,
  textColor,
}: {
  title: string;
  value: number;
  bgColor: string;
  textColor: string;
}) {
  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: bgColor }}>
      <p className="text-sm" style={{ color: "#727485" }}>{title}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: textColor }}>{value}</p>
    </div>
  );
}
