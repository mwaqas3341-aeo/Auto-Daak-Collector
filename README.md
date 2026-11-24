# Auto Daak Collector

WhatsApp group Google Sheets links -> proposed updates -> **admin approval** -> Google Sheets.

## Core rules
- Never write to a sheet without explicit admin approval of the exact proposed changes.
- Never send WhatsApp messages or replies.
- Never commit secrets (tokens, keys, session files) to this repository.

## Documentation
| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, workflow, approval rules, status lifecycle |
| [docs/DATABASE_AND_MAPPINGS.md](docs/DATABASE_AND_MAPPINGS.md) | Supabase tables, A-I-DB school sources, column mappings, excluded fields |
| [docs/EDGE_FUNCTIONS.md](docs/EDGE_FUNCTIONS.md) | `login` and `sheet-reader` functions, required secrets |
| [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) | Google Cloud OAuth setup and refresh token steps |
| [docs/Auto_Daak_Architecture.docx](docs/Auto_Daak_Architecture.docx) | Original full design document |
| [legal/privacy.html](legal/privacy.html), [legal/terms.html](legal/terms.html) | Privacy policy and terms (linked from the Google consent screen) |

## Layout
- `index.html`, `assets/`: GitHub Pages admin panel (static; anon key only)
- `supabase/001_schema.sql`: tables, RLS, approval RPC
- `supabase/002_column_mappings_seed.sql`: heading-to-source mappings
- `supabase/functions/`: edge function source (`login`, `sheet-reader`)
- Worker (WhatsApp listener, Google writer): keep in a PRIVATE repo, uses service-role key server-side only

## Phase status
1. Foundation: schema, RLS, approval RPC, panel shell, login. **Done**
2. Google read-only access and proposals: column mappings seeded, `sheet-reader` deployed. **In progress** (waiting on Google OAuth credentials)
3. WhatsApp intake. Not started
4. Approved write path (separate write-scoped Google token). Not started
5. Pilot. Not started

Private schools are excluded from the first release and will be handled later.

## Setup
1. Create a Supabase project and run `supabase/001_schema.sql`, then `supabase/002_column_mappings_seed.sql`.
2. Deploy the edge functions in `supabase/functions/` and add the secrets listed in `docs/EDGE_FUNCTIONS.md`.
3. Complete Google setup in `docs/GOOGLE_SETUP.md`.
4. Fill `assets/config.js` (project URL + anon key) and enable GitHub Pages.
