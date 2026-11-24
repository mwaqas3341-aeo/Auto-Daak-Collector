# Database and column mappings

## Tables (public schema, RLS enabled on all)
`app_settings`, `monitored_groups`, `source_connections`, `spreadsheet_links`, `spreadsheet_snapshots`, `column_mappings`, `processing_jobs`, `change_proposals`, `proposed_changes`, `approval_events`, `applied_changes`, `audit_logs`, `profiles`.

Functions: `fn_decide_proposal(p_proposal, p_version, p_decision, p_notes)` (approval RPC), `fn_is_admin()`, `rls_auto_enable()`.

## School sources (A-I-DB database)
Matching is an exact EMIS match. School name is only a secondary check.

| Priority | Table | Key column |
|---|---|---|
| 1 | `public_schools` | `emis` |
| 2 | `pef_schools` | `emis_code` |
| 3 | `piema_schools` | `emis_code` |
| 4 | `schools` | `emis` |

`private_schools` has no EMIS and is **excluded from the first release**.

## Mapped headings
EMIS, school name, district, tehsil, markaz, level, wing, type, area, enrollment, rooms, rooms used for teaching, washrooms, furniture, boundary wall, electricity, address, latitude, longitude, SMP enrollment (with common spelling variants). Headings are normalized (lowercase, punctuation collapsed) before lookup.

Each `column_mappings` row stores: `target_heading`, `normalized_heading`, `source_table`, `source_field`, `match_rule` (for example `emis_exact:emis;priority=1`), `enabled`.

## Excluded by default
Bank and IBAN fields, FTF account fields, caregiver CNIC and phone numbers, private-school owner and principal CNIC and phone numbers. A sheet shared in a group must not receive these. Add any of them deliberately, one at a time.

## Known gaps
- `piema_schools` has no enrollment mapping yet (column not confirmed).
