# Edge functions

Source is in `supabase/functions/`.

## login
Verifies CNIC and password against A-I-DB, looks up the A-I-DB role, creates or updates a shadow user in this project, writes `profiles`, and returns a session. Only A-I-DB admins receive the `admin` role.

Secrets: `AIDB_URL`, `AIDB_ANON_KEY`, `AIDB_SERVICE_ROLE_KEY`.

## sheet-reader
Read-only. Requires a signed-in admin (`fn_is_admin`). Writes nothing to Google or the database.

The header row and the first data row are **chosen by the admin in the panel**, because sheets differ (headers on row 1, 2, 3, 4, merged cells, title rows above).

`POST {"action":"preview","url":"<sheet link>","sheet":"<worksheet, optional>"}`
Returns the worksheet list, the first 25 rows, merged ranges, and a suggested header row (a hint only).

`POST {"action":"map","url":"...","sheet":"...","header_row":N,"data_start_row":M}`
Returns each column (letter, heading, mapped source fields), unmapped headings, the first data rows, merged ranges in the data area, and warnings.

Merged cells:
- A covered cell takes the value of the merge's anchor (top-left) cell.
- For a header merged across columns, only the first column is used; the others are marked `continuation` and skipped.
- Merged cells in the data area are reported; updates can only target the first cell of a merge.

Limits: header row and data start row must be within 1-200; first 52 columns are read.

Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_READ_REFRESH_TOKEN` (scope `spreadsheets.readonly`).

A separate `GOOGLE_WRITE_REFRESH_TOKEN` will be added in the approved write phase so the reader can never modify a sheet.

## Secrets rule
Set secrets in Supabase (Edge Functions -> Secrets). Never put them in this repository, in chat, or in `assets/config.js`.
