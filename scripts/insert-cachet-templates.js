// One-off : remplace la case vide en bas à droite (cachet OF) par le cachet
// LADS officiel dans les templates convention + contrat.
//
// Stratégie : deleteContentRange sur l'image placeholder existante, puis
// insertInlineImage avec l'URL publique du cachet et les bonnes dimensions
// (le placeholder fait 129×30 PT, on insère à 130×48 PT pour respecter
// l'aspect ratio du cachet ~2.73:1 et garder le texte lisible).
//
// Idempotent au sens où chaque exécution remplace TOUJOURS la case dont
// l'ID est listé ci-dessous. Si tu réorganises la grille de signature dans
// les templates, mets à jour les IDs ci-dessous.
//
// Usage :
//   docker exec evaremote node /tmp/insert-cachet-templates.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const CACHET_URL = "https://evaremote.com/cachet-lads.png";

// Aspect ratio du PNG 500×183 = 2.73:1. Largeur cible 130 PT (~4.6 cm),
// hauteur = 130/2.73 = ~48 PT (~1.7 cm).
const CACHET_WIDTH_PT = 130;
const CACHET_HEIGHT_PT = 48;

const TEMPLATES = [
  {
    name: "Convention",
    id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE",
    // ID de l'image placeholder en bas à droite (case "cachet OF")
    targetImageId: "kix.3nddt5e7g38y",
  },
  {
    name: "Contrat",
    id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM",
    targetImageId: "kix.wekt4qx19fcn",
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

// Trouve l'index du caractère qui correspond à l'inlineObjectElement avec
// l'inlineObjectId donné.
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
    console.log(`[${tpl.name}] ✗ Image placeholder ${tpl.targetImageId} introuvable (réorganisation du Doc ?). Skip.`);
    return;
  }

  const requests = [
    // 1. Supprime la case vide (1 char à idx)
    { deleteContentRange: { range: { startIndex: idx, endIndex: idx + 1 } } },
    // 2. Insère le cachet au même emplacement, dimensions désirées
    {
      insertInlineImage: {
        location: { index: idx },
        uri: CACHET_URL,
        objectSize: {
          width: { magnitude: CACHET_WIDTH_PT, unit: "PT" },
          height: { magnitude: CACHET_HEIGHT_PT, unit: "PT" },
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
  console.log(`[${tpl.name}] ✓ Cachet inséré à idx ${idx} (nouveau objectId : ${newId})`);
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
