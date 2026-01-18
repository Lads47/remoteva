"use client";

import { useState, useEffect, useCallback } from "react";
import { AccessLinkInfo } from "@/lib/services";

interface Props {
  link: AccessLinkInfo;
}

interface Conference {
  id: string;
  title: string;
  status: "VALIDÉ" | "BROUILLON" | "TRAITEMENT EN COURS" | "EN ATTENTE";
  summary?: string;
  summary_style?: string;
  summary_word_count?: number;
}

interface EventInfo {
  loaded: boolean;
  event_name?: string;
  newsletter_template?: string;
}

// Composant pour le service Newsletter Live - Interface de correction client IA Régie
export default function NewsletterService({ link }: Props) {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewsletterModal, setShowNewsletterModal] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<{
    type: "info" | "success" | "danger";
    message: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Textes modifiés localement
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

  // Charger les données
  const loadData = useCallback(async () => {
    try {
      // Charger les infos de l'événement depuis n8n
      const eventRes = await fetch("/api/event/current");
      if (eventRes.ok) {
        const eventData = await eventRes.json();
        setEventInfo(eventData);
      }

      // Charger les conférences depuis n8n ou depuis le config du lien
      const config = link.config as { conferences?: Conference[] };
      if (config.conferences) {
        setConferences(config.conferences);
        // Initialiser les textes édités
        const texts: Record<string, string> = {};
        config.conferences.forEach((conf) => {
          if (conf.summary) {
            texts[conf.id] = conf.summary;
          }
        });
        setEditedTexts(texts);
      }
    } catch (error) {
      console.error("Erreur chargement données:", error);
    } finally {
      setLoading(false);
    }
  }, [link.config]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh si traitement en cours
  useEffect(() => {
    const hasProcessing = conferences.some(
      (conf) => conf.status === "TRAITEMENT EN COURS"
    );
    if (hasProcessing) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [conferences]);

  // Compter les mots
  const countWords = (text: string) => {
    return text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  };

  // Sauvegarder une conférence
  const saveConference = async (id: string, status: "BROUILLON" | "VALIDÉ") => {
    const text = editedTexts[id] || "";
    const fileInput = document.getElementById(
      `photo-${id}`
    ) as HTMLInputElement;

    try {
      // 1. Sauvegarde du texte et statut
      const response = await fetch(`/client/update-summary/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: text, status: status }),
      });

      if (!response.ok) throw new Error("Erreur lors de la sauvegarde du texte");

      // 2. Upload de la photo si sélectionnée
      if (fileInput?.files && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        const photoResponse = await fetch(`/upload-photo/${id}`, {
          method: "POST",
          body: formData,
        });
        if (!photoResponse.ok)
          throw new Error("Erreur lors de l'upload de l'image");
      }

      alert(
        `${status === "VALIDÉ" ? "Version finale validée" : "Brouillon enregistré"} et synchronisé !`
      );
      window.location.reload();
    } catch (error) {
      alert("" + (error as Error).message);
    }
  };

  // Générer la newsletter
  const generateNewsletter = async () => {
    if (!newsletterEmail) {
      alert("Veuillez saisir une adresse email");
      return;
    }

    if (!newsletterEmail.includes("@") || !newsletterEmail.includes(".")) {
      alert("Adresse email invalide");
      return;
    }

    setGenerating(true);
    setNewsletterStatus({ type: "info", message: "Génération en cours..." });

    try {
      const response = await fetch("/api/newsletter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: eventInfo?.event_name || "",
          template_name: eventInfo?.newsletter_template || "newsletter_base.html",
          email: newsletterEmail,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setNewsletterStatus({
          type: "success",
          message: `Newsletter envoyée avec succès ! (${result.conferences_count} article(s))`,
        });

        setTimeout(() => {
          setShowNewsletterModal(false);
          setNewsletterStatus(null);
          setGenerating(false);
        }, 3000);
      } else {
        setNewsletterStatus({
          type: "danger",
          message: result.error || "Erreur lors de la génération",
        });
        setGenerating(false);
      }
    } catch (error) {
      setNewsletterStatus({
        type: "danger",
        message: "Erreur de connexion au serveur",
      });
      setGenerating(false);
    }
  };

  // Nombre de conférences validées
  const validatedCount = conferences.filter(
    (conf) => conf.status === "VALIDÉ"
  ).length;

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse text-gray-500">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-[#2c3e50] border-l-4 border-blue-500 pl-4">
          ESPACE CORRECTION CLIENT{" "}
          {eventInfo?.event_name && (
            <span className="text-blue-500 font-medium text-sm sm:text-base">
              - {eventInfo.event_name}
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowNewsletterModal(true)}
          className="px-6 py-3 text-white font-semibold rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          }}
        >
          GÉNÉRER NEWSLETTER
        </button>
      </div>

      {/* Liste des conférences */}
      {conferences.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <p className="text-gray-500">Aucune conférence disponible</p>
        </div>
      ) : (
        conferences.map((conf) => (
          <div
            key={conf.id}
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            {/* En-tête conférence */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <h4 className="text-lg font-bold text-[#2c3e50]">
                #{conf.id} - {conf.title}
              </h4>
              <span
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${
                  conf.status === "VALIDÉ"
                    ? "bg-green-100 text-green-800"
                    : conf.status === "BROUILLON"
                      ? "bg-yellow-100 text-yellow-800"
                      : conf.status === "TRAITEMENT EN COURS"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-600"
                }`}
              >
                {conf.status}
              </span>
            </div>

            {conf.summary ? (
              <>
                {/* Info style */}
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg mb-4 text-sm">
                  Résumé généré en style{" "}
                  <strong>{conf.summary_style || "journaliste"}</strong> (
                  {conf.summary_word_count || 200} mots ciblés)
                </div>

                {/* Zone de texte */}
                <label className="block text-sm font-semibold text-gray-500 mb-2">
                  Correction du résumé IA :
                </label>
                <textarea
                  id={`text-${conf.id}`}
                  rows={10}
                  value={editedTexts[conf.id] || ""}
                  onChange={(e) =>
                    setEditedTexts((prev) => ({
                      ...prev,
                      [conf.id]: e.target.value,
                    }))
                  }
                  className="w-full p-4 border border-gray-300 rounded-lg text-gray-900 text-base leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
                <div className="text-right text-sm text-gray-500 mt-1">
                  {countWords(editedTexts[conf.id] || "")} mots
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mt-6">
                  <div className="w-full sm:w-auto">
                    <label className="block text-sm font-semibold text-gray-500 mb-2">
                      Ajouter une photo de la conférence :
                    </label>
                    <input
                      type="file"
                      id={`photo-${conf.id}`}
                      accept="image/*"
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-dashed file:border-gray-300 file:bg-gray-50 file:text-gray-700 hover:file:bg-blue-50 hover:file:border-blue-500 transition-all"
                    />
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => saveConference(conf.id, "BROUILLON")}
                      className="px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg shadow transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      ENREGISTRER BROUILLON
                    </button>
                    <button
                      onClick={() => saveConference(conf.id, "VALIDÉ")}
                      className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      VALIDER LA VERSION FINALE
                    </button>
                  </div>
                </div>
              </>
            ) : conf.status === "TRAITEMENT EN COURS" ? (
              <div
                className="text-center p-8 rounded-lg text-white"
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                <h5 className="text-lg font-medium">Traitement en cours...</h5>
                <p className="text-white/80 mt-2">
                  La transcription et le résumé sont en cours de génération (2-4
                  min)
                </p>
              </div>
            ) : (
              <div className="p-8 text-center border border-gray-200 rounded-lg bg-gray-50">
                <p className="text-gray-500">
                  La conférence n&apos;a pas encore été enregistrée ou le résumé
                  est en préparation...
                </p>
              </div>
            )}
          </div>
        ))
      )}

      {/* Modal Newsletter */}
      {showNewsletterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h5 className="text-lg font-semibold text-gray-900">
                Générer et Envoyer la Newsletter
              </h5>
              <button
                onClick={() => {
                  setShowNewsletterModal(false);
                  setNewsletterStatus(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="inline-block px-4 py-2 bg-green-100 text-green-800 rounded-lg font-semibold">
                {validatedCount} conférence(s) validée(s)
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l&apos;événement :
                </label>
                <input
                  type="text"
                  value={eventInfo?.event_name || ""}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template utilisé :
                </label>
                <input
                  type="text"
                  value={eventInfo?.newsletter_template || "newsletter_base.html"}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email destinataire :
                </label>
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="exemple@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {newsletterStatus && (
                <div
                  className={`p-4 rounded-lg ${
                    newsletterStatus.type === "info"
                      ? "bg-blue-50 text-blue-800"
                      : newsletterStatus.type === "success"
                        ? "bg-green-50 text-green-800"
                        : "bg-red-50 text-red-800"
                  }`}
                >
                  {newsletterStatus.type === "info" && (
                    <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                  )}
                  {newsletterStatus.message}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowNewsletterModal(false);
                  setNewsletterStatus(null);
                }}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={generateNewsletter}
                disabled={generating}
                className="px-5 py-2.5 text-white font-semibold rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                Générer et Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
