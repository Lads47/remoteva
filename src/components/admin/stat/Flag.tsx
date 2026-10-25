import * as flags from "country-flag-icons/string/3x2";

// SVG inline (les émojis drapeaux ne s'affichent pas sous Windows). Rendu serveur
// uniquement : la bibliothèque complète ne part jamais dans le navigateur.
export default function Flag({ code }: { code: string | null }) {
  const svg = code ? (flags as Record<string, string>)[code.toUpperCase()] : undefined;
  if (!svg) {
    return <span className="inline-block w-[21px] h-[14px] rounded-sm align-middle" style={{ backgroundColor: "var(--line)" }} />;
  }
  return (
    <span
      className="inline-block w-[21px] h-[14px] rounded-sm overflow-hidden align-middle [&>svg]:w-full [&>svg]:h-full"
      style={{ boxShadow: "0 0 0 1px var(--line)" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
