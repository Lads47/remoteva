// Helpers d'extraction d'éléments d'une adresse postale française saisie en texte libre.
// Convention : on cherche un code postal à 5 chiffres ; tout ce qui est avant = adresse_line_1,
// tout ce qui est après = ville.

export interface ParsedAddress {
  addressLine1: string;
  postalCode: string;
  city: string;
}

/**
 * Parse une adresse française en extrayant le code postal (5 chiffres) comme pivot.
 * Si pas de CP trouvé, retourne la chaîne entière comme addressLine1 et le reste vide.
 */
export function parseFrenchAddress(raw: string): ParsedAddress {
  const s = (raw || "").trim();
  if (!s) return { addressLine1: "", postalCode: "", city: "" };

  const match = s.match(/\b(\d{5})\b/);
  if (!match) {
    return { addressLine1: s, postalCode: "", city: "" };
  }
  const cp = match[1];
  const cpIndex = s.indexOf(cp);
  const before = s.slice(0, cpIndex).trim();
  const after = s.slice(cpIndex + cp.length).trim();
  // Nettoie les ponctuations de fin (virgule notamment) sur "before"
  const addressLine1 = before.replace(/[,;]+$/, "").trim();
  return {
    addressLine1,
    postalCode: cp,
    city: after.toUpperCase(),
  };
}
