// One-off : remplace Jérôme Garin par Noémie Marphay (responsable pédagogique)
// dans les templates convention + convocation déjà créés.
// Idempotent : si une chaîne ne match pas (template déjà patché ou édité par
// l'utilisateur), la requête est un no-op.
//
// Usage dans le container :
//   docker exec evaremote node /tmp/patch-signataire-noemie.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const TEMPLATES = [
  {
    name: "Convention",
    id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE",
    replacements: [
      // Représentant légal de l'OF dans le préambule
      {
        from: "Représenté par : Jérôme GARIN",
        to: "Représenté par : Noémie Marphay, responsable pédagogique",
      },
      // La ligne "Contact pédagogique" devient redondante puisque Noémie est
      // désormais le représentant. On la simplifie en gardant juste les
      // coordonnées de contact général.
      {
        from: "Contact pédagogique : Noémie Marphay — formation@lesateliersdustream.fr — 06.46.65.65.77",
        to: "Contact : formation@lesateliersdustream.fr — 06.46.65.65.77",
      },
      // Référent handicap : transféré à la responsable pédagogique pour
      // cohérence (Qualiopi critère 5, single-point-of-contact).
      {
        from: "Référent handicap : Jérôme Garin",
        to: "Référent handicap : Noémie Marphay",
      },
      // Bloc signature en bas de page (occurrence restante après les remplacements ci-dessus)
      { from: "Jérôme GARIN", to: "Noémie Marphay" },
    ],
  },
  {
    name: "Convocation",
    id: "1dR3806BnGR58SuO_p2zstNWCCRk4SA4V0lAdX1-R80s",
    replacements: [
      // Référent handicap dans le paragraphe accessibilité
      {
        from: "contactez le référent handicap Jérôme Garin",
        to: "contactez le référent handicap Noémie Marphay",
      },
      // Signature au pied de page
      { from: "Jérôme Garin", to: "Noémie Marphay" },
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
  // Le résultat liste les remplacements effectués et leur count
  const summary = (d.replies || []).map((r, i) => {
    const c = r.replaceAllText?.occurrencesChanged ?? 0;
    return `  • "${tpl.replacements[i].from.slice(0, 60)}${tpl.replacements[i].from.length > 60 ? "..." : ""}" → ${c} remplacement(s)`;
  });
  console.log(`\n[${tpl.name}] (${tpl.id})`);
  console.log(summary.join("\n"));
}

async function main() {
  const tk = await token();
  for (const tpl of TEMPLATES) {
    await patchDoc(tk, tpl);
  }
  console.log("\n✓ Templates patchés.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
