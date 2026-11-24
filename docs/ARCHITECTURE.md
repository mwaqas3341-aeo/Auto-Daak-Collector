# Architecture

Condensed from `Auto_Daak_Architecture.docx` (prepared 31 October 2026).

## Core rule
The system may detect links, read authorized sources, compare records and prepare proposed changes. It must not modify a shared Google Sheet until the authorized administrator explicitly approves the exact proposed changes. It never sends WhatsApp messages.

## Components
| Component | Role |
|---|---|
| WhatsApp account | Additional number in the group; receives shared links only |
| Wispbyte worker | WhatsApp listener, queue processor, source lookup, approved-update writer |
| GitHub Pages frontend | Static admin panel: settings, review, approval, logs. No secrets |
| Supabase | Config, links, proposals, approvals, jobs, mappings, audit log. RLS enforced |
| Google Sheets API | Reads sheet structure; writes approved cells only |
| Google Drive API | Reads authorized source files |

## Data flow
WhatsApp group -> listener -> Supabase link queue -> Sheets reader + source search -> proposed changes -> admin approval panel -> validation and conflict check -> Sheets API -> result and audit log.

## Workflow
1. Detect Google Sheets links (no replies sent)
2. Validate and normalize the link, extract the spreadsheet ID
3. Deduplicate (spreadsheet ID + processing version)
4. Read title, worksheets, headers, current values
5. Map headings to canonical fields (aliases in `column_mappings`)
6. Search school sources by exact EMIS match
7. Build a proposal: old value, proposed value, source, match method, status
8. Admin reviews: approve all, selected rows, individual cells, edit, reject, re-analyze
9. Revalidate immediately before writing (proposal unchanged, target cells unchanged, edit permission)
10. Write only approved cells
11. Audit: who approved, when, target cells, before and after values
12. On conflict or permission error: stop and return to review

## Approval rules
- Default state is Awaiting Approval.
- Approval applies to one immutable proposal version and exact cells and values.
- If a target cell changed since the preview, mark a conflict and require renewed approval.
- Edited values are stored as reviewed overrides in the approval record.
- No bulk deletion; no formatting, formula or protected-range changes in the first release.

## Status lifecycle
Detected -> Queued -> Analyzing -> Awaiting Approval -> Approved -> Applying -> Completed
Alternative: Rejected, Needs Review, Conflict Detected, Failed, Cancelled.

## Security
- Browser uses the anon key with user authentication; RLS restricts access.
- Service-role keys, Google tokens and WhatsApp session files live only in protected server environments.
- Reading and writing use separate Google tokens (read-only scope for the reader).
