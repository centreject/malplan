---
name: malplan
description: One always-on planning board, three user-selectable themes (bus arrival board, desk calendar, standard).
colors:
  # Bus theme (버스 안내판) — default, also bound to :root
  bus-bg: "#e9edf2"
  bus-surface: "#ffffff"
  bus-surface-2: "#f3f5f8"
  bus-ink: "#18212d"
  bus-ink-2: "#4a5566"
  bus-ink-3: "#6b7686"
  bus-line: "#d5dbe3"
  bus-accent: "#1b5fb5"
  bus-red: "#d33a2a"
  bus-late: "#b86e00"
  bus-late-bg: "#fff3dc"
  bus-plate-bg: "#18212d"
  bus-plate-ink: "#ffffff"
  bus-plate-when: "#f2b705"
  bus-cat-0: "#4a5566"
  bus-cat-1-trunk: "#1b5fb5"
  bus-cat-2-branch: "#23803a"
  bus-cat-3-express: "#d33a2a"
  bus-cat-4-circular: "#e9a800"
  bus-cat-5-night: "#283a5a"
  bus-cat-6-airport: "#007a78"
  bus-cat-ink-4: "#1d1600"
  # Desk theme (탁상달력)
  desk-bg: "#e7e1d6"
  desk-surface: "#fbf8f2"
  desk-surface-2: "#f2ede3"
  desk-ink: "#23201b"
  desk-ink-2: "#57514a"
  desk-ink-3: "#78706a"
  desk-line: "#ddd5c8"
  desk-accent-red: "#c8281f"
  desk-blue: "#2e5aac"
  desk-late: "#a3560a"
  desk-late-bg: "#f8e9d4"
  desk-cat-0: "#57514a"
  desk-cat-1: "#2e5aac"
  desk-cat-2: "#3f7d4e"
  desk-cat-3: "#b5482f"
  desk-cat-4: "#9a7413"
  desk-cat-5: "#6b4e8e"
  desk-cat-6: "#2f7580"
  # Standard theme (기본)
  standard-bg: "#f4f5f7"
  standard-surface: "#ffffff"
  standard-surface-2: "#f7f8fa"
  standard-ink: "#1f2937"
  standard-ink-2: "#4b5563"
  standard-ink-3: "#6b7280"
  standard-line: "#e5e7eb"
  standard-accent: "#2563eb"
  standard-red: "#dc2626"
  standard-late: "#b45309"
  standard-late-bg: "#fef3c7"
  standard-plate-bg: "#eff4ff"
  standard-plate-ink: "#1e3a8a"
  standard-plate-when: "#1d4ed8"
  standard-cat-0: "#6b7280"
  standard-cat-1: "#2563eb"
  standard-cat-2: "#16a34a"
  standard-cat-3: "#dc2626"
  standard-cat-4: "#b7791f"
  standard-cat-5: "#7c3aed"
  standard-cat-6: "#0891b2"
typography:
  display-bus:
    fontFamily: "Bahnschrift, Malgun Gothic, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  display-desk:
    fontFamily: "Bahnschrift, Malgun Gothic, sans-serif"
    fontSize: "96px"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  display-standard:
    fontFamily: "Segoe UI, Malgun Gothic, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  plate-when:
    fontFamily: "Bahnschrift, Malgun Gothic, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Malgun Gothic, 맑은 고딕, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  title:
    fontFamily: "Malgun Gothic, 맑은 고딕, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Malgun Gothic, 맑은 고딕, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Malgun Gothic, 맑은 고딕, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  cell:
    fontFamily: "Malgun Gothic, 맑은 고딕, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  numeral:
    fontFamily: "Bahnschrift, Malgun Gothic, sans-serif"
    fontFeature: "tnum"
rounded:
  bus-capsule: "999px"
  bus-pane: "14px"
  desk-tag: "3px"
  desk-pane: "4px"
  standard-tag: "6px"
  standard-pane: "10px"
  control: "8px"
  check: "6px"
  standard-plate: "6px"
spacing:
  shell: "20px"
  shell-docked: "16px"
  pane-gap: "14px"
  pane-inset: "16px"
  row-standard: "8px"
  row-bus: "9px"
  row-desk: "10px"
  cell-gap: "4px"
components:
  quick-add-input:
    backgroundColor: "{colors.bus-surface}"
    textColor: "{colors.bus-ink}"
    rounded: "{rounded.bus-pane}"
    height: "42px"
    padding: "0 14px"
    typography: "{typography.title}"
  quick-add-submit-bus:
    backgroundColor: "{colors.bus-plate-when}"
    textColor: "{colors.bus-cat-ink-4}"
    width: "46px"
  next-plate-bus:
    backgroundColor: "{colors.bus-plate-bg}"
    textColor: "{colors.bus-plate-ink}"
    rounded: "10px"
    padding: "14px 18px"
  next-plate-desk:
    backgroundColor: "{colors.desk-surface}"
    textColor: "{colors.desk-ink}"
    rounded: "0px"
    padding: "12px 16px"
  next-plate-standard:
    backgroundColor: "{colors.standard-plate-bg}"
    textColor: "{colors.standard-plate-ink}"
    rounded: "6px"
    padding: "12px 16px"
  cat-tag-bus:
    backgroundColor: "{colors.bus-cat-1-trunk}"
    textColor: "{colors.bus-plate-ink}"
    rounded: "{rounded.bus-capsule}"
    padding: "1px 9px"
    typography: "{typography.cell}"
  cat-tag-desk:
    textColor: "{colors.desk-cat-1}"
    rounded: "{rounded.desk-tag}"
    padding: "0 6px"
  cat-tag-standard:
    textColor: "{colors.standard-cat-1}"
    rounded: "{rounded.standard-tag}"
    padding: "1px 9px"
  tab:
    backgroundColor: "{colors.bus-surface}"
    textColor: "{colors.bus-ink-2}"
    rounded: "{rounded.bus-capsule}"
    height: "28px"
    padding: "0 12px"
  agenda-row-late:
    backgroundColor: "{colors.bus-late-bg}"
    textColor: "{colors.bus-ink}"
  theme-card-selected:
    backgroundColor: "{colors.standard-surface}"
    textColor: "{colors.standard-ink}"
    rounded: "{rounded.standard-plate}"
    padding: "12px"
  check:
    backgroundColor: "{colors.bus-surface}"
    rounded: "{rounded.check}"
    size: "22px"
---

# Design System: malplan

## Overview

**Creative North Star: "One Board, Three Liveries"**

malplan is a single planning board that the user can repaint. The shell is fixed: a top bar dominated by the sentence input, Today as the wide lead column, the week above the month on the right. Each theme is a livery painted on that same chassis, and a livery may change only four things: type, palette, density, and one signature move. Bus (버스 안내판, the default) is a Seoul bus arrival board: navy route band, route-family category colours, capsule tags, one reversed arrival plate. Desk (탁상달력) is a bank desk calendar: warm paper ground, huge condensed numerals, red Sundays and holidays, index tabs hanging off the month frame. Standard (기본) is a neutral calendar: cool greys, one blue accent, soft tinted tags.

The board is built for a glance from an always-on window. Density is medium: rows sit at 8–10px vertical padding, panes are separated by a 14px gutter, and nothing decorates for its own sake. Information hierarchy comes from the numerals, the plate and row state, not from ornament. Every theme keeps the panes flat on a tinted ground; the only lifted surface is the unfolded crowded-day list.

**Key Characteristics:**
- One shell, three liveries switched by `data-theme` on the root element; the choice is saved to local storage and defaults to bus.
- Today leads; the next-up plate is the single loudest object on screen.
- Category colour arrives only through palette slots 0–6, never as ad-hoc hex.
- Kind is shown by the mark (task = square checkbox, event = dot), state by the row (late, past, done).
- Dates and times are set in tabular numerals; desk scales them into the dominant visual.

## Colors

Each theme defines the same role vocabulary (ground, two surfaces, three inks, line, accent, red/blue calendar tones, late pair, plate trio, category slots), so components bind roles and never theme-specific values.

### Primary
- **Route Blue** (bus-accent): bus accent, today marker, focus ring and 간선 (trunk) category. The colour of Seoul's trunk buses.
- **Calendar Red** (desk-accent-red): desk accent; also its Sunday/holiday tone, plate top rule and today ring. On desk the accent and the red tone are the same ink by design: a printed desk calendar has one spot colour.
- **Interface Blue** (standard-accent): standard accent, today marker and focus.

### Secondary
- **Arrival Amber** (bus-plate-when): the "N분 후" countdown on the bus plate, the bus submit button and the active theme option. Only appears on the navy band and plate.
- **Plate trio** (bus-plate-bg / bus-plate-ink; standard-plate-bg / standard-plate-ink / standard-plate-when): bus reverses the plate to navy-on-white; standard tints it pale blue with a deep navy ink; desk keeps the plate on paper (desk-surface) with a red top rule.

### Tertiary: category slots
- **Slot 0** (cat-0) is the theme's neutral ink and colours the default 전체 tab and uncategorised items.
- **Bus slots 1–6** are Seoul bus route families: 1 간선 trunk blue, 2 지선 branch green, 3 광역 express red, 4 순환 circular yellow, 5 심야 night navy, 6 공항 airport teal. Slot 4 is the only light slot and takes a dark ink (bus-cat-ink-4) instead of white.
- **Desk slots 1–6** are the same six hue families muted toward printed inks (blue, green, brick, ochre, violet, teal) so they sit on paper.
- **Standard slots 1–6** are the same families at clean UI saturation.

### Neutral
- **Ground** (bg): the page behind the panes: blue-grey on bus, warm card stock on desk, cool grey on standard.
- **Surface / Surface 2** (surface, surface-2): pane fill / hover, selected day and count chip.
- **Ink 1–3** (ink, ink-2, ink-3): primary text / secondary text and controls / tertiary, placeholders, past and done items.
- **Line** (line): every hairline: pane borders, grid rules, row dividers.
- **Late pair** (late, late-bg): amber text and wash for an unfinished task whose time has passed; also overdue dates in the side list.

### Named Rules
**The Route Colour Rule.** Category colour comes only from slots `--cat-0`…`--cat-6`, applied through a slot class that sets the local colour and its ink. Never write a category hex into a component. The slot index is stable across themes, so a category keeps its meaning when the livery changes.

**The Calendar Tone Rule.** Red marks Sundays, public holidays and the now line; blue marks Saturdays. On bus and standard, the red tone is used only for these calendar meanings (the red category slot is a separate token). Desk is the exception: its accent is the same Calendar Red, so its today ring and plate top rule are red as well. No theme uses red for errors.

**The Same Roles Rule.** A new theme must fill every role token the three existing themes define. A theme that needs a new role has to add it to all three.

## Typography

**UI Font:** Malgun Gothic (with 맑은 고딕, system-ui, sans-serif); standard puts Segoe UI first.
**Numeral Font:** Bahnschrift (with Malgun Gothic) on bus and desk; Segoe UI on standard.

**Character:** A plain Korean UI face carries all the words; a separate numeral face carries every date, time and count, so numbers read like a timetable or a printed calendar. These are installed Windows faces standing in for the intended self-hosted faces (see Open Items); the roles are settled, the families are not.

### Hierarchy
- **Display** (the Today date numeral): bus 46px/700, desk 96px/700 condensed at -0.04em, standard 40px/600; line-height 0.9. It is the biggest type on the board in every theme.
- **Plate When** (700, 28px; 32px on bus): the countdown or date on the next-up plate, in the plate-when colour.
- **Headline** (700, 16px): pane titles and the plate title; desk raises the month title to 22px.
- **Title** (400, 15px): agenda row titles and the sentence input.
- **Body** (400, 14px, 1.5): base text.
- **Label** (400, 13px): times, pane ranges, tabs, text buttons, theme options, input preview.
- **Cell** (400, 12px, 1.35): week and month item lines, category tags (700), weekday headers; 11px for item times, holiday names and "+n" overflow.
- **Calendar numerals**: week dates 20px/600 (desk 32px/700 condensed), month days 14px/600 (desk 32px/700 condensed; 22px when docked).

### Named Rules
**The Tabular Numeral Rule.** Every date, time, count and countdown uses the numeral face with tabular figures, so columns of times line up and countdowns don't jitter.

**The Numeral Leads Rule.** On desk the numerals are the visual: they are scaled and condensed, and month cells show two items instead of three so the numbers keep the room.

## Layout

The board fills the window as a fixed-height app shell: a top bar, then a two-column board with 20px outer padding and a 14px gutter. The left column (minimum 340px, 2fr) is Today; the right column (3fr) stacks Week (0.8fr) over Month (1.2fr). Panes scroll internally, so the window never scrolls at desktop sizes.

The top bar is a three-part grid: brand, the sentence input (dominant, max 760px, with a live parse preview line underneath), and a 42px settings (gear) button. On bus the whole top bar becomes the navy route band.

Inside panes: 16px horizontal inset, headers at 14px/16px/10px. The agenda row is a four-column grid (76px time, title, tag, check). Week and month are 7-column grids with hairline rules, starting on Sunday.

**900px and below:** the shell stops being fixed-height and the page scrolls. The board becomes one column in story order (Today, Week, Month), the week grid keeps at least 220px and month rows at least 76px.

**600px and below (docked window):** the top bar becomes brand + gear on one row with the sentence input full-width below, 16px padding. The week turns into a stacked day list (64px date column, items beside it, empty days dimmed). Month tabs drop below the title so the arrows stay on the title row; month cells show only item marks (titles and "+n" hidden), and the agenda time column narrows to 62px.

### Named Rules
**The Today Leads Rule.** Today is always first, in the wide column on desktop and on top when stacked. Week and month support it; they never displace it.

**The Same Shell Rule.** Themes don't move panes, change the grid, or add regions. Only type, palette, density (row padding, cell capacity) and one signature move differ.

## Elevation & Depth

The board is flat. Panes sit on a tinted ground and are separated by a 1px line and tone alone. Depth signals state or structure, never decoration.

### Shadow Vocabulary
- **Unfolded day** (0 8px 24px of ink at 16%): the full item list that unfolds over a crowded month cell when it takes focus. This is the only lifted surface.
- **Tab band** (an inset 3px top band in the tab colour; 4px on desk): the coloured top edge of the month frame. This is a structural band, not a lift.
- **Desk today ring** (an inset 2px red ring): desk marks today with a printed outline instead of a filled chip.

### Named Rules
**The Flat Board Rule.** Panes, plates, tags and rows never cast shadows. If something needs to stand out, use tone, the plate, or the tab band.

## Shapes

Corner language is one of the four livery levers. Each theme sets two radii: a small control radius and a pane radius.
- **Bus:** capsules (999px) for tags, tabs and the today marker, which read as route-number badges; panes at 14px.
- **Desk:** nearly square, like printed paper (3px tags, 4px panes). Month tabs hang from the frame with only their bottom corners rounded (6px); desk tags are outlined, not filled.
- **Standard:** gentle 6px tags and 10px panes.
- **Shared:** the plate radius is the pane radius minus 4px; icon and text buttons use 8px; the task checkbox uses 6px; theme cards use the plate radius. Hairlines are always 1px; the checkbox border is 1.5px; done strikethrough is 2px.

## Components

### Sentence Input (top bar)
The one input that matters, and the widest thing in the top bar.
- **Shape:** 42px tall, pane radius on the outer corners, fused to a 46px square submit button on the right.
- **Colour:** surface fill, line border, 15px text, accent caret. On bus the border goes transparent on the navy band and the submit turns Arrival Amber with dark ink.
- **Focus:** the global 2px focus ring, drawn inset (-2px offset) so it stays inside the fused shape.
- **Preview:** a 13px ink-2 line under the input shows the live parse; it reserves 20px so the layout doesn't jump.

### Settings Dialog (theme choice)
Themes are chosen in settings, not on the board, so the top bar stays about the task. The gear button in the top bar opens it.
- **Shape:** native modal `<dialog>`, max 560px wide, pane radius, 1px line border, the one modal shadow (0 16px 48px of ink at 22%) over a 35% ink backdrop.
- **Theme cards:** a 3-column radio group (one column at 600px and below). Each card shows a 4-colour swatch strip, the theme name (700) and a 12px ink-3 description. Selected = accent border plus a 1px inset accent ring; keyboard focus draws the global focus ring around the card.
- **Behaviour:** the choice applies at once and is saved; Escape or the close button dismisses.

### Next-up Plate (signature)
The single loudest object on the board: what is next and how long until it.
- **Structure:** a two-column grid. The countdown ("40분 후", "내일", or a short date) spans both rows on the left; the category tag and title (700, 16px, single line with ellipsis) are on the right, with the time and place under them at 72% plate ink.
- **Bus:** reversed navy plate, amber countdown at 32px, 14px/18px padding: the arrival board.
- **Desk:** a paper plate with a hairline border and a 3px red top rule, red countdown: a tear-off sheet.
- **Standard:** a pale blue tint with a deep navy title and a blue countdown.
- Shown only when viewing today and something is still ahead.

### Category Tag
- **Bus:** a filled capsule in the slot colour, 12px/700 with white ink (dark ink on slot 4): a route-number badge.
- **Desk:** outlined in the slot colour with slot-colour text at 600, 3px radius: a rubber-stamp mark.
- **Standard:** a 14% slot tint on surface, with text at 80% slot / 20% ink, 600.
- Past rows fade the tag to 60%, done rows to 45%.

### Item Marks (calendar cells)
**The Mark Says Kind Rule.** In week and month cells a task is a 12px square checkbox outline (checked when done) and an event is a 7px dot, both in the category colour. The mark is the only kind signal in cells; no text labels.

### Agenda Row (Today)
- **Structure:** time (13px ink-2; on bus 15px/600 ink in the numeral face), title (15px) with an optional 12px place line, tag, and a 22px checkbox for tasks only. Events have no checkbox.
- **Order:** untimed items (미정, 아무때나, slots) first, an 8px gap, then timed items, with the red "지금" now line inserted at the current minute.

**The Row Carries State Rule.** State is shown by row style, never by an extra badge: a **late** task gets the amber wash and a bold amber time; a **past** event drops to ink-3; a **done** item gets a 2px strikethrough in ink-3 with its tag at 45%. In week and month cells, done is a strikethrough in ink-3.

### Checkbox
- **Style:** 22px square, 6px radius, 1.5px ink-3 border on surface.
- **Checked:** an ink-2 fill with a surface-colour check icon (14px, stroke 3).

### Pane Header & Navigation
- **Style:** title (16px/700) on the left; previous/next 30px icon buttons (18px chevrons) on the right, and a "오늘로 / 이번 주로 / 이번 달로" text button that appears only when the pane has moved away from the current period.
- **Hover:** surface-2 fill, ink text, 160ms colour transition.

### Month Tabs and Tab Frame (signature)
**The Frame Follows Tab Rule.** The selected tab fills with its category colour, and the whole month pane takes that colour as an inset top band with its border mixed 55% toward it. The default 전체 tab uses slot 0 (neutral ink). A tab's colour is the colour of its first category.
- **Tabs:** 28px tall, 13px, 1px line border on surface, theme radius; selected is the slot fill, slot ink, 700.
- **Desk:** tabs hang from the frame's top band (pulled up 15px, no top border, bottom corners rounded 6px), like index tabs on a desk calendar. When docked they return to ordinary rounded tabs below the title.

### Week and Month Grids
- **Week:** 7 columns with hairline rules. Head: weekday (12px) plus date numeral, toned red on Sunday or a holiday and blue on Saturday. Today's date sits on an accent chip (bus capsule, standard rounded square; desk uses the red ring). The selected day takes surface-2. Up to the visible limit, items show mark, start time and a two-line title, then "+n".
- **Month:** hairline cell grid with weekday headers, three items per cell (two on desk) and "+n". Outside days drop to ink-3. Hover and selection take surface-2. Focusing a crowded cell unfolds its full list in place (the only shadowed surface).

## Do's and Don'ts

### Do:
- **Do** bind every colour to a role token on the active theme; a new component must render correctly in bus, desk and standard without per-theme code unless it is that theme's signature move.
- **Do** colour categories only through slots 0–6, and keep bus slots mapped to Seoul route families (간선 blue, 지선 green, 광역 red, 순환 yellow, 심야 navy, 공항 teal).
- **Do** set every date, time and count in the numeral face with tabular figures.
- **Do** show task vs event by the mark (square checkbox vs dot) and late/past/done by row style.
- **Do** keep red for Sundays, holidays and the now line (plus the accent on desk), and blue for Saturdays.
- **Do** keep Today first in both the desktop layout and the ≤900px stack.

### Don't:
- **Don't** let a theme change layout, pane order or grid structure; themes change type, palette, density and one signature move only.
- **Don't** add a second plate or reversed block; the next-up plate is the only one.
- **Don't** add shadows to panes, plates, tags or rows; the unfolded crowded-day list is the only lifted surface.
- **Don't** add status badges or labels for late/done; the row style carries state.
- **Don't** fill desk tags or round them into capsules; desk tags are outlined at 3px. Capsules belong to bus.
- **Don't** use red for errors or general emphasis. It means a Sunday, a holiday or now, plus the accent on desk only.

## Open Items
- **Dark and high-contrast themes:** not built. PRODUCT.md commits to a high-contrast theme and user-adjustable text size. Both must fill the full role vocabulary above.
- **Self-hosted fonts:** pending download approval (Seoul Namsan for bus, a condensed numeral face for desk). Malgun Gothic, Bahnschrift and Segoe UI are installed-system stand-ins, not the decided faces.
- **Lunar dates:** not yet computed; intended for the desk theme's date cells.
