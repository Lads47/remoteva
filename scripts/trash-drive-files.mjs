// One-shot : trash des fichiers/dossiers Drive via Service Account JWT.
// Usage : node trash-drive-files.mjs ID1 ID2 ID3...

import { createSign } from "crypto";

const SCOPES = "https://www.googleapis.com/auth/drive";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64url(input) {
  // ⚠️ Ne PAS toString() un Buffer binaire (signature RSA) — ça le corrompt
  // en interprétant les bytes comme de l'UTF-8. On encode le Buffer directement.
  const b = typeof input === "string" ? Buffer.from(input) : input;
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 manquant");
  const key = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  // Si la clé contient des '\n' littéraux (échappés), on les convertit en
  // vrais retours à la ligne — sinon crypto.createSign échoue avec
  // "Invalid JWT Signature".
  if (key.private_key && key.private_key.includes("\\n")) {
    key.private_key = key.private_key.replace(/\\n/g, "\n");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: key.client_email,
    scope: SCOPES,
    aud: key.token_uri || OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const sig = base64url(signer.sign(key.private_key));
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function trashFile(token, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Trash failed for ${fileId}: ${res.status} ${txt}`);
  }
  return res.json();
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Aucun ID fourni");
    process.exit(1);
  }
  const token = await getAccessToken();
  console.log(`Access token OK (${token.slice(0, 20)}...)`);
  for (const id of ids) {
    try {
      const r = await trashFile(token, id);
      console.log(`  ✓ ${id} → trashed (${r.name || "?"})`);
    } catch (e) {
      console.error(`  ✗ ${id} → ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
