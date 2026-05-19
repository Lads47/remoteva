// Client minimal Google Docs API — auth partagée avec google-drive.ts via le
// même Service Account (le SA doit avoir le scope `documents` activé : voir
// la constante SCOPES dans google-drive.ts).
//
// Sert principalement à substituer des variables `{{NOM_VARIABLE}}` dans une
// copie de template Doc (utilisé pour générer convention/contrat/convocation
// par stagiaire).

import { getAccessToken } from "./google-drive";

const DOCS_API = "https://docs.googleapis.com/v1";

/**
 * Effectue une substitution de variables en une seule requête batchUpdate.
 * Le `replacements` est un Record où les clés sont les noms de variables
 * SANS les accolades, et les valeurs sont le texte à insérer.
 *
 * Exemple :
 *   replaceTextInDoc(docId, { NOM: "Dupont", PRENOM: "Marie" })
 *   → remplace toutes les occurrences de "{{NOM}}" par "Dupont"
 *     et "{{PRENOM}}" par "Marie" dans le document.
 *
 * Si une variable n'apparaît pas dans le doc, c'est silencieux (pas d'erreur).
 * Le matching est sensible à la casse pour éviter les faux positifs.
 */
export async function replaceTextInDoc(
  documentId: string,
  replacements: Record<string, string>
): Promise<void> {
  const requests = Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: {
        text: `{{${key}}}`,
        matchCase: true,
      },
      replaceText: value ?? "",
    },
  }));

  if (requests.length === 0) return;

  const token = await getAccessToken();
  const res = await fetch(
    `${DOCS_API}/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Docs batchUpdate failed (HTTP ${res.status}): ${t.slice(0, 500)}`);
  }
}
