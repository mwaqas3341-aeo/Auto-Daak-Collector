# Edge functions

Source is in `supabase/functions/`.

## login
Verifies CNIC and password against A-I-DB, looks up the A-I-DB role, creates or updates a shadow user in this project, writes `profiles`, and returns a session. Only A-I-DB admins receive the `admin` role.

Secrets: `AIDB_URL`, `AIDB_ANON_KEY`, `AIDB_SERVICE_ROLE_KEY`.

## sheet-reader
Read-only. Requires a signed-in admin (`fn_is_admin`). Accepts `POST {"url": "<google sheets link>"}`, reads worksheets and the first 15 rows, detects the header row, and returns each column with its mapped source fields plus unmapped headings. Writes nothing to Google or the database.

Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_READ_REFRESH_TOKEN` (scope `spreadsheets.readonly`).

A separate `GOOGLE_WRITE_REFRESH_TOKEN` will be added in the approved write phase so the reader can never modify a sheet.

## Secrets rule
Set secrets in Supabase (Edge Functions -> Secrets). Never put them in this repository, in chat, or in `assets/config.js`.
