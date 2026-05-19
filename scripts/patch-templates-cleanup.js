// One-off : nettoie les 3 templates (convention + contrat + convocation) :
//   1. Retire la ligne "Référence : {{SESSION_CODE}}" (info interne)
//   2. Retire la ligne "Référence interne : {{FORMATION_CODE}}" (info interne)
//   3. Corrige l'alignement du bloc signature : 5 tabs → 4 tabs pour rester
//      cohérent avec la ligne d'en-tête "Pour le bénéficiaire,\t\t\t\tPour
//      Les Ateliers..." (4 tabs). Avec 5 tabs, quand CONTACT_ADMIN/NOM_COMPLET
//      est court ou vide, "Noémie Marphay" se retrouve plus à droite que
//      "Pour Les Ateliers du Stream", créant un décalage visible.
//
// Idempotent : chaque remplacement non trouvé renvoie 0 occurrence.
//
// Usage :
//   docker exec evaremote node /tmp/patch-templates-cleanup.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const COMMON_REPLACEMENTS = [
  // Retire les références aux codes internes (formation + session)
  // On retire aussi le \n pour effacer la ligne complète.
  { from: "Référence : {{SESSION_CODE}}\n", to: "" },
  { from: "Référence interne : {{FORMATION_CODE}}\n", to: "" },
  // Variantes sans \n au cas où le user aurait modifié les fins de ligne
  { from: "Référence : {{SESSION_CODE}}", to: "" },
  { from: "Référence interne : {{FORMATION_CODE}}", to: "" },
];

const TEMPLATES = [
  {
    name: "Convention",
    id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE",
    replacements: [
      ...COMMON_REPLACEMENTS,
      // Fix alignement signature : 5 tabs → 4 tabs
      {
        from: "{{CONTACT_ADMIN}}\t\t\t\t\tNoémie Marphay",
        to: "{{CONTACT_ADMIN}}\t\t\t\tNoémie Marphay",
      },
    ],
  },
  {
    name: "Contrat",
    id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM",
    replacements: [
      ...COMMON_REPLACEMENTS,
      {
        from: "{{NOM_COMPLET}}\t\t\t\t\tNoémie Marphay",
        to: "{{NOM_COMPLET}}\t\t\t\tNoémie Marphay",
      },
    ],
  },
  {
    name: "Convocation",
    id: "1dR3806BnGR58SuO_p2zstNWCCRk4SA4V0lAdX1-R80s",
    replacements: COMMON_REPLACEMENTS,
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

async function patchDoc(tk, tpl) {
  const requests = tpl.replacements.map((r) => ({
    replaceAllText: {
      containsText: { text: r.from, matchCase: true },
      replaceText: r.to,
    },
  }));
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
  console.log(`\n[${tpl.name}] (${tpl.id})`);
  for (let i = 0; i < tpl.replacements.length; i++) {
    const c = d.replies?.[i]?.replaceAllText?.occurrencesChanged ?? 0;
    const preview = tpl.replacements[i].from.slice(0, 50).replace(/\t/g, "[TAB]");
    console.log(`  • "${preview}${tpl.replacements[i].from.length > 50 ? "..." : ""}" → ${c} remplacement(s)`);
  }
}

async function main() {
  const tk = await token();
  for (const tpl of TEMPLATES) {
    try {
      await patchDoc(tk, tpl);
    } catch (e) {
      console.error(`[${tpl.name}] ✗ Erreur:`, e.message);
    }
  }
  console.log("\n✓ Templates nettoyés.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
