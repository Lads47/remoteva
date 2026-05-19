// One-off : aligne les paragraphes d'images (signature + cachet) sur la
// colonne droite du bloc signature (sous "Pour Les Ateliers du Stream").
//
// Cause du décalage : après suppression des cases vides à gauche, les
// paragraphes images n'ont plus que 4 tabs depuis la marge gauche → images
// à ~144pt. Mais la ligne d'en-tête "Pour le bénéficiaire,\t\t\t\tPour Les
// Ateliers..." a ses 4 tabs APRÈS un texte de ~120pt, donc "Pour Les
// Ateliers..." se pose à ~252pt. D'où ~108pt d'écart à gauche pour les
// images.
//
// Fix : ajoute 3 tabs supplémentaires au début de chaque paragraphe qui
// contient uniquement (tabs + 1 image + newline). Cible ainsi spécifiquement
// les paragraphes images de la zone signature, sans toucher au logo
// d'en-tête (qui a d'autre contenu).
//
// Idempotent : si la modification est déjà appliquée (7+ tabs), no-op.
//
// Usage :
//   docker exec evaremote node /tmp/fix-signature-indent.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const DOCS = [
  { name: "Convention", id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE" },
  { name: "Contrat", id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM" },
];

// Nombre total de tabs cible avant l'image (4 historiquement, mais avec la
// suppression des cases vides il faut 7 pour atteindre la même position
// horizontale que "Pour Les Ateliers du Stream" qui est à ~252pt après
// "Pour le bénéficiaire," + 4 tabs).
const TARGET_TABS = 7;

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

// Renvoie la liste des paragraphes qui ne contiennent que (tabs + image +
// éventuel newline). Pour chacun : { startIndex, currentTabs }.
function findImageOnlyParagraphs(doc) {
  const out = [];
  for (const el of (doc.body && doc.body.content) || []) {
    if (!el.paragraph) continue;
    const elements = el.paragraph.elements || [];
    const hasImage = elements.some((e) => e.inlineObjectElement);
    if (!hasImage) continue;
    const textContent = elements
      .map((e) => (e.textRun ? e.textRun.content : ""))
      .join("");
    // On ne garde que les paragraphes dont tout le texte (hors image) est
    // tabs/espaces/newline (typiquement notre bloc signature).
    if (!/^[\t \n]*$/.test(textContent)) continue;
    const currentTabs = (textContent.match(/\t/g) || []).length;
    out.push({ startIndex: el.startIndex, currentTabs });
  }
  return out;
}

async function patchDoc(tk, doc) {
  const d = await getDoc(tk, doc.id);
  const targets = findImageOnlyParagraphs(d);
  console.log(`\n[${doc.name}] ${targets.length} paragraphe(s) image trouvés.`);

  // Tri par startIndex DECROISSANT pour que les insertions ne décalent pas
  // les indices des suivants.
  targets.sort((a, b) => b.startIndex - a.startIndex);

  let totalInserted = 0;
  for (const t of targets) {
    const missing = TARGET_TABS - t.currentTabs;
    if (missing <= 0) {
      console.log(`  para start=${t.startIndex} : déjà ${t.currentTabs} tabs (cible ${TARGET_TABS}), skip.`);
      continue;
    }
    const tabsToInsert = "\t".repeat(missing);
    const res = await fetch(
      `https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            { insertText: { location: { index: t.startIndex }, text: tabsToInsert } },
          ],
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(`  para start=${t.startIndex} : échec ${err}`);
      continue;
    }
    console.log(`  para start=${t.startIndex} : +${missing} tabs (était ${t.currentTabs}, devient ${TARGET_TABS})`);
    totalInserted += missing;
  }
  console.log(`  → ${totalInserted} tabs insérés au total.`);
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
  console.log("\n✓ Indentation alignée.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
