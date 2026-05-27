// One-off : corrige définitivement l'alignement du bloc signature en
// utilisant des TAB STOPS explicites plutôt que des séries de tabs.
//
// Problème : avec des tabs successifs (\t\t\t\t...), la position finale
// dépend de la longueur du texte à gauche (CONTACT_ADMIN, NOM_COMPLET,
// "Lu et approuvé..." etc.). Quand un champ varie, la colonne droite se
// décale.
//
// Solution : un seul tab stop fixe à 252pt sur chaque paragraphe du bloc
// signature. Quel que soit le texte gauche, le 1er tab amène pile à 252pt.
//
// Étapes :
//   1. Réduit tous les multi-tabs (7, 4, 2) à un seul tab dans les docs
//   2. Applique paragraphStyle.tabStops = [{ offset: 252pt }] sur tous les
//      paragraphes contenant au moins un tab (= paragraphes du bloc signature)
//
// Usage :
//   docker exec evaremote node /tmp/fix-signature-tabstops.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const DOCS = [
  { name: "Convention", id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE" },
  { name: "Contrat", id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM" },
];

const TAB_STOP_PT = 252;

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
    const t = await res.text();
    throw new Error(t);
  }
  return res.json();
}

async function reduceTabs(tk, docId) {
  // ORDRE IMPORTANT : du plus long au plus court, pour ne pas matcher
  // plusieurs fois la même séquence après réduction.
  const reductions = [
    { from: "\t".repeat(7), to: "\t" }, // 7 tabs (image paragraphs après mon fix précédent)
    { from: "\t".repeat(6), to: "\t" }, // au cas où il y aurait des 6
    { from: "\t".repeat(5), to: "\t" },
    { from: "\t".repeat(4), to: "\t" }, // 4 tabs (lignes 1 et 2 du bloc texte)
    { from: "\t".repeat(3), to: "\t" },
    { from: "\t".repeat(2), to: "\t" }, // 2 tabs (ligne 3 "Lu et approuvé...")
  ];
  // On exécute les réductions une par une, sinon le résultat dépend de
  // l'ordre de scan de l'API.
  let totalReduced = 0;
  for (const r of reductions) {
    const result = await batchUpdate(tk, docId, [
      {
        replaceAllText: {
          containsText: { text: r.from, matchCase: true },
          replaceText: r.to,
        },
      },
    ]);
    const count = result.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
    if (count > 0) {
      console.log(`    ${r.from.length} tabs → 1 tab : ${count} occurrence(s)`);
      totalReduced += count;
    }
  }
  return totalReduced;
}

async function applyTabStops(tk, doc) {
  const requests = [];
  let count = 0;
  for (const el of (doc.body && doc.body.content) || []) {
    if (!el.paragraph) continue;
    const text = (el.paragraph.elements || [])
      .map((e) => (e.textRun ? e.textRun.content : ""))
      .join("");
    if (!text.includes("\t")) continue;
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: el.startIndex, endIndex: el.endIndex },
        paragraphStyle: {
          tabStops: [{ offset: { magnitude: TAB_STOP_PT, unit: "PT" } }],
        },
        fields: "tabStops",
      },
    });
    count++;
  }
  if (requests.length === 0) return 0;
  await batchUpdate(tk, doc.id, requests);
  return count;
}

async function patchDoc(tk, doc) {
  console.log(`\n[${doc.name}] (${doc.id})`);
  console.log("  Réduction des multi-tabs à 1 tab unique :");
  await reduceTabs(tk, doc.id);

  console.log("  Application du tab stop à " + TAB_STOP_PT + "pt :");
  const fresh = await getDoc(tk, doc.id);
  const applied = await applyTabStops(tk, fresh);
  console.log(`    ${applied} paragraphe(s) avec tab stop appliqué`);
}

async function main() {
  const tk = await token();
  for (const doc of DOCS) {
    try {
      await patchDoc(tk, doc);
    } catch (e) {
      console.error(`[${doc.name}] ✗ Erreur:`, e.message);
    }
  }
  console.log("\n✓ Bloc signature aligné à " + TAB_STOP_PT + "pt quelle que soit la longueur du champ gauche.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
