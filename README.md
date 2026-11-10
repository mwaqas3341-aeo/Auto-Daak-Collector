# Auto Daak Collector

WhatsApp group Google Sheets links -> proposed updates -> **admin approval** -> Google Sheets.

Core rules: never write to a sheet without explicit approval; never send WhatsApp messages; never commit secrets.
Full design: `docs/Auto_Daak_Architecture.docx`.

## Layout
- `index.html`, `assets/`: GitHub Pages admin panel (static; anon key only)
- `supabase/001_schema.sql`: tables, RLS (admin-read only), approval RPC
- Worker (WhatsApp listener, Google reader/writer): keep in a PRIVATE repo, uses service-role key server-side only

## Phase status
1. Foundation (this commit): schema + panel shell. No live writes, no WhatsApp, no Google.
2. Google read-only proposals, 3. WhatsApp intake, 4. Approved write path, 5. Pilot.

## Setup
1. Create a NEW Supabase project, run `supabase/001_schema.sql`.
2. Add a `login` edge function that verifies A-I-DB CNIC+password and mints a session (same pattern as SMPledger); set role in `profiles`.
3. Fill `assets/config.js` (project URL + anon key), enable GitHub Pages.
