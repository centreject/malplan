---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

## Scope
Main window of malplan (src/App.tsx and src/ui/**). Mode: Operate.

## Audience & task
General users glancing at an always-on window (docked small or opened large) to see what is next today, the week's shape, and the month. Today leads (user choice, may change later). Avoid: cramped density, sparse emptiness, flashy noise.

## Direction contract
THESIS: One shell, three user-selectable themes (user-pinned: Seoul bus arrival board, bank desk calendar, standard calendar). The shell refuses the category's single-grid calendar: Today is the wide lead column with a "next up" plate; week and month sit beside it.
OWN-WORLD: Themes swap only type, palette, density and one signature move. Bus: Seoul bus route colours (blue/green/yellow/red) as category colours, route-number capsules, one reversed "N분 후" plate. Desk: big condensed date numerals, red Sundays/holidays, warm off-white paper ground, index tabs. Standard: neutral, crisp, blue accent.
STORY: The user sees what is next and how long until it, scans the rest of today, checks the week, then the month by category tab.
FIRST VIEWPORT: Top bar: name, natural-language input (dominant), theme switch. Left 40%: Today (date head, next-up plate, undecided/anytime, timed rows only where items exist with a now line, overdue and undated collapsible). Right: week (7 columns, Sun start) above month grid with tabs; selected tab colours the month frame.
FORM: user-pinned three themes (bus = roll round 0 assigned, desk = pick, standard = canon); seed key a23a9e7c.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
Self-hosted fonts (Seoul Namsan for bus, a condensed numeral face for desk) need download approval; first build uses Malgun Gothic + Bahnschrift. Dark and high-contrast variants later. Lunar dates on desk theme not yet computed.
