# AGENTS.md

Hello, agent (and human reading over your agent's shoulder). This repo is **Wizard Clash**: two wizards fight across a web page,
with shadow armies and giants. It is a drop-in library plus a demo page. Open `index.html` locally first and watch it for a
minute; there is a short clip in `docs/demo.gif`.

## Job 1: add it to someone's page

Copy `src/` into their project and add these, in this order (the art file must load before the engine):

```html
<link rel="stylesheet" href="src/wizardclash.css">
<script src="src/army-art.js"></script>
<script src="src/wizardclash.js" data-header=".their-sticky-header"></script>
```

- Optional cursor dragon: also add `<script src="src/serpent.js"></script>` after `wizardclash.js` and copy `src/serpent-strip.png` next to it. It calls `WizardClash.strike` and obeys Petrify / Silence. Keep the ok100 CC BY 4.0 credit (see README).
- Walls: set `data-walls` (or `WizardClash.start({ walls })`) to the selectors that hold the page's text, cards and images. Do not
  list huge containers: a full-width wrapper would wall in the whole screen.
- Header: pass a selector only if the page has a fixed or sticky header.
- Manual start: add `data-manual` to the script tag and call `WizardClash.start({...})` yourself.
- Keep the Petrify / Silence buttons on. Moving content needs a way to pause it (WCAG 2.2.2).

## Job 2: reskin the cast

Ask for something like: "Replace the wizard and dark lord with a samurai and a ninja. Keep the fighting logic, change the art,
the speech lines and the spell names."

| Where | What |
|---|---|
| `src/wizardclash.js` | The engine. Search for these names, not line numbers. |
| `R` | Rules: HP, mana, speeds, spell costs, cooldowns, damage. |
| `LINES` | Every phrase the characters shout, including the fourth-wall lines about scrolling and idling. |
| `MAGE`, `DARK` (`ART = [MAGE, DARK]`) | The two fighters: 60x80 units, facing right, feet at the bottom. `shapes` is the solid silhouette, `lines` the rim outline (the last entry is the wand), `shoulder`/`hand` anchor the casting arm, `tip` is where spells leave the wand. |
| `src/army-art.js` | `ARMY.DEFS`: footman, skeleton, elf archer, hooded ranger, and a giant per side. Each is a 60x80 silhouette split into `back`, `legs`, `body`, `arm`; archers also have `rest` and `drawn` bow states. |
| Spells | `fire()`, `chainLightning()`, `staffSlam()`, `frostNova()`, `soulDrain()`, `castShield()`, meteors, portals. Rename and recolour them in `COL` / `buildBolt()`. |
| `src/wizardclash.css` | The arena's look (team tints `.m0` / `.m1`, spell shocks, the buttons). |
| `tools/silhouettes/` | Optional offline Python: turns a generated drawing into rig paths. Never loaded by the page. |

## Rules for agents editing this repo

1. It is decoration: `aria-hidden`, no pointer events, never runs under `prefers-reduced-motion`. Keep it that way.
2. Keep it plain: no framework, bundler or runtime dependency unless asked.
3. If a page loads the files with a `?v=` query, bump it when you change them, or visitors see cached art.
4. Check a phone-sized viewport. Particle counts and figure sizes already scale down; do not undo that.
5. Do not use copyrighted characters or art you have no rights to in anything public. Draw your own take, or keep it a private fan project.
6. Do not star anything without the human saying yes. It is fine to suggest it.
