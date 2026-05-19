// One-off : refactore le bloc signature des templates convention + contrat
// en une vraie TABLE 2 colonnes × 5 lignes. Solution définitive au problème
// de tabs (qui dépendent de la longueur du texte à gauche).
//
// Structure cible :
//   ┌────────────────────────────┬──────────────────────────────────────┐
//   │ Pour le bénéficiaire,      │ Pour Les Ateliers du Stream...       │
//   │ {{CONTACT_ADMIN}}          │ Noémie Marphay                       │
//   │ Lu et approuvé...          │ Lu et approuvé...                    │
//   │                            │ [signature image LADS]               │
//   │                            │ [cachet image LADS]                  │
//   └────────────────────────────┴──────────────────────────────────────┘
//
// La table est insérée à la place du bloc signature actuel (lignes après
// "En double exemplaire..." jusqu'à la fin du doc). Les images existantes
// (signature + cachet LADS) sont ré-insérées via leurs URLs publiques.
//
// Usage :
//   docker exec evaremote node /tmp/refactor-signature-table.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const SIGNATURE_URL = "https://evaremote.com/signature-lads.png";
const CACHET_URL = "https://evaremote.com/cachet-lads.png";
const SIG_W_PT = 130, SIG_H_PT = 44;
const CACHET_W_PT = 130, CACHET_H_PT = 48;

const TEMPLATES = [
  {
    name: "Convention",
    id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE",
    // Texte du 1er paragraphe du bloc signature, pour le détecter
    anchorStart: "Pour le bénéficiaire,",
    leftRows: [
      "Pour le bénéficiaire,",
      "{{CONTACT_ADMIN}}",
      "Lu et approuvé avec signature et cachet",
      "",
      "",
    ],
    rightRows: [
      "Pour Les Ateliers du Stream — Web Video Production",
      "Noémie Marphay",
      "Lu et approuvé avec signature et cachet",
      { image: "signature" },
      { image: "cachet" },
    ],
  },
  {
    name: "Contrat",
    id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM",
    anchorStart: "Pour le stagiaire,",
    leftRows: [
      "Pour le stagiaire,",
      "{{NOM_COMPLET}}",
      "Lu et approuvé avec signature",
      "",
      "",
    ],
    rightRows: [
      "Pour Les Ateliers du Stream — Web Video Production",
      "Noémie Marphay, responsable pédagogique",
      "Lu et approuvé avec signature et cachet",
      { image: "signature" },
      { image: "cachet" },
    ],
  },
];

const key = JSON.parse(
  Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64, "base64").toString("utf8")
);
const b64url = (b) =>
  (typeof b === "string" ? Buffer.from(b) : b)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const u =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64url(
      JSON.stringify({
        iss: key.client_email,
        scope: SCOPES,
        aud: OAUTH,
        iat: now,
        exp: now + 3600,
      })
    );
  const s = createSign("RSA-SHA256");
  s.update(u);
  s.end();
  const r = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: u + "." + b64url(s.sign(key.private_key)),
    }).toString(),
  });
  return (await r.json()).access_token;
}

async function getDoc(tk, id) {
  const r = await fetch("https://docs.googleapis.com/v1/documents/" + id, {
    headers: { Authorization: "Bearer " + tk },
  });
  if (!r.ok) throw new Error("GET doc failed: " + (await r.text()));
  return r.json();
}

async function batchUpdate(tk, docId, requests) {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

// Trouve [startIndex, endIndex) du bloc signature : du paragraphe contenant
// anchorStart jusqu'au DERNIER paragraphe du body. endIndex exclut le
// caractère final du body (Docs n'autorise pas la suppression du \n final).
function findSignatureBlockRange(doc, anchorStart) {
  const content = doc.body.content;
  let start = null;
  let lastEnd = null;
  for (let i = 0; i < content.length; i++) {
    const el = content[i];
    if (!el.paragraph) continue;
    const text = (el.paragraph.elements || []).map((e) => e.textRun?.content || "").join("");
    if (start === null && text.startsWith(anchorStart)) {
      start = el.startIndex;
    }
    if (el.paragraph) lastEnd = el.endIndex;
  }
  if (start === null) return null;
  // -1 pour préserver le \n final du body (qui doit rester)
  return { startIndex: start, endIndex: lastEnd - 1 };
}

// Localise dans le doc fraîchement re-fetched les TABLES + leurs cellules,
// retourne la 1re table avec ses cell startIndex par (row, col).
function findFirstTableCells(doc) {
  const content = doc.body.content;
  for (const el of content) {
    if (!el.table) continue;
    const cells = [];
    for (const row of el.table.tableRows || []) {
      const rowCells = [];
      for (const cell of row.tableCells || []) {
        // startIndex de la première paragraph dans cette cellule = où on insère
        const firstPara = (cell.content || []).find((c) => c.paragraph);
        if (firstPara) rowCells.push(firstPara.startIndex);
      }
      cells.push(rowCells);
    }
    return cells;
  }
  return null;
}

async function refactor(tk, tpl) {
  console.log(`\n[${tpl.name}] (${tpl.id})`);

  // 1. Trouve le range à supprimer
  const doc = await getDoc(tk, tpl.id);
  const range = findSignatureBlockRange(doc, tpl.anchorStart);
  if (!range) {
    console.log(`  ✗ Bloc signature introuvable (anchor "${tpl.anchorStart}")`);
    return;
  }
  console.log(`  Bloc signature : [${range.startIndex}, ${range.endIndex})`);

  // 2. Supprime le bloc
  await batchUpdate(tk, tpl.id, [
    { deleteContentRange: { range } },
  ]);
  console.log("  ✓ Ancien bloc supprimé");

  // 3. Insère la table à la même position
  await batchUpdate(tk, tpl.id, [
    {
      insertTable: {
        location: { index: range.startIndex },
        rows: 5,
        columns: 2,
      },
    },
  ]);
  console.log("  ✓ Table 5×2 insérée");

  // 4. Re-fetch + repère les cellules
  let fresh = await getDoc(tk, tpl.id);
  const cells = findFirstTableCells(fresh);
  if (!cells || cells.length !== 5) {
    console.log(`  ✗ Cellules introuvables (trouvé ${cells?.length ?? 0} lignes)`);
    return;
  }
  console.log(`  Cellules : ${cells.length} lignes × ${cells[0].length} colonnes`);

  // 5. Remplit les cellules. On insère du BAS vers le HAUT, et de DROITE vers
  //    GAUCHE, pour que les insertions ne décalent pas les autres index.
  const insertions = [];
  for (let r = 4; r >= 0; r--) {
    const left = tpl.leftRows[r];
    const right = tpl.rightRows[r];
    const leftIdx = cells[r][0];
    const rightIdx = cells[r][1];

    // Cellule droite d'abord (index plus grand → ne décale pas la gauche)
    if (typeof right === "string") {
      if (right) insertions.push({ insertText: { location: { index: rightIdx }, text: right } });
    } else if (right.image === "signature") {
      insertions.push({
        insertInlineImage: {
          location: { index: rightIdx },
          uri: SIGNATURE_URL,
          objectSize: { width: { magnitude: SIG_W_PT, unit: "PT" }, height: { magnitude: SIG_H_PT, unit: "PT" } },
        },
      });
    } else if (right.image === "cachet") {
      insertions.push({
        insertInlineImage: {
          location: { index: rightIdx },
          uri: CACHET_URL,
          objectSize: { width: { magnitude: CACHET_W_PT, unit: "PT" }, height: { magnitude: CACHET_H_PT, unit: "PT" } },
        },
      });
    }

    // Cellule gauche
    if (typeof left === "string" && left) {
      insertions.push({ insertText: { location: { index: leftIdx }, text: left } });
    }
  }

  // Trie par location.index DECROISSANT pour ne pas avoir de problèmes d'index
  insertions.sort((a, b) => {
    const aIdx = a.insertText?.location.index ?? a.insertInlineImage?.location.index;
    const bIdx = b.insertText?.location.index ?? b.insertInlineImage?.location.index;
    return bIdx - aIdx;
  });

  await batchUpdate(tk, tpl.id, insertions);
  console.log(`  ✓ ${insertions.length} cellules remplies`);
}

async function main() {
  const tk = await token();
  for (const tpl of TEMPLATES) {
    try {
      await refactor(tk, tpl);
    } catch (e) {
      console.error(`[${tpl.name}] ✗ Erreur:`, e.message);
    }
  }
  console.log("\n✓ Refactor terminé. Vérifie le rendu dans les Docs.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
