import { isIP } from "node:net";

// Traefik remplace X-Real-Ip par l'adresse qu'il voit et écarte les X-Forwarded-*
// venus d'un client non approuvé : X-Real-Ip d'abord, puis la DERNIÈRE entrée
// de X-Forwarded-For (celle ajoutée par le proxy, pas celle que le client a pu forger).
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIP(normalize(real))) return normalize(real);
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last && isIP(normalize(last))) return normalize(last);
  }
  return null;
}

function normalize(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped ? mapped[1] : ip;
}

function expandIpv6(ip: string): string[] | null {
  const parts = ip.toLowerCase().split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  return [...head, ...Array(parts.length === 2 ? missing : 0).fill("0"), ...tail];
}

// IPv4 → /24, IPv6 → /48. C'est la seule forme d'IP qui touche le disque.
export function truncateIp(ip: string): string | null {
  const n = normalize(ip);
  const kind = isIP(n);
  if (kind === 4) {
    const p = n.split(".");
    return `${p[0]}.${p[1]}.${p[2]}.0`;
  }
  if (kind === 6) {
    const groups = expandIpv6(n);
    if (!groups) return null;
    return `${groups.slice(0, 3).map((g) => parseInt(g, 16).toString(16)).join(":")}::`;
  }
  return null;
}
