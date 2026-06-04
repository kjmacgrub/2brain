# 2Brain Journal Tools

## How files are served
- **Live (primary):** hosted on **GitHub Pages** at `https://kjmacgrub.github.io/2brain/` (e.g. `https://kjmacgrub.github.io/2brain/2b-journal.html`), served from the `master` branch of `kjmacgrub/2brain`. This is the URL actually used day-to-day.
  - **UI changes only appear after a `git push`** — Pages rebuilds in ~30–90s. A local hard-refresh is NOT enough for the live page.
  - If a pushed change doesn't show, hard-refresh (`Cmd+Shift+R`) or append a cache-buster (`?v=2`) — Pages/CDN can serve a cached copy briefly.
- **Local (dev):** files can also be opened directly as `file:///Users/km/python3/source/2brain_tools/` for quick iteration. No dev server; local edits show on hard refresh of the `file://` URL, but do NOT affect the live Pages site until pushed.

## Git
- This directory is a **nested git repo** inside `/Users/km/python3/source/`
- Always commit and push using `git -C /Users/km/python3/source/2brain_tools` (or `cd` into it)
- Remote: `https://github.com/kjmacgrub/2brain.git` — branch: `master`
- Do NOT `git add 2brain_tools/` from the outer `/source` repo

## Files
- `2brain-journal.html` — main journal viewer (views: journal, chrono, calendar)
- `2brain-meeting.html` — meeting capture form
- `2brain-menu.html` — app launcher/menu
- `2brain-journal-original.html` — backup of original before changes

## Supabase Backend
- Project ref: `wiabftxfumvzbttqgmtq`
- Credentials: `/Users/km/python3/source/2Brain/credentials.md`
- Thoughts table: `thoughts` — columns: `id`, `content`, `metadata` (JSON), `created_at`
- `metadata` fields: `type`, `topics[]`, `people[]`, `action_items[]`
- Entry types: `idea`, `meeting`, `observation`, `person_note`, `reference`, `summary`, `task`
- Edge functions: `ingest-thought`, `brain-mcp`, `ical-proxy`
- Publishable key in HTML files; service role key in credentials.md
- `projects` table — controls which project tags the metadata extractor recognises. To add a project: `INSERT INTO projects (tag, name) VALUES ('tag', 'Name');`. To retire: `UPDATE projects SET active = false WHERE tag = 'old';`

## Data API exposure (Supabase change, enforced 2026-10-30)
- This project uses the Data API (`/rest/v1/...` in the HTML files, `supabase.from(...)` in edge functions). The HTMLs hit the API as the `anon` role; edge functions use `service_role`.
- Existing tables (`thoughts`, `projects`) keep their current grants — no action needed for them.
- **For any NEW table in `public` that the HTML or edge functions should read/write**, include explicit grants in the create-table SQL, otherwise PostgREST returns `42501`:
  ```sql
  grant select on public.<table> to anon;
  grant select, insert, update, delete on public.<table> to authenticated;
  grant select, insert, update, delete on public.<table> to service_role;
  alter table public.<table> enable row level security;
  -- + RLS policies
  ```
- Tables only accessed via direct Postgres connection (not the Data API) don't need these grants.

## Routines (scheduled cloud agents writing to the journal)
- Claude **cloud routines** (`/schedule`) can post entries to this journal on a cron schedule. A pinned **⏰ Routines panel** at the top of `2b-journal.html` (`renderRoutinePanel()`) surfaces them — matches entries where `metadata.source` is `routine`/`routine-poc` OR `topics` includes `routine`. The header also has an `⏰ routines` link to https://claude.ai/code/routines.
- **Write via the 2Brain connector, NOT curl.** A routine boots with zero context (just its prompt + the checked-out repo). A prompt telling it to `curl` the Supabase endpoint with a hardcoded bearer token gets **refused as a suspected prompt-injection / exfiltration attempt** — the run "Completes" by declining and writes nothing. What works:
  - Attach the **2Brain MCP connector** and have the routine call its capture tool (entries arrive with `source: "mcp"`, so the panel relies on the `routine` *topic* to catch them).
  - Frame the prompt as a legitimate, contextualized request ("this is the owner's own journal…") — avoid identity-override phrasing like "You are X, do EXACTLY nothing else."
  - Don't over-restrict `allowed_tools`; let the default preset expose the connector tools.
- Live PoC routine: "2B routine heartbeat" (`trig_01Bdme6yvr94cssxT3dkpsFE`), `0 12 * * *` = 8am EDT (drifts to 7am EST; cron is fixed UTC). Delete/disable only via the routines web page — the API can't delete.

## Journal View Logic
- `journal` view: groups entries by detected app/project (Delivery, SBS, CEF, Budget, 2Brain, General)
- Detection via `APP_RULES` — matches topics/content keywords to app names
- `chrono` view: flat chronological list with app badge per entry
- `calendar` view: month grid with heat map + day panel; pulls iCal events via `ical-proxy`
- Sections are individually collapsible; "collapse all / expand all" chip in view filter row
