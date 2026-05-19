// One-off : supprime les 2 cases vides côté stagiaire (placeholder signature
// + placeholder cachet) dans les templates convention + contrat. Le côté
// stagiaire devient ainsi vierge : il signera/cachetera manuellement à
// l'impression, dans un espace libre.
//
// Approche : pour chaque image cible, on récupère l'index frais via
// findImgIndex(), puis on delete via deleteContentRange. Une suppression à
// la fois (et donc 1 batchUpdate par image) pour éviter tout décalage d'index.
//
// Usage :
//   docker exec evaremote node /tmp/delete-empty-signature-boxes.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

// IDs des cases vides côté stagiaire (top-left = signature, bottom-left = cachet)
const TARGETS = [
  { name: "Convention/signature stagiaire", docId: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE", imgId: "kix.ba7y8ja8a75l" },
  { name: "Convention/cachet stagiaire",    docId: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE", imgId: "kix.8274aejkqzic" },
  { name: "Contrat/signature stagiaire",     docId: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM", imgId: "kix.ec0lh2fmpy17" },
  { name: "Contrat/cachet stagiaire",        docId: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM", imgId: "kix.datblb9flvtg" },
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

async function deleteImg(tk, target) {
  const idx = await findImgIndex(tk, target.docId, target.imgId);
  if (idx === null) {
    console.log(`[${target.name}] ✗ Image ${target.imgId} introuvable. Déjà supprimée ? Skip.`);
    return;
  }
  const requests = [
    { deleteContentRange: { range: { startIndex: idx, endIndex: idx + 1 } } },
  ];
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${target.docId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${target.name} : ${t}`);
  }
  console.log(`[${target.name}] ✓ Supprimée (était à idx ${idx})`);
}

async function main() {
  const tk = await token();
  for (const target of TARGETS) {
    try {
      await deleteImg(tk, target);
    } catch (e) {
      console.error(`[${target.name}] ✗ Erreur:`, e.message);
    }
  }
  console.log("\n✓ Cases vides supprimées. Le bloc signature stagiaire reste vide pour signature manuelle.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
