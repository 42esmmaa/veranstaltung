CREATE SCHEMA "veranstaltung";
--> statement-breakpoint
CREATE TYPE "veranstaltung"."kategorie" AS ENUM('KONZERT', 'SPORT', 'THEATER', 'WORKSHOP', 'SONSTIGES');--> statement-breakpoint
CREATE TABLE "veranstaltung"."ort" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "veranstaltung"."ort_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"strasse" text NOT NULL,
	"plz" text NOT NULL,
	"stadt" text NOT NULL,
	"veranstaltung_id" integer NOT NULL CONSTRAINT "ort_veranstaltung_id_key" UNIQUE
);
--> statement-breakpoint
CREATE TABLE "veranstaltung"."ticket" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "veranstaltung"."ticket_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bezeichnung" text NOT NULL,
	"preis" numeric(8,2) NOT NULL,
	"kontingent" integer NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"veranstaltung_id" integer NOT NULL,
	CONSTRAINT "ticket_preis_check" CHECK ("preis" >= 0),
	CONSTRAINT "ticket_kontingent_check" CHECK ("kontingent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "veranstaltung"."veranstaltung" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "veranstaltung"."veranstaltung_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"titel" text NOT NULL,
	"datum" date NOT NULL,
	"kategorie" "veranstaltung"."kategorie" NOT NULL,
	"schlagwoerter" jsonb DEFAULT '[]' NOT NULL,
	"preis" numeric(8,2) NOT NULL,
	"veranstalter_id" text NOT NULL,
	"erstellt" timestamp with time zone DEFAULT now() NOT NULL,
	"aktualisiert" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "veranstaltung_preis_check" CHECK ("preis" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ticket_veranstaltung_id_idx" ON "veranstaltung"."ticket" ("veranstaltung_id");--> statement-breakpoint
CREATE INDEX "veranstaltung_veranstalter_id_idx" ON "veranstaltung"."veranstaltung" ("veranstalter_id");--> statement-breakpoint
ALTER TABLE "veranstaltung"."ort" ADD CONSTRAINT "ort_veranstaltung_id_fkey" FOREIGN KEY ("veranstaltung_id") REFERENCES "veranstaltung"."veranstaltung"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "veranstaltung"."ticket" ADD CONSTRAINT "ticket_veranstaltung_id_fkey" FOREIGN KEY ("veranstaltung_id") REFERENCES "veranstaltung"."veranstaltung"("id") ON DELETE CASCADE;