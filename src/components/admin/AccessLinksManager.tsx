"use client";

// Composant partagé de gestion des liens d'accès (AccessLink).
// Utilisé par EVA Lien (serviceType="download") et EVA Newsletter
// (serviceType="newsletter") — Phase 2 réorganisation EVA.
//
// La plomberie API (/api/admin/links) reste partagée entre les 2 univers
// (audit §43 : "La séparation est une affaire d'organisation et d'interface,
// pas de réécriture de la base").
//
// Le composant force le type de service via prop : la liste est filtrée
// côté client, le sélecteur de type est masqué dans le formulaire, et le
// type est appliqué automatiquement aux nouvelles entrées.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface AccessLink {
  id: string;
  slug: string;
  serviceType: "newsletter" | "download";
  clientName: string;
  serviceName: string;
  expiresAt: string;
  isActive: boolean;
}

type ServiceType = "newsletter" | "download";

interface Props {
  serviceType: ServiceType;
  title: string;
  subtitle: string;
}

export default function AccessLinksManager({ serviceType, title, subtitle }: Props) {
  const searchParams = useSearchParams();
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(searchParams.get("action") === "new");
  const [editingLink, setEditingLink] = useState<AccessLink | null>(null);
  const [formError, setFormError] = useState("");

  // Formulaire : serviceType est forcé par la prop
  const [formData, setFormData] = useState({
    slug: "",
    clientName: "",
    serviceName: "",
    expiresAt: "",
  });

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch("/api/admin/links");
      const data = await res.json();
      if (data.links) {
        setLinks(data.links);
      }
    } catch (error) {
      console.error("Erreur chargement liens:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      slug: "",
      clientName: "",
      serviceName: "",
      expiresAt: "",
    });
    setEditingLink(null);
    setFormError("");
  };

  const openEditForm = (link: AccessLink) => {
    setFormData({
      slug: link.slug,
      clientName: link.clientName,
      serviceName: link.serviceName,
      expiresAt: new Date(link.expiresAt).toISOString().split("T")[0],
    });
    setEditingLink(link);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    try {
      const url = "/api/admin/links";
      const method = editingLink ? "PUT" : "POST";
      const body = editingLink
        ? { id: editingLink.id, serviceType, ...formData }
        : { serviceType, ...formData };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Erreur lors de l'enregistrement");
        return;
      }

      await fetchLinks();
      setShowForm(false);
      resetForm();
    } catch {
      setFormError("Erreur de connexion");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce lien ?")) return;

    try {
      await fetch(`/api/admin/links?id=${id}`, { method: "DELETE" });
      await fetchLinks();
    } catch (error) {
      console.error("Erreur suppression:", error);
    }
  };

  const handleToggleActive = async (link: AccessLink) => {
    try {
      await fetch("/api/admin/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id, isActive: !link.isActive }),
      });
      await fetchLinks();
    } catch (error) {
      console.error("Erreur toggle:", error);
    }
  };

  const isExpired = (date: string) => new Date(date) < new Date();

  // Filtre côté client sur le type de service
  const filteredLinks = links.filter((l) => l.serviceType === serviceType);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>{title}</h2>
          <p className="mt-1 text-sm" style={{ color: "#727485" }}>{subtitle}</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 text-white rounded-full text-sm font-medium transition-colors"
          style={{ backgroundColor: "#1f2244" }}
        >
          Nouveau lien
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
            {editingLink ? "Modifier le lien" : "Créer un lien"}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Slug */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Slug (URL)
                </label>
                <div className="flex items-center">
                  <span className="text-sm mr-1" style={{ color: "#727485" }}>evaremote.com/</span>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""),
                      })
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                    placeholder="agrotic2026"
                  />
                </div>
              </div>

              {/* Nom du client */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Nom du client
                </label>
                <input
                  type="text"
                  required
                  value={formData.clientName}
                  onChange={(e) =>
                    setFormData({ ...formData, clientName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                  placeholder="Agrotic SA"
                />
              </div>

              {/* Événement */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Événement
                </label>
                <input
                  type="text"
                  required
                  value={formData.serviceName}
                  onChange={(e) =>
                    setFormData({ ...formData, serviceName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                  placeholder="Conférence 2026"
                />
              </div>

              {/* Date d'expiration */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Date d&apos;expiration
                </label>
                <input
                  type="date"
                  required
                  value={formData.expiresAt}
                  onChange={(e) =>
                    setFormData({ ...formData, expiresAt: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                />
              </div>
            </div>

            {/* Erreur */}
            {formError && (
              <div className="text-red-600 text-sm bg-red-50 py-2 px-3 rounded">
                {formError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-white rounded-full text-sm font-medium transition-colors"
                style={{ backgroundColor: "#1f2244" }}
              >
                {editingLink ? "Enregistrer" : "Créer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-full text-sm font-medium transition-colors"
                style={{ color: "#1f2244" }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des liens */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {filteredLinks.length === 0 ? (
          <div className="p-8 text-center" style={{ color: "#727485" }}>
            Aucun lien créé pour le moment
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200" style={{ backgroundColor: "#f5f5f7" }}>
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: "#727485" }}>
                    Slug
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: "#727485" }}>
                    Client
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium hidden sm:table-cell" style={{ color: "#727485" }}>
                    Service
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: "#727485" }}>
                    Statut
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: "#727485" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a
                        href={`/${link.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-mono text-sm"
                        style={{ color: "#7dcef5" }}
                      >
                        /{link.slug}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#1f2244" }}>
                      {link.clientName}
                    </td>
                    <td className="px-4 py-3 text-sm hidden sm:table-cell" style={{ color: "#727485" }}>
                      {link.serviceName}
                    </td>
                    <td className="px-4 py-3">
                      {isExpired(link.expiresAt) ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                          Expiré
                        </span>
                      ) : link.isActive ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                          Actif
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "#f5f5f7", color: "#727485" }}>
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(link)}
                          className="text-xs transition-colors"
                          style={{ color: "#727485" }}
                        >
                          {link.isActive ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          onClick={() => openEditForm(link)}
                          className="text-xs transition-colors"
                          style={{ color: "#7dcef5" }}
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="text-xs text-red-600 hover:text-red-800 transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
