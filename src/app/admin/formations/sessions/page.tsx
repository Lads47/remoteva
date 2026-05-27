"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Session {
  id: string;
  formationId: string;
  formationCode: string;
  formationNomLong: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  capacite: number;
  lieu: string;
  horaires: string;
  status: string;
  driveFolderId: string | null;
  trainerId: string | null;
  trainerNomComplet: string | null;
  trainerIsExternal: boolean;
  trainerFeeAmount: number | null;
  trainerContractDriveFileId: string | null;
  trainerContractSentAt: string | null;
  notes: string;
  traineeCount: number;
}

interface Formation {
  id: string;
  code: string;
  nomLong: string;
  active: boolean;
  dureeJours: number;
}

interface TrainerOption {
  id: string;
  prenom: string;
  nom: string;
  active: boolean;
  isExternal: boolean;
}

function addDays(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function openDatePicker(e: React.MouseEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  input.showPicker?.();
}

const SESSION_STATUSES = [
  { value: "planned", label: "Planifiée" },
  { value: "open", label: "Ouverte aux inscriptions" },
  { value: "full", label: "Complète" },
  { value: "closed", label: "Clôturée" },
  { value: "cancelled", label: "Annulée" },
];

function statusBadge(status: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    planned: { bg: "#e0e7ff", fg: "#3730a3" },
    open: { bg: "#dcfce7", fg: "#166534" },
    full: { bg: "#fef3c7", fg: "#92400e" },
    closed: { bg: "#e5e7eb", fg: "#374151" },
    cancelled: { bg: "#fee2e2", fg: "#991b1b" },
  };
  const c = colors[status] ?? colors.planned;
  const label = SESSION_STATUSES.find((s) => s.value === status)?.label ?? status;
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateInput(s: string) {
  return s.slice(0, 10);
}

type FormState = {
  formationId: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  capacite: string;
  lieu: string;
  horaires: string;
  status: string;
  trainerId: string;
  trainerFeeAmount: string;  // saisie texte, parsée en number à l'envoi
  notes: string;
};

const DEFAULT_LIEU = "39 bis rue Robert Creuzet, 47200 MARMANDE";
const DEFAULT_HORAIRES = "9h00 - 17h00";

function emptyForm(formationId = ""): FormState {
  return {
    formationId,
    code: "",
    dateDebut: "",
    dateFin: "",
    capacite: "8",
    lieu: DEFAULT_LIEU,
    horaires: DEFAULT_HORAIRES,
    status: "planned",
    trainerId: "",
    trainerFeeAmount: "",
    notes: "",
  };
}

function SessionsPageInner() {
  const searchParams = useSearchParams();
  const filterFormationId = searchParams.get("formationId") ?? "";

  const [sessions, setSessions] = useState<Session[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(filterFormationId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    Promise.all([fetchSessions(filterFormationId), fetchFormations(), fetchTrainers()]).finally(() =>
      setLoading(false)
    );
  }, [filterFormationId]);

  async function fetchSessions(formationId?: string) {
    try {
      const url = formationId
        ? `/api/admin/sessions?formationId=${formationId}`
        : "/api/admin/sessions";
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data.sessions)) setSessions(data.sessions);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchFormations() {
    try {
      const res = await fetch("/api/admin/formations");
      const data = await res.json();
      if (Array.isArray(data.formations)) setFormations(data.formations);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchTrainers() {
    try {
      const res = await fetch("/api/admin/trainers");
      const data = await res.json();
      if (Array.isArray(data.trainers)) setTrainers(data.trainers);
    } catch (err) {
      console.error(err);
    }
  }

  function toFormState(s: Session): FormState {
    return {
      formationId: s.formationId,
      code: s.code,
      dateDebut: fmtDateInput(s.dateDebut),
      dateFin: fmtDateInput(s.dateFin),
      capacite: s.capacite.toString(),
      lieu: s.lieu,
      horaires: s.horaires,
      status: s.status,
      trainerId: s.trainerId ?? "",
      trainerFeeAmount: s.trainerFeeAmount != null ? String(s.trainerFeeAmount) : "",
      notes: s.notes,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Si formateur externe sélectionné, on parse le montant HT pour déclencher
      // la génération du contrat de sous-traitance (Qualiopi ind. 27).
      const selectedTrainer = trainers.find((t) => t.id === form.trainerId);
      const feeRaw = form.trainerFeeAmount.replace(",", ".").trim();
      const feeNumber = feeRaw === "" ? null : parseFloat(feeRaw);
      const trainerFeeAmount =
        selectedTrainer?.isExternal && feeNumber != null && !Number.isNaN(feeNumber) && feeNumber > 0
          ? feeNumber
          : null;

      const payload = {
        formationId: form.formationId,
        code: form.code.trim(),
        dateDebut: new Date(form.dateDebut + "T00:00:00").toISOString(),
        dateFin: new Date(form.dateFin + "T23:59:59").toISOString(),
        capacite: parseInt(form.capacite, 10) || 8,
        lieu: form.lieu.trim(),
        horaires: form.horaires.trim(),
        status: form.status,
        trainerId: form.trainerId === "" ? null : form.trainerId,
        trainerFeeAmount,
        notes: form.notes.trim(),
      };
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? {
            id: editingId,
            code: payload.code,
            dateDebut: payload.dateDebut,
            dateFin: payload.dateFin,
            capacite: payload.capacite,
            lieu: payload.lieu,
            horaires: payload.horaires,
            status: payload.status,
            trainerId: payload.trainerId,
            trainerFeeAmount: payload.trainerFeeAmount,
            notes: payload.notes,
          }
        : payload;
      const res = await fetch("/api/admin/sessions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      // Si le serveur a notifié le formateur d'une assignation, on l'indique
      // dans le toast pour rassurer l'admin (sinon le mail part en silence).
      const notif = data.trainerNotified as {
        emailSent?: boolean;
        error?: string;
        contractGenerated?: boolean;
        contractSkipReason?: string;
      } | null | undefined;
      let trainerNote = "";
      if (notif) {
        if (notif.emailSent) {
          trainerNote = " · Formateur prévenu par mail ✓";
          if (notif.contractGenerated) trainerNote += " (contrat de sous-traitance joint 📎)";
          else if (notif.contractSkipReason) trainerNote += ` (contrat non généré : ${notif.contractSkipReason})`;
        } else if (notif.error) {
          trainerNote = ` · Mail formateur en erreur (${String(notif.error).slice(0, 60)})`;
        }
      }
      setFeedback({
        type: "success",
        msg: (editingId ? "Session mise à jour" : "Session créée") + trainerNote,
      });
      setForm(emptyForm(filterFormationId));
      setEditingId(null);
      setShowForm(false);
      await fetchSessions(filterFormationId);
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      console.error(err);
      setError("Erreur connexion");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(s: Session) {
    setEditingId(s.id);
    setForm(toFormState(s));
    setShowForm(true);
    setError("");
  }

  async function handleRegenerateTrainerContract(s: Session) {
    // Si la session n'a pas encore de montant HT saisi, on prompt à la volée.
    let amount = s.trainerFeeAmount;
    if (amount == null || amount <= 0) {
      const input = prompt(
        `Montant HT du contrat de sous-traitance pour ${s.trainerNomComplet || "ce formateur"} (€) ?`,
        ""
      );
      if (!input) return;
      const parsed = parseFloat(input.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFeedback({ type: "error", msg: "Montant invalide" });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
      amount = parsed;
    }
    if (!confirm(`Générer + envoyer le contrat de sous-traitance (${amount} € HT) à ${s.trainerNomComplet} ?`)) return;
    try {
      const res = await fetch(`/api/admin/sessions/${s.id}/regenerate-trainer-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerFeeAmount: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      let msg = "Contrat ST ";
      if (data.contractGenerated) msg += "généré + mail envoyé ✓";
      else if (data.contractSkipReason) msg += `non généré : ${data.contractSkipReason}`;
      else if (data.emailSent) msg += "mail envoyé (sans PJ)";
      else msg += `erreur : ${data.error || "?"}`;
      setFeedback({ type: data.contractGenerated || data.emailSent ? "success" : "error", msg });
      await fetchSessions(filterFormationId);
      setTimeout(() => setFeedback(null), 6000);
    } catch (err) {
      console.error(err);
      setFeedback({ type: "error", msg: "Erreur de connexion" });
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  async function handleDelete(id: string, traineeCount: number) {
    const msg = traineeCount > 0
      ? `Supprimer cette session ? ${traineeCount} stagiaire(s) liés seront aussi supprimés.`
      : "Supprimer cette session ?";
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/admin/sessions?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur suppression" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      setFeedback({ type: "success", msg: "Session supprimée" });
      await fetchSessions(filterFormationId);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }

  function handleCancel() {
    setForm(emptyForm(filterFormationId));
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  const filterFormation = filterFormationId
    ? formations.find((f) => f.id === filterFormationId)
    : null;

  // Suggestion live du code session (sans gérer la collision côté client — le serveur le fait)
  const selectedFormation = formations.find((f) => f.id === form.formationId);
  const suggestedCode = selectedFormation && form.dateDebut
    ? `${selectedFormation.code}-${form.dateDebut.slice(0, 7)}`
    : "";

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }

  return (
    <div>
      <Link href="/admin/formations" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
        ← Tableau de bord
      </Link>
      <div className="flex justify-between items-start mt-2 mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
            {filterFormation
              ? <>Sessions <span style={{ color: "#727485", fontWeight: 400 }}>· {filterFormation.nomLong}</span></>
              : "Sessions de formation"}
          </h1>
          {!filterFormation && (
            <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
              Toutes les sessions, toutes formations confondues
            </p>
          )}
          {filterFormationId && (
            <Link
              href="/admin/formations/sessions"
              className="text-xs mt-1 inline-block underline font-jetbrains"
              style={{ color: "#727485" }}
            >
              ← Voir toutes les sessions
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          {!showForm && formations.length > 0 && (
            <button
              onClick={() => {
                setForm(emptyForm(filterFormationId || formations[0]?.id || ""));
                setShowForm(true);
              }}
              className="px-4 py-2 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: "#1f2244" }}
            >
              + Nouvelle session
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${
            feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {formations.length === 0 && (
        <div className="mb-6 p-4 rounded-lg bg-yellow-50 text-yellow-800 text-sm font-jetbrains">
          Aucune formation dans le catalogue.{" "}
          <Link href="/admin/formations/catalogue" className="underline">
            Crée une formation
          </Link>{" "}
          avant d&apos;ajouter une session.
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 p-6 rounded-lg border space-y-4"
          style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
        >
          <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
            {editingId ? "Modifier la session" : "Nouvelle session"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Formation" required>
              <select
                value={form.formationId}
                onChange={(e) => {
                  const formationId = e.target.value;
                  const f = formations.find((x) => x.id === formationId);
                  setForm((prev) => {
                    if (!f || !prev.dateDebut || editingId) return { ...prev, formationId };
                    return { ...prev, formationId, dateFin: addDays(prev.dateDebut, f.dureeJours - 1) };
                  });
                }}
                disabled={!!editingId}
                className="input"
                required
              >
                <option value="">— Sélectionner —</option>
                {formations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.nomLong}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Code session">
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder={suggestedCode || "auto-généré"}
                className="input"
              />
              {!editingId && !form.code && suggestedCode && (
                <p className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>
                  Sera généré : <code>{suggestedCode}</code>
                  {" (suffixe -2, -3... si déjà pris)"}
                </p>
              )}
            </Field>
            <Field label="Date début" required>
              <input
                type="date"
                value={form.dateDebut}
                onChange={(e) => {
                  const dateDebut = e.target.value;
                  setForm((prev) => {
                    const f = formations.find((x) => x.id === prev.formationId);
                    if (!f || !dateDebut || editingId) return { ...prev, dateDebut };
                    return { ...prev, dateDebut, dateFin: addDays(dateDebut, f.dureeJours - 1) };
                  });
                }}
                onClick={openDatePicker}
                onFocus={openDatePicker}
                className="input"
                required
              />
            </Field>
            <Field label="Date fin" required>
              <input
                type="date"
                value={form.dateFin}
                onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                onClick={openDatePicker}
                onFocus={openDatePicker}
                className="input"
                required
              />
            </Field>
            <Field label="Capacité (places)">
              <input
                type="number"
                min="1"
                value={form.capacite}
                onChange={(e) => setForm({ ...form, capacite: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Statut">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input"
              >
                {SESSION_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Formateur" full>
              <select
                value={form.trainerId}
                onChange={(e) => setForm({ ...form, trainerId: e.target.value })}
                className="input"
              >
                <option value="">— Aucun formateur assigné —</option>
                {trainers
                  .filter((t) => t.active || t.id === form.trainerId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prenom} {t.nom}
                      {t.isExternal ? " — externe" : ""}
                      {!t.active ? " (désactivé)" : ""}
                    </option>
                  ))}
              </select>
            </Field>

            {/* === Qualiopi ind. 27 — Montant HT si formateur externe ===
                Quand un formateur externe est sélectionné, on demande le
                montant HT du contrat. Si rempli + envoi, on génère et joint
                automatiquement le contrat de sous-traitance au mail
                d'assignation. */}
            {(() => {
              const selected = trainers.find((t) => t.id === form.trainerId);
              if (!selected?.isExternal) return null;
              return (
                <Field label="Montant HT du contrat de sous-traitance (€)" full>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.trainerFeeAmount}
                    onChange={(e) => setForm({ ...form, trainerFeeAmount: e.target.value })}
                    placeholder="ex : 1250.00"
                    className="input"
                  />
                  <p className="text-xs mt-1.5 font-jetbrains" style={{ color: "#92400e" }}>
                    📎 Formateur externe : un contrat de sous-traitance sera généré et joint
                    au mail d&apos;assignation (Qualiopi ind. 27). Laisser vide pour envoyer
                    juste le mail sans contrat.
                  </p>
                </Field>
              );
            })()}
            <Field label="Lieu" full>
              <input
                type="text"
                value={form.lieu}
                onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                placeholder="39 bis rue Robert Creuzet, 47200 MARMANDE"
                className="input"
              />
            </Field>
            <Field label="Horaires" full>
              <input
                type="text"
                value={form.horaires}
                onChange={(e) => setForm({ ...form, horaires: e.target.value })}
                placeholder="9h00 - 17h30"
                className="input"
              />
            </Field>
            <Field label="Notes internes" full>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="input"
              />
            </Field>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1f2244" }}
            >
              {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-full text-sm font-medium border"
              style={{ borderColor: "#d1d5db", color: "#374151" }}
            >
              Annuler
            </button>
          </div>

          <style jsx>{`
            .input {
              width: 100%;
              padding: 0.5rem 0.75rem;
              border: 1px solid #d1d5db;
              border-radius: 0.5rem;
              font-size: 0.875rem;
              background-color: white;
            }
            .input:focus {
              outline: 2px solid #7dcef5;
              outline-offset: 1px;
            }
            .input:disabled {
              background-color: #f3f4f6;
              color: #9ca3af;
            }
          `}</style>
        </form>
      )}

      {showForm ? null : sessions.length === 0 ? (
        <div
          className="text-center py-12 border rounded-lg font-jetbrains text-sm"
          style={{ borderColor: "#e5e7eb", color: "#727485" }}
        >
          {filterFormationId
            ? "Aucune session pour cette formation."
            : "Aucune session. Crée la première via « + Nouvelle session »."}
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-lg border flex items-center justify-between"
              style={{ borderColor: "#e5e7eb" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-jetbrains"
                    style={{ backgroundColor: "#1f2244", color: "white" }}
                  >
                    {s.code}
                  </span>
                  {statusBadge(s.status)}
                  <span className="text-sm font-jetbrains" style={{ color: "#727485" }}>
                    {s.formationCode}
                  </span>
                </div>
                <h3 className="font-semibold mt-1" style={{ color: "#1f2244" }}>
                  {fmtDate(s.dateDebut)} → {fmtDate(s.dateFin)}
                </h3>
                <div className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
                  {s.lieu || "Lieu non précisé"}
                  {s.horaires && ` · ${s.horaires}`}
                  {" · "}
                  {s.traineeCount}/{s.capacite} stagiaire{s.traineeCount > 1 ? "s" : ""}
                  {" · "}
                  {s.trainerNomComplet ? (
                    <span style={{ color: "#1f2244" }}>Formateur : {s.trainerNomComplet}</span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>Pas de formateur</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Link
                  href={`/admin/formations/sessions/${s.id}`}
                  className="text-xs px-3 py-1.5 rounded-full border"
                  style={{ borderColor: "#1f2244", color: "#1f2244" }}
                >
                  Détails
                </Link>
                {s.trainerIsExternal && (
                  <button
                    onClick={() => handleRegenerateTrainerContract(s)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                    title="(Re)générer + envoyer le contrat de sous-traitance au formateur externe"
                  >
                    📎 Contrat ST
                  </button>
                )}
                <button
                  onClick={() => handleEdit(s)}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.traineeCount)}
                  className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
      <SessionsPageInner />
    </Suspense>
  );
}
