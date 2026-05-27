-- Champ libre pour documenter les actions de maintien et développement
-- des compétences du formateur sur l'année (Qualiopi indicateur 22).
-- Formations suivies, webinaires, certifications, veille, événements pro.

ALTER TABLE "trainers" ADD COLUMN "developpement_competences" TEXT NOT NULL DEFAULT '';
