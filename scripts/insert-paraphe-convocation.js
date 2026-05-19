// One-off : remplace la case vide en fin de convocation par le paraphe
// manuscrit de Noémie (sans la mention 'Lu et approuvé' qui n'a pas lieu
// d'être dans une convocation).
//
// Aspect ratio paraphe-lads.png : 500×124 = 4.03:1. Largeur cible 130 PT
// (cohérence avec la convention/contrat), hauteur = 32 PT.
//
// Usage :
//   docker exec evaremote node /tmp/insert-paraphe-convocation.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const PARAPHE_URL = "https://evaremote.com/paraphe-lads.png";

const PARAPHE_WIDTH_PT = 130;
const PARAPHE_HEIGHT_PT = 32; // 130 / 4.03

const DOC_ID = "1dR3806BnGR58SuO_p2zstNWCCRk4SA4V0lAdX1-R80s";
const TARGET_IMG_ID = "kix.7if47ab8375n";

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

async function main() {
  const tk = await token();
  const idx = await findImgIndex(tk, DOC_ID, TARGET_IMG_ID);
  if (idx === null) {
    console.log(`✗ Placeholder ${TARGET_IMG_ID} introuvable dans la convocation. Skip.`);
    return;
  }
  const requests = [
    { deleteContentRange: { range: { startIndex: idx, endIndex: idx + 1 } } },
    {
      insertInlineImage: {
        location: { index: idx },
        uri: PARAPHE_URL,
        objectSize: {
          width: { magnitude: PARAPHE_WIDTH_PT, unit: "PT" },
          height: { magnitude: PARAPHE_HEIGHT_PT, unit: "PT" },
        },
      },
    },
  ];
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${DOC_ID}:batchUpdate`,
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
  const d = await res.json();
  const newId = d.replies?.[1]?.insertInlineImage?.objectId ?? "?";
  console.log(`✓ Paraphe inséré dans la convocation à idx ${idx} (nouveau objectId : ${newId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
