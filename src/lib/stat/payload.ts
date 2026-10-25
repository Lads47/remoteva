import { z } from "zod";

// Messages envoyés par /e.js. Clés courtes : le script doit rester sous 3 Ko.
export const MAX_BODY_BYTES = 4096;

const clientId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const path = z.string().min(1).max(500).startsWith("/");
const short = (max: number) => z.string().max(max).optional();

const base = {
  s: z.string().regex(/^[a-z0-9-]{1,32}$/), // slug du site (data-site)
  v: clientId, // visiteur (localStorage, propre au site)
  se: clientId, // session (sessionStorage)
  b: z.literal(1).optional(), // navigator.webdriver
};

const pageview = z.object({
  ...base,
  t: z.literal("pageview"),
  p: clientId, // id de la page vue
  u: path,
  ti: short(300),
  r: short(1000),
  us: short(100),
  um: short(100),
  uc: short(100),
  w: z.number().int().min(0).max(20000).optional(),
  l: short(35),
});

const ping = (t: "heartbeat" | "leave") =>
  z.object({
    ...base,
    t: z.literal(t),
    p: clientId,
    d: z.number().int().min(0).max(86400), // secondes visibles sur la page
  });

const propValue = z.union([z.string().max(200), z.number(), z.boolean()]);

const event = z.object({
  ...base,
  t: z.literal("event"),
  n: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  pr: z
    .record(z.string().max(40), propValue)
    .refine((o) => Object.keys(o).length <= 10, "10 propriétés au plus")
    .optional(),
  u: path,
});

export const collectPayload = z.discriminatedUnion("t", [
  pageview,
  ping("heartbeat"),
  ping("leave"),
  event,
]);

export type CollectPayload = z.infer<typeof collectPayload>;
export type PageviewPayload = z.infer<typeof pageview>;

export function parsePayload(text: string): CollectPayload | null {
  if (text.length > MAX_BODY_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const r = collectPayload.safeParse(json);
  return r.success ? r.data : null;
}
