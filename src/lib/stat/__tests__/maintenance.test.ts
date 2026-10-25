import { describe, it, expect } from "vitest";
import { backupsToDelete, monthBounds, monthsToArchive } from "@/lib/stat/maintenance";

describe("bornes d'un mois", () => {
  it("couvre le mois entier, années bissextiles comprises", () => {
    expect(monthBounds("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthBounds("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("mois à archiver", () => {
  const days = ["2026-08-30", "2026-09-02", "2026-09-30", "2026-10-01", "2026-10-25"];
  it("seulement les mois clos, sans archive, dans l'ordre", () => {
    expect(monthsToArchive(days, "2026-10-25", new Set())).toEqual(["2026-08", "2026-09"]);
    expect(monthsToArchive(days, "2026-10-25", new Set(["2026-08"]))).toEqual(["2026-09"]);
  });
  it("jamais le mois en cours, même le dernier jour", () => {
    expect(monthsToArchive(days, "2026-10-31", new Set(["2026-08", "2026-09"]))).toEqual([]);
    expect(monthsToArchive(days, "2026-11-01", new Set(["2026-08", "2026-09"]))).toEqual(["2026-10"]);
  });
});

describe("rotation des sauvegardes", () => {
  const files = Array.from({ length: 16 }, (_, i) => `stat-2026-10-${String(i + 1).padStart(2, "0")}.db`);
  it("garde les 14 plus récentes", () => {
    expect(backupsToDelete(files)).toEqual(["stat-2026-10-02.db", "stat-2026-10-01.db"]);
  });
  it("ne touche à rien d'autre que ses propres fichiers", () => {
    expect(backupsToDelete([...files, "predeploy-20261025.db", "stat.db", "notes.txt"])).toHaveLength(2);
    expect(backupsToDelete(files.slice(0, 3))).toEqual([]);
  });
});
