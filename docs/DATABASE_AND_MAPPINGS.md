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

## Field coverage
Per the department's decision, every available column of the four school tables is mappable (heading = column name or a common alias), including contact fields such as `ecce_caregiver_cell_no`. Technical columns (`id`, `created_at`, `updated_at`, `sr_no`) are not mapped.

## Disabled by default (`enabled = false`)
Bank and IBAN fields (`bank_name`, `bank_address`, `branch_code`, `iban_no`, `ftf_bank_name`, `ftf_bank_branch`, `ftf_iban_account_no`) and `ecce_caregiver_cnic`, in all three school tables. Turn one on with:

```sql
update public.column_mappings set enabled = true where source_field = 'iban_no';
```

## Staff mapping
Staff data (head teacher name, cell number, etc.) lives in the A-I-DB HR project and is not mapped yet.

## Known gaps
- Staff mapping pending (see above). Private schools excluded from the first release.
