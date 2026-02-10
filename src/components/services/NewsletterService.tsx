"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AccessLinkInfo, NewsletterConfig, Conference } from "@/lib/services";

interface Props {
  link: AccessLinkInfo;
}

interface Template {
  name: string;
  label?: string;
}

// Composant pour le service Newsletter Live - Interface de correction client IA Régie
export default function NewsletterService({ link }: Props) {
  const config = link.config as NewsletterConfig;
  const slug = link.slug;

  const [conferences, setConferences] = useState<Conference[]>(
    config.conferences || []
  );
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  // Textes modifiés localement (clé = conference.id)
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});

  // Modal newsletter
  const [showNewsletterModal, setShowNewsletterModal] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<{
    type: "info" | "success" | "danger";
    message: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState(
    config.newsletter_template || "newsletter_base.html"
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Texte personnalisé (édito) pour la newsletter
  const [customText, setCustomText] = useState("");

  // Speaker mapping par conférence
  const [speakerMappings, setSpeakerMappings] = useState<
    Record<number, Record<string, string>>
  >({});
  const [savingMapping, setSavingMapping] = useState<number | null>(null);
  const [mappingSaved, setMappingSaved] = useState<number | null>(null);

  // Refs pour file inputs
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Initialiser les textes édités et les speaker mappings depuis les données
  useEffect(() => {
    const texts: Record<number, string> = {};
    const mappings: Record<number, Record<string, string>> = {};

    (config.conferences || []).forEach((conf) => {
      // Priorité : summary_corrected > summary_ia
      const text = conf.summary_corrected || conf.summary_ia || "";
      if (text) {
        texts[conf.id] = text;
      }

      // Initialiser le mapping speakers : override > mapping global
      if (conf.speakers_detected && conf.speakers_detected.length > 0) {
        const m: Record<string, string> = {};
        conf.speakers_detected.forEach((spk) => {
          if (conf.speaker_mapping_override?.[spk]) {
            m[spk] = conf.speaker_mapping_override[spk];
          } else if (config.speaker_mapping?.[spk]) {
            m[spk] = config.speaker_mapping[spk];
          }
        });
        if (Object.keys(m).length > 0) {
          mappings[conf.id] = m;
        }
      }
    });

    setEditedTexts(texts);
    setSpeakerMappings(mappings);
    setConferences(config.conferences || []);
  }, [config.conferences, config.speaker_mapping]);

  // Auto-refresh si traitement en cours (polling léger via fetch)
  useEffect(() => {
    const hasProcessing = conferences.some(
      (conf) =>
        conf.status === "TRAITEMENT EN COURS" || conf.status === "EN ATTENTE"
    );

    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/${slug}/sync`);
        if (res.ok) {
          const data = await res.json();
          if (data.conferences) {
            // Vérifier s'il y a de nouvelles données
            const hasNewData = data.conferences.some(
              (c: { id: number; has_summary_ia: boolean }) => {
                const current = conferences.find((cc) => cc.id === c.id);
                return current && !current.summary_ia && c.has_summary_ia;
              }
            );
            if (hasNewData) {
              // Recharger la page pour avoir les données fraîches
              window.location.reload();
            }
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [conferences, slug]);

  // Compter les mots
  const countWords = (text: string) => {
    return text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  };

  // === Valider une conférence ===
  const saveConference = async (conferenceId: number) => {
    const text = editedTexts[conferenceId] || "";
    setSavingId(conferenceId);

    try {
      // 1. Valider le texte via l'API newsletter
      const response = await fetch("/api/services/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          action: "validate_conference",
          conference_id: conferenceId,
          summary: text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la sauvegarde");
      }

      const result = await response.json();

      // 2. Upload de la photo si sélectionnée
      const fileInput = fileInputRefs.current[conferenceId];
      if (fileInput?.files && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        formData.append("slug", slug);
        formData.append("conference_id", String(conferenceId));

        const photoResponse = await fetch("/api/services/newsletter/upload-photo", {
          method: "POST",
          body: formData,
        });

        if (!photoResponse.ok) {
          throw new Error("Erreur lors de l'upload de l'image");
        }

        // Reset le file input
        fileInput.value = "";
      }

      // 3. Mettre à jour l'état local
      setConferences((prev) =>
        prev.map((c) =>
          c.id === conferenceId
            ? {
                ...c,
                summary_corrected: text,
                status: "VALIDÉ",
              }
            : c
        )
      );

      // Notification
      if (result.all_validated) {
        alert(
          `Version finale validée !\n\nToutes les conférences sont validées (${result.validated_count}/${result.total_count}). Vous pouvez générer la newsletter !`
        );
      } else {
        alert(
          `Version finale validée !\n\n${result.validated_count}/${result.total_count} conférence(s) validée(s).`
        );
      }
    } catch (error) {
      alert("Erreur : " + (error as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  // === Sauvegarder le mapping speakers d'une conférence ===
  const saveSpeakerMapping = async (conferenceId: number) => {
    setSavingMapping(conferenceId);
    try {
      const response = await fetch("/api/services/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          action: "save_speaker_mapping",
          conference_id: conferenceId,
          speaker_mapping_override: speakerMappings[conferenceId] || {},
        }),
      });

      if (!response.ok) throw new Error("Erreur sauvegarde mapping");

      // Feedback visuel
      setMappingSaved(conferenceId);
      setTimeout(() => setMappingSaved(null), 2000);

      // Mettre à jour l'état local
      setConferences((prev) =>
        prev.map((c) =>
          c.id === conferenceId
            ? { ...c, speaker_mapping_override: speakerMappings[conferenceId] }
            : c
        )
      );
    } catch (error) {
      alert("Erreur : " + (error as Error).message);
    } finally {
      setSavingMapping(null);
    }
  };

  // === Charger les templates disponibles ===
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch("/api/services/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "list_templates" }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.templates.length > 0) {
          setTemplates(data.templates);
        }
      }
    } catch {
      // Templates non disponibles, on garde le défaut
    } finally {
      setLoadingTemplates(false);
    }
  };

  // === Générer et envoyer la newsletter ===
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
      const response = await fetch("/api/services/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          action: "generate",
          email: newsletterEmail,
          template_name: selectedTemplate,
          custom_text: selectedTemplate.includes("custom") ? customText : undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setNewsletterStatus({
          type: "success",
          message: `Newsletter envoyée avec succès à ${newsletterEmail} ! (${result.conferences_count} article(s))`,
        });

        setTimeout(() => {
          setShowNewsletterModal(false);
          setNewsletterStatus(null);
          setGenerating(false);
        }, 4000);
      } else {
        setNewsletterStatus({
          type: "danger",
          message: result.error || "Erreur lors de la génération",
        });
        setGenerating(false);
      }
    } catch {
      setNewsletterStatus({
        type: "danger",
        message: "Erreur de connexion au serveur",
      });
      setGenerating(false);
    }
  };

  // Ouvrir la modal newsletter
  const openNewsletterModal = () => {
    setShowNewsletterModal(true);
    setNewsletterStatus(null);
    setNewsletterEmail("");
    setCustomText("");
    loadTemplates();
  };

  // Stats
  const validatedCount = conferences.filter(
    (conf) => conf.status === "VALIDÉ"
  ).length;
  const totalCount = conferences.length;
  const readyCount = conferences.filter(
    (conf) => conf.summary_ia || conf.summary_corrected
  ).length;

  // Déterminer le texte affiché pour une conférence
  const getDisplayText = (conf: Conference): string => {
    return conf.summary_corrected || conf.summary_ia || "";
  };

  // La conférence a un résumé disponible ?
  const hasSummary = (conf: Conference): boolean => {
    return !!(conf.summary_ia || conf.summary_corrected);
  };

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
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#2c3e50] border-l-4 border-blue-500 pl-4">
            ESPACE CORRECTION CLIENT
            {config.event_name && (
              <span className="text-blue-500 font-medium text-sm sm:text-base ml-2">
                - {config.event_name}
              </span>
            )}
          </h2>
          {config.event_date && (
            <p className="text-sm text-gray-500 mt-1 pl-5">
              {new Date(config.event_date).toLocaleDateString("fr-FR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Compteur */}
          <div className="text-right text-sm">
            <div className="text-green-600 font-semibold">
              {validatedCount}/{totalCount} validée(s)
            </div>
            <div className="text-gray-400">
              {readyCount}/{totalCount} résumé(s) prêt(s)
            </div>
          </div>

          <button
            onClick={openNewsletterModal}
            disabled={validatedCount === 0}
            className="px-6 py-3 text-white font-semibold rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              background:
                validatedCount > 0
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  : "#9ca3af",
            }}
          >
            GÉNÉRER NEWSLETTER
          </button>
        </div>
      </div>

      {/* Barre de progression */}
      {totalCount > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progression</span>
            <span>
              {validatedCount}/{totalCount} conférence(s) validée(s)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{
                width: `${(validatedCount / totalCount) * 100}%`,
                background:
                  validatedCount === totalCount
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              }}
            />
          </div>
        </div>
      )}

      {/* Liste des conférences */}
      {conferences.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-lg">
            Aucune conférence disponible pour le moment
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Les conférences apparaîtront ici une fois l&apos;événement
            configuré.
          </p>
        </div>
      ) : (
        conferences.map((conf) => (
          <div
            key={conf.id}
            className={`bg-white border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow ${
              conf.status === "VALIDÉ"
                ? "border-green-200"
                : "border-gray-200"
            }`}
          >
            {/* En-tête conférence */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <h4 className="text-lg font-bold text-[#2c3e50]">
                #{conf.id} - {conf.title}
              </h4>
              <div className="flex items-center gap-2">
                {conf.status === "VALIDÉ" && (
                  <span className="text-green-600 text-lg">✓</span>
                )}
                <span
                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${
                    conf.status === "VALIDÉ"
                      ? "bg-green-100 text-green-800"
                      : conf.status === "TRAITEMENT EN COURS"
                        ? "bg-blue-100 text-blue-800"
                        : conf.status === "RÉSUMÉ PRÊT"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {conf.status}
                </span>
              </div>
            </div>

            {hasSummary(conf) ? (
              <>
                {/* Info style */}
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg mb-4 text-sm flex items-center justify-between">
                  <span>
                    Résumé généré en style{" "}
                    <strong>{conf.summary_style || "journaliste"}</strong> (
                    {conf.summary_word_count || 200} mots ciblés)
                  </span>
                  {conf.summary_corrected && (
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-medium">
                      Modifié
                    </span>
                  )}
                </div>

                {/* Zone de texte */}
                <label className="block text-sm font-semibold text-gray-500 mb-2">
                  Correction du résumé IA :
                </label>
                <textarea
                  id={`text-${conf.id}`}
                  rows={10}
                  value={editedTexts[conf.id] ?? getDisplayText(conf)}
                  onChange={(e) =>
                    setEditedTexts((prev) => ({
                      ...prev,
                      [conf.id]: e.target.value,
                    }))
                  }
                  disabled={savingId === conf.id}
                  className="w-full p-4 border border-gray-300 rounded-lg text-gray-900 text-base leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50 disabled:bg-gray-50"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>
                    {conf.speakers_detected && conf.speakers_detected.length > 0 && (
                      <span className="text-xs text-gray-400">
                        Speakers détectés : {conf.speakers_detected.join(", ")}
                      </span>
                    )}
                  </span>
                  <span>
                    {countWords(editedTexts[conf.id] ?? getDisplayText(conf))}{" "}
                    mots
                  </span>
                </div>

                {/* Section Speaker Mapping */}
                {conf.speakers_detected && conf.speakers_detected.length > 0 &&
                  config.lexicon_speakers && config.lexicon_speakers.length > 0 && (
                  <div className="bg-[#f0f4f8] border border-[#d0d7de] rounded-xl p-5 mt-5 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-blue-600 font-bold text-sm">
                        Identification des Intervenants
                      </span>
                      {mappingSaved === conf.id && (
                        <span className="text-green-600 text-xs font-medium animate-pulse">
                          Sauvegard&eacute;
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                      Associez chaque voix d&eacute;tect&eacute;e au nom de l&apos;intervenant correspondant.
                    </p>

                    <div className="space-y-2">
                      {conf.speakers_detected.map((speakerId) => (
                        <div
                          key={speakerId}
                          className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-500 transition-colors"
                        >
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded min-w-[110px] font-semibold">
                            {speakerId}
                          </span>
                          <span className="text-gray-400 text-lg">&rarr;</span>
                          <select
                            value={speakerMappings[conf.id]?.[speakerId] || ""}
                            onChange={(e) => {
                              setSpeakerMappings((prev) => ({
                                ...prev,
                                [conf.id]: {
                                  ...(prev[conf.id] || {}),
                                  [speakerId]: e.target.value,
                                },
                              }));
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="">-- S&eacute;lectionner un intervenant --</option>
                            {config.lexicon_speakers!.map((s) =>
                              s.function ? (
                                <option key={s.name} value={s.name}>
                                  {s.name} &mdash; {s.function}
                                </option>
                              ) : (
                                <option key={s.name} value={s.name}>
                                  {s.name}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <button
                        onClick={() => saveSpeakerMapping(conf.id)}
                        disabled={savingMapping === conf.id}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                      >
                        {savingMapping === conf.id ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sauvegarde...
                          </span>
                        ) : (
                          "Sauvegarder le mapping"
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Photo existante */}
                {conf.photo_path && (
                  <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                    <span>📷</span>
                    <span>Photo déjà uploadée</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mt-6">
                  <div className="w-full sm:w-auto">
                    <label className="block text-sm font-semibold text-gray-500 mb-2">
                      {conf.photo_path
                        ? "Remplacer la photo :"
                        : "Ajouter une photo de la conférence :"}
                    </label>
                    <input
                      type="file"
                      ref={(el) => {
                        fileInputRefs.current[conf.id] = el;
                      }}
                      accept="image/*"
                      disabled={savingId === conf.id}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-dashed file:border-gray-300 file:bg-gray-50 file:text-gray-700 hover:file:bg-blue-50 hover:file:border-blue-500 transition-all disabled:opacity-50"
                    />
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => saveConference(conf.id)}
                      disabled={savingId === conf.id}
                      className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                      {savingId === conf.id ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Validation...
                        </span>
                      ) : (
                        "VALIDER LA VERSION FINALE"
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : conf.status === "TRAITEMENT EN COURS" ? (
              <div
                className="text-center p-8 rounded-lg text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                <h5 className="text-lg font-medium">Traitement en cours...</h5>
                <p className="text-white/80 mt-2">
                  La transcription et le résumé sont en cours de génération (2-4
                  min)
                </p>
                <p className="text-white/60 text-sm mt-1">
                  Cette page se rafraîchit automatiquement
                </p>
              </div>
            ) : (
              <div className="p-8 text-center border border-gray-200 rounded-lg bg-gray-50">
                <div className="text-3xl mb-2">⏳</div>
                <p className="text-gray-500">
                  La conférence n&apos;a pas encore été enregistrée ou le résumé
                  est en préparation...
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Le résumé apparaîtra automatiquement une fois prêt
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
            <div
              className="flex justify-between items-center p-6 border-b border-gray-200"
              style={{
                background:
                  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              }}
            >
              <h5 className="text-lg font-semibold text-white">
                Générer et Envoyer la Newsletter
              </h5>
              <button
                onClick={() => {
                  setShowNewsletterModal(false);
                  setNewsletterStatus(null);
                }}
                className="text-white/70 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Résumé de validation */}
              <div className="flex items-center gap-3">
                <div
                  className={`inline-block px-4 py-2 rounded-lg font-semibold ${
                    validatedCount === totalCount && totalCount > 0
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {validatedCount}/{totalCount} conférence(s) validée(s)
                </div>
                {validatedCount < totalCount && (
                  <span className="text-sm text-gray-500">
                    Seules les conférences validées seront incluses
                  </span>
                )}
              </div>

              {/* Liste des conférences incluses */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Articles inclus :
                </p>
                <ul className="space-y-1">
                  {conferences.map((conf) => (
                    <li
                      key={conf.id}
                      className={`text-sm flex items-center gap-2 ${
                        conf.status === "VALIDÉ"
                          ? "text-green-700"
                          : "text-gray-400"
                      }`}
                    >
                      <span>
                        {conf.status === "VALIDÉ" ? "✓" : "○"}
                      </span>
                      <span>
                        #{conf.id} - {conf.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l&apos;événement :
                </label>
                <input
                  type="text"
                  value={config.event_name || link.serviceName || ""}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>

              {/* Sélection du template */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template newsletter :
                </label>
                {loadingTemplates ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    Chargement des templates...
                  </div>
                ) : templates.length > 0 ? (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {templates.map((tpl) => (
                      <option key={tpl.name} value={tpl.name}>
                        {tpl.label || tpl.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedTemplate}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                )}
              </div>

              {/* Texte personnalisé (visible si template "custom") */}
              {selectedTemplate.includes("custom") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Texte personnalis&eacute; (&eacute;dito, introduction...) :
                  </label>
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    rows={4}
                    placeholder="Ajoutez votre texte ici... Il apparaîtra en haut de la newsletter, avant les articles."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email destinataire :
                </label>
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="votre-email@exemple.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-xs text-gray-400 mt-1">
                  La newsletter sera envoyée à cette adresse. Vous pourrez
                  ensuite la transférer à votre base de contacts.
                </p>
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
                  {newsletterStatus.type === "success" && (
                    <span className="mr-2">✅</span>
                  )}
                  {newsletterStatus.type === "danger" && (
                    <span className="mr-2">❌</span>
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
                disabled={generating || validatedCount === 0}
                className="px-5 py-2.5 text-white font-semibold rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Envoi en cours...
                  </span>
                ) : (
                  `Générer et Envoyer (${validatedCount} article${validatedCount > 1 ? "s" : ""})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
