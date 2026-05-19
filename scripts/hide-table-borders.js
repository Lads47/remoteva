// One-off : masque les bordures des tables signature dans convention +
// contrat. Sets borderLeft/Right/Top/Bottom à width 0 PT pour toutes les
// cellules de la 1re table de chaque doc.
//
// Usage :
//   docker exec evaremote node /tmp/hide-table-borders.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";

const DOCS = [
  { name: "Convention", id: "1bHLgdRWxanqOIzsWRV5Ns2yIxVKegBa6QQHltljhZCE" },
  { name: "Contrat", id: "1900rv1nRj5ifXjZ0CUHsZpeCtOVo70O1X0KCJ5_yMwM" },
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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Bordure invisible : width 0 PT + couleur blanche (au cas où le moteur
// rendrait quand même un trait à 0 PT).
const INVISIBLE_BORDER = {
  color: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
  width: { magnitude: 0, unit: "PT" },
  dashStyle: "SOLID",
};

function findFirstTableStart(doc) {
  for (const el of doc.body.content || []) {
    if (el.table) return el.startIndex;
  }
  return null;
}

async function hideBorders(tk, docInfo) {
  const d = await getDoc(tk, docInfo.id);
  const tableStart = findFirstTableStart(d);
  if (tableStart === null) {
    console.log(`  ✗ Aucune table trouvée.`);
    return;
  }
  console.log(`  Table trouvée à index ${tableStart}`);
  await batchUpdate(tk, docInfo.id, [
    {
      updateTableCellStyle: {
        tableStartLocation: { index: tableStart },
        tableCellStyle: {
          borderLeft: INVISIBLE_BORDER,
          borderRight: INVISIBLE_BORDER,
          borderTop: INVISIBLE_BORDER,
          borderBottom: INVISIBLE_BORDER,
        },
        fields: "borderLeft,borderRight,borderTop,borderBottom",
      },
    },
  ]);
  console.log("  ✓ Bordures masquées sur toutes les cellules");
}

(async () => {
  const tk = await token();
  for (const docInfo of DOCS) {
    console.log(`\n[${docInfo.name}] (${docInfo.id})`);
    try {
      await hideBorders(tk, docInfo);
    } catch (e) {
      console.error(`  ✗ Erreur:`, e.message);
    }
  }
  console.log("\n✓ Terminé.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
