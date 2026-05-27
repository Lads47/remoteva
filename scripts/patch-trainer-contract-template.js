// One-shot : patche le template "Contrat de sous-traitance formateur"
// (article 2.1, article 3.1, article 6) pour autoriser que le formateur
// dispense son propre programme validé en amont par LADS.
//
// Usage :
//   scp -i ~/.ssh/id_ed25519 scripts/patch-trainer-contract-template.js \
//     root@82.112.240.219:/tmp/
//   ssh -i ~/.ssh/id_ed25519 root@82.112.240.219 \
//     "docker cp /tmp/patch-trainer-contract-template.js evaremote:/tmp/ && \
//      docker exec evaremote node /tmp/patch-trainer-contract-template.js"

const { createSign } = require("crypto");

const TEMPLATE_ID = "1UV4MX-CdzymNzpAJayOP5u6zCUUEWyA2xOuxsAU4__M";
const SCOPES = "https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

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

// === Les 3 remplacements ===
//
// On découpe l'article 6 en 2 remplacements distincts pour matcher chacun
// des 2 paragraphes existants (les newlines à l'intérieur de replaceText
// créent de nouveaux paragraphes côté Docs).

const replacements = [
  {
    label: "Article 2 — point 1",
    old: "1. Respecter scrupuleusement le programme pédagogique, les objectifs et les modalités d'évaluation transmis par le donneur d'ordre, sans modification unilatérale.",
    new: "1. Respecter scrupuleusement le programme pédagogique, les objectifs et les modalités d'évaluation tels que validés en amont par le donneur d'ordre pour la présente session, sans modification unilatérale après validation.",
  },
  {
    label: "Article 3 — point 1",
    old: "1. Mettre à disposition du sous-traitant le programme pédagogique détaillé, les supports de cours, la grille d'évaluation et tout outil nécessaire à la bonne exécution de la prestation.",
    new: "1. Mettre à disposition du sous-traitant les outils de suivi qualité (grille d'évaluation, feuilles d'émargement, formulaire de satisfaction) et, le cas échéant, les supports pédagogiques lorsqu'ils sont fournis par le donneur d'ordre.",
  },
  {
    label: "Article 6 — paragraphe 1 → 2 paragraphes",
    old: "Les supports pédagogiques, programmes, grilles d'évaluation et tout autre document fourni par le donneur d'ordre demeurent sa propriété exclusive. Le sous-traitant ne peut les reproduire, les diffuser ou les utiliser à d'autres fins que la bonne exécution du présent contrat.",
    new:
      "Chaque partie demeure propriétaire des supports pédagogiques, programmes et documents qu'elle a elle-même conçus.\n" +
      "Les outils de suivi qualité (grille d'évaluation, feuilles d'émargement, formulaire de satisfaction) ainsi que les supports pédagogiques éventuellement fournis par le donneur d'ordre demeurent sa propriété exclusive. Le sous-traitant ne peut les reproduire, les diffuser ou les utiliser à d'autres fins que la bonne exécution du présent contrat.",
  },
  {
    label: "Article 6 — paragraphe 2 → 2 paragraphes",
    old: "Réciproquement, le sous-traitant garantit que les éventuels apports personnels qu'il intègre à la session sont libres de droits ou que les droits d'usage correspondants ont été acquis.",
    new:
      "Le sous-traitant conserve la propriété intellectuelle de ses propres supports pédagogiques, programmes et apports personnels, dès lors qu'ils ont été validés en amont par le donneur d'ordre. Il accorde au donneur d'ordre un droit d'usage non exclusif sur ces supports, limité à la durée et aux besoins de l'action de formation objet du présent contrat.\n" +
      "Le sous-traitant garantit que ses propres apports sont libres de droits ou que les droits d'usage correspondants ont été acquis.",
  },
];

async function main() {
  const tk = await token();

  const requests = replacements.map((r) => ({
    replaceAllText: {
      containsText: { text: r.old, matchCase: true },
      replaceText: r.new,
    },
  }));

  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(TEMPLATE_ID)}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  const body = await res.json();
  if (!res.ok) {
    console.error("FAIL", res.status, JSON.stringify(body, null, 2));
    process.exit(1);
  }

  // Affichage compteur de matches par replacement (Docs renvoie un
  // occurrencesChanged par requête : 0 = pas trouvé → indique un drift)
  const replies = body.replies || [];
  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i];
    const occ = replies[i]?.replaceAllText?.occurrencesChanged ?? 0;
    const status = occ > 0 ? "✓" : "✗ NON TROUVÉ";
    console.log(`${status} ${r.label} : ${occ} occurrence(s) remplacée(s)`);
  }
  console.log("\nDoc patché :", "https://docs.google.com/document/d/" + TEMPLATE_ID + "/edit");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
