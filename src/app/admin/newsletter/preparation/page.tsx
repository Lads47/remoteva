"use client";

import { useState, useEffect, useCallback } from "react";

interface Lexique {
  file_id: string;
  file_name: string;
  event_name?: string;
  modified_time?: string;
  created_time?: string;
}

interface Template {
  name: string;
  file_id?: string;
}

interface Progress {
  status: string;
  progress_percent: number;
  current_step: string;
  error?: string;
}

// Page de préparation du lexique événement - Design clair
export default function PreparationPage() {
  const [eventName, setEventName] = useState("");
  const [mode, setMode] = useState<"rapide" | "approfondi">("rapide");
  const [driveUrl, setDriveUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  const [lexiques, setLexiques] = useState<Lexique[]>([]);
  const [loadingLexiques, setLoadingLexiques] = useState(true);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Charger les lexiques
  const loadLexiques = useCallback(async () => {
    setLoadingLexiques(true);
    try {
      const response = await fetch("/api/lexiques");
      const data = await response.json();
      if (data.lexiques) {
        setLexiques(data.lexiques);
      }
    } catch (error) {
      console.error("Erreur chargement lexiques:", error);
    } finally {
      setLoadingLexiques(false);
    }
  }, []);

  // Charger les templates
  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch("/api/newsletter/templates");
      const data = await response.json();
      if (data.success && data.templates) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error("Erreur chargement templates:", error);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    loadLexiques();
    loadTemplates();
  }, [loadLexiques, loadTemplates]);

  // Polling progression
  useEffect(() => {
    if (!processing || !eventName) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/preparation/progress/${encodeURIComponent(eventName)}`
        );
        const data = await response.json();

        if (data.status === "not_found") return;

        setProgress(data);

        if (data.status === "completed") {
          clearInterval(interval);
          alert("Lexique terminé avec succès !");
          loadLexiques();
          resetForm();
        } else if (data.status === "error") {
          clearInterval(interval);
          alert("Erreur: " + data.error);
          resetForm();
        }
      } catch (error) {
        console.error("Erreur polling:", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [processing, eventName, loadLexiques]);

  const resetForm = () => {
    setProcessing(false);
    setProgress(null);
    setEventName("");
    setDriveUrl("");
  };

  // Lancer la préparation
  const startProcessing = async () => {
    if (!eventName.trim()) {
      alert("Veuillez saisir un nom d'événement");
      return;
    }
    if (!driveUrl.trim()) {
      alert("Veuillez saisir l'URL du dossier Google Drive");
      return;
    }

    try {
      const response = await fetch("/api/prepare-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: eventName,
          drive_folder_url: driveUrl,
          mode: mode,
        }),
      });

      if (response.ok) {
        setProcessing(true);
        setProgress({ status: "init", progress_percent: 0, current_step: "init" });
      } else {
        const error = await response.json();
        alert("Erreur: " + (error.detail || "Échec du lancement"));
      }
    } catch (error) {
      alert("Erreur réseau: " + (error as Error).message);
    }
  };

  // Charger un lexique
  const chargerLexique = async (fileId: string, lexName: string) => {
    const sheetId = prompt(
      `Charger le lexique "${lexName}" pour le jour J ?\n\n` +
        `Template newsletter: ${selectedTemplate || "Aucun"}\n\n` +
        `Pour charger les conférences, collez l'ID du Google Sheet "Synthes":\n` +
        `(Vous pouvez le trouver dans l'URL du sheet entre /d/ et /edit)\n\n` +
        `Exemple: 11WTPO0JJ3mg5ssq8TUbLp22czYSQROTyHWxsYIzr_98\n\n` +
        `Laissez vide pour charger uniquement le lexique sans les conférences.`
    );

    if (sheetId === null) return;

    try {
      const body: Record<string, string> = { file_id: fileId };
      if (sheetId?.trim()) body.sheet_id = sheetId.trim();
      if (selectedTemplate) body.newsletter_template = selectedTemplate;

      const response = await fetch("/api/lexiques/charger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const result = await response.json();
        let message = `Lexique chargé avec succès !\n\n${result.conferences_count} conférences`;
        if (result.speakers_count > 0) {
          message += `\n${result.speakers_count} intervenants`;
        }
        if (selectedTemplate) {
          message += `\nTemplate: ${selectedTemplate}`;
        }
        alert(message);
        window.location.href = "/admin/newsletter";
      } else {
        const error = await response.json();
        alert("Erreur: " + (error.detail || "Échec du chargement"));
      }
    } catch (error) {
      alert("Erreur réseau: " + (error as Error).message);
    }
  };

  // Effacer un lexique
  const effacerLexique = async (fileId: string, lexName: string) => {
    if (
      !confirm(
        `ATTENTION: Supprimer définitivement le lexique "${lexName}" de Google Drive ?\n\nCette action est irréversible.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/lexiques/effacer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });

      if (response.ok) {
        alert("Lexique supprimé avec succès !");
        loadLexiques();
      } else {
        const error = await response.json();
        alert("Erreur: " + (error.detail || "Échec de la suppression"));
      }
    } catch (error) {
      alert("Erreur réseau: " + (error as Error).message);
    }
  };

  // Formater la date
  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return (
        date.toLocaleDateString("fr-FR") +
        " " +
        date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return isoString;
    }
  };

  // Labels des étapes
  const stepLabels: Record<string, string> = {
    init: "Initialisation...",
    scan_drive: "Scan Google Drive...",
    parse_sheets: "Lecture Google Sheets...",
    extract_ppt: "Extraction PowerPoint...",
    extract_pdf: "Extraction PDF...",
    extract_documents: "Extraction documents...",
    build_lexicon: "Construction lexique...",
    finalize: "Finalisation...",
    upload: "Upload vers Drive...",
    completed: "Terminé !",
  };

  return (
    <div className="space-y-6">
      {/* En-tête + breadcrumb fournis par /admin/newsletter/layout.tsx (Phase 5) */}
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
          Préparation Newsletter Live
        </h2>
        <p className="mt-1 text-sm" style={{ color: "#727485" }}>
          Créer et gérer les lexiques d&apos;événements.
        </p>
      </div>

      {/* Section création lexique */}
      {!processing ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
            1. Créer un nouveau lexique
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                Nom de l&apos;événement :
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Ex: Agrotic 2024"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "#1f2244" }}>
                Mode d&apos;analyse :
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="rapide"
                    checked={mode === "rapide"}
                    onChange={() => setMode("rapide")}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span>
                    <span className="font-medium">Rapide (2-4h)</span>
                    <span className="text-gray-500 ml-2">- Extraction par fréquence</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="approfondi"
                    checked={mode === "approfondi"}
                    onChange={() => setMode("approfondi")}
                    className="w-4 h-4 text-purple-600"
                  />
                  <span>
                    <span className="font-medium">Approfondi (12-24h)</span>
                    <span className="text-gray-500 ml-2">- Analyse LLM complète</span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                URL Dossier Google Drive :
              </label>
              <input
                type="text"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              onClick={startProcessing}
              className="w-full py-3 text-white font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: "#1f2244" }}
            >
              LANCER LA PRÉPARATION
            </button>
          </div>
        </div>
      ) : (
        /* Section progression */
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
            2. Traitement en cours...
          </h2>

          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-blue-600">EN COURS</span>
            <span className="text-sm font-medium">{progress?.progress_percent || 0}%</span>
          </div>

          <div className="h-8 bg-gray-200 rounded-lg overflow-hidden">
            <div
              className="h-full flex items-center justify-center text-white text-sm font-bold transition-all duration-500"
              style={{
                width: `${progress?.progress_percent || 0}%`,
                background: "linear-gradient(90deg, #1f2244 0%, #7dcef5 100%)",
              }}
            >
              {progress?.progress_percent || 0}%
            </div>
          </div>

          <p className="mt-3 text-sm" style={{ color: "#727485" }}>
            Étape: {stepLabels[progress?.current_step || "init"] || progress?.current_step}
          </p>

          <button
            onClick={() => {
              if (confirm("Annuler le traitement en cours ?")) {
                resetForm();
              }
            }}
            className="mt-4 px-4 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Lexiques disponibles */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "#1f2244" }}>
            Lexiques disponibles (Google Drive)
          </h2>
          <button
            onClick={loadLexiques}
            className="text-blue-600 hover:text-blue-800 text-xl"
            title="Rafraîchir"
          >
            &#8635;
          </button>
        </div>

        {loadingLexiques ? (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            Chargement depuis Google Drive...
          </div>
        ) : lexiques.length === 0 ? (
          <p className="text-gray-500">Aucun lexique disponible sur Google Drive</p>
        ) : (
          <div className="space-y-3">
            {lexiques.map((lex) => (
              <div
                key={lex.file_id}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="font-medium" style={{ color: "#1f2244" }}>
                    {lex.event_name || lex.file_name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatDate(lex.modified_time || lex.created_time)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      chargerLexique(lex.file_id, lex.event_name || lex.file_name)
                    }
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Charger
                  </button>
                  <button
                    onClick={() =>
                      effacerLexique(lex.file_id, lex.event_name || lex.file_name)
                    }
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Effacer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates Newsletter */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "#1f2244" }}>
            Templates Newsletter (Google Drive)
          </h2>
          <button
            onClick={loadTemplates}
            className="text-blue-600 hover:text-blue-800 text-xl"
            title="Rafraîchir"
          >
            &#8635;
          </button>
        </div>

        {loadingTemplates ? (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            Chargement depuis Google Drive...
          </div>
        ) : templates.length === 0 ? (
          <p className="text-gray-500">Aucun template disponible sur Google Drive</p>
        ) : (
          <div className="space-y-3 mb-4">
            {templates.map((tpl, index) => (
              <div
                key={index}
                className="p-4 bg-gray-50 rounded-lg"
              >
                <p className="font-medium" style={{ color: "#1f2244" }}>
                  {tpl.name}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="block text-sm font-medium mb-2" style={{ color: "#1f2244" }}>
            Template sélectionné pour cet événement :
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="">-- Sélectionner un template --</option>
            {templates.map((tpl, index) => (
              <option key={index} value={tpl.name}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
