// One-off : remplace la case vide en haut à droite (signature OF) par
// l'image "Lu et approuvé + paraphe" manuscrit dans les templates
// convention + contrat.
//
// Aspect ratio de signature-lads.png : 600×205 = 2.93:1. Largeur cible
// 130 PT (cohérence visuelle avec le cachet), hauteur = 44 PT.
//
// Usage :
//   docker exec evaremote node /tmp/insert-signature-templates.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const SIGNATURE_URL = "https://evaremote.com/signature-lads.png";

const SIG_WIDTH_PT = 130;
const SIG_HEIGHT_PT = 44; // 130 / 2.93

const TEMPLATES = [
  {
    name: "Convention",
    id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE",
    targetImageId: "kix.9hsxs47lc7gf", // ligne 1 colonne 2 (signature OF)
  },
  {
    name: "Contrat",
    id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM",
    targetImageId: "kix.mv109wg0bymb",
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

async function findImgIndex(tk, docId, targetImgId) {
  const r = await fetch("https://docs.googleapis.com/v1/documents/" + docId, {
    headers: { Authorization: "Bearer " + tk },
  });
  if (!r.ok) throw new Error("GET doc failed: " + (await r.text()));
  const d = await r.json();
  for (const el of (d.body && d.body.content) || []) {
    if (!el.paragraph) continue;
    for (const e of el.paragraph.elements || []) {
      if (
        e.inlineObjectElement &&
        e.inlineObjectElement.inlineObjectId === targetImgId
      ) {
        return e.startIndex;
      }
    }
  }
  return null;
}

async function patchTemplate(tk, tpl) {
  const idx = await findImgIndex(tk, tpl.id, tpl.targetImageId);
  if (idx === null) {
    console.log(`[${tpl.name}] ✗ Placeholder ${tpl.targetImageId} introuvable. Skip.`);
    return;
  }
  const requests = [
    { deleteContentRange: { range: { startIndex: idx, endIndex: idx + 1 } } },
    {
      insertInlineImage: {
        location: { index: idx },
        uri: SIGNATURE_URL,
        objectSize: {
          width: { magnitude: SIG_WIDTH_PT, unit: "PT" },
          height: { magnitude: SIG_HEIGHT_PT, unit: "PT" },
        },
      },
    },
  ];
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${tpl.id}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${tpl.name} : ${t}`);
  }
  const d = await res.json();
  const newId = d.replies?.[1]?.insertInlineImage?.objectId ?? "?";
  console.log(`[${tpl.name}] ✓ Signature insérée à idx ${idx} (nouveau objectId : ${newId})`);
}

async function main() {
  const tk = await token();
  for (const tpl of TEMPLATES) {
    try {
      await patchTemplate(tk, tpl);
    } catch (e) {
      console.error(`[${tpl.name}] ✗ Erreur:`, e.message);
    }
  }
  console.log("\nTerminé. Ouvre les Docs pour vérifier le rendu.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
