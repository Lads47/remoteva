// One-off : corrige l'effectif dans les templates convention + contrat.
// Le texte "1 stagiaire" laissait croire que la formation n'accueille qu'un
// stagiaire ; en réalité c'est entre 1 et la capacité de la session.
// Remplacement par "1 à {{SESSION_CAPACITE}} stagiaires" qui sera substitué
// à la génération par la vraie capacité (défaut 8).
//
// Usage :
//   docker exec evaremote node /tmp/patch-effectif-session.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const TEMPLATES = [
  {
    name: "Convention",
    id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE",
    replacements: [
      {
        from: "Effectif : 1 stagiaire",
        to: "Effectif de la session : 1 à {{SESSION_CAPACITE}} stagiaires",
      },
    ],
  },
  {
    name: "Contrat",
    id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM",
    replacements: [
      {
        from: "Elle est organisée pour un effectif de 1 stagiaire.",
        to: "Elle est organisée pour un effectif compris entre 1 et {{SESSION_CAPACITE}} stagiaires.",
      },
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
  const summary = (d.replies || []).map((r, i) => {
    const c = r.replaceAllText?.occurrencesChanged ?? 0;
    return `  • "${tpl.replacements[i].from.slice(0, 60)}${tpl.replacements[i].from.length > 60 ? "..." : ""}" → ${c} remplacement(s)`;
  });
  console.log(`\n[${tpl.name}] (${tpl.id})`);
  console.log(summary.join("\n"));
}

async function main() {
  const tk = await token();
  for (const tpl of TEMPLATES) await patchDoc(tk, tpl);
  console.log("\n✓ Templates patchés.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
