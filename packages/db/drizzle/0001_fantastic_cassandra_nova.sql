CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"website_url" text NOT NULL,
	"business_name" text,
	"audit_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
