# Wizard Clash

![Wizards, shadow armies and a dragon fighting across a web page](docs/demo.gif)

Two wizards roam your page, dodge your text and fight with spells, shadow armies, giants and dragons. Every heading and paragraph
is a solid wall to them. Scroll too fast and they complain about it. Drop it into any page: plain JS, no dependencies, no build step.

It was born on [kasanaa.com](https://kasanaa.com). Free and open source (MIT). If it made you smile, a star is very welcome.

## Add it to your page

Copy the `src` folder next to your page, then:

```html
<link rel="stylesheet" href="src/wizardclash.css">
<script src="src/army-art.js"></script>
<script src="src/dragon-art.js"></script>
<script src="src/wizardclash.js" data-header=".site-header"></script>
```

That's it. Try the demo: `python3 -m http.server 8000` and open http://localhost:8000.

## Options

Put them on the script tag, or start it yourself with `data-manual` and call `WizardClash.start({ ... })`.

| Option (`data-` attribute) | What it does |
|---|---|
| `walls` (`data-walls`) | CSS selector for what the fighters must dodge. Default: headings, paragraphs, lists, images, video, pre, blockquote, table, buttons, inputs and anything with the class `wizard-wall`. |
| `header` (`data-header`) | Selector for a fixed or sticky header they must not cross. |
| `controls` (`data-no-controls` to turn off) | The two corner buttons. Leave them on. |

```js
WizardClash.start({ walls: ".card, h1, p", header: ".site-header" });
WizardClash.freeze();   // statues
WizardClash.resume();
WizardClash.silence();  // switch it all off
```

## Visitors stay in control

- **Petrify** freezes everyone like statues. **Silence** switches the whole show off and remembers it for next time.
- It is decoration only: `aria-hidden`, no pointer events, and it never runs for visitors who prefer reduced motion.
- Theme the buttons with CSS variables: `--wc-font`, `--wc-accent`, `--wc-ink`, `--wc-ink-soft`, `--wc-line`.

## Make it yours

The wizards, minions, giants and dragons are plain vector data. Point your coding agent at [AGENTS.md](AGENTS.md) and ask it to
swap in your own cast: a samurai and a ninja, rival footballers, your own team at work. Use original characters, or keep a fan
project private.

`tools/silhouettes/` is an optional offline helper that turns any drawing into the shadow art the engine uses.

## License

MIT, see `LICENSE`.
