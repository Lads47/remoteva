// Client minimal Google Sheets API v4 — auth via Service Account (réutilise
// getAccessToken de google-drive.ts). Pas de SDK npm, juste REST.
//
// Permet :
//   - createSpreadsheet : crée un fichier .gsheet dans un dossier Drive
//   - getSpreadsheet : lit la liste des onglets (sheets) existants
//   - addSheet : ajoute un onglet à un spreadsheet existant
//   - updateValues : écrit un tableau 2D dans un range donné (A1 notation)
//   - clearValues : vide un range avant ré-écriture (idempotence cron)
//
// Doc REST officielle : https://developers.google.com/sheets/api/reference/rest

import { getAccessToken } from "./google-drive";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

export interface Spreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets: SheetTab[];
}

/**
 * Crée un Google Sheet vide via l'API Drive (en posant simplement le mimeType
 * `application/vnd.google-apps.spreadsheet`). Plus simple que l'API Sheets
 * pour la création, et permet de cibler un dossier parent.
 */
export async function createSpreadsheetInFolder(input: {
  parentFolderId: string;
  name: string;
}): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_API}/files?supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [input.parentFolderId],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Drive create spreadsheet failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string; webViewLink?: string };
  return {
    spreadsheetId: data.id,
    spreadsheetUrl: data.webViewLink || `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
  };
}

/**
 * Récupère le spreadsheet et la liste de ses onglets.
 */
export async function getSpreadsheet(spreadsheetId: string): Promise<Spreadsheet> {
  const token = await getAccessToken();
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title,index))");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Sheets get failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets: { properties: { sheetId: number; title: string; index: number } }[];
  };
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    sheets: data.sheets.map((s) => s.properties),
  };
}

/**
 * Ajoute un onglet portant `title` au spreadsheet, et renvoie sa sheetId interne.
 * Si un onglet du même titre existe déjà, le renvoie sans rien créer.
 */
export async function addSheet(spreadsheetId: string, title: string): Promise<SheetTab> {
  const existing = await getSpreadsheet(spreadsheetId);
  const found = existing.sheets.find((s) => s.title === title);
  if (found) return found;

  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Sheets addSheet failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    replies: { addSheet: { properties: { sheetId: number; title: string; index: number } } }[];
  };
  return data.replies[0].addSheet.properties;
}

/**
 * Vide un range (efface les valeurs sans supprimer la mise en forme).
 * Utilisé avant ré-écriture pour éviter les artefacts si la nouvelle vue
 * est plus courte que l'ancienne.
 */
export async function clearValues(spreadsheetId: string, range: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Sheets clear failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
}

/**
 * Écrit un tableau 2D dans un range (A1 notation). values[i][j] = ligne i, col j.
 * Les valeurs sont écrites en mode "USER_ENTERED" → Google interprète les
 * nombres et formats comme si l'utilisateur tapait au clavier (utile pour
 * "85 %" qui devient un pourcentage natif).
 */
export async function updateValues(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const token = await getAccessToken();
  const url = new URL(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range, values }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Sheets update failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
}

/**
 * Met en forme les premières lignes/colonnes d'un onglet (en-tête en gras,
 * largeur de colonne A, …). Best-effort, idempotent.
 */
export async function applyHeaderFormatting(
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        // En-tête colonne A en gras
        {
          repeatCell: {
            range: { sheetId, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        // Largeur colonne A
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 320 },
            fields: "pixelSize",
          },
        },
        // Largeur colonne B
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 140 },
            fields: "pixelSize",
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    // Pas critique : on log et on continue.
    const t = await res.text().catch(() => "");
    console.warn(`[google-sheets] applyHeaderFormatting failed (HTTP ${res.status}): ${t.slice(0, 200)}`);
  }
}
