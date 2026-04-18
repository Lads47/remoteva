import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { getProjectsByDate, isValidRegie, type Regie } from "@/lib/flow";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// GET /api/flow/projects?date=YYYY-MM-DD&regie=WVP_A2
export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const regieParam = searchParams.get("regie");

    if (!dateParam) {
      return jsonCors({ error: "Paramètre 'date' requis (YYYY-MM-DD)" }, { status: 400 });
    }

    const date = new Date(dateParam);
    if (isNaN(date.getTime())) {
      return jsonCors({ error: "Date invalide" }, { status: 400 });
    }

    let regie: Regie | undefined;
    if (regieParam) {
      if (!isValidRegie(regieParam)) {
        return jsonCors(
          { error: `Régie invalide. Valeurs acceptées : WVP_A1, WVP_A2, WVP_A3, WVP_A4` },
          { status: 400 }
        );
      }
      regie = regieParam;
    }

    const projects = await getProjectsByDate(date, regie);
    return jsonCors({ projects });
  } catch (error) {
    console.error("[/api/flow/projects] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
