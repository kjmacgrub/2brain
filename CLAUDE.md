# 2Brain Journal Tools

## How files are served
- All files are opened **directly in the browser** as local files: `file:///Users/km/python3/source/2brain_tools/`
- No dev server — changes to HTML/JS/CSS are visible after a hard refresh (`Cmd+Shift+R`)

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

## Journal View Logic
- `journal` view: groups entries by detected app/project (Delivery, SBS, CEF, Budget, 2Brain, General)
- Detection via `APP_RULES` — matches topics/content keywords to app names
- `chrono` view: flat chronological list with app badge per entry
- `calendar` view: month grid with heat map + day panel; pulls iCal events via `ical-proxy`
- Sections are individually collapsible; "collapse all / expand all" chip in view filter row
