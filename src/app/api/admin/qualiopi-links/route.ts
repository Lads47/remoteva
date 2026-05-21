// GET / PUT /api/admin/qualiopi-links
//
// Stocke et expose les URL des documents Drive externes utiles pour les
// indicateurs Qualiopi qui ne tiennent pas dans EVA Remote :
//   - Sheet de veille (ind. 25-27 : socio-éco, légale, pédagogique/techno)
//   - Doc partenariats / acteurs socio-économiques (ind. 28)
//
// AppConfig keys :
//   - qualiopi.veille_sheet_url
//   - qualiopi.partenaires_doc_url

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const KEYS = {
  veille: "qualiopi.veille_sheet_url",
  partenaires: "qualiopi.partenaires_doc_url",
} as const;

async function getCfg(key: string): Promise<string> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? "";
}

async function setCfg(key: string, value: string): Promise<void> {
  if (value) {
    await prisma.appConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  } else {
    // Suppression si vide pour ne pas garder de chaînes vides en base
    await prisma.appConfig.deleteMany({ where: { key } });
  }
}

export async function GET() {
  try {
    const [veille, partenaires] = await Promise.all([
      getCfg(KEYS.veille),
      getCfg(KEYS.partenaires),
    ]);
    return NextResponse.json({ veille, partenaires });
  } catch (error) {
    console.error("[/api/admin/qualiopi-links] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const veille = typeof body.veille === "string" ? body.veille.trim() : "";
    const partenaires = typeof body.partenaires === "string" ? body.partenaires.trim() : "";

    // Validation légère : doit ressembler à une URL si non vide
    for (const [name, val] of Object.entries({ veille, partenaires })) {
      if (val && !/^https?:\/\//i.test(val)) {
        return NextResponse.json(
          { error: `Le lien ${name} doit commencer par http:// ou https://` },
          { status: 400 }
        );
      }
    }

    await setCfg(KEYS.veille, veille);
    await setCfg(KEYS.partenaires, partenaires);

    return NextResponse.json({ veille, partenaires });
  } catch (error) {
    console.error("[/api/admin/qualiopi-links] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
