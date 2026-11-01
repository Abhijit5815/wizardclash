/*!
 * Wizard Clash: two wizards roam your page, dodge your text and fight with spells, shadow armies, giants and dragons.
 * MIT licensed. Needs army-art.js and dragon-art.js loaded first. Plain JS, no dependencies, no build step.
 * Decoration only: aria-hidden, no pointer events, and it never runs under prefers-reduced-motion.
 */
// --- Visitor control. "Petrify" freezes the whole show where it stands, like statues; "Silence" switches it off and clears it away.
// The arena subscribes, so the page text is never touched. Under reduced motion there is no show, so no buttons.
// Only Silence is remembered between visits: a frozen frame needs the show to have run first so there is something to freeze.
const Show = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, subs = [];
  let mode = "run";
  try { if (localStorage.getItem("show") === "off") mode = "off"; } catch {}
  const bar = document.createElement("div");
  bar.className = "show-controls";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Background show");
  bar.innerHTML = '<button type="button" data-do="freeze" title="Freeze everyone like statues"></button><button type="button" data-do="off" title="Switch the whole show off"></button>';
  const [bFreeze, bOff] = bar.children;
  const paint = () => {
    document.body.dataset.show = mode;
    bFreeze.textContent = mode === "freeze" ? "Awaken" : "Petrify";
    bFreeze.setAttribute("aria-pressed", String(mode === "freeze"));
    bFreeze.disabled = mode === "off";
    bOff.textContent = mode === "off" ? "Summon" : "Silence";
    bOff.setAttribute("aria-pressed", String(mode === "off"));
  };
  const set = (m) => {
    mode = m;
    try { localStorage.setItem("show", m === "off" ? "off" : "on"); } catch {}
    paint();
    subs.forEach((f) => f(mode));
  };
  bFreeze.addEventListener("click", () => set(mode === "freeze" ? "run" : "freeze"));
  bOff.addEventListener("click", () => set(mode === "off" ? "run" : "off"));
  return {
    get mode() { return mode; },
    on(fn) { subs.push(fn); fn(mode); },
    mount(controls) { if (controls && !reduced) document.body.appendChild(bar); paint(); },
    set,
  };
})();

// --- Wizard duel: two pencil-sketch wizards roam the whole viewport and fight.
// Every visible element matching the `walls` selector is a solid wall: it blocks movement, sight
// and spells. Pure decoration: aria-hidden, no pointer events, and it does not
// run at all under reduced motion.
function boot(opts) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const NS = "http://www.w3.org/2000/svg";
  let svg = document.getElementById("arena");
  if (!svg) {
    svg = document.createElementNS(NS, "svg");
    svg.id = "arena";
    svg.setAttribute("aria-hidden", "true");
    document.body.appendChild(svg);
  }
  const nav = opts.header ? document.querySelector(opts.header) : null;   // a fixed header the fighters must not cross
  Show.mount(opts.controls);

  // The rules. Speeds are px per frame at 60fps; times are in seconds.
  const R = {
    hp: 130, mp: 100, mpRegen: 10,
    wanderSpeed: 1.5, chaseSpeed: 3, fleeSpeed: 4,
    sense: 320,                                   // knows where the foe is inside this radius, walls or not
    basic: { cost: 3, dmg: 15, speed: 8 },                    // wand flick: orange, white or blue
    major: { cost: 35, dmg: 46, speed: 5.5, chance: 0.7, boost: 1 / 15, boostDmg: 65 },   // emerald or crimson, 2x size; rarely boosted
    bolt: { cooldown: 1, range: 380, life: 3, counter: 0.5, spread: 12 },
    mirror: { cost: 40, life: 8 },                // two bodyguard clones that block shots
    rest: { below: 30, until: 70, regen: 2, fleeFor: 6, patience: 4 },   // past patience: enraged, back to the fight
    stuck: { window: 3, minTravel: 10, blink: 150 },
    rally: 6, enrage: 3, death: 3, respawn: 2,   // respawn counts from when the dust settles
    poke: { clicks: 3, within: 2, hold: 2.5 },
    bubble: { every: [10, 15], rise: 0.6, r: 11, reach: 200, contest: 150 },
    talk: { for: 2 },
    horde: { cost: 50, cooldown: 22, first: [3, 6], count: [5, 7], cast: 1.7, leap: 0.9, stagger: 0.09 },   // Summon Horde
    shield: { cost: 20, cooldown: 7, life: 2.5, hp: 60 },                  // rune bubble that eats spells
    chain: { cost: 25, cooldown: 5, jumps: 5, range: 140, dmg: 18 },        // lightning that jumps minion to minion
    slam: { cost: 20, cooldown: 6, radius: 170, dmg: 24 },                  // staff slam shockwave when surrounded
    frost: { cost: 30, cooldown: 10, radius: 150, life: 3, slow: 0.4, dmg: 6 },   // the good wizard's frost nova: a ring of ice that leaves enemies crawling
    drain: { cost: 30, cooldown: 8, jumps: 3, range: 170, dmg: 18, heal: 9 },     // the dark lord's soul drain: beams that bleed minions and heal him
    rally: { cost: 30, cooldown: 15, life: 4 },                             // the good wizard's heal and haste cry
    meteor: { cost: 60, cooldown: 40, count: 6 },
    giant: { cost: 60, cooldown: 50, hp: 220, dmg: 22, windup: 0.55 },   // a long, readable raise before the slam
    portal: { cost: 15, cooldown: 9 },
    raise: { cost: 30, cooldown: 12, max: 3 },                              // the dark lord stands the fallen back up
    archer: { range: 210, flee: 80, windup: 0.4, cd: 1.5, dmg: 8, wizDmg: 5, speed: 9 },      // elf archers: ranged, they kite and shoot on an arc
    minion: { sense: 300, search: 280, hp: 26, dmg: 7, wizDmg: 6, speed: 3.5, accel: 0.25, knock: 3.2, reach: 5, windup: 0.22, swing: 0.9, gravity: 0.3 },
  };
  // Phones shrink the figures, so speeds and ranges (px) shrink with them or a duel crosses the screen in a blink.
  const R0 = structuredClone(R);
  const SCALED = [["wanderSpeed"], ["chaseSpeed"], ["fleeSpeed"], ["sense"], ["basic", "speed"], ["major", "speed"], ["bolt", "range"],
    ["archer", "range"], ["archer", "flee"], ["archer", "speed"], ["minion", "sense"], ["minion", "search"], ["minion", "speed"],
    ["bubble", "reach"], ["chain", "range"], ["slam", "radius"], ["frost", "radius"], ["drain", "range"], ["stuck", "blink"]];
  const LINES = {
    start: ["Yield, fool!", "Your magic is weak!"],
    ultimate: ["Expelliarmus!", "Avada Kedavra!"], // shouted with a boosted major: archmage, dark lord
    poked: ["Do you mind?!", "Can't you see I'm busy?!", "Stop poking me!"],
    cheated: ["Hey! No fair!"],
    death: ["Not like this...", "My magic fades...", "I will return..."],
    chain: ["Feel the storm!"],
    frost: ["Winter comes!", "Freeze!"],
    drain: ["Your souls are mine!", "Feed me!"],
    // The fourth wall: they notice what the visitor is doing.
    squashed: ["Hey! Your scrolling just buried me!", "Mind the text, I was standing there!", "You squashed me, mortal!"],
    fast: ["Too fast! I'm mid-duel!", "Slow down, I need to fight!", "Easy on the wheel, mortal!", "Stop spinning the world!"],
    blocked: ["You're blocking me! Scroll further!", "The text is in my way. Scroll on!", "Move the page, I can't get through!"],
    idle: ["Still there, mortal?", "Hello? Did you fall asleep?", "Scroll, you coward!", "Is anyone watching this?"],
    back: ["Oh, you're back!", "Where did you go?!", "Finally. We were getting bored."],
    resized: ["Did you just shrink reality?!", "The walls moved!", "What have you done to the world?!"],
    slam: ["You shall not pass!", "Back, all of you!"],
    rally: ["For the realm!"],
    meteor: ["Let the sky fall!", "Rain, fire!"],
    giant: ["Awaken, ancient one!", "Rise, destroyer!"],
    raise: ["Arise, fallen!", "Death is only the beginning!"],
    summon: ["By the old oaths, arise!", "Rise, my wretched horde!"],
    victory: ["Too easy.", "Dust to dust.", "I am the supreme Artificer!"],
  };
  const alive = (w) => w.state !== "DEAD" && w.state !== "DEATH_ANIMATION";


  // ---------------------------------------------------------------------------
  // Art: 60x80 units, facing right, feet at the bottom. Every stroke is drawn
  // twice (a firm line plus a faint offset one) and the whole figure runs through
  // a displacement filter, so it reads as graphite rather than vector.
  // ---------------------------------------------------------------------------
  // The good wizard: solid shadow traced from a generated image; the wand is the last line so it can swing.
  const MAGE = {
    tip: [49.2, 32.1], shoulder: [35, 29], hand: [41.2, 42.1], fill: "light", cape: [22.7, 27.6, "M0 0 Q-12 22 -17 49 L-8 49 Q-6 36 -3 30"],
    shapes: ["M30.8 79.0 L27.6 78.9 L26.4 77.7 L24.5 77.4 L18.9 77.5 L18.1 77.2 L17.8 76.7 L18.0 75.7 L19.2 75.0 L18.9 73.2 L20.3 53.1 L19.2 50.1 L17.6 48.2 L17.3 46.1 L18.0 44.0 L17.3 42.1 L20.6 33.1 L21.9 26.3 L22.9 24.0 L22.7 20.7 L23.4 18.7 L24.3 17.5 L24.1 16.5 L24.5 15.8 L24.6 14.2 L21.9 11.8 L21.3 10.4 L21.7 9.9 L22.6 9.7 L25.8 9.6 L32.2 0.6 L33.1 -0.0 L33.5 0.3 L33.6 4.0 L33.3 5.0 L33.3 8.0 L32.9 9.0 L33.1 10.6 L33.0 12.4 L36.7 15.3 L36.7 16.0 L35.5 16.6 L35.0 17.3 L35.8 18.0 L37.0 18.1 L37.9 18.7 L38.2 20.5 L39.3 22.0 L39.4 23.5 L38.6 24.7 L38.5 25.3 L41.3 35.7 L40.9 46.6 L39.5 53.2 L42.3 69.6 L43.4 73.7 L44.4 74.7 L46.2 75.6 L46.7 76.1 L46.7 76.5 L45.6 77.3 L43.0 77.5 L40.1 78.4 L33.8 78.1Z"],
    lines: [
      "M30.8 79.0 L27.6 78.9 L26.4 77.7 L24.5 77.4 L18.9 77.5 L18.1 77.2 L17.8 76.7 L18.0 75.7 L19.2 75.0 L18.9 73.2 L20.3 53.1 L19.2 50.1 L17.6 48.2 L17.3 46.1 L18.0 44.0 L17.3 42.1 L20.6 33.1 L21.9 26.3 L22.9 24.0 L22.7 20.7 L23.4 18.7 L24.3 17.5 L24.1 16.5 L24.5 15.8 L24.6 14.2 L21.9 11.8 L21.3 10.4 L21.7 9.9 L22.6 9.7 L25.8 9.6 L32.2 0.6 L33.1 -0.0 L33.5 0.3 L33.6 4.0 L33.3 5.0 L33.3 8.0 L32.9 9.0 L33.1 10.6 L33.0 12.4 L36.7 15.3 L36.7 16.0 L35.5 16.6 L35.0 17.3 L35.8 18.0 L37.0 18.1 L37.9 18.7 L38.2 20.5 L39.3 22.0 L39.4 23.5 L38.6 24.7 L38.5 25.3 L41.3 35.7 L40.9 46.6 L39.5 53.2 L42.3 69.6 L43.4 73.7 L44.4 74.7 L46.2 75.6 L46.7 76.1 L46.7 76.5 L45.6 77.3 L43.0 77.5 L40.1 78.4 L33.8 78.1Z",   // rim
      "M41.2 42.1 L49.2 32.1",   // wand, always last
    ],
  };
  // The dark lord, traced the same way.
  const DARK = {
    tip: [52.2, 34.6], shoulder: [37, 28], hand: [44.2, 44.6], fill: "dark", cape: [20.3, 27.6, "M0 0 Q-14 18 -22 42 L-15 38 L-17 48 L-9 42"],
    shapes: ["M27.2 79.0 L23.0 78.8 L22.6 78.2 L22.9 75.7 L22.5 75.3 L21.2 75.6 L20.4 76.9 L19.7 77.0 L17.9 76.6 L15.8 76.7 L13.9 75.8 L12.5 75.8 L12.2 75.2 L14.2 73.9 L15.2 73.8 L16.3 72.3 L17.5 72.4 L18.1 72.0 L19.5 63.9 L19.4 63.2 L18.4 62.0 L17.5 62.2 L17.9 58.3 L17.3 58.1 L16.8 58.9 L16.1 58.6 L18.6 36.9 L18.6 35.8 L17.9 35.0 L18.5 33.4 L17.7 31.3 L18.4 30.7 L19.1 29.0 L19.4 26.7 L19.3 26.3 L18.6 25.6 L18.9 24.4 L18.9 23.9 L18.3 23.1 L18.6 21.8 L18.2 21.3 L17.2 21.2 L17.0 20.9 L18.5 20.1 L19.2 19.4 L19.6 18.3 L17.6 16.2 L20.6 17.0 L21.3 16.2 L20.7 14.0 L21.1 13.9 L22.3 15.3 L22.7 15.3 L23.9 13.2 L23.8 11.1 L24.2 10.8 L27.8 10.7 L28.3 10.3 L28.4 8.3 L27.9 7.7 L28.2 6.7 L27.7 6.2 L28.0 5.2 L27.1 4.0 L26.9 2.7 L27.3 1.8 L29.2 -0.0 L29.2 0.8 L28.5 2.4 L29.4 3.5 L30.5 4.1 L31.5 4.1 L32.3 3.4 L33.1 4.0 L33.7 4.0 L34.6 3.1 L34.9 4.3 L35.4 4.6 L35.7 4.6 L36.5 3.5 L35.5 1.5 L35.8 0.7 L36.2 1.4 L37.7 2.9 L38.2 3.9 L38.2 4.9 L36.9 6.9 L36.8 7.5 L36.2 8.1 L36.2 10.6 L35.4 11.8 L35.4 12.3 L37.7 14.3 L37.8 15.2 L37.6 16.3 L38.2 17.0 L38.9 17.3 L40.3 16.2 L39.8 18.4 L40.5 19.1 L42.2 18.8 L40.9 20.3 L42.0 23.2 L41.1 23.9 L41.5 26.3 L40.7 27.0 L40.6 28.1 L41.0 29.4 L41.0 31.0 L41.6 31.8 L42.6 31.6 L42.4 35.1 L43.4 40.4 L44.1 41.2 L43.7 42.4 L44.3 44.6 L43.2 46.6 L42.1 47.3 L41.7 47.3 L41.2 46.6 L40.6 47.0 L42.4 70.8 L41.6 71.9 L41.0 71.2 L40.6 71.2 L40.1 71.7 L39.5 71.6 L39.2 72.2 L40.6 73.8 L42.1 74.8 L43.2 74.9 L45.0 74.4 L45.2 74.8 L44.2 76.8 L42.7 77.2 L39.5 77.1 L37.7 76.4 L36.8 76.6 L34.7 76.5 L34.3 76.2 L34.1 75.2 L34.3 73.1 L33.9 72.5 L33.4 72.4 L32.2 73.8 L30.8 73.4 L30.1 73.5 L29.0 74.4 L27.7 74.9 L27.6 75.6 L28.3 78.5 L28.0 78.9Z"],
    lines: [
      "M27.2 79.0 L23.0 78.8 L22.6 78.2 L22.9 75.7 L22.5 75.3 L21.2 75.6 L20.4 76.9 L19.7 77.0 L17.9 76.6 L15.8 76.7 L13.9 75.8 L12.5 75.8 L12.2 75.2 L14.2 73.9 L15.2 73.8 L16.3 72.3 L17.5 72.4 L18.1 72.0 L19.5 63.9 L19.4 63.2 L18.4 62.0 L17.5 62.2 L17.9 58.3 L17.3 58.1 L16.8 58.9 L16.1 58.6 L18.6 36.9 L18.6 35.8 L17.9 35.0 L18.5 33.4 L17.7 31.3 L18.4 30.7 L19.1 29.0 L19.4 26.7 L19.3 26.3 L18.6 25.6 L18.9 24.4 L18.9 23.9 L18.3 23.1 L18.6 21.8 L18.2 21.3 L17.2 21.2 L17.0 20.9 L18.5 20.1 L19.2 19.4 L19.6 18.3 L17.6 16.2 L20.6 17.0 L21.3 16.2 L20.7 14.0 L21.1 13.9 L22.3 15.3 L22.7 15.3 L23.9 13.2 L23.8 11.1 L24.2 10.8 L27.8 10.7 L28.3 10.3 L28.4 8.3 L27.9 7.7 L28.2 6.7 L27.7 6.2 L28.0 5.2 L27.1 4.0 L26.9 2.7 L27.3 1.8 L29.2 -0.0 L29.2 0.8 L28.5 2.4 L29.4 3.5 L30.5 4.1 L31.5 4.1 L32.3 3.4 L33.1 4.0 L33.7 4.0 L34.6 3.1 L34.9 4.3 L35.4 4.6 L35.7 4.6 L36.5 3.5 L35.5 1.5 L35.8 0.7 L36.2 1.4 L37.7 2.9 L38.2 3.9 L38.2 4.9 L36.9 6.9 L36.8 7.5 L36.2 8.1 L36.2 10.6 L35.4 11.8 L35.4 12.3 L37.7 14.3 L37.8 15.2 L37.6 16.3 L38.2 17.0 L38.9 17.3 L40.3 16.2 L39.8 18.4 L40.5 19.1 L42.2 18.8 L40.9 20.3 L42.0 23.2 L41.1 23.9 L41.5 26.3 L40.7 27.0 L40.6 28.1 L41.0 29.4 L41.0 31.0 L41.6 31.8 L42.6 31.6 L42.4 35.1 L43.4 40.4 L44.1 41.2 L43.7 42.4 L44.3 44.6 L43.2 46.6 L42.1 47.3 L41.7 47.3 L41.2 46.6 L40.6 47.0 L42.4 70.8 L41.6 71.9 L41.0 71.2 L40.6 71.2 L40.1 71.7 L39.5 71.6 L39.2 72.2 L40.6 73.8 L42.1 74.8 L43.2 74.9 L45.0 74.4 L45.2 74.8 L44.2 76.8 L42.7 77.2 L39.5 77.1 L37.7 76.4 L36.8 76.6 L34.7 76.5 L34.3 76.2 L34.1 75.2 L34.3 73.1 L33.9 72.5 L33.4 72.4 L32.2 73.8 L30.8 73.4 L30.1 73.5 L29.0 74.4 L27.7 74.9 L27.6 75.6 L28.3 78.5 L28.0 78.9Z",   // rim
      "M44.2 44.6 L52.2 34.6",   // wand, always last
    ],
  };
  const ART = [MAGE, DARK];

  const ink = (list) =>
    list.map((d) => `<path class="ink" d="${d}"/><path class="ink ghost" d="${d}" transform="translate(.6 .4)"/>`).join("");
  // The casting arm: a sleeve from the shoulder to the hand, the hand and the wand, turned about the shoulder by --arm (set per frame in drawBody).
  const armG = (a) => {
    const [sx, sy] = a.shoulder, [hx, hy] = a.hand, dx = hx - sx, dy = hy - sy, L = Math.hypot(dx, dy), nx = (-dy / L) * 3.2, ny = (dx / L) * 3.2;
    const sleeve = `M${sx + nx} ${sy + ny} L${hx + nx * 0.7} ${hy + ny * 0.7} L${hx - nx * 0.7} ${hy - ny * 0.7} L${sx - nx} ${sy - ny}Z`;
    return `<g class="arm" style="transform:translate(${sx}px,${sy}px) rotate(var(--arm,0deg)) translate(${-sx}px,${-sy}px)"><path class="fill-${a.fill}" d="${sleeve}"/>`
      + `<circle class="fill-${a.fill}" cx="${hx}" cy="${hy}" r="2.2"/><g class="wand">${ink(a.lines.slice(-1))}</g></g>`;
  };
  const symbol = (id, a) => `<symbol id="${id}" viewBox="0 0 60 80" overflow="visible">
    ${(a.ghosts || []).map((d) => `<path class="fill-ghost" d="${d}"/>`).join("")}${a.shapes.map((d) => `<path class="fill-${a.fill}" d="${d}"/>`).join("")}${(a.hatch || []).map((d) => `<path class="hatch" d="${d}"/>`).join("")}
    <g transform="translate(${a.cape[0]} ${a.cape[1]})"><g>${ink([a.cape[2]])}
      <animateTransform attributeName="transform" type="skewX" values="-5;4;-5" dur="2.2s" repeatCount="indefinite"/></g></g>
    ${ink(a.lines.slice(0, -1))}${armG(a)}</symbol>`;   // the wand is always the last line
  const filters = [3, 11, 23].map((seed, k) => `<filter id="graphite${k}" x="-25%" y="-15%" width="150%" height="130%">
    <feTurbulence type="turbulence" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>`).join("");
  // Spell palettes: [body, white-hot]. Each school has its own look; see buildBolt().
  const COL = { p0: ["#2fd47a", "#c8ffe0"], p1: ["#e0243f", "#ffa0ae"], orange: ["#ff9a3c", "#ffe6b0"], white: ["#bcd8ff", "#ffffff"], blue: ["#6fb6ff", "#e2f1ff"], gold: ["#f2c94c", "#fff3c4"] };
  // Gradients for the minion illustrations (filled, shaded shapes rather than line doodles).
  const GR = { gBone: ["#f8f1de", "#b3a684"], gRust: ["#8d7058", "#3a2d25"], gSteel: ["#f4f7fb", "#7a8697"], gCloth: ["#52284f", "#150a1b"], gSkin: ["#fff4e2", "#eec7a0"],
    gRobe: ["#66e6a8", "#1b9560"], gHat: ["#47d890", "#136c47"], gWing: ["#f6fffb", "#7be8b6"], gGold: ["#fff2b8", "#d4a22a"], gBark: ["#9e784a", "#3a2814"],
    gLeaf: ["#86e475", "#27783a"], gDrag: ["#8a2a20", "#240806"], gBelly: ["#f6d48a", "#b9762c"], gMem: ["#d4482c", "#4e100c"], gDemon: ["#a52424", "#2a0505"], gFlame: ["#ffe680", "#ff4a1c"] };
  const grads = Object.entries(GR).map(([k, [a, b]]) => `<linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join("")
    + `<radialGradient id="gIris" cx=".4" cy=".35"><stop offset="0" stop-color="#a6f4ff"/><stop offset="1" stop-color="#1f6fa3"/></radialGradient>`;
  const halos = Object.entries(COL).map(([k, [c]]) => `<radialGradient id="halo-${k}"><stop offset="0" stop-color="${c}" stop-opacity=".7"/><stop offset=".45" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><linearGradient id="flare-${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".35" stop-color="${c}" stop-opacity=".55"/><stop offset=".5" stop-color="${COL[k][1]}" stop-opacity="1"/><stop offset=".65" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`).join("")
    + `<filter id="flameWarp" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence id="flameTurb" type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="1" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7"/></filter>`;
  svg.innerHTML = `<defs>${filters}${halos}${grads}<pattern id="hatch" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><line x1="0" y1="0" x2="0" y2="2.6" stroke="#d8d0c0" stroke-width=".55" stroke-opacity=".7"/></pattern><radialGradient id="portalDisc"><stop offset="0" stop-color="#140700"/><stop offset=".7" stop-color="#2a1204" stop-opacity=".92"/><stop offset="1" stop-color="#ff9a3c" stop-opacity=".55"/></radialGradient><radialGradient id="streakGlow"><stop offset="0" stop-color="#f2c94c" stop-opacity=".35"/><stop offset="1" stop-color="#f2c94c" stop-opacity="0"/></radialGradient>${[["#2fd47a"], ["#e0243f"]].map(([c], i) => `<radialGradient id="sigilGlow${i}"><stop offset="0" stop-color="${c}" stop-opacity=".5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><linearGradient id="pillar${i}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset=".6" stop-color="#fffaf0" stop-opacity=".25"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`).join("")}<filter id="dout" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius=".45" result="d"/><feFlood flood-color="#d6cfc2" flood-opacity=".75"/><feComposite in2="d" operator="in" result="o"/><feGaussianBlur in="o" stdDeviation=".3" result="ob"/><feMerge><feMergeNode in="ob"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>${symbol("mage", MAGE)}${symbol("dark", DARK)}</defs><g></g>`;
  const stage = svg.lastElementChild;
  // A second overlay blended with "screen": spells, sparks and flashes add light to the page instead of
  // painting over it, so a bolt actually lights up the text it passes. Same stylesheet via :is().
  const fxSvg = document.createElementNS(NS, "svg");
  fxSvg.id = "arenafx";
  fxSvg.setAttribute("aria-hidden", "true");
  const fxg = document.createElementNS(NS, "g");
  fxSvg.appendChild(fxg);
  svg.after(fxSvg);
  const flameTurb = svg.querySelector("#flameTurb");
  const el = (tag, attrs, parent = stage) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return parent.appendChild(n);
  };

  const ground = el("g", {}), crowd = el("g", {});   // rune circles, then minions, both under the wizards

  // Cinematic layer: letterbox bars slide in for big moments, and a colour flash on impacts.
  const cine = document.createElement("div");
  cine.id = "cine";
  cine.setAttribute("aria-hidden", "true");
  cine.innerHTML = "<i></i><i></i><b></b>";
  document.body.appendChild(cine);
  const flash = (color) => {
    cine.lastChild.style.setProperty("--flash", color);
    cine.lastChild.animate?.([{ opacity: 0 }, { opacity: 0.85, offset: 0.12 }, { opacity: 0 }], { duration: 700 });
  };
  const shake = (a, ms) => {
    const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ translate: k === 7 ? "0 0" : `${rand(-a, a).toFixed(0)}px ${rand(-a * 0.8, a * 0.8).toFixed(0)}px` }));
    for (const n of [document.querySelector("main"), svg, fxSvg]) n?.animate?.(frames, { duration: ms });
  };

  // ---------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  let size = 60, s = 0.75, top = 0, mh = 28, msc = 0.7;           // figure height (px), art scale, top of the arena
  let walls = [], wallsDirty = true;

  function readWalls() {
    wallsDirty = false;
    top = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
    walls = [];
    for (const n of document.querySelectorAll(opts.walls)) {
      const b = n.getBoundingClientRect();
      if (b.width < 1 || b.bottom < top || b.top > innerHeight) continue;
      walls.push({ l: b.left - 4, t: b.top - 4, r: b.right + 4, b: b.bottom + 4, el: n });
    }
  }

  // Liang-Barsky: does the segment (x0,y0)-(x1,y1) cross box w?
  function segHits(x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, x0 - w.l], [dx, w.r - x0], [-dy, y0 - w.t], [dy, w.b - y0]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  console.assert(segHits(0, 5, 20, 5, { l: 8, t: 0, r: 12, b: 10 }) && !segHits(0, 20, 20, 20, { l: 8, t: 0, r: 12, b: 10 }), "segHits");
  const sees = (a, b) => !walls.some((w) => segHits(a.x, a.y, b.x, b.y, w));

  const hitsWall = (x, y, r) => walls.some((w) => Math.hypot(x - clamp(x, w.l, w.r), y - clamp(y, w.t, w.b)) < r);
  const minY = () => top + size * 0.55, maxY = () => innerHeight - size * 0.5;
  const free = (x, y, r) => x >= r && x <= innerWidth - r && y >= minY() && y <= maxY() && !hitsWall(x, y, r);

  // First clear spot on a ring of radius d around (x, y), starting at a random angle.
  function ringSpot(x, y, r, d) {
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 16; k++) {
      const a = a0 + (k / 16) * Math.PI * 2, p = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
      if (free(p.x, p.y, r)) return p;
    }
    return null;
  }
  // A random clear spot, preferably far from `avoid`.
  function anySpot(r, avoid) {
    for (let k = 0; k < 60; k++) {
      const p = { x: rand(r, innerWidth - r), y: rand(minY(), maxY()) };
      if (free(p.x, p.y, r) && (!avoid || k > 40 || dist(p, avoid) > innerWidth * 0.3)) return p;
    }
    return { x: innerWidth / 2, y: maxY() };    // screen is wall-to-wall text; unwedge sorts it out later
  }

  // Circle vs box. Push out along the contact normal and drop only the velocity
  // pointing into the wall, so a wizard hitting text at an angle slides along it.
  function collide(e) {
    for (const w of walls) {
      const cx = clamp(e.x, w.l, w.r), cy = clamp(e.y, w.t, w.b);
      let nx = e.x - cx, ny = e.y - cy, push;
      const d = Math.hypot(nx, ny);
      if (d >= e.r) continue;
      if (d > 0) { nx /= d; ny /= d; push = e.r - d; }
      else {                                      // centre inside the box: leave by the nearest side
        const [pen, ox, oy] = [[e.x - w.l, -1, 0], [w.r - e.x, 1, 0], [e.y - w.t, 0, -1], [w.b - e.y, 0, 1]]
          .reduce((a, b) => (b[0] < a[0] ? b : a));
        nx = ox; ny = oy; push = pen + e.r;
      }
      e.x += nx * push;
      e.y += ny * push;
      const vn = e.vx * nx + e.vy * ny;
      if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
    }
  }

  // Viewport edges: clamp and reflect, keeping some of the speed, so they bounce off.
  function bounce(e) {
    const l = e.r, r = innerWidth - e.r, t = minY(), b = maxY();
    if (e.x < l) { e.x = l; e.vx = Math.abs(e.vx) * 0.7; } else if (e.x > r) { e.x = r; e.vx = -Math.abs(e.vx) * 0.7; }
    if (e.y < t) { e.y = t; e.vy = Math.abs(e.vy) * 0.7; } else if (e.y > b) { e.y = b; e.vy = -Math.abs(e.vy) * 0.7; }
  }

  // Squeezed between two walls, or a wall scrolled on top of it: hop to the nearest clear spot.
  function unwedge(e) {
    if (e.i !== undefined && e.hp !== undefined) e.squashedAt = clock;   // a wizard buried by a scrolling wall
    for (let d = 12; d <= 320; d += 12) {
      const p = ringSpot(e.x, e.y, e.r, d);
      if (p) { e.x = p.x; e.y = p.y; return; }
    }
  }

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------
  let wiz, clones = [], bolts = [], fx = [], bubbles = [], debris = [], minions = [], sigils = [];
  let arrows = [], duel = null, graves = [], meteors = [], portals = [], dragon = null, nextDragon = 0, dragonIdx = -1;
  let tscale = 1, slowTo = 1, slowUntil = 0, nowMs = 0, cineUntil = 0, clashed = false;   // slow-motion and cinematic state
  let clock = 0, F = 1, frame = 0, boil = 0, nextBubble = 4;

  const body = (owner, x, y) => ({
    owner, x, y, vx: 0, vy: 0, r: size * 0.34, face: owner ? -1 : 1, lean: 0, flinch: 0, walk: Math.random() * 6,
    node: el("use", { href: owner ? "#dark" : "#mage", width: 60, height: 80 }),
  });

  function makeWizard(i) {
    const w = Object.assign(body(i, innerWidth * (i ? 0.85 : 0.15), maxY()), {
      i, hp: R.hp, mp: R.mp, state: "", since: 0, cd: rand(0.5, 1.5), trail: [], goal: null, goalAt: 0, rally: 0,
      streak: 0, hasteUntil: 0, enragedUntil: 0, noBubble: 0, pokes: [], talk: null, hordeAt: clock + rand(...R.horde.first), sig: null, shield: null, shieldAt: 0, raiseAt: clock + 5, raised: false,
      chainAt: 0, slamAt: 0, frostAt: 0, drainAt: 0, rallyAt: 0, meteorAt: clock + rand(14, 24), giantAt: clock + rand(20, 30), portalAt: 0, vis: 1, stormed: false, portal: null,
    });
    w.aura = stage.insertBefore(document.createElementNS(NS, "circle"), w.node);   // drawn under the wizard
    w.aura.setAttribute("class", "aura");
    w.label = el("text", { class: "streak" });
    const bars = el("g", { class: "bars" });
    w.bars = bars;
    w.lines = ["track", "hp", "track", "mp"].map((c) => el("line", { class: c }, bars));
    go(w, "WANDER");
    return w;
  }

  function go(w, state) {
    if (w.state === state) return;
    w.state = state;
    w.since = clock;
    w.goal = null;
    w.node.dataset.state = state;
  }

  function steer(e, to, speed) {
    const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.chill > clock) speed *= R.frost.slow;
    const v = speed * Math.min(1, d / 30);       // ease into the goal instead of overshooting
    const k = 1 - Math.pow(0.85, F);
    e.vx += ((dx / d) * v - e.vx) * k;
    e.vy += ((dy / d) * v - e.vy) * k;
  }

  function move(e) {
    e.x += e.vx * F;
    e.y += e.vy * F;
    collide(e);
    bounce(e);
    if (hitsWall(e.x, e.y, e.r * 0.9)) unwedge(e);
    e.walk += Math.hypot(e.vx, e.vy) * 0.12 * F;
  }

  const tip = (e) => {                             // the wand tip, turned about the shoulder with the arm
    const a = ART[e.owner], [sx, sy] = a.shoulder, r = ((e.armA || 0) * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r), dx = a.tip[0] - sx, dy = a.tip[1] - sy;
    return { x: e.x + e.face * (sx + dx * c - dy * n - 30) * s, y: e.y + (sy + dx * n + dy * c - 40) * s };
  };

  function fire(w, target, cheap, mode) {
    // 70% major whenever it can afford one (fire is only called with line of sight); otherwise a wand flick.
    const major = !cheap && w.mp >= R.major.cost && (mode ? mode === "major" : Math.random() < R.major.chance);
    const spec = major ? R.major : R.basic;
    w.face = Math.sign(target.x - w.x) || w.face;
    const o = tip(w);
    // Aimed where the target is right now, plus up to 12 degrees of bad aim: usually close, sometimes wild.
    // A flat 5-15 degrees missed nearly every shot past ~150px. No tracking, so moving targets can dodge.
    const spread = cheap ? 0 : ((Math.random() - Math.random()) * R.bolt.spread * Math.PI) / 180;
    const a = Math.atan2(target.y - o.y, target.x - o.x) + spread;
    const boosted = major && Math.random() < R.major.boost;   // about 1 major in 15: bigger, harder, shouted
    const size = (major ? 2 : 1) * (boosted ? 1.5 : 1) * (1 + 0.1 * w.streak);   // a win streak adds 10% per kill
    const kind = major ? `p${w.i}` : ["orange", "white", "blue"][(Math.random() * 3) | 0];
    const node = el("g", { class: `bolt ${kind}`, filter: "url(#glow)" });
    const b = {
      from: w.i, x: o.x, y: o.y, vx: Math.cos(a) * spec.speed, vy: Math.sin(a) * spec.speed, speed: spec.speed,
      dmg: boosted ? R.major.boostDmg : spec.dmg, major, kind, size, born: clock, node, seed: rand(0, 6),
    };
    buildBolt(b);
    bolts.push(b);
    muzzle(o, kind, major, size);
    w.lean = major ? 1.6 : 1;
    if (boosted) say(w, [LINES.ultimate[w.i]]);
    if (cheap) return;                             // the cheap shot is free and ignores the cooldown
    w.mp -= spec.cost;
    w.cd = R.bolt.cooldown;
    w.counter = Math.random() < R.bolt.counter;    // will the next shot answer an incoming bolt?
  }

  // Mirror Image: two bodyguard clones. Nobody aims at them; they just stand in the way.
  function mirror(w) {
    w.mp -= R.mirror.cost;
    for (const slot of [-1, 1]) clones.push(Object.assign(body(w.i, w.x, w.y), { slot, born: clock }));
    scribble(w.x, w.y, 22, 0.4);
  }

  function hurt(w, at) {
    w.hp -= at.dmg;
    w.flinch = at.major ? 1.6 : 1;
    scribble(at.x, at.y, 12 * at.size, 0.35);
    if (at.kind) impact(at.x, at.y, at.kind, at.major ? 1.2 : 0.7);
    if (w.hp <= 0) return die(w);
    if (w.state === "DISTRACTED") return resume(w);
    if (w.mp >= R.mirror.cost && !clones.some((c) => c.owner === w.i)) mirror(w);
  }

  // Down at 0 HP: kneels, drops a snapped wand, says last words and crumbles to graphite over 3s.
  function die(w) {
    const winner = wiz[1 - w.i];
    go(w, "DEATH_ANIMATION");
    if (w.shield) breakShield(w, false);
    dissolve(w.i);                                 // the master's magic is gone, so is the horde's
    slow(0.3, 1.2);
    cineUntil = clock + 3.2;
    flash("#000");
    Object.assign(w, { hp: 0, vx: 0, vy: 0, streak: 0, enragedUntil: 0, hasteUntil: 0 });   // dies in plain graphite
    clones = clones.filter((c) => c.owner !== w.i || (scribble(c.x, c.y, 10, 0.3), c.node.remove(), false));
    const t = tip(w), floor = w.y + size * 0.5;
    for (const k of [0, 1]) {
      drop(el("line", { class: "wand-bit" }), t.x - w.face * (4 + k * 9) * s, t.y + k * 4 * s, rand(-1, 1), rand(-2, -0.5), floor, R.death + 1, 9 * s);
    }
    say(w, LINES.death, true);
    if (alive(winner)) {
      go(winner, "VICTORY");
      say(winner, LINES.victory);
    }
  }

  // The dust has settled. Only now does the winner absorb the loser's magic: full heal and +1 streak,
  // so a fresh respawn can't just walk up and finish off a wounded winner.
  function finishDeath(w) {
    const winner = wiz[1 - w.i];
    dissolve(winner.i);                            // the winner's spent horde crumbles too
    for (let k = 0; k < 30; k++) ash(w);
    go(w, "DEAD");
    w.node.style.display = "none";
    w.node.style.opacity = "";
    if (w.talk) { w.talk.node.remove(); w.talk = null; }
    if (winner.state === "VICTORY") {
      winner.hp = R.hp;
      winner.streak++;
      burst(winner.x, winner.y, ["gold"], 0, 16, 0.6);
      go(winner, "WANDER");
    }
  }

  // Falling bits: graphite ash and wand halves. Each falls to its floor and fades out.
  function drop(node, x, y, vx, vy, floor, life, len = 0) {
    debris.push({ node, x, y, vx, vy, floor, until: clock + life, len, rot: rand(0, 6), vr: len ? rand(-0.25, 0.25) : 0 });
  }
  function ash(w) {
    const x = w.x + rand(-0.7, 0.7) * w.r, y = w.y + rand(-0.5, 0.45) * size;
    const n = el("circle", { class: Math.random() < 0.5 ? "ash" : "ash dark", r: rand(0.7, 1.8).toFixed(1) });
    drop(n, x, y, rand(-1.2, 1.2), rand(-1.5, 0.3), innerHeight - rand(2, 10), rand(4, 6));
  }
  function updateDebris() {
    debris = debris.filter((d) => {
      d.vy = Math.min(d.vy + 0.12 * F, d.len ? 8 : 1.4);   // ash drifts down slowly, wood drops
      d.x += (d.vx + (d.len ? 0 : Math.sin(clock * 3 + d.rot) * 0.3)) * F;
      d.y += d.vy * F;
      d.vx *= Math.pow(0.97, F);
      if (d.y >= d.floor) { d.y = d.floor; d.vy = 0; d.vx = 0; d.vr = 0; }
      d.rot += d.vr * F;
      const left = d.until - clock;
      if (left <= 0) { d.node.remove(); return false; }
      d.node.setAttribute("opacity", Math.min(1, left).toFixed(2));
      if (d.len) {
        const cx = (Math.cos(d.rot) * d.len) / 2, cy = (Math.sin(d.rot) * d.len) / 2;
        d.node.setAttribute("x1", (d.x - cx).toFixed(1)); d.node.setAttribute("y1", (d.y - cy).toFixed(1));
        d.node.setAttribute("x2", (d.x + cx).toFixed(1)); d.node.setAttribute("y2", (d.y + cy).toFixed(1));
      } else {
        d.node.setAttribute("cx", d.x.toFixed(1)); d.node.setAttribute("cy", d.y.toFixed(1));
      }
      return true;
    });
  }

  function respawn(w) {
    const foe = wiz[1 - w.i], x = foe.x > innerWidth / 2 ? w.r + 2 : innerWidth - w.r - 2;   // the far edge
    let p = null;
    for (let k = 0; k < 30 && !p; k++) { const y = rand(minY(), maxY()); if (free(x, y, w.r)) p = { x, y }; }
    p = p || anySpot(w.r, foe);
    Object.assign(w, { x: p.x, y: p.y, vx: 0, vy: 0, hp: R.hp, mp: R.mp, cd: 1, trail: [], rally: 0, hasteUntil: 0, enragedUntil: 0, hordeAt: clock + rand(5, 9) });
    go(w, "WANDER");
    w.node.style.display = "";
    scribble(w.x, w.y, 18, 0.5);
  }

  // Back from complaining to the visitor, and angry about it.
  function resume(w) {
    go(w, "SEEK");
    w.rally = clock + R.rally;
    say(w, LINES.cheated);
  }

  function blink(w) {
    const p = ringSpot(w.x, w.y, w.r, R.stuck.blink) || ringSpot(w.x, w.y, w.r, R.stuck.blink * 2) || anySpot(w.r);
    scribble(w.x, w.y, 14, 0.4);
    Object.assign(w, { x: p.x, y: p.y, vx: 0, vy: 0, goal: null });
    w.trail.length = 0;
    scribble(w.x, w.y, 14, 0.4);
  }

  // Anti-stuck: a wizard that means to move but has stayed within 10px for 3s blinks away.
  function watchStuck(w) {
    if (!["WANDER", "SEEK", "FLEE", "FETCH"].includes(w.state)) { w.trail.length = 0; return; }
    const last = w.trail[w.trail.length - 1];
    if (!last || clock - last.t >= 0.1) w.trail.push({ x: w.x, y: w.y, t: clock });
    while (clock - w.trail[0].t > R.stuck.window) w.trail.shift();
    if (clock - w.trail[0].t < R.stuck.window - 0.15) return;   // not enough history yet
    if (w.trail.every((p) => dist(p, w) < R.stuck.minTravel)) { blink(w); complain(w, "blocked", 10); }
  }

  // A spot just outside some wall where the foe cannot see us. Nearest wins.
  function coverSpot(w, foe) {
    let best = null, bd = Infinity;
    const pad = w.r + 6;
    for (const b of walls) {
      const spots = [
        { x: b.l - pad, y: clamp(w.y, b.t, b.b) }, { x: b.r + pad, y: clamp(w.y, b.t, b.b) },
        { x: clamp(w.x, b.l, b.r), y: b.t - pad }, { x: clamp(w.x, b.l, b.r), y: b.b + pad },
      ];
      for (const p of spots) {
        const d = dist(w, p);
        if (d < bd && dist(foe, p) > 140 && free(p.x, p.y, w.r) && !sees(foe, p)) { bd = d; best = p; }
      }
    }
    return best;
  }
  function awayFrom(w, foe) {
    const dx = w.x - foe.x, dy = w.y - foe.y, d = Math.hypot(dx, dy) || 1;
    return { x: clamp(w.x + (dx / d) * 200, w.r, innerWidth - w.r), y: clamp(w.y + (dy / d) * 200, minY(), maxY()) };
  }

  function wander(w) {
    go(w, "WANDER");
    if (!w.goal || dist(w, w.goal) < 12 || clock - w.goalAt > 4) { w.goal = anySpot(w.r); w.goalAt = clock; }
    steer(w, w.goal, R.wanderSpeed * (clock < w.hasteUntil ? 2 : 1));
  }

  // Bubbles: one every 10-15s, rising from the bottom. Touching one pops it for a buff.
  const BUFFS = {
    heal: { want: (w) => w.hp < 60, give: (w) => (w.hp = Math.min(R.hp, w.hp + 30)) },
    mana: { want: (w) => w.mp < 70, give: (w) => (w.mp = Math.min(R.mp, w.mp + 50)) },
    haste: { want: () => true, give: (w) => (w.hasteUntil = clock + 5) },
  };

  // A bubble worth breaking off for: within 200px, actually useful, and not contested.
  function pickBubble(w, foe) {
    if (clock < w.noBubble) return null;
    let best = null;
    for (const b of bubbles) {
      if (BUFFS[b.kind].want(w) && dist(w, b) < R.bubble.reach && (!best || dist(w, b) < dist(w, best))) best = b;
    }
    if (best && foe.state === "FETCH" && dist(w, foe) < R.bubble.contest) {   // both reaching for one: fight instead
      w.noBubble = foe.noBubble = clock + 4;
      return null;
    }
    return best;
  }

  function updateBubbles() {
    if (clock > nextBubble) {
      nextBubble = clock + rand(...R.bubble.every);
      // Rise under one of the wizards: spawned anywhere, most drifted up out of their 200px reach.
      const near = wiz[(Math.random() * 2) | 0];
      const kind = Object.keys(BUFFS)[(Math.random() * 3) | 0], x = clamp(near.x + rand(-150, 150), 30, innerWidth - 30);
      bubbles.push({ kind, x, x0: x, y: innerHeight + 12, phase: rand(0, 6), node: el("circle", { class: `bubble ${kind}`, r: R.bubble.r }) });
    }
    bubbles = bubbles.filter((b) => {
      b.y -= R.bubble.rise * F;
      b.x = b.x0 + Math.sin(clock * 1.3 + b.phase) * 14;
      const w = wiz.find((w) => alive(w) && dist(w, b) < w.r + R.bubble.r);
      if (w) { BUFFS[b.kind].give(w); burst(b.x, b.y, [b.kind], 0, 10, 0.4); }
      // Popped, or floated off the top: a wizard chasing it picks a new plan next frame.
      if (w || b.y < top - 12) { b.node.remove(); return false; }
      b.node.setAttribute("cx", b.x.toFixed(1));
      b.node.setAttribute("cy", b.y.toFixed(1));
      return true;
    });
  }

  // Speech bubbles: a rough box that follows the speaker for 2s (last words: the whole death).
  function say(w, lines, shaky) {
    if (w.state === "DEAD") return;
    if (w.talk) w.talk.node.remove();
    const g = el("g", { class: "talk" });
    const box = el("path", {}, g), ghost = el("path", {}, g), text = el("text", { y: -7 }, g);
    text.textContent = lines[(Math.random() * lines.length) | 0];
    const hw = text.getComputedTextLength() / 2 + 8;
    box.setAttribute("d", roughBubble(hw, 22));
    ghost.setAttribute("d", roughBubble(hw, 22));
    w.talk = { node: g, until: clock + (shaky ? R.death : R.talk.for), shaky };
  }
  function roughBubble(hw, h) {
    const pts = [[-hw, -h], [hw, -h], [hw, 0], [5, 0], [-2, 8], [-4, 0], [-hw, 0]];   // box with a tail
    let d = "";
    pts.forEach(([x, y], k) => {
      const [nx, ny] = pts[(k + 1) % pts.length];
      for (let j = 0; j < 3; j++) {
        const u = j / 3, wob = j ? 1.2 : 0;
        d += `${k || j ? "L" : "M"}${(x + (nx - x) * u + rand(-wob, wob)).toFixed(1)} ${(y + (ny - y) * u + rand(-wob, wob)).toFixed(1)} `;
      }
    });
    return d + "Z";
  }

  // The brain: WANDER, SEEK, ATTACK, FETCH (a bubble), FLEE, REST, DISTRACTED, VICTORY,
  // DEATH_ANIMATION, and DEAD while it waits to respawn.
  function think(w, dt) {
    const foe = wiz[1 - w.i];
    const t = clock - w.since;
    if (w.state === "DEAD") { if (t > R.respawn) respawn(w); return; }
    w.mp = Math.min(R.mp, w.mp + R.mpRegen * dt);
    w.cd -= dt;

    if (w.state === "DEATH_ANIMATION") {
      w.vx = w.vy = 0;
      if (Math.random() < 0.2 + t / R.death) ash(w);   // crumbles faster as it goes
      if (t >= R.death) finishDeath(w);
      return;
    }
    // Gloating over the dying foe; finishDeath() hands out the reward and ends this.
    if (w.state === "VICTORY") {
      w.vx = w.vy = 0;
      w.face = Math.sign(foe.x - w.x) || w.face;
      if (foe.state !== "DEATH_ANIMATION") go(w, "WANDER");   // safety: never stuck gloating
      return;
    }

    if (w.state === "BEAM") {                      // locked in a beam duel: updateDuel() runs the fight
      steer(w, w, 0);
      w.face = Math.sign(foe.x - w.x) || w.face;
      return;
    }
    if (w.state === "STORM") {
      steer(w, w, 0);
      w.face = Math.sign(foe.x - w.x) || w.face;
      if (!w.stormed && t >= 0.6) { w.stormed = true; launchStorm(w); }
      if (t >= 1.3) go(w, "WANDER");
      return;
    }
    if (w.state === "PORTAL") {                    // steps into a sling-ring portal and out of another
      steer(w, w, 0);
      const pt = w.portal;
      w.vis = t < 0.3 ? 1 - t / 0.3 : clamp((t - 0.3) / 0.3, 0, 1);
      if (!pt.moved && t >= 0.3) {
        pt.moved = true;
        Object.assign(w, { x: pt.to.x, y: pt.to.y, vx: 0, vy: 0 });
        w.trail.length = 0;
        openPortal(pt.to.x, pt.to.y);
      }
      if (t >= 0.6) { w.vis = 1; go(w, "WANDER"); }
      return;
    }
    if (w.state === "RAISE") {
      steer(w, w, 0);
      w.face = Math.sign(foe.x - w.x) || w.face;
      if (!w.raised && t >= 0.7) { w.raised = true; raiseDead(w); }
      if (t >= 1.3) go(w, "WANDER");
      return;
    }
    if (w.state === "SUMMON") {
      steer(w, w, 0);
      w.face = Math.sign(foe.x - w.x) || w.face;
      if (t >= R.horde.cast) go(w, "WANDER");
      return;
    }

    // Poked by the visitor: stands still complaining until the cheap shot lands or time runs out.
    if (w.state === "DISTRACTED") {
      w.vx = w.vy = 0;
      if (t > R.poke.hold) resume(w);
      return;
    }
    // The foe is busy complaining: drop everything and take the free shot, once.
    if (foe.state === "DISTRACTED") {
      w.vx = w.vy = 0;
      w.face = Math.sign(foe.x - w.x) || w.face;
      if (w.cheapAt !== foe.since) { w.cheapAt = foe.since; fire(w, foe, true); }
      return;
    }

    // Incoming big spell: throw up a rune shield.
    if (!w.shield && clock > w.shieldAt && w.mp >= R.shield.cost && Math.random() < 0.2 &&
        bolts.some((b) => b.from !== w.i && b.major && dist(b, w) < 180 && b.vx * (w.x - b.x) + b.vy * (w.y - b.y) > 0)) castShield(w);

    if (w.hp < 75 && clock > w.portalAt && clock < w.slamAt && w.mp >= R.portal.cost && minions.filter((m) => m.team !== w.i && !m.dying && dist(m, w) < size * 1.1).length >= 3) {   // cornered, slam spent: step through a portal
      const dest = portalDest(w, foe);
      if (dest) return startPortal(w, dest);
    }
    if (w.hp < R.rest.below && w.state !== "FLEE" && w.state !== "REST" && clock > w.rally) {
      const dest = clock > w.portalAt && w.mp >= R.portal.cost && Math.random() < 0.6 ? portalDest(w, foe) : null;
      if (dest) return startPortal(w, dest);
      go(w, "FLEE");
    }

    if (w.state === "FLEE") {
      if (!w.goal || clock - w.goalAt > 0.5) {   // the foe moves, so re-aim twice a second
        w.goal = coverSpot(w, foe) || awayFrom(w, foe);
        w.goalAt = clock;
      }
      steer(w, w.goal, R.fleeSpeed);
      // Only the badly hurt may hide; one healed on the way (a bubble) goes back to the fight.
      if (dist(w, w.goal) < w.r * 0.6 || t > R.rest.fleeFor) go(w, w.hp < R.rest.below ? "REST" : "SEEK");
      return;
    }

    if (w.state === "REST") {
      steer(w, w, 0);
      if (t > R.rest.patience) {                 // wall decay: hiding too long makes it snap
        w.enragedUntil = clock + R.enrage;
        w.rally = clock + R.rally;
        return go(w, "SEEK");
      }
      w.hp = Math.min(R.hp, w.hp + R.rest.regen * dt);
      if (w.hp >= R.rest.until) go(w, "SEEK");
      return;
    }

    if (!alive(foe)) return wander(w);
    if (w.i === 1 && clock > w.raiseAt && w.mp >= R.raise.cost && alive(foe) && graves.some((g) => clock - g.at < 10) &&
        minions.filter((m) => m.team === 1 && !m.dying).length < 4) return startRaise(w);
    if (clock > w.giantAt && w.mp >= R.giant.cost && !minions.some((m) => m.team === w.i && m.big && !m.dying)) return startSummon(w, true);
    if (clock > w.meteorAt && w.mp >= R.meteor.cost && dist(w, foe) > 220) return startStorm(w);
    if (w.i === 0 && clock > w.rallyAt && w.mp >= R.rally.cost && minions.filter((m) => m.team === 0 && !m.dying).length >= 2 &&
        minions.some((m) => m.team === 1 && !m.dying && minions.some((o) => o.team === 0 && !o.dying && dist(o, m) < 250))) castRally(w);
    if (clock > w.portalAt && w.mp >= R.portal.cost && Math.random() < 0.08 &&
        bolts.some((b) => b.from !== w.i && b.major && dist(b, w) < 130 && b.vx * (w.x - b.x) + b.vy * (w.y - b.y) > 0)) {
      const dest = portalDest(w, foe);
      if (dest) return startPortal(w, dest);
    }
    if (clock > w.hordeAt && w.mp >= R.horde.cost && !minions.some((m) => m.team === w.i && !m.dying)) return startSummon(w);
    // Masters are never fooled: they always aim at the real wizard. Clones only get hit by standing in the way.
    const target = sees(w, foe) ? foe : null;
    const fast = clock < w.hasteUntil ? 2 : 1;

    const bubble = pickBubble(w, foe);
    if (bubble) {
      go(w, "FETCH");
      steer(w, bubble, R.chaseSpeed * fast);
      return;
    }

    // A horde on the way in comes first: back off to keep its reach short and pick it apart.
    let threat = null, td = 300;
    for (const m of minions) {
      if (m.team === w.i || m.dying) continue;
      const d = dist(w, m);
      if (d < td && sees(w, m)) { threat = m; td = d; }
    }
    if (threat) {
      if (clock > w.slamAt && w.mp >= R.slam.cost && minions.filter((m) => m.team !== w.i && !m.dying && dist(m, w) < 110).length >= 2) return staffSlam(w);
      if (w.i === 0 && clock > w.frostAt && w.mp >= R.frost.cost && minions.filter((m) => m.team !== w.i && !m.dying && dist(m, w) < R.frost.radius).length >= 2) return frostNova(w);
      if (w.i === 1 && clock > w.drainAt && w.mp >= R.drain.cost && w.hp < 85 && minions.filter((m) => m.team !== w.i && !m.dying && dist(m, w) < R.drain.range).length >= 2) return soulDrain(w);
      go(w, "ATTACK");
      w.face = Math.sign(threat.x - w.x) || w.face;
      steer(w, td < 140 ? awayFrom(w, threat) : w, td < 140 ? R.chaseSpeed : 0.6);   // kiting slower than the horde runs: it WILL be caught
      if (w.cd <= 0 && w.mp >= R.basic.cost) {
        const pack = minions.filter((m) => m.team !== w.i && !m.dying && dist(m, threat) < 70).length;
        if (clock > w.chainAt && w.mp >= R.chain.cost && pack >= 3 && Math.random() < 0.5) { chainLightning(w, threat); w.cd = 0.5; return; }
        fire(w, threat, false, pack >= 3 && w.mp >= R.major.cost ? "major" : "basic");
        w.cd = 0.5;
      }
      return;
    }

    if (target && dist(w, target) <= R.bolt.range) {
      go(w, "ATTACK");
      w.face = Math.sign(target.x - w.x) || w.face;
      steer(w, { x: w.x, y: w.y + Math.sin(clock * 1.7 + w.i * 3) * 20 }, 0.6);   // shuffle, don't freeze
      // With a bolt incoming it either counters (the bolts will clash) or holds and takes the hit.
      // Always countering would make every shot clash, and no bolt would ever land.
      const incoming = bolts.some((b) => b.from !== w.i);
      const ready = w.cd <= 0 || (incoming && w.counter && w.cd < 0.75);   // a counter may jump the cooldown a little
      if (ready && w.mp >= R.basic.cost && (!incoming || w.counter)) fire(w, target);
    } else if (target || dist(w, foe) < R.sense || foe.state === "FLEE" || foe.state === "REST" || clock < w.rally) {
      go(w, "SEEK");
      steer(w, foe, R.chaseSpeed * fast);
    } else wander(w);
  }

  // Bodyguards: one on each side of the line to the foe, two body-widths out, so together they
  // cover the straight shot at the wizard (at +-0.45 rad their circles overlap in the middle).
  function updateClones() {
    clones = clones.filter((c) => {
      const w = wiz[c.owner], foe = wiz[1 - c.owner];
      const a = Math.atan2(foe.y - w.y, foe.x - w.x) + c.slot * 0.45;
      steer(c, { x: w.x + Math.cos(a) * w.r * 2, y: w.y + Math.sin(a) * w.r * 2 }, R.fleeSpeed * 1.8);
      move(c);
      c.face = Math.sign(foe.x - c.x) || c.face;
      if (clock - c.born > R.mirror.life) {
        scribble(c.x, c.y, 10, 0.3);
        c.node.remove();
        return false;
      }
      return true;
    });
  }

  function updateBolts() {
    bolts = bolts.filter((b) => {
      b.x += b.vx * F;
      b.y += b.vy * F;
      let hit = clock - b.born > R.bolt.life || b.x < -40 || b.x > innerWidth + 40 || b.y < -40 || b.y > innerHeight + 40;
      if (!hit && walls.some((w) => b.x > w.l && b.x < w.r && b.y > w.t && b.y < w.b)) { scribble(b.x, b.y, 8, 0.3); impact(b.x, b.y, b.kind, 0.5); hit = true; }
      if (!hit) {
        const ci = clones.findIndex((c) => c.owner !== b.from && dist(c, b) < c.r + 4 * (b.size - 1));
        if (ci >= 0) { scribble(clones[ci].x, clones[ci].y, 14, 0.4); clones[ci].node.remove(); clones.splice(ci, 1); hit = true; }   // one hit, any spell
      }
      if (!hit) {
        const mi = minions.find((m) => m.team !== b.from && !m.dying && m.z < m.r * 2 && dist(m, b) < m.r + 3 + 4 * (b.size - 1));
        if (mi) { boltHitsMinion(b, mi); hit = true; }
      }
      const foe = wiz[1 - b.from];
      if (!hit && foe.shield && dist(foe, b) < shieldR() * 0.95) {            // the bubble takes it
        foe.shield.hp -= b.dmg;
        foe.shield.flash = 1;
        impact(b.x, b.y, b.kind, b.major ? 0.9 : 0.5);
        hit = true;
      }
      if (!hit && alive(foe) && dist(foe, b) < foe.r + 4 * (b.size - 1)) { hurt(foe, b); hit = true; }
      if (hit) { b.node.remove(); b.fxn.remove(); }
      return !hit;
    });
    // Opposing spells that meet. The touch distance is >= what they close in one frame, so none slip through.
    // basic vs basic: both gone. major vs basic: the basic is gone, the major flies on. major vs major: boom.
    for (const a of bolts) for (const c of bolts) {
      if (a.from !== 0 || c.from !== 1 || a.spent || c.spent || dist(a, c) > 8 * (a.size + c.size) + 2) continue;
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      if (a.major && c.major) {
        a.spent = c.spent = true;
        if (!(Math.random() < 0.7 && startDuel(mx, my))) bigBoom(mx, my);   // usually the beams lock; otherwise they just detonate
      } else if (a.major || c.major) {
        const weak = a.major ? c : a;
        weak.spent = true;
        burst(weak.x, weak.y, [weak.kind], 0, 6, 0.3);
      } else {
        a.spent = c.spent = true;
        burst(mx, my, [a.kind, c.kind], 6, 12, 0.5);
        impact(mx, my, a.kind, 0.6);
      }
    }
    bolts = bolts.filter((b) => !b.spent || (b.node.remove(), b.fxn.remove(), false));
  }

  // Green major meets red major: a huge burst and the whole page shakes for a moment.
  function bigBoom(x, y) {
    burst(x, y, ["p0", "p1", "gold"], 14, 36, 0.9);
    scribble(x, y, 46, 0.8);
    impact(x, y, "p0", 1.8);
    impact(x, y, "p1", 1.8);
    scribble(x, y, 30, 0.6);
    shake(9, 450);
  }

  // Jagged arcs and flying sparks in the given colours: clashes (500ms), bubble pops, dust, the winner's glow.
  function burst(x, y, kinds, arcs, nSparks, life) {
    const g = el("g", { class: "burst" }), sparks = [];
    for (let k = 0; k < arcs; k++) {
      const a = (k / arcs) * Math.PI * 2 + rand(-0.3, 0.3), len = rand(16, 30);
      const pts = Array.from({ length: 5 }, (_, j) => {
        const d = (len * j) / 4, off = j ? rand(-5, 5) : 0;
        return `${(x + Math.cos(a) * d - Math.sin(a) * off).toFixed(1)},${(y + Math.sin(a) * d + Math.cos(a) * off).toFixed(1)}`;
      });
      el("polyline", { class: kinds[k % kinds.length], points: pts.join(" ") }, g);
    }
    for (let k = 0; k < nSparks; k++) {
      const a = rand(0, Math.PI * 2), v = rand(1.5, 4);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, n: el("line", { class: kinds[k % kinds.length] }, g) });
    }
    fx.push({ x, y, born: clock, life, node: g, sparks });
  }

  // A burst of pencil scribble: explosions, hits, blinks, respawns.
  function scribble(x, y, rad, life) {
    const pts = Array.from({ length: 16 }, () => `${(x + rand(-rad, rad)).toFixed(1)},${(y + rand(-rad, rad)).toFixed(1)}`);
    fx.push({ x, y, born: clock, life, node: el("polyline", { class: "scribble", points: pts.join(" ") }) });
  }


  // ---------------------------------------------------------------------------
  // Summon Horde. A rune circle burns into the ground, a pillar of light opens and
  // the minions are thrown out of it. They are real bodies: mass, an acceleration
  // limit, ground friction, gravity while airborne, momentum-conserving collisions
  // and knockback. They fight the nearest enemy minion; any that survive turn on
  // the master. When a master falls, its horde crumbles with it.
  // ---------------------------------------------------------------------------
  const slow = (scale, secs) => { slowTo = scale; slowUntil = nowMs + secs * 1000; };

  // Ink-style art lives in army-art.js (same canvas and rig as before: 32x40, feet at the bottom centre).
  const MINI = [ARMY.art("footman"), ARMY.art("skeleton")];
  const GIANT = [ARMY.art("giantGood"), ARMY.art("giantDark")];

  function minionNode(team, art) {
    const a = art || MINI[team], g = el("g", { class: `minion m${team}` }, crowd);
    g.innerHTML = `<ellipse class="shadow" rx="1" ry=".35"/><g class="mb">${a.back}<g class="l0">${a.legs[0]}</g><g class="l1">${a.legs[1]}</g>${a.body}<g class="wp">${a.weapon}</g></g>`;
    const q = (c) => g.querySelector(c);
    return { g, drawn: q(".drawn"), rest: q(".rest"), eyes: q(".eyes"), wg: q(".wg"), sh: q(".shadow"), mb: q(".mb"), l0: q(".l0"), l1: q(".l1"), wp: q(".wp") };
  }

  function startSummon(w, big) {
    const foe = wiz[1 - w.i];
    w.mp -= big ? R.giant.cost : R.horde.cost;
    if (big) w.giantAt = clock + R.giant.cooldown; else w.hordeAt = clock + R.horde.cooldown;
    go(w, "SUMMON");
    w.face = Math.sign(foe.x - w.x) || w.face;
    const rr = size * (big ? 0.95 : 0.6);
    let spot = { x: w.x + w.face * size * 1.1, y: w.y };
    if (!free(spot.x, spot.y, size * 0.4)) spot = ringSpot(w.x, w.y, size * 0.4, size * 1.1) || { x: w.x, y: w.y };
    if (big) spot.y = clamp(spot.y, minY() + size * 0.5, maxY() - size * 0.5);
    const fy = spot.y + mh / 2;
    const g = el("g", { class: "sigil" }, ground);
    const flat = el("g", { transform: `translate(${spot.x.toFixed(1)} ${fy.toFixed(1)}) scale(1 .36)` }, g);   // lies on the ground
    el("circle", { r: rr * 1.4, fill: `url(#sigilGlow${w.i})` }, flat);
    const ring = (d) => { const n = el("path", { class: `ring p${w.i}`, d, pathLength: 1 }, flat); n.style.strokeDasharray = "1 2"; n.style.strokeDashoffset = "1"; return n; };
    const circle = (r) => `M${-r} 0 A${r} ${r} 0 1 1 ${r} 0 A${r} ${r} 0 1 1 ${-r} 0`;
    const star = Array.from({ length: 5 }, (_, k) => {
      const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
      return `${k ? "L" : "M"}${(Math.cos(a) * rr * 0.78).toFixed(1)} ${(Math.sin(a) * rr * 0.78).toFixed(1)}`;
    }).join("") + "Z";
    const rings = [ring(circle(rr)), ring(circle(rr * 0.82)), ring(star)];
    const spin = el("g", {}, flat);
    const ticks = el("g", { class: `p${w.i}` }, spin);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      el("line", { class: "tick", x1: (c * rr * 0.86).toFixed(1), y1: (sn * rr * 0.86).toFixed(1), x2: (c * rr * (k % 2 ? 0.95 : 1.02)).toFixed(1), y2: (sn * rr * (k % 2 ? 0.95 : 1.02)).toFixed(1) }, ticks);
    }
    const pillar = el("rect", { x: (spot.x - rr * 0.7).toFixed(1), width: (rr * 1.4).toFixed(1), height: 0, fill: `url(#pillar${w.i})`, filter: "url(#glow)" }, g);
    w.sig = { w, g, rings, spin, ticks, pillar, spot, fy, rr, born: clock, ang: 0, fired: false, dead: false, queue: [], big: !!big };
    sigils.push(w.sig);
    cineUntil = clock + R.horde.cast + 1.6;
    scribble(spot.x, fy, 14, 0.4);
    say(w, big ? LINES.giant : [LINES.summon[w.i]]);
  }

  function updateSigils(dt) {
    sigils = sigils.filter((sg) => {
      const t = clock - sg.born, L = R.horde.leap, k = Math.min(1, t / L);
      if (!alive(sg.w) && !sg.dead) { sg.dead = true; sg.deadAt = clock; sg.queue.length = 0; }
      sg.ang += dt * (60 + 420 * k * k);                     // the circle spins up as the spell builds
      sg.spin.setAttribute("transform", `rotate(${sg.ang.toFixed(1)})`);
      sg.rings.forEach((n, i) => (n.style.strokeDashoffset = (1 - clamp(k * 1.3 - i * 0.15, 0, 1)).toFixed(3)));
      sg.ticks.setAttribute("opacity", k.toFixed(2));
      if (!sg.fired && !sg.dead && t >= L) {
        sg.fired = true;
        const n = sg.big ? 1 : innerWidth < 700 ? 4 : Math.round(rand(...R.horde.count));
        for (let i = 0; i < n; i++) sg.queue.push(clock + i * R.horde.stagger);
        burst(sg.spot.x, sg.fy, [`p${sg.w.i}`, "gold"], 10, 26, 0.7);
        flash(sg.w.i ? "#e0243f" : "#2fd47a");
        shake(sg.big ? 9 : 5, sg.big ? 500 : 300);
        slow(sg.big ? 0.3 : 0.5, sg.big ? 1 : 0.6);
      }
      while (sg.queue.length && clock >= sg.queue[0]) { sg.queue.shift(); spawnMinion(sg); }
      const after = t - L;
      const pk = sg.fired ? Math.max(0, 1 - after / 0.8) : 0.1 * k + 0.02 * Math.sin(t * 40) * k;   // light erupts at release
      const ph = size * 2.6 * pk;
      sg.pillar.setAttribute("y", (sg.fy - ph).toFixed(1));
      sg.pillar.setAttribute("height", ph.toFixed(1));
      const fade = sg.dead ? 1 - (clock - sg.deadAt) / 0.4 : after > 1 ? 1 - (after - 1) / 0.6 : 1;
      sg.g.setAttribute("opacity", clamp(fade, 0, 1).toFixed(2));
      if (fade <= 0) { sg.g.remove(); if (sg.w.sig === sg) sg.w.sig = null; return false; }
      return true;
    });
  }

  // Thrown out of the circle on a ballistic arc: up, outward, and a little toward the enemy.
  function newMinion(team, x, y, vx, vy, vz, face, big, archer) {
    const art = big ? GIANT[team] : archer ? (team ? RANGER : ELF) : MINI[team];
    const m = {
      team, x, y, vx, vy, z: 0.1, vz, r: size * (big ? 0.48 : 0.22), hp: big ? R.giant.hp : archer ? R.minion.hp * 0.75 : R.minion.hp, ranged: !!archer, mass: big ? 8 : 1 + rand(0, 0.25), big: !!big, art, speedK: rand(0.9, 1.1),
      face, walk: rand(0, 6), cd: rand(0.2, 0.6), swingT: 9, winding: false, flash: 0, squash: 0,
      dying: false, dieT: 0, dustT: 0, sense: R.minion.sense, searchA: rand(0, 6), baseA: face > 0 ? 0 : Math.PI, route: null, routeAt: 0, n: minionNode(team, art),
    };
    if (big) m.n.g.classList.add("giant");
    minions.push(m);
    return m;
  }
  function spawnMinion(sg) {
    const team = sg.w.i, a = rand(0, Math.PI * 2), d = rand(0, sg.rr * 0.4), fwd = sg.w.face;
    const archer = !sg.big && (sg.made = (sg.made || 0) + 1) % 3 === 0;   // every third minion is an archer: elf for the good side, hooded ranger for the dark
    const m = newMinion(team, sg.spot.x + Math.cos(a) * d, sg.spot.y + Math.sin(a) * d * 0.4,
      fwd * rand(0.8, 2) + Math.cos(a) * rand(0.5, 1.5), Math.sin(a) * rand(0.3, 1.2), sg.big ? rand(2.2, 3) : rand(4, 5.6), fwd, sg.big, archer);
    if (!free(m.x, m.y, m.r)) { m.x = sg.spot.x; m.y = sg.spot.y; }
    burst(m.x, m.y + mh / 2, [`p${team}`], 0, 4, 0.3);
  }

  // Push toward `goal`, but only as hard as the legs allow: velocity changes by at most
  // accel per frame (less for heavier bodies), so charging and stopping take distance.
  function accelTo(m, goal, speed) {
    if (m.chill > clock) speed *= R.frost.slow;
    const dx = goal.x - m.x, dy = goal.y - m.y, d = Math.hypot(dx, dy) || 1, v = speed * Math.min(1, d / 24);
    let ax = (dx / d) * v - m.vx, ay = (dy / d) * v - m.vy;
    const a = Math.hypot(ax, ay), max = (R.minion.accel * F) / m.mass;
    if (a > max) { ax *= max / a; ay *= max / a; }
    m.vx += ax;
    m.vy += ay;
  }

  // The nearest corner of a blocking wall that is reachable in a straight line: go around the text.
  function route(m, to) {
    let best = null, bs = Infinity;
    const pad = m.r + 8;
    for (const w of walls) {
      if (!segHits(m.x, m.y, to.x, to.y, w)) continue;
      for (const [cx, cy] of [[w.l - pad, w.t - pad], [w.r + pad, w.t - pad], [w.l - pad, w.b + pad], [w.r + pad, w.b + pad]]) {
        if (!free(cx, cy, m.r)) continue;
        const c = { x: cx, y: cy }, sc = dist(m, c) + dist(c, to);
        if (sc < bs && sees(m, c)) { bs = sc; best = c; }
      }
    }
    return best;
  }

  function dust(m, n = 1) {
    if (debris.length > 260) return;
    const fy = m.y + mh / 2;
    for (let k = 0; k < n; k++) {
      drop(el("circle", { class: "ash", r: rand(0.9, 2.1).toFixed(1) }), m.x - m.vx * 1.5 + rand(-3, 3), fy - 1, rand(-0.4, 0.4) - m.vx * 0.15, rand(-0.9, -0.3), fy + 2, rand(0.35, 0.6));
    }
  }

  function hitMinion(t, a, dx, dy) {
    t.hp -= R.minion.dmg * (a.rally > clock ? 1.35 : 1);
    t.vx += (dx * R.minion.knock) / t.mass;           // the blow shoves the victim along the line of the strike
    t.vy += (dy * R.minion.knock * 0.6) / t.mass;
    if (!t.z) { t.z = 0.01; t.vz = 1.6; }             // and pops it off the ground a little
    a.vx -= (dx * R.minion.knock * 0.25) / a.mass;    // Newton: the attacker recoils, a quarter as hard
    a.vy -= (dy * R.minion.knock * 0.15) / a.mass;
    t.flash = 0.12;
    burst(t.x, t.y, [`p${a.team}`, "white"], 0, 5, 0.25);
    if (t.hp <= 0) killMinion(t, { x: dx, y: dy });
  }

  function hitWizard(t, a, dx, dy) {
    if (clock < (t.guardUntil || 0)) return;          // the robe's ward: blows from a crowd can't stack inside a third of a second
    t.guardUntil = clock + 0.3;
    hurt(t, { dmg: R.minion.wizDmg * (a.big ? 3 : 1), major: false, x: t.x - dx * t.r * 0.7, y: t.y - dy * t.r * 0.7, size: 0.8 });
    t.vx += dx * 0.8;
    t.vy += dy * 0.8;
    burst(t.x - dx * t.r * 0.7, t.y - dy * t.r * 0.7, [`p${a.team}`], 0, 5, 0.25);
  }

  function killMinion(m, dir, crumble) {
    if (m.dying) return;
    m.dying = true;
    m.dieT = 0;
    if (!crumble) { graves.push({ x: m.x, y: m.y, team: m.team, at: clock }); if (graves.length > 16) graves.shift(); }
    m.crumble = !!crumble;
    m.fallDir = dir ? Math.sign(dir.x) || 1 : m.face;
    if (dir && !crumble) {                            // dies where the blow sent it
      m.vx += (dir.x * 2.5) / m.mass;
      m.vy += (dir.y * 1.2) / m.mass;
      if (!m.z) { m.z = 0.01; m.vz = 2.4; }
    }
    m.n.g.classList.add("dead");
    if (!crumble) for (let k = 0, n = m.big ? 4 : 1; k < n; k++) mote(m.x + rand(-4, 4), m.y, rand(-0.25, 0.25), rand(-0.9, -0.5), rand(1.3, 1.9), rand(1.6, 2.6), `p${m.team}`, -0.004, 0.6);   // a wisp leaves the body
    if (m.big) { shake(8, 500); slow(0.4, 0.9); flash(m.team ? "#e0243f" : "#2fd47a"); impact(m.x, m.y + mh, `p${m.team}`, 1.6); }
  }

  // The master is gone: every minion of that team crumbles, one after another.
  function dissolve(team) {
    for (const m of minions) if (m.team === team && !m.dying && !m.doomed) m.doomed = clock + rand(0.05, 0.7);
  }

  function boltHitsMinion(b, m) {
    if (b.major) {                                    // a blast: damage and a shove that fade with distance
      const rad = 34 * b.size;
      for (const o of minions) {
        if (o.team === b.from || o.dying) continue;
        const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
        if (d > rad) continue;
        const f = 1 - d / rad, n = d ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
        o.hp -= b.dmg * (0.4 + 0.6 * f);
        o.vx += (n.x * 6 * f) / o.mass;
        o.vy += (n.y * 4 * f) / o.mass;
        if (!o.z) { o.z = 0.01; o.vz = 2 + 4 * f; }   // flung into the air, comes down under gravity
        o.flash = 0.15;
        if (o.hp <= 0) killMinion(o, n);
      }
      burst(b.x, b.y, [b.kind, "gold"], 8, 16, 0.5);
      impact(b.x, b.y, b.kind, 1.3);
      scribble(b.x, b.y, rad * 0.7, 0.4);
      shake(3, 220);
    } else {
      const ux = b.vx / b.speed, uy = b.vy / b.speed;
      m.hp -= b.dmg;
      m.vx += (ux * 2.5) / m.mass;
      m.vy += (uy * 2.5) / m.mass;
      m.flash = 0.12;
      burst(b.x, b.y, [b.kind], 0, 5, 0.25);
      impact(b.x, b.y, b.kind, 0.45);
      if (m.hp <= 0) killMinion(m, { x: ux, y: uy });
    }
  }

  function strike(m, tgt) {
    if (m.ranged) return shootArrow(m, tgt);
    const dx0 = tgt.x - m.x, dy0 = tgt.y - m.y, d = Math.hypot(dx0, dy0) || 1;
    if (d > m.r + tgt.r + R.minion.reach * 3) return;   // it moved away during the windup: a miss
    const dx = dx0 / d, dy = dy0 / d;
    if (m.big) { blast(m.x, m.y + mh * 0.6, 90, m.team, R.giant.dmg, `p${m.team}`); shake(4, 220); slow(0.3, 0.1); return; }   // a stomp, not a swing
    if (tgt.team === undefined) return hitWizard(tgt, m, dx, dy);
    if (!clashed) { clashed = true; slow(0.4, 0.7); shake(4, 250); cineUntil = Math.max(cineUntil, clock + 2); }   // first blood
    hitMinion(tgt, m, dx, dy);
  }

  function mind(m, dt) {
    const own = wiz[m.team], foeW = wiz[1 - m.team];
    // They only know what is inside their sense radius, and it widens every second they find
    // nothing: a sweeping search that fans outward until something is in range.
    m.sense += R.minion.search * dt;
    let tgt = null, bd = Infinity;
    for (const o of minions) {
      if (o.team === m.team || o.dying || o.z > m.r * 2) continue;
      const d = dist(m, o);
      if (d < bd && d < m.sense) { bd = d; tgt = o; }
    }
    if (!tgt && alive(foeW) && dist(m, foeW) < m.sense) { tgt = foeW; bd = dist(m, foeW); }    // nobody left in the way: the master
    const speed = R.minion.speed * m.speedK * (m.big ? 0.6 : 1) * (m.rally > clock ? 1.25 : 1) * (m.swingT < 0.45 ? 0.35 : 1);
    if (!tgt) {
      const hunting = alive(foeW) || minions.some((o) => o.team !== m.team && !o.dying);
      if (!hunting) { accelTo(m, { x: own.x + Math.cos(m.walk) * size, y: own.y + Math.sin(m.walk) * size * 0.5 }, speed * 0.5); return; }
      m.searchA += dt * 0.7;
      const ang = m.baseA + Math.sin(m.searchA) * 0.9, reach = Math.min(m.sense * 0.9, Math.hypot(innerWidth, innerHeight));
      let goal = { x: clamp(own.x + Math.cos(ang) * reach, m.r, innerWidth - m.r), y: clamp(own.y + Math.sin(ang) * reach * 0.6, minY(), maxY()) };
      if (!sees(m, goal)) {
        if (clock > m.routeAt) { m.route = route(m, goal); m.routeAt = clock + 0.3; }
        goal = m.route || goal;
      }
      m.face = Math.sign(goal.x - m.x) || m.face;
      accelTo(m, goal, speed * 0.8);
      return;
    }
    m.face = Math.sign(tgt.x - m.x) || m.face;
    const reach = m.r + tgt.r + R.minion.reach, engage = m.ranged ? R.archer.range : reach;
    const canShoot = m.ranged && bd <= engage && sees(m, tgt);
    if (m.ranged && tgt.team !== undefined && bd < R.archer.flee) {
      accelTo(m, { x: m.x + (m.x - tgt.x), y: m.y + (m.y - tgt.y) }, speed);        // archers back away from melee
    } else if (bd > engage || (m.ranged && !canShoot)) {
      let goal = tgt;
      if (!sees(m, tgt)) {
        if (clock > m.routeAt) { m.route = route(m, tgt); m.routeAt = clock + 0.3; }
        goal = m.route || tgt;
      }
      if (m.winding && bd > engage * 1.6) m.winding = false;
      accelTo(m, goal, speed);
      m.dustT -= dt;
      if (Math.hypot(m.vx, m.vy) > 2.2 && m.dustT <= 0) { dust(m); m.dustT = 0.09; }
    } else accelTo(m, m, 0);                         // plant the feet
    if ((m.ranged ? canShoot : bd <= reach) && !m.winding && m.cd <= 0) { m.winding = true; m.swingT = 0; }
    if (m.winding && m.swingT >= (m.ranged ? R.archer.windup : m.big ? R.giant.windup : R.minion.windup)) {
      m.winding = false;
      strike(m, tgt);
      m.cd = m.ranged ? R.archer.cd + rand(0, 0.5) : R.minion.swing * (m.big ? 1.5 : 1) + rand(0, 0.35);
    }
  }

  function updateMinions(dt) {
    if (!minions.length) { clashed = false; return; }
    for (const m of minions) {
      if (m.dying) {
        m.dieT += dt;
        if (m.z > 0) {
          m.vz -= R.minion.gravity * F;
          m.z += m.vz * F;
          if (m.z <= 0) { m.z = 0; m.vz = 0; dust(m, 2); }
        } else { const f = Math.pow(0.85, F); m.vx *= f; m.vy *= f; }
        m.x += m.vx * F;
        m.y += m.vy * F;
        collide(m);
        bounce(m);
        if (m.dieT > (m.crumble ? 0.2 : 0.9) && m.dieT < 1.8 && Math.random() < 0.5) {
          const fy = m.y + mh / 2;
          drop(el("circle", { class: Math.random() < 0.5 ? "ash" : "ash dark", r: rand(0.7, 1.7).toFixed(1) }), m.x + rand(-1, 1) * m.r, fy - rand(0, mh * 0.4), rand(-0.6, 0.6), rand(-1.2, 0), fy + rand(0, 6), rand(1.5, 3));
        }
        continue;
      }
      m.cd -= dt;
      m.swingT += dt;
      m.flash = Math.max(0, m.flash - dt);
      m.squash *= Math.pow(0.85, F);
      if (m.doomed && clock > m.doomed) { killMinion(m, null, true); continue; }
      if (m.z > 0) {                                  // airborne: no steering, only gravity
        m.vz -= R.minion.gravity * F;
        m.z += m.vz * F;
        if (m.z <= 0) { m.z = 0; m.vz = 0; m.squash = 1; dust(m, 3); }
      } else {
        mind(m, dt);
        const sp = Math.hypot(m.vx, m.vy);
        if (sp > R.minion.speed * 1.15) { const f = Math.pow(0.9, F); m.vx *= f; m.vy *= f; }   // ground friction eats a knockback
        m.walk += sp * 0.18 * F;
      }
      m.x += m.vx * F;
      m.y += m.vy * F;
      collide(m);
      bounce(m);
      if (hitsWall(m.x, m.y, m.r * 0.9)) unwedge(m);
    }

    // Bodies can't overlap. Push apart by inverse mass and swap the approaching part of the
    // velocity (small restitution, momentum conserved). Enemies shove harder than friends.
    const live = minions.filter((m) => !m.dying && m.z < m.r * 1.2);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r;
      if (d >= min) continue;
      const nx = dx / d, ny = dy / d, over = (min - d) * (a.team === b.team ? 0.6 : 1), tot = a.mass + b.mass;
      a.x -= nx * over * (b.mass / tot); a.y -= ny * over * (b.mass / tot);
      b.x += nx * over * (a.mass / tot); b.y += ny * over * (a.mass / tot);
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const j2 = (-(1.15) * vn) / (1 / a.mass + 1 / b.mass);
        a.vx -= (j2 / a.mass) * nx; a.vy -= (j2 / a.mass) * ny;
        b.vx += (j2 / b.mass) * nx; b.vy += (j2 / b.mass) * ny;
      }
    }
    for (const w of wiz) {                            // wizards are solid too
      if (!alive(w)) continue;
      for (const m of live) {
        const dx = m.x - w.x, dy = m.y - w.y, d = Math.hypot(dx, dy) || 0.01, min = m.r + w.r * 0.8;
        if (d >= min) continue;
        const nx = dx / d, ny = dy / d, vn = m.vx * nx + m.vy * ny;
        m.x = w.x + nx * min;
        m.y = w.y + ny * min;
        if (vn < 0) { m.vx -= vn * nx; m.vy -= vn * ny; }
      }
    }
    minions = minions.filter((m) => !(m.dying && m.dieT > 2.2) || (m.n.g.remove(), false));
  }

  function drawMinion(m) {
    const n = m.n, bk = m.big ? 2.4 : 1, fy = m.y + (mh * bk) / 2, sp = Math.hypot(m.vx, m.vy), run = m.z > 0 || m.dying ? 0 : Math.min(1, sp / 2);
    const W = m.art.ranged ? R.archer.windup : m.big ? R.giant.windup : R.minion.windup;
    let x = m.x, rot = 0, sx = 1, sy = 1, fade = 1, arm = 0, lunge = 0, leg = Math.sin(m.walk) * 38 * run;
    const bob = m.z > 0 ? 0 : Math.abs(Math.sin(m.walk)) * (m.team ? 2 : 3.6) * run + Math.sin(clock * 2 + m.walk) * 0.4;
    if (m.dying) {
      const k = m.dieT;
      leg = 0;
      if (m.crumble) {                                // dissolves where it stands
        sy = 1 - 0.45 * Math.min(1, k / 0.9);
        fade = 1 - Math.min(1, k / 0.9);
        x += rand(-1, 1) * Math.min(1, k * 3);
      } else {                                        // topples away from the blow, then fades
        const f = Math.min(1, k / 0.35);
        rot = m.fallDir * 90 * f * f;
        fade = clamp(1 - (k - 0.9) / 0.9, 0, 1);
      }
    } else {
      rot = m.face * run * 9 + (m.team ? 0 : Math.sin(m.walk) * 7 * run);   // leans into the run; the sprites waddle side to side
      sx = 1 + 0.2 * m.squash + (m.team ? 0 : Math.sin(m.walk * 2) * 0.06 * run);
      sy = 1 - 0.3 * m.squash - (m.team ? 0 : Math.sin(m.walk * 2) * 0.06 * run);   // squash and stretch with every hop
      const t = m.swingT, S = 0.14, up = m.big ? 70 : 62, ease = (k) => k * k * (3 - 2 * k);
      if (m.art.ranged) arm = t < W ? -4 * (t / W) : 3 * Math.max(0, 1 - (t - W) / 0.2);
      else if (t < W) { const p = ease(t / W); arm = -up * p; rot -= m.face * (m.big ? 6 : 9) * p; sy *= 1 - 0.09 * p; sx *= 1 + 0.05 * p; }   // wind up: lean back, crouch, raise the weapon
      else if (t < W + S) { arm = -up + (up + 100) * ((t - W) / S); lunge = m.big ? 2 : 6; rot += m.face * 12; sx *= 1.1; sy *= 0.94; }   // strike: lunge and lean into it
      else {                                          // recover; a giant squashes from the slam
        const p = Math.max(0, 1 - (t - W - S) / 0.35);
        arm = 100 * p; rot += m.face * 12 * p;
        if (m.big && t < W + S + 0.25) { const k = 1 - (t - W - S) / 0.25; sx *= 1 + 0.1 * k; sy *= 1 - 0.1 * k; }
      }
      if (m.flash > 0) { rot -= m.face * 10 * Math.min(1, m.flash / 0.12); sx *= 0.92; }   // flinch back from a hit
      if (m.z > 0) arm = -40;                         // arms thrown up in the air
    }
    n.mb.setAttribute("transform",
      `translate(${x.toFixed(1)} ${(fy - m.z - bob).toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${(m.face * msc * bk * sx).toFixed(3)} ${(msc * bk * sy).toFixed(3)}) translate(-16 -40)`);
    n.l0.setAttribute("transform", `rotate(${leg.toFixed(1)} ${m.art.hip.join(" ")})`);
    n.l1.setAttribute("transform", `rotate(${(-leg).toFixed(1)} ${m.art.hip.join(" ")})`);
    const [px, py] = m.art.pivot;
    n.wp.setAttribute("transform", `translate(${lunge} 0) rotate(${arm.toFixed(1)} ${px} ${py})`);
    const ss = m.r * 1.2 / (1 + m.z / 45);
    n.sh.setAttribute("transform", `translate(${m.x.toFixed(1)} ${fy.toFixed(1)}) scale(${ss.toFixed(2)})`);
    n.g.style.opacity = fade < 1 ? fade.toFixed(2) : "";
    if (n.eyes && m.art.blink) {                    // blink every few seconds; wide-eyed alarm when hit
      const blink = (clock + m.walk * 7) % 3.4 < 0.12 || m.dying, ey = m.art.eyeY;
      n.eyes.setAttribute("transform", blink ? `translate(0 ${ey}) scale(1 .12) translate(0 ${-ey})` : m.flash > 0 ? `translate(0 ${ey}) scale(1.15) translate(0 ${-ey})` : "");
    }
    if (n.wg) n.wg.setAttribute("transform", `rotate(${(Math.sin(clock * 16 + m.walk) * (m.z > 0 ? 24 : 13) - 4).toFixed(1)} ${m.art.wingPivot.join(" ")})`);
    if (n.drawn) { const nock = m.winding && !m.dying; n.drawn.style.display = nock ? "" : "none"; n.rest.style.display = nock ? "none" : ""; }
    n.g.classList.toggle("hit", m.flash > 0);
    n.g.classList.toggle("rallied", m.rally > clock);
    n.g.classList.toggle("chilled", m.chill > clock);
    if (!m.dying && Math.random() < (m.big ? 0.35 : 0.12) * (0.4 + run)) {   // shadow-stuff peels off them: smoke at the heels, a soul-ember off the head
      const hy = fy - m.z - mh * bk * 0.9;
      mote(m.x - m.face * m.r * 0.6, fy - m.z - mh * bk * 0.25, -m.face * rand(0.1, 0.5), rand(-0.5, -0.15), rand(0.5, 0.9), rand(1.6, 3) * bk, "smoke", -0.01, 1.2);
      if (Math.random() < 0.3) mote(m.x + rand(-4, 4) * bk, hy, rand(-0.2, 0.2), rand(-0.9, -0.4), rand(0.5, 0.9), rand(0.5, 0.9) * bk, `p${m.team}`, -0.02);
    }
  }


  // ---------------------------------------------------------------------------
  // Rune shield. A mystic bubble (rings, a spinning hexagram) that swallows enemy spells until
  // it has absorbed enough or its time runs out. Ripples bright on every hit, shatters when broken.
  // ---------------------------------------------------------------------------
  const shieldR = () => size * 0.62;
  function castShield(w) {
    w.mp -= R.shield.cost;
    w.shieldAt = clock + R.shield.cooldown;
    const [c, hot] = COL[`p${w.i}`], SR = shieldR(), g = el("g", {});
    el("circle", { r: SR * 1.2, fill: `url(#halo-p${w.i})`, stroke: "none" }, g);
    const ring = el("circle", { r: SR, fill: "none", stroke: c, "stroke-width": 1.8 }, g);
    const rune = el("circle", { r: SR * 0.86, fill: "none", stroke: hot, "stroke-width": 0.9, "stroke-dasharray": "2 4", opacity: 0.7 }, g);
    const star = el("g", { fill: "none", stroke: hot, "stroke-width": 0.9, opacity: 0.6 }, g);
    for (const o of [0, 180]) {
      el("path", { d: [0, 1, 2].map((k) => { const a = ((k * 120 + o - 90) * Math.PI) / 180; return `${k ? "L" : "M"}${(Math.cos(a) * SR * 0.62).toFixed(1)} ${(Math.sin(a) * SR * 0.62).toFixed(1)}`; }).join("") + "Z" }, star);
    }
    g.setAttribute("filter", "url(#glow)");
    w.shield = { g, ring, rune, star, hp: R.shield.hp, until: clock + R.shield.life, born: clock, flash: 0 };
    impact(w.x, w.y, `p${w.i}`, 0.5);
  }
  function updateShield(w) {
    const sh = w.shield;
    if (!sh) return;
    const left = sh.until - clock, pop = Math.min(1, (clock - sh.born) / 0.15);
    if (!alive(w) || left <= 0 || sh.hp <= 0) return breakShield(w, sh.hp <= 0 && alive(w));
    sh.flash *= Math.pow(0.88, F);
    sh.g.setAttribute("transform", `translate(${w.x.toFixed(1)} ${w.y.toFixed(1)}) scale(${((0.6 + 0.4 * pop) * (1 + Math.sin(clock * 9) * 0.015)).toFixed(3)})`);
    sh.g.setAttribute("opacity", (Math.min(1, left / 0.4) * (0.75 + 0.25 * sh.flash)).toFixed(2));
    sh.ring.setAttribute("stroke-width", (1.8 + 3.5 * sh.flash).toFixed(1));
    sh.rune.style.strokeDashoffset = (clock * -24).toFixed(1);
    sh.star.setAttribute("transform", `rotate(${(clock * 50).toFixed(0)})`);
  }
  function breakShield(w, shattered) {
    const sh = w.shield;
    if (!sh) return;
    sh.g.remove();
    w.shield = null;
    if (!shattered) return;
    impact(w.x, w.y, `p${w.i}`, 1.1);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      mote(w.x + Math.cos(a) * shieldR(), w.y + Math.sin(a) * shieldR(), Math.cos(a) * 3, Math.sin(a) * 3, 0.7, 1.8, "white", 0.05);
    }
    shake(3, 200);
  }

  // ---------------------------------------------------------------------------
  // Beam duel. When two big spells meet they can lock into opposing beams. The clash point
  // is pushed toward the weaker caster by their mana, health and surges of will; both drain
  // mana as they strain. When it reaches a wizard, that wizard takes the full blast.
  // ---------------------------------------------------------------------------
  function startDuel(x, y) {
    const [w0, w1] = wiz;
    if (duel || !alive(w0) || !alive(w1) || w0.state === "DISTRACTED" || w1.state === "DISTRACTED") return false;
    for (const w of wiz) { go(w, "BEAM"); w.face = Math.sign(wiz[1 - w.i].x - w.x) || w.face; }
    const g = el("g", { filter: "url(#glow)" });
    const beams = [0, 1].map((i) => {
      const [c, hot] = COL[`p${i}`], pl = (stroke, w, o) => el("polyline", { fill: "none", stroke, "stroke-width": w, opacity: o, "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
      return [pl(c, 16, 0.28), pl(c, 7, 0.8), pl(hot, 2.6, 1)];
    });
    duel = {
      born: clock, k: 0.5, g, beams, ringAt: 0, shakeAt: 0, P: { x, y },
      halo: el("circle", { r: 30, fill: "url(#halo-gold)" }, g), core: el("circle", { r: 6, fill: "#fff" }, g),
      flare: el("ellipse", { rx: 130, ry: 3, fill: "url(#flare-gold)" }, fxg), spill: el("circle", { r: 150, fill: "url(#halo-gold)", opacity: 0.35 }, fxg),
    };
    slow(0.4, 1);
    cineUntil = clock + 7;
    flash("#fff");
    return true;
  }
  function updateDuel(dt) {
    const d = duel;
    if (!d) return;
    const [w0, w1] = wiz, t = clock - d.born;
    if (w0.state !== "BEAM" || w1.state !== "BEAM") return endDuel(null);
    const str = (w) => Math.max(0, w.mp) + 0.6 * w.hp + 12 * w.streak + 25 * Math.sin(clock * 3 + w.i * 2);   // will surges
    for (const w of wiz) w.mp = Math.max(0, w.mp - 12 * dt);
    d.k = clamp(d.k + ((str(w0) - str(w1)) / 300 + rand(-0.15, 0.15)) * (1 + t * 0.4) * dt, 0, 1);
    const a = tip(w0), b = tip(w1), P = { x: a.x + (b.x - a.x) * d.k, y: a.y + (b.y - a.y) * d.k };
    d.P = P;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, px = -(b.y - a.y) / len, py = (b.x - a.x) / len;
    [[a, 0], [b, 1]].forEach(([from, i]) => {
      const pts = Array.from({ length: 18 }, (_, n) => {
        const u = n / 17, env = Math.sin(u * Math.PI), off = (Math.sin(n * 0.9 - clock * 40 + i * 3) * 4 + rand(-1.5, 1.5)) * env;
        return `${(from.x + (P.x - from.x) * u + px * off).toFixed(1)},${(from.y + (P.y - from.y) * u + py * off).toFixed(1)}`;
      }).join(" ");
      d.beams[i].forEach((n) => n.setAttribute("points", pts));
    });
    d.halo.setAttribute("cx", P.x.toFixed(1)); d.halo.setAttribute("cy", P.y.toFixed(1));
    d.halo.setAttribute("r", (30 + Math.sin(clock * 30) * 6 + t * 3).toFixed(1));
    d.core.setAttribute("cx", P.x.toFixed(1)); d.core.setAttribute("cy", P.y.toFixed(1));
    for (const n of [d.flare, d.spill]) { n.setAttribute("cx", P.x.toFixed(1)); n.setAttribute("cy", P.y.toFixed(1)); }
    d.flare.setAttribute("rx", (130 * rand(0.8, 1.2) + t * 12).toFixed(0));
    d.spill.setAttribute("r", (150 + Math.sin(clock * 12) * 12).toFixed(0));
    d.core.setAttribute("r", (6 + Math.sin(clock * 40) * 1.5).toFixed(1));
    for (let k = 0; k < 3; k++) {
      const an = rand(0, Math.PI * 2), v = rand(1.5, 4.5);
      mote(P.x, P.y, Math.cos(an) * v, Math.sin(an) * v, rand(0.3, 0.7), rand(0.8, 1.8), ["p0", "p1", "gold", "white"][(Math.random() * 4) | 0], 0.06);
    }
    if (clock > d.ringAt) { d.ringAt = clock + 0.3; impact(P.x, P.y, "gold", 0.5); }
    if (clock > d.shakeAt) { d.shakeAt = clock + 0.5; shake(2, 150); }
    if (d.k <= 0.08) endDuel(w0);
    else if (d.k >= 0.92) endDuel(w1);
    else if (t > 6) endDuel(null);                  // dead even: the beams overload
  }
  function endDuel(loser) {
    const d = duel;
    duel = null;
    d.g.remove();
    d.flare.remove();
    d.spill.remove();
    for (const w of wiz) if (w.state === "BEAM") go(w, "WANDER");
    if (!loser) return bigBoom(d.P.x, d.P.y);
    const win = wiz[1 - loser.i];
    hurt(loser, { dmg: 45, major: true, x: loser.x, y: loser.y, size: 2, kind: `p${win.i}` });
    loser.vx += Math.sign(loser.x - win.x || 1) * 9;               // thrown back by the blast
    bigBoom(loser.x, loser.y);
  }

  // ---------------------------------------------------------------------------
  // Raise the dead. The dark lord drives a wave of dark power through the ground and the
  // fallen (either side's) claw their way back up, as skeletons that fight for him.
  // ---------------------------------------------------------------------------
  function startRaise(w) {
    w.mp -= R.raise.cost;
    w.raiseAt = clock + R.raise.cooldown;
    w.raised = false;
    go(w, "RAISE");
    say(w, LINES.raise);
    cineUntil = Math.max(cineUntil, clock + 2.5);
    const fy = w.y + size * 0.5;
    fx.push({ x: w.x, y: fy, born: clock, life: 0.9, grow: 16, node: el("circle", { class: "shock", cx: w.x, cy: fy, r: 12, stroke: COL.p1[0] }) });
  }
  function raiseDead(w) {
    const pick = graves.filter((g) => clock - g.at < 10).sort((a, b) => dist(a, w) - dist(b, w)).slice(0, R.raise.max);
    for (const g of pick) {
      graves.splice(graves.indexOf(g), 1);
      if (!free(g.x, g.y, size * 0.2)) continue;
      const m = newMinion(w.i, g.x, g.y, rand(-0.5, 0.5), rand(-0.3, 0.3), rand(3, 4.5), w.face);
      m.hp = R.minion.hp * 0.7;                                      // risen bodies are brittle
      const fy = g.y + mh / 2;
      impact(g.x, fy, "p1", 0.8);
      scribble(g.x, fy, 16, 0.5);
      for (let k = 0; k < 6; k++) mote(g.x + rand(-8, 8), fy, rand(-1, 1), rand(-3, -1), rand(0.5, 0.9), rand(1, 2), "white", 0.12);
    }
    shake(4, 260);
    flash("#e0243f");
  }

  // ---------------------------------------------------------------------------
  // The rest of the grimoire: giants (art below), lightning chains, the staff-slam
  // shockwave, the healing rally, the meteor storm, sling-ring portals and a dragon.
  // ---------------------------------------------------------------------------
  function damageWizard(w, dmg, x, y, kind) {      // a shield swallows area damage too
    if (!alive(w)) return;
    if (w.shield) { w.shield.hp -= dmg; w.shield.flash = 1; impact(x, y, kind, 0.6); return; }
    hurt(w, { dmg, major: dmg > 20, x: w.x, y: w.y, size: 1.2, kind });
  }

  // An area blast: damage and a shove that fall off with distance. Everything it flings obeys gravity.
  // A scorch mark burned into the ground, fading over a quarter of a minute. Capped so a long storm never piles them up.
  function scorch(x, y, rad) {
    if (fx.length > 200) return;
    fx.push({ x, y, born: clock, life: 22, flat: true, node: el("ellipse", { cx: x, cy: y, rx: rad, ry: rad * 0.38, fill: "rgba(0,0,0,.45)" }, ground) });
  }
  function blast(x, y, rad, owner, dmg, kind) {
    if (rad >= 80) scorch(x, y + mh * 0.5, rad * 0.55);
    for (const o of minions) {
      if (o.team === owner || o.dying) continue;
      const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy);
      if (d > rad + o.r) continue;
      const f = 1 - Math.min(1, d / rad), n = d ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
      o.hp -= dmg * (0.4 + 0.6 * f);
      o.vx += (n.x * 7 * f) / o.mass;
      o.vy += (n.y * 5 * f) / o.mass;
      if (!o.z) { o.z = 0.01; o.vz = 2.5 + (4 * f) / Math.sqrt(o.mass); }
      o.flash = 0.15;
      if (o.hp <= 0) killMinion(o, n);
    }
    const foe = wiz[1 - owner];
    if (alive(foe) && dist(foe, { x, y }) < rad * 0.9) damageWizard(foe, dmg * 0.6, x, y, kind);
    impact(x, y, kind, 1);
  }

  // Chain lightning: from the wand to the target, then jumping to the nearest enemy minion each time.
  function chainLightning(w, first) {
    w.mp -= R.chain.cost;
    w.chainAt = clock + R.chain.cooldown;
    w.face = Math.sign(first.x - w.x) || w.face;
    w.lean = 1.6;
    say(w, LINES.chain);
    const hit = new Set(), pts = [tip(w)];
    let cur = first;
    for (let j = 0; j < R.chain.jumps && cur; j++) {
      hit.add(cur);
      pts.push({ x: cur.x, y: cur.y });
      cur.hp -= R.chain.dmg * (1 - j * 0.15);
      cur.flash = 0.2;
      burst(cur.x, cur.y, ["white", "blue"], 6, 8, 0.3);
      const from = pts[pts.length - 2];
      if (cur.hp <= 0) killMinion(cur, { x: Math.sign(cur.x - from.x) || 1, y: 0 });
      let nx = null, nd = R.chain.range;
      for (const o of minions) {
        if (o.team === w.i || o.dying || hit.has(o)) continue;
        const d = dist(cur, o);
        if (d < nd) { nd = d; nx = o; }
      }
      cur = nx;
    }
    const g = el("g", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round", filter: "url(#glow)" });
    const layers = [[COL.white[0], 6, 0.35], [COL.blue[1], 2.6, 0.9], ["#fff", 1.1, 1]].map(([c, wd, o]) => el("polyline", { stroke: c, "stroke-width": wd, opacity: o }, g));
    const path = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = 7, len = Math.hypot(b.x - a.x, b.y - a.y) || 1, px = -(b.y - a.y) / len, py = (b.x - a.x) / len;
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const u = k / n, off = k === 0 || k === n ? 0 : rand(-7, 7);
        path.push(`${(a.x + (b.x - a.x) * u + px * off).toFixed(1)},${(a.y + (b.y - a.y) * u + py * off).toFixed(1)}`);
      }
    }
    layers.forEach((n) => n.setAttribute("points", path.join(" ")));
    fx.push({ x: pts[0].x, y: pts[0].y, born: clock, life: 0.4, flat: true, node: g });
    flash("#bcd8ff");
  }

  // Staff slam: a shockwave that throws everything around the caster outward.
  function staffSlam(w) {
    w.mp -= R.slam.cost;
    w.slamAt = clock + R.slam.cooldown;
    w.lean = 2.2;
    say(w, LINES.slam);
    const fy = w.y + size * 0.5;
    fx.push({ x: w.x, y: fy, born: clock, life: 0.6, grow: 22, node: el("circle", { class: "shock", cx: w.x, cy: fy, r: 10, stroke: COL.gold[0] }) });
    fx.push({ x: w.x, y: fy, born: clock, life: 0.45, grow: 14, node: el("circle", { class: "shock thin", cx: w.x, cy: fy, r: 8, stroke: "#fff" }) });
    scribble(w.x, fy, 40, 0.6);
    blast(w.x, w.y, R.slam.radius, w.i, R.slam.dmg * 2, "gold");
    const foe = wiz[1 - w.i];
    if (alive(foe) && dist(w, foe) < R.slam.radius) { foe.vx += Math.sign(foe.x - w.x || 1) * 8; foe.flinch = 1.5; }
    shake(6, 300);
    slow(0.5, 0.4);
  }

  // Frost nova: a ring of ice rolls out from the caster. Everything it touches is chilled and crawls for a few seconds.
  function frostNova(w) {
    w.mp -= R.frost.cost;
    w.frostAt = clock + R.frost.cooldown;
    w.lean = 2;
    say(w, LINES.frost);
    const fy = w.y + size * 0.5, rad = R.frost.radius, [c] = COL.blue, foe = wiz[1 - w.i];
    fx.push({ x: w.x, y: fy, born: clock, life: 0.7, grow: 22, node: el("circle", { class: "shock", cx: w.x, cy: fy, r: 10, stroke: c }) });
    fx.push({ x: w.x, y: fy, born: clock, life: 0.5, grow: 15, node: el("circle", { class: "shock thin", cx: w.x, cy: fy, r: 8, stroke: "#fff" }) });
    fx.push({ x: w.x, y: fy, born: clock, life: 0.6, grow: 5, node: el("circle", { cx: w.x, cy: fy, r: rad * 0.5, fill: "url(#halo-blue)" }, fxg) });
    for (let k = 0, n = innerWidth < 700 ? 10 : 18; k < n; k++) {       // ice shards fly out and fall
      const a = (k / n) * Math.PI * 2 + rand(-0.2, 0.2), v = rand(2, 4.5);
      mote(w.x, fy, Math.cos(a) * v, Math.sin(a) * v * 0.5, rand(0.6, 1), rand(1.2, 2.4), k % 2 ? "blue" : "white", 0.05);
    }
    for (const m of minions) {
      if (m.team === w.i || m.dying || dist(m, { x: w.x, y: fy - size * 0.3 }) > rad + m.r) continue;
      m.chill = clock + R.frost.life;
      m.hp -= R.frost.dmg;
      m.flash = 0.15;
      if (m.hp <= 0) killMinion(m, { x: Math.sign(m.x - w.x) || 1, y: 0 });
    }
    if (alive(foe) && dist(foe, w) < rad) { foe.chill = clock + R.frost.life; damageWizard(foe, R.frost.dmg, foe.x, foe.y, "blue"); }
    flash("#bcd8ff");
    shake(3, 200);
  }

  // Soul drain: crimson beams reach into the nearest enemy minions, bleed them and feed the dark lord.
  function soulDrain(w) {
    const foes = minions.filter((m) => m.team !== w.i && !m.dying && dist(m, w) < R.drain.range && sees(w, m)).sort((a, b) => dist(a, w) - dist(b, w)).slice(0, R.drain.jumps);
    if (!foes.length) return;
    w.mp -= R.drain.cost;
    w.drainAt = clock + R.drain.cooldown;
    w.face = Math.sign(foes[0].x - w.x) || w.face;
    w.lean = 1.6;
    say(w, LINES.drain);
    const from = tip(w), g = el("g", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round", filter: "url(#glow)" });
    for (const m of foes) {
      m.hp -= R.drain.dmg;
      m.flash = 0.2;
      w.hp = Math.min(R.hp, w.hp + R.drain.heal);
      const len = Math.hypot(m.x - from.x, m.y - from.y) || 1, px = -(m.y - from.y) / len, py = (m.x - from.x) / len, pts = [];
      for (let k = 0; k <= 9; k++) { const u = k / 9, off = k === 0 || k === 9 ? 0 : Math.sin(u * 9) * 7; pts.push(`${(from.x + (m.x - from.x) * u + px * off).toFixed(1)},${(from.y + (m.y - from.y) * u + py * off).toFixed(1)}`); }
      [[COL.p1[0], 5, 0.4], [COL.p1[1], 1.8, 0.95]].forEach(([c, wd, o]) => el("polyline", { points: pts.join(" "), stroke: c, "stroke-width": wd, opacity: o }, g));
      for (let k = 0; k < 4; k++) mote(m.x + rand(-6, 6), m.y + rand(-6, 6), (from.x - m.x) / 36, (from.y - m.y) / 36, 0.6, rand(1.2, 2.2), "p1");   // souls stream back to him
      if (m.hp <= 0) killMinion(m, { x: Math.sign(m.x - from.x) || 1, y: 0 });
    }
    fx.push({ x: from.x, y: from.y, born: clock, life: 0.45, flat: true, node: g });
    impact(from.x, from.y, "p1", 0.5);
  }

  // Rally: the good wizard's cry heals the horde and speeds it up for a few seconds.
  function castRally(w) {
    w.mp -= R.rally.cost;
    w.rallyAt = clock + R.rally.cooldown;
    say(w, LINES.rally);
    const fy = w.y + size * 0.5;
    fx.push({ x: w.x, y: fy, born: clock, life: 0.8, grow: 18, node: el("circle", { class: "shock", cx: w.x, cy: fy, r: 10, stroke: COL.gold[0] }) });
    flash("#f2c94c");
    for (const m of minions) {
      if (m.team !== w.i || m.dying) continue;
      m.hp = Math.min(m.big ? R.giant.hp : R.minion.hp, m.hp + 12);
      m.rally = clock + R.rally.life;
      for (let k = 0; k < 6; k++) mote(m.x + rand(-8, 8), m.y + rand(-4, 8), rand(-0.3, 0.3), rand(-1.6, -0.6), rand(0.7, 1.2), rand(1, 2), "gold", -0.01);
    }
  }

  // Meteor storm: reticles burn onto the ground, then burning stars fall from the sky on a slant.
  function startStorm(w) {
    w.mp -= R.meteor.cost;
    w.meteorAt = clock + R.meteor.cooldown;
    w.stormed = false;
    go(w, "STORM");
    say(w, LINES.meteor);
    cineUntil = Math.max(cineUntil, clock + 3.5);
  }
  function launchStorm(w) {
    const foe = wiz[1 - w.i], foes = minions.filter((m) => m.team !== w.i && !m.dying), spots = [{ x: foe.x, y: foe.y }];
    for (let i = 0; i < 2 && foes.length; i++) { const m = foes[(Math.random() * foes.length) | 0]; spots.push({ x: m.x, y: m.y }); }
    while (spots.length < R.meteor.count) spots.push({ x: foe.x + rand(-170, 170), y: foe.y + rand(-90, 90) });
    const kind = w.i ? "orange" : "gold";
    spots.forEach((p, i) => {
      const tx = clamp(p.x, 20, innerWidth - 20), ty = clamp(p.y, minY(), maxY());
      const ret = el("ellipse", { cx: tx, cy: ty + size * 0.4, rx: 44, ry: 15, fill: "none", stroke: COL[kind][0], "stroke-width": 1.4, "stroke-dasharray": "4 4" }, ground);
      meteors.push({ owner: w.i, kind, tx, ty, ret, g: null, born: clock, delay: 0.25 + i * 0.28, fall: 0.75 });
    });
    shake(2, 400);
  }
  function updateMeteors() {
    meteors = meteors.filter((m) => {
      const t = clock - m.born - m.delay;
      m.ret.setAttribute("opacity", (0.45 + 0.35 * Math.sin(clock * 14)).toFixed(2));
      m.ret.style.strokeDashoffset = (clock * -30).toFixed(0);
      if (t < 0) return true;
      const [c, hot] = COL[m.kind];
      if (!m.g) {
        m.g = el("g", { filter: "url(#glow)" });
        m.halo = el("circle", { r: 28, fill: `url(#halo-${m.kind})` }, m.g);
        m.tail = el("path", { fill: c, opacity: 0.55 }, m.g);
        m.core = el("circle", { r: 6, fill: hot }, m.g);
      }
      const u = Math.min(1, t / m.fall), e = u * u, sx = m.tx + 260, sy = -70;
      const x = sx + (m.tx - sx) * e, y = sy + (m.ty - sy) * e;
      const L = Math.hypot(sx - m.tx, sy - m.ty), ux = (sx - m.tx) / L, uy = (sy - m.ty) / L, px = -uy, py = ux;
      m.halo.setAttribute("cx", x.toFixed(1)); m.halo.setAttribute("cy", y.toFixed(1));
      m.core.setAttribute("cx", x.toFixed(1)); m.core.setAttribute("cy", y.toFixed(1));
      m.tail.setAttribute("d", `M${(x + px * 7).toFixed(1)} ${(y + py * 7).toFixed(1)}L${(x + ux * 110).toFixed(1)} ${(y + uy * 110).toFixed(1)}L${(x - px * 7).toFixed(1)} ${(y - py * 7).toFixed(1)}Z`);
      mote(x + ux * 10 + rand(-3, 3), y + uy * 10 + rand(-3, 3), ux * 0.5 + rand(-0.4, 0.4), uy * 0.5 + rand(-0.4, 0.4), 0.5, rand(1, 2.4), Math.random() < 0.5 ? m.kind : "white");
      if (u < 1) return true;
      m.g.remove();
      m.ret.remove();
      blast(m.tx, m.ty, 58, m.owner, 40, m.kind);
      impact(m.tx, m.ty, m.kind, 1.6);
      scribble(m.tx, m.ty, 30, 0.8);
      fx.push({ x: m.tx, y: m.ty, born: clock, life: 1.6, flat: true, node: el("circle", { cx: m.tx, cy: m.ty, r: 26, fill: `url(#halo-${m.kind})` }, ground) });   // the crater glows
      shake(5, 250);
      return false;
    });
  }

  // Sling-ring portals: step into one, out of another. Used to dodge a spell or escape a beating.
  function portalDest(w, foe) {
    const p = coverSpot(w, foe) || anySpot(w.r, foe);
    return p && free(p.x, p.y, w.r) ? p : null;
  }
  function startPortal(w, dest) {
    w.mp -= R.portal.cost;
    w.portalAt = clock + R.portal.cooldown;
    w.portal = { to: dest, moved: false };
    go(w, "PORTAL");
    openPortal(w.x, w.y);
  }
  function openPortal(x, y) {
    const R0 = size * 0.5, g = el("g", {});
    el("circle", { cx: 0, cy: 0, r: R0, fill: "url(#portalDisc)" }, g);
    const ring = el("circle", { cx: 0, cy: 0, r: R0, fill: "none", stroke: COL.orange[0], "stroke-width": 2.4 }, g);
    const dash = el("circle", { cx: 0, cy: 0, r: R0 * 0.8, fill: "none", stroke: COL.orange[1], "stroke-width": 1, "stroke-dasharray": "3 5" }, g);
    g.setAttribute("filter", "url(#glow)");
    portals.push({ x, y, born: clock, life: 0.9, g, ring, dash, R0 });
  }
  function updatePortals() {
    portals = portals.filter((p) => {
      const k = (clock - p.born) / p.life;
      if (k >= 1) { p.g.remove(); return false; }
      const pop = Math.sin(Math.PI * Math.min(1, k)) ** 0.5;
      p.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(pop * 0.85).toFixed(3)} ${pop.toFixed(3)})`);
      p.dash.style.strokeDashoffset = (clock * -50).toFixed(0);
      for (let n = 0; n < 2; n++) {                // sparks spin off the rim like a sling ring
        const a = rand(0, Math.PI * 2), r = p.R0 * pop;
        mote(p.x + Math.cos(a) * r * 0.85, p.y + Math.sin(a) * r, -Math.sin(a) * 3.5, Math.cos(a) * 3.5, 0.4, rand(0.8, 1.6), Math.random() < 0.5 ? "orange" : "gold", 0.04);
      }
      return true;
    });
  }

  // The dragon: a rare, neutral fly-by. It breathes fire down along its path, scorching the text,
  // burning anything caught in the stream, then flies on.
  // Dragon-fire: a particle fluid on its own canvas, drawn additively. Hot gas is thrown out of the mouth in a
  // narrow cone, then drag, turbulence and buoyancy spread it out, billow it up and roll it along the ground.
  // Each puff grows, cools from white-hot through yellow and orange to dull red, and fades. It splashes off
  // the floor into lingering ground fire and rebounds off the text.
  const fireCv = document.createElement("canvas");
  fireCv.id = "fire";
  fireCv.setAttribute("aria-hidden", "true");
  document.body.appendChild(fireCv);
  const fctx = fireCv.getContext("2d");
  const sizeFire = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    fireCv.width = innerWidth * dpr;
    fireCv.height = innerHeight * dpr;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const RAMP = [[0, [255, 250, 214]], [0.2, [255, 216, 112]], [0.45, [255, 142, 42]], [0.72, [222, 62, 22]], [1, [110, 22, 10]]];
  const rampAt = (k) => {
    for (let i = 1; i < RAMP.length; i++) {
      if (k <= RAMP[i][0]) { const [k0, c0] = RAMP[i - 1], [k1, c1] = RAMP[i], u = (k - k0) / (k1 - k0); return c0.map((v, j) => Math.round(v + (c1[j] - v) * u)); }
    }
    return RAMP[RAMP.length - 1][1];
  };
  const SPRITES = Array.from({ length: 24 }, (_, i) => {
    const [r, g, b] = rampAt(i / 23), c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(0.35, `rgba(${r},${g},${b},.55)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return c;
  });
  let flames = [];
  function emitFlames(mx, my, dx, dy, sc) {
    const S = size / 60, n = Math.round(16 * F + Math.random());
    for (let i = 0; i < n && flames.length < 900; i++) {
      const tongue = Math.random() < 0.14, sp = (tongue ? rand(14, 19) : rand(9, 14)) * S;
      const ang = Math.atan2(dy, dx) + rand(-0.1, 0.1) * (tongue ? 0.5 : 1);
      flames.push({ x: mx + rand(-3, 3), y: my + rand(-3, 3), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, life: tongue ? rand(0.8, 1.2) : rand(0.55, 0.95),
        r0: rand(3, 6) * sc * 0.5, r1: rand(18, 32) * sc * 0.42 * (tongue ? 1.15 : 1), seed: Math.random() * 6.3 });
    }
  }
  function drawFire(dt) {
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    if (!flames.length) return;
    fctx.globalCompositeOperation = "lighter";
    const gy = maxY() + size * 0.35, born = [];
    flames = flames.filter((p) => {
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) return false;
      p.vx += Math.sin(p.y * 0.035 + clock * 9 + p.seed) * 0.09 * F * (0.4 + p.age * 2.2);                                 // turbulence
      p.vy += (Math.cos(p.x * 0.035 + clock * 8 + p.seed) * 0.09 * (0.4 + p.age * 2.2) - (p.ground ? 0.012 : 0.022 + p.age * 0.06)) * F;      // and buoyancy: hot gas rises
      const dr = Math.pow(p.ground ? 0.96 : 0.986, F);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * F; p.y += p.vy * F;
      if (p.y > gy) {                                                                                  // splashes off the floor and rolls along it
        p.y = gy; p.vy = -Math.abs(p.vy) * 0.12; p.vx *= 1.04;
        if (!p.ground) {
          p.ground = true;
          if (Math.random() < 0.18) born.push({ x: p.x + rand(-6, 6), y: gy, vx: rand(-0.4, 0.4), vy: -0.3, age: 0, life: rand(1.2, 2.2), r0: 6, r1: rand(16, 26), seed: Math.random() * 6.3, ground: true });
        }
      }
      if (p.vx * p.vx + p.vy * p.vy > 1) {
        let inside = false;
        for (const w of walls) {
          if (p.x > w.l && p.x < w.r && p.y > w.t && p.y < w.b) {                                      // rebounds off the text blocks...
            inside = true;
            if (!p.out) break;                                                                         // ...unless it was born inside one: then it just burns through
            const dl = p.x - w.l, dR = w.r - p.x, dt2 = p.y - w.t, db = w.b - p.y, m = Math.min(dl, dR, dt2, db);
            if (m === dl) p.x = w.l; else if (m === dR) p.x = w.r; else if (m === dt2) p.y = w.t; else p.y = w.b;
            p.vx *= -0.35; p.vy *= -0.35;
            break;
          }
        }
        if (!inside) p.out = true;
      }
      const r = p.r0 + (p.r1 - p.r0) * Math.pow(k, 0.7), a = Math.min(1, k / 0.08) * Math.pow(1 - k, 0.9) * 0.6;
      fctx.globalAlpha = a;
      fctx.drawImage(SPRITES[Math.min(23, (k * 23) | 0)], p.x - r, p.y - r, r * 2, r * 2);
      return true;
    });
    if (born.length) flames = flames.concat(born);
    fctx.globalAlpha = 1;
  }

  // --- the dragons: three shadow silhouettes (dragon-art.js), each cut into back wing, front wing, head and a two-piece tail
  // hung from joints; the base keeps the rest. Each has its own timing (speed, wing beat, when it breathes, how long between visits).
  function dragonRig(def) {
    const pc = (k, inner = "") => `<g data-r="${k}"><path d="${def.p[k]}" fill="#050403"/>${inner}</g>`;
    return `<g transform="translate(${def.tx} ${def.ty}) scale(${-def.k} ${def.k})">${pc("wb")}${pc("wf")}<path d="${def.p.base}" fill="#050403"/>${pc("t1", pc("t2"))}`
      + `${pc("hd", `<ellipse class="dmouth" cx="${def.mouth[0] + 16}" cy="${def.mouth[1] + 4}" rx="11" ry="7"/>`)}</g>`;
  }
  // Wings beat with a down-stroke that is slower than the recovery; the body bobs against them and the head and tail trail behind.
  function poseDragon(d, t) {
    const w = t * d.cfg.flap, R = d.rig, P = d.def.pv, rot = (k, a) => R[k].setAttribute("transform", `rotate(${a.toFixed(1)} ${P[k][0]} ${P[k][1]})`);
    const flap = Math.sin(w) + 0.25 * Math.sin(2 * w - 0.6), sq = 0.8 + 0.2 * Math.cos(w);   // the wing foreshortens as it rises
    const wing = (k, a, ph) => R[k].setAttribute("transform", `translate(${P[k][0]} ${P[k][1]}) rotate(${(a * Math.sin(w + ph)).toFixed(1)}) scale(1 ${(sq + 0.1 * Math.sin(w + ph)).toFixed(3)}) translate(${-P[k][0]} ${-P[k][1]})`);
    wing("wf", 22, 0); wing("wb", 15, 0.45);
    d.bob = -Math.cos(w + 0.3) * 5 * d.sc;                                                   // lifts on the down-stroke
    const tw = t * 3.4;
    rot("hd", Math.sin(t * 2.2 - 0.8) * 3 - flap * 2 + d.jaw * 9);
    rot("t1", Math.sin(tw) * 5 + flap * 1.5); rot("t2", Math.sin(tw - 1.2) * 12);
  }

  function spawnDragon() {
    const dir = Math.random() < 0.5 ? 1 : -1, g = el("g", { class: "dragon", filter: "url(#glow)" });
    // Never the same dragon twice running. The art faces left, so dragonRig flips it into the right-facing frame the rest of the code expects, mouth at (116, 21).
    const pick = (dragonIdx + 1 + Math.floor(Math.random() * (DRAGONS.length - 1))) % DRAGONS.length, def = DRAGONS[pick];
    dragonIdx = pick;
    g.innerHTML = dragonRig(def);
    g.setAttribute("filter", "url(#dout)");
    const sh = el("ellipse", { rx: 1, ry: 0.16, fill: "rgba(0,0,0,.4)" }, ground);
    dragon = { g, sh, dir, jaw: 0, rig: Object.fromEntries([...g.querySelectorAll("[data-r]")].map((n) => [n.dataset.r, n])), def, cfg: def.cfg, mouth: g.querySelector(".dmouth"), glow: el("circle", { r: 150, fill: "url(#halo-orange)", opacity: 0 }, fxg), sc: (clamp(innerWidth * 0.28, 120, 400) / 113) * def.cfg.scale, x: dir > 0 ? -300 : innerWidth + 300, y: 0, t0: clock, hitAt: 0, glowAt: 0, roared: false };
    cineUntil = Math.max(cineUntil, clock + 5);
    slow(0.6, 0.6);
    shake(3, 700);                                  // the roar
  }
  function updateDragon(dt) {
    if (!dragon) {
      if (clock > nextDragon && alive(wiz[0]) && alive(wiz[1]) && !duel) spawnDragon();
      return;
    }
    const d = dragon, t = clock - d.t0, sc = d.sc;
    d.x += d.dir * d.cfg.speed * F;
    const u = d.dir > 0 ? (d.x + 300) / (innerWidth + 600) : 1 - (d.x + 300) / (innerWidth + 600);
    d.y = top + innerHeight * (d.cfg.fy + 0.1 * Math.sin(Math.PI * clamp(u, 0, 1))) + Math.sin(t * 1.6) * 16;   // dips as it passes over the fight
    const breathing = d.cfg.breath.some(([a, b]) => u > a && u < b);
    d.jaw += ((breathing ? 1 : 0) - d.jaw) * (1 - Math.pow(0.82, F));        // the jaw swings open to breathe, the head tips down
    poseDragon(d, t);
    d.mouth.setAttribute("fill", d.jaw > 0.25 ? "#ff9a3a" : "#0a0605");
    const tilt = d.dir * (Math.sin(t * 1.6) * 2.5 + d.jaw * 14), tr = (tilt * Math.PI) / 180;
    d.g.setAttribute("transform", `translate(${d.x.toFixed(1)} ${(d.y + d.bob).toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${(d.dir * sc).toFixed(3)} ${sc.toFixed(3)}) translate(-60 -30)`);
    d.sh.setAttribute("transform", `translate(${d.x.toFixed(1)} ${(innerHeight - 10).toFixed(1)}) scale(${(sc * 62).toFixed(1)} ${(sc * 62).toFixed(1)})`);
    d.sh.setAttribute("opacity", (0.7 - (innerHeight - d.y) / innerHeight * 0.3).toFixed(2));
    if (breathing) {
      if (!d.roared) { d.roared = true; flash("#ff7a2c"); shake(4, 500); slow(0.7, 0.5); }
      const rx = d.dir * 56 * sc, ry = -9 * sc, mx = d.x + rx * Math.cos(tr) - ry * Math.sin(tr), my = d.y + rx * Math.sin(tr) + ry * Math.cos(tr), ang = (32 * Math.PI) / 180, dx = d.dir * Math.cos(ang), dy = Math.sin(ang);
      const L = clamp((maxY() + size * 0.4 - my) / dy, 160, 420), ex = mx + dx * L, ey = my + dy * L, qx = -dy, qy = dx;
      emitFlames(mx, my, dx, dy, sc);
      d.glow.setAttribute("cx", (mx + dx * L * 0.5).toFixed(1)); d.glow.setAttribute("cy", (my + dy * L * 0.5).toFixed(1));       // the stream lights the page
      d.glow.setAttribute("r", (190 + Math.sin(clock * 25) * 18).toFixed(0)); d.glow.setAttribute("opacity", (0.42 + Math.random() * 0.12).toFixed(2));
      if (Math.random() < 0.5) mote(mx + dx * rand(40, L), my + dy * rand(40, L), rand(-0.5, 0.5), rand(-1, -0.3), 0.9, rand(3, 5), "smoke", -0.02, 1.2);
      if (Math.random() < 0.7) mote(mx + dx * rand(30, L), my + dy * rand(30, L), rand(-1, 1), rand(-2.2, -0.6), rand(0.6, 1.2), rand(0.8, 1.6), Math.random() < 0.5 ? "gold" : "orange", -0.03);   // embers
      if (clock > d.glowAt) {                       // the ground where the fire lands keeps glowing
        d.glowAt = clock + 0.15;
        fx.push({ x: ex, y: ey, born: clock, life: 1.3, flat: true, node: el("circle", { cx: ex, cy: ey, r: 34, fill: "url(#halo-orange)" }, ground) });
        impact(ex, ey, "orange", 0.35);
      }
      for (const w of walls) {
        if (w.el && !w.el.classList.contains("scorch") && segHits(mx, my, ex, ey, w)) {
          w.el.classList.add("scorch");
          setTimeout(() => w.el.classList.remove("scorch"), 2300);
        }
      }
      if (clock > d.hitAt) {                       // the stream hurts whatever stands in it
        d.hitAt = clock + 0.35;
        const near = (o, rad) => { const l2 = (ex - mx) ** 2 + (ey - my) ** 2, tt = clamp(((o.x - mx) * (ex - mx) + (o.y - my) * (ey - my)) / l2, 0, 1); return Math.hypot(o.x - (mx + (ex - mx) * tt), o.y - (my + (ey - my) * tt)) < rad + 0.2 * tt * Math.sqrt(l2); };   // the cone widens with distance
        for (const w of wiz) if (alive(w) && near(w, 34)) damageWizard(w, 7, w.x, w.y, "orange");
        for (const m of minions) if (!m.dying && near(m, 30)) { m.hp -= 10; m.flash = 0.15; burst(m.x, m.y, ["orange", "gold"], 0, 5, 0.3); if (m.hp <= 0) killMinion(m, { x: d.dir, y: 0.4 }); }
      }
    } else d.glow.setAttribute("opacity", 0);
    if (d.x < -340 || d.x > innerWidth + 340) { d.g.remove(); d.glow.remove(); d.sh.remove(); dragon = null; nextDragon = clock + rand(...d.cfg.gap); }
  }

  const ELF = ARMY.art("elf"), RANGER = ARMY.art("ranger");

  // Arrows fly on a real arc: ground position plus a height with gravity, drawn lifted by that height.
  function shootArrow(m, tgt) {
    const lead = 0.7, g = 0.12, sp = R.archer.speed;
    const d0 = Math.hypot(tgt.x - m.x, tgt.y - m.y) || 1, T = Math.max(6, d0 / sp);
    const tx = tgt.x + (tgt.vx || 0) * T * lead, ty = tgt.y + (tgt.vy || 0) * T * lead;
    const z0 = mh * 0.55, zt = tgt.team === undefined ? size * 0.45 : mh * 0.4;
    const node = el("g", { class: `arrow a${m.team}` });
    node.innerHTML = '<path class="arw" d="M-10 0 L2 0 M-10 0 L-12 -1.6 M-10 0 L-12 1.6 M-8 0 L-10 -1.6 M-8 0 L-10 1.6"/><path class="arwh" d="M3 0 L-0.6 -1.7 L-0.6 1.7Z"/>';
    arrows.push({ team: m.team, x: m.x + m.face * m.r, y: m.y, z: z0, vx: (tx - m.x) / T, vy: (ty - m.y) / T, vz: (zt - z0 + 0.5 * g * T * T) / T, g, stuck: 0, node });
    m.vx -= m.face * 0.3;                          // a little recoil
  }
  function updateArrows(dt) {
    arrows = arrows.filter((a) => {
      if (a.stuck) {                               // stuck in the ground, fading
        a.stuck -= dt;
        a.node.setAttribute("opacity", Math.min(1, a.stuck / 0.5).toFixed(2));
        if (a.stuck > 0) return true;
        a.node.remove();
        return false;
      }
      a.x += a.vx * F; a.y += a.vy * F; a.vz -= a.g * F; a.z += a.vz * F;
      const foe = wiz[1 - a.team];
      let hit = false;
      for (const m of minions) {
        if (m.team === a.team || m.dying || a.z > mh * 1.05 || dist(m, a) > m.r + 3) continue;
        m.hp -= R.archer.dmg;
        m.vx += a.vx * 0.5 / m.mass; m.vy += a.vy * 0.5 / m.mass;
        m.flash = 0.12;
        burst(a.x, a.y - a.z, ["white"], 0, 4, 0.2);
        if (m.hp <= 0) killMinion(m, { x: Math.sign(a.vx) || 1, y: 0 });
        hit = true;
        break;
      }
      if (!hit && alive(foe)) {
        if (foe.shield && dist(foe, a) < shieldR() * 0.95) { foe.shield.hp -= R.archer.dmg; foe.shield.flash = 1; impact(a.x, a.y - a.z, `p${foe.i}`, 0.4); hit = true; }
        else if (dist(foe, a) < foe.r + 3 && a.z < size * 0.9) { damageWizard(foe, R.archer.wizDmg, a.x, a.y - a.z, "white"); hit = true; }
      }
      if (hit) { a.node.remove(); return false; }
      if (a.z <= 0 || walls.some((w) => a.x > w.l && a.x < w.r && a.y > w.t && a.y < w.b)) { a.stuck = 1.4; a.z = Math.max(0, a.z); }
      if (a.x < -50 || a.x > innerWidth + 50) { a.node.remove(); return false; }
      const sx = a.vx, sy = a.vy - a.vz;
      a.node.setAttribute("transform", `translate(${a.x.toFixed(1)} ${(a.y - a.z).toFixed(1)}) rotate(${((Math.atan2(sy, sx) * 180) / Math.PI).toFixed(1)}) scale(${(size / 40).toFixed(2)})`);
      return true;
    });
  }


  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function drawBody(e) {
    const breath = Math.sin(clock * 2.4 + e.owner * 2);
    const moving = Math.hypot(e.vx, e.vy) > 0.3;
    const y = e.y + breath * 0.8 - (moving ? Math.abs(Math.sin(e.walk)) * 2 : 0);
    e.lean *= Math.pow(0.9, F);
    e.flinch *= Math.pow(0.88, F);
    // Poked: upright, a touch bigger and trembling, as if turned to face the visitor.
    const poked = e.state === "DISTRACTED", grow = (poked ? 1.12 : 1) * (e.vis ?? 1);
    let x = e.x, yy = y, kneel = 1;
    let rot = poked ? Math.sin(clock * 40) * 2 : e.face * (e.lean * 8 - e.flinch * 10 + (moving ? 3 : 0));
    const dying = e.state === "DEATH_ANIMATION", k = dying ? Math.min(1, (clock - e.since) / R.death) : 0;
    if (dying) {                                   // sinks to its knees, shakes harder and fades as it turns to ash
      const sink = Math.min(1, k * 5);
      kneel = 1 - 0.28 * sink;
      yy += size * 0.14 * sink;
      x += rand(-1, 1) * (1 + k * 5);
      yy += rand(-1, 1) * k * 3;
      rot = e.face * 8 * sink;
    } else if (e.state === "BEAM") {                // braced, arms driving the beam, trembling with the strain
      rot = e.face * 6;
      x += rand(-1, 1) * 1.3;
    } else if (e.state === "SUMMON" || e.state === "RAISE" || e.state === "STORM") {              // arms up, hovering while the circle burns
      yy -= 4 + Math.sin(clock * 8) * 1.2;
      rot = -e.face * 7;
    } else if (e.state === "VICTORY") {            // levitates, staff raised
      yy -= 6 + Math.sin(clock * 3) * 2;
      rot = -e.face * 6;
    }
    // The casting arm: hangs and sways when idle, swings with the stride, flicks up with every cast, braces forward for a beam, goes high for summons and victory.
    const hold = dying ? 25 : e.state === "BEAM" ? -60 : e.state === "SUMMON" || e.state === "RAISE" || e.state === "STORM" ? -115 : e.state === "VICTORY" ? -125 : poked ? 0 : Math.sin(clock * 1.8 + e.owner) * 4 + (moving ? Math.sin(e.walk) * 12 : 0) - Math.max(0, e.lean - 0.3) * 38;
    e.armA = (e.armA || 0) + (hold - (e.armA || 0)) * (1 - Math.pow(0.7, F));
    e.node.style.setProperty("--arm", `${e.armA.toFixed(1)}deg`);
    e.node.style.opacity = dying ? (1 - k).toFixed(2) : "";
    e.node.classList.toggle("is-dying", dying);
    e.node.setAttribute("transform",
      `translate(${x.toFixed(1)} ${yy.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${(e.face * s * grow).toFixed(3)} ${(s * grow * kneel * (1 + breath * 0.012)).toFixed(3)}) translate(-30 -40)`);
    e.node.classList.toggle("is-enraged", clock < e.enragedUntil);
    e.node.classList.toggle("is-hasted", clock < e.hasteUntil);
    if (frame % 7 === 0) e.node.setAttribute("filter", `url(#graphite${boil})`);   // the line "boils"
  }

  // Everything that floats over a wizard: bars, streak glow and label, speech bubble.
  function drawExtras(w) {
    const head = w.y - size * 0.62;
    const showBars = alive(w) && (w.hp < R.hp || w.mp < R.mp);
    w.bars.style.display = showBars ? "" : "none";
    if (showBars) {
      const x = w.x - 14;
      [[head, 1], [head, Math.max(0, w.hp) / R.hp], [head + 4, 1], [head + 4, w.mp / R.mp]].forEach(([yy, f], k) => {
        const n = w.lines[k];
        n.setAttribute("x1", x.toFixed(1)); n.setAttribute("x2", (x + 28 * f).toFixed(1));
        n.setAttribute("y1", yy.toFixed(1)); n.setAttribute("y2", yy.toFixed(1));
      });
    }
    const streak = w.streak > 0 && w.state !== "DEAD";
    w.aura.style.display = w.label.style.display = streak ? "" : "none";
    if (streak) {
      w.aura.setAttribute("cx", w.x.toFixed(1)); w.aura.setAttribute("cy", w.y.toFixed(1));
      w.aura.setAttribute("r", (size * (0.6 + Math.sin(clock * 3) * 0.05)).toFixed(1));
      w.label.setAttribute("x", w.x.toFixed(1)); w.label.setAttribute("y", (head - 6).toFixed(1));
      w.label.textContent = `Win Streak: ${w.streak}`;
    }
    if (w.talk && clock > w.talk.until) { w.talk.node.remove(); w.talk = null; }
    const jit = w.talk?.shaky ? rand(-1.5, 1.5) : 0;
    if (w.talk) w.talk.node.setAttribute("transform", `translate(${(w.x + jit).toFixed(1)} ${(head - (streak ? 20 : 8) + jit).toFixed(1)})`);
  }

  // ---------------------------------------------------------------------------
  // Spells. Four schools, each built from layers: a soft halo, a tapered comet tail, a
  // moving body, and shed particles. Emerald = a blooming flower of light with orbiting
  // stars and runes. Crimson = a void orb with writhing tendrils, a crown of thorns and
  // smoke. The wand flicks: fireball, lightning, frost crystal.
  // ---------------------------------------------------------------------------
  let motes = [];
  function mote(x, y, vx, vy, life, r, cls, grav = 0, grow = 0) {
    if (motes.length > 280) return;
    motes.push({ x, y, vx, vy, life, born: clock, r, grav, grow, node: el("circle", { class: `mote ${cls}`, r }, cls === "smoke" ? stage : fxg) });
  }
  function updateMotes() {
    motes = motes.filter((m) => {
      const k = (clock - m.born) / m.life;
      if (k >= 1) { m.node.remove(); return false; }
      m.vy += m.grav * F;
      m.vx *= Math.pow(0.98, F);
      m.x += m.vx * F;
      m.y += m.vy * F;
      m.node.setAttribute("cx", m.x.toFixed(1));
      m.node.setAttribute("cy", m.y.toFixed(1));
      m.node.setAttribute("r", Math.max(0.1, m.r * (1 + m.grow * k)).toFixed(2));
      m.node.setAttribute("opacity", (1 - k * k).toFixed(2));
      return true;
    });
  }

  // The hit: a flash, light rays, a lens-flare streak, expanding shockwave rings (with a chromatic
  // fringe on big ones), flying sparks and (for big ones) smoke. All of it adds light to the page.
  function impact(x, y, kind, power = 1) {
    const cl = COL[kind] ? kind : "orange", [c, hot] = COL[cl];
    fx.push({ x, y, born: clock, life: 0.3, grow: 0.8, node: el("circle", { cx: x, cy: y, r: 26 * power, fill: `url(#halo-${cl})` }, fxg) });
    fx.push({ x, y, born: clock, life: 0.6, grow: 2.2, s0: 1, node: el("circle", { cx: x, cy: y, r: 70 * power, fill: `url(#halo-${cl})`, opacity: 0.5 }, fxg) });   // light thrown on the page
    fx.push({ x, y, born: clock, life: 0.55, grow: 5, node: el("circle", { class: "shock", cx: x, cy: y, r: 5 * power, stroke: c }, fxg) });
    if (power >= 1) fx.push({ x, y, born: clock, life: 0.4, grow: 3.4, node: el("circle", { class: "shock thin", cx: x, cy: y, r: 4 * power, stroke: hot }, fxg) });
    const rays = el("g", { fill: c }, fxg);
    for (let k = 0, n = Math.round(9 + 8 * power); k < n; k++) {      // radiating light rays
      const an = (k / n) * Math.PI * 2 + rand(-0.15, 0.15), len = rand(14, 36) * power, w = 0.1;
      el("path", { d: `M${x} ${y}L${(x + Math.cos(an - w) * len).toFixed(1)} ${(y + Math.sin(an - w) * len).toFixed(1)}L${(x + Math.cos(an) * len * 1.35).toFixed(1)} ${(y + Math.sin(an) * len * 1.35).toFixed(1)}L${(x + Math.cos(an + w) * len).toFixed(1)} ${(y + Math.sin(an + w) * len).toFixed(1)}Z`, opacity: rand(0.5, 0.9).toFixed(2) }, rays);
    }
    fx.push({ x, y, born: clock, life: 0.35, grow: 1.4, node: rays });
    if (power >= 0.9) fx.push({ x, y, born: clock, life: 0.35, grow: 0.5, s0: 0.6, node: el("ellipse", { cx: x, cy: y, rx: 80 * power, ry: 2.2, fill: `url(#flare-${cl})` }, fxg) });   // anamorphic streak
    if (power >= 1) [["#ff3b3b", 0], ["#3bff7a", 1.4], ["#3b7bff", 2.8]].forEach(([col, off], i) => {         // chromatic aberration on the shockwave
      fx.push({ x, y, born: clock, life: 0.5, grow: 4.4 + i * 0.35, node: el("circle", { class: "shock thin", cx: x, cy: y, r: (6 + off) * power, stroke: col }, fxg) });
    });
    for (let k = 0, n = Math.round(6 + 8 * power); k < n; k++) {
      const an = rand(0, Math.PI * 2), v = rand(1.2, 4.5) * Math.sqrt(power);
      mote(x, y, Math.cos(an) * v, Math.sin(an) * v, rand(0.35, 0.8), rand(0.8, 1.9), k % 3 ? cl : "gold", 0.08);
    }
    if (power >= 1) for (let k = 0; k < 5; k++) mote(x + rand(-6, 6), y + rand(-6, 6), rand(-0.5, 0.5), rand(-0.9, -0.2), rand(0.7, 1.2), rand(4, 7) * power, "smoke", -0.01, 1.2);
  }
  function muzzle(o, kind, major, size) {
    const cl = COL[kind] ? kind : "orange";
    fx.push({ x: o.x, y: o.y, born: clock, life: 0.22, grow: 1.2, node: el("circle", { cx: o.x, cy: o.y, r: (major ? 22 : 12) * size, fill: `url(#halo-${cl})` }, fxg) });
    fx.push({ x: o.x, y: o.y, born: clock, life: 0.2, grow: 0.5, s0: 0.6, node: el("ellipse", { cx: o.x, cy: o.y, rx: (major ? 52 : 26) * size, ry: 1.5, fill: `url(#flare-${cl})` }, fxg) });
    fx.push({ x: o.x, y: o.y, born: clock, life: 0.3, grow: 3, node: el("circle", { class: "shock thin", cx: o.x, cy: o.y, r: 5 * size, stroke: COL[cl][0] }, fxg) });
    for (let k = 0; k < (major ? 8 : 3); k++) { const an = rand(0, 6.3); mote(o.x, o.y, Math.cos(an) * 2, Math.sin(an) * 2, 0.4, rand(0.8, 1.6), cl); }
  }

  // A ribbon along a recent path, widening toward the head; strand() winds a thin line around that path.
  const STAR = "M0 -6 L1 -1 L6 0 L1 1 L0 6 L-1 1 L-6 0 L-1 -1Z";
  const trailFrame = (h) => h.map((p, i) => {
    const p0 = h[Math.max(0, i - 1)], p1 = h[Math.min(h.length - 1, i + 1)], dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy) || 1;
    return { x: p.x, y: p.y, nx: -dy / d, ny: dx / d, u: h.length > 1 ? i / (h.length - 1) : 1 };
  });
  const ribbon = (T, w0, grow = 1.15) => {
    if (T.length < 2) return "";
    const L = T.map((p) => `${(p.x + p.nx * w0 * Math.pow(p.u, grow)).toFixed(1)} ${(p.y + p.ny * w0 * Math.pow(p.u, grow)).toFixed(1)}`);
    const Rr = T.map((p) => `${(p.x - p.nx * w0 * Math.pow(p.u, grow)).toFixed(1)} ${(p.y - p.ny * w0 * Math.pow(p.u, grow)).toFixed(1)}`).reverse();
    return `M${L.join("L")}L${Rr.join("L")}Z`;
  };
  const strand = (T, ph, amp, t) => T.map((p) => { const o = Math.sin(p.u * 9 - t * 12 + ph) * amp * p.u; return `${(p.x + p.nx * o).toFixed(1)},${(p.y + p.ny * o).toFixed(1)}`; }).join(" ");

  function buildBolt(b) {
    const g = b.node, k = b.size, [c, hot] = COL[b.kind], add = (tag, at) => el(tag, at, g), fa = (tag, at) => el(tag, at, b.fxn);
    b.fxn = el("g", {}, fxg);                          // additive extras: light spill, flare, ribbons, glints
    b.spill = fa("circle", { r: (b.major ? 120 : 56) * k, fill: `url(#halo-${b.kind})`, opacity: b.major ? 0.38 : 0.28 });
    b.halo = add("circle", { r: (b.major ? 24 : 13) * k, fill: `url(#halo-${b.kind})` });
    if (b.kind !== "p1") { b.rib = fa("path", { fill: c, opacity: 0.32 }); b.rib2 = fa("path", { fill: hot, opacity: 0.5 }); }
    b.flare = fa("ellipse", { rx: (b.major ? 72 : 34) * k, ry: (b.major ? 1.7 : 1.1) * k, fill: `url(#flare-${b.kind})` });
    b.glints = [0, 1, 2].map(() => fa("path", { d: STAR, fill: hot }));
    if (b.kind === "p0") {
      b.strands = [0, 1].map(() => fa("polyline", { fill: "none", stroke: hot, "stroke-width": 1, opacity: 0.85, "stroke-linecap": "round" }));
      b.runes = add("circle", { r: 10 * k, fill: "none", stroke: hot, "stroke-width": 0.9, "stroke-dasharray": "2 3.5" });
      b.bloom = add("g", {});
      for (let i = 0; i < 6; i++) el("path", { d: "M0 0 Q5 -5 0 -12 Q-5 -5 0 0Z", fill: c, "fill-opacity": 0.55, stroke: hot, "stroke-width": 0.8, transform: `rotate(${i * 60})` }, b.bloom);
      b.orbs = [0, 1, 2].map(() => add("circle", { r: 1.7 * k, fill: hot }));
      b.core = add("circle", { r: 3 * k, fill: "#fff" });
    } else if (b.kind === "p1") {
      b.tail = add("path", { fill: "#12060a", opacity: 0.6 });
      b.arms = [0, 1, 2].map(() => fa("polyline", { fill: "none", stroke: c, "stroke-width": 2, opacity: 0.7, "stroke-linecap": "round" }));   // accretion arms
      b.tent = [0, 1, 2, 3, 4].map(() => add("path", { fill: "none", stroke: c, "stroke-width": 1.7 * Math.sqrt(k), "stroke-linecap": "round" }));
      b.thorns = add("path", { fill: "none", stroke: c, "stroke-width": 1.1 });
      b.voidc = add("circle", { r: 5.2 * k, fill: "#07020a", stroke: c, "stroke-width": 1.6 });
      b.photon = fa("circle", { r: 6.4 * k, fill: "none", stroke: hot, "stroke-width": 1.1, opacity: 0.9 });
      b.eye = add("circle", { r: 1.5 * k, fill: hot });
    } else if (b.kind === "orange") {
      b.flameG = add("g", { filter: "url(#flameWarp)" });
      b.flames = [0, 1, 2].map(() => el("path", { fill: c, opacity: 0.75 }, b.flameG));
      b.core = add("circle", { r: 3.2 * k, fill: hot });
    } else if (b.kind === "white") {
      b.l3 = fa("polyline", { fill: "none", stroke: c, "stroke-width": 8 * k, opacity: 0.18, "stroke-linejoin": "round" });
      b.l2 = add("polyline", { fill: "none", stroke: c, "stroke-width": 4.5 * k, opacity: 0.35, "stroke-linejoin": "round" });
      b.l1 = add("polyline", { fill: "none", stroke: "#fff", "stroke-width": 1.7 * k, "stroke-linejoin": "round" });
      b.forks = [0, 1, 2].map(() => add("polyline", { fill: "none", stroke: hot, "stroke-width": 0.9 * k, opacity: 0.85, "stroke-linejoin": "round" }));
      b.core = add("circle", { r: 2.4 * k, fill: "#fff" });
    } else {
      b.ring = add("circle", { r: 8 * k, fill: "none", stroke: hot, "stroke-width": 0.9, "stroke-dasharray": "1.5 3" });
      b.shards = add("g", {});
      for (let i = 0; i < 4; i++) el("path", { d: "M0 -10 L3 0 L0 10 L-3 0Z", fill: "rgba(150,200,255,.25)", stroke: hot, "stroke-width": 0.9, transform: `rotate(${i * 45})` }, b.shards);
      b.flake = add("g", { fill: "none", stroke: "#fff", "stroke-width": 0.8, "stroke-linecap": "round" });
      for (let i = 0; i < 6; i++) el("path", { d: "M0 0 L0 -12 M0 -7 L-3.6 -10.6 M0 -7 L3.6 -10.6 M0 -3.4 L-2.2 -5.6 M0 -3.4 L2.2 -5.6", transform: `rotate(${i * 60})` }, b.flake);
      b.core = add("circle", { r: 2.6 * k, fill: "#fff" });
    }
  }

  function drawBolt(b) {
    const ux = b.vx / b.speed, uy = b.vy / b.speed, px = -uy, py = ux, k = b.size, t = clock + b.seed, x = b.x, y = b.y, sk = Math.sqrt(k);
    const P = (d, sd) => `${(x - ux * d + px * sd).toFixed(1)} ${(y - uy * d + py * sd).toFixed(1)}`;
    const taper = (len, w, bend = 0) => `M${P(0, w)} Q${P(len * 0.5, w * 0.6 + bend)} ${P(len, bend * 2)} Q${P(len * 0.5, -w * 0.6 + bend)} ${P(0, -w)}Z`;
    const at = (n, cx, cy) => { n.setAttribute("cx", cx.toFixed(1)); n.setAttribute("cy", cy.toFixed(1)); };
    const jit = () => rand(-1, 1);
    (b.hist = b.hist || []).push({ x, y });
    if (b.hist.length > 18) b.hist.shift();
    const T = trailFrame(b.hist);
    at(b.halo, x, y);
    b.halo.setAttribute("r", ((b.major ? 24 : 13) * k * (1 + Math.sin(t * 14) * 0.08)).toFixed(1));
    at(b.spill, x, y);
    b.spill.setAttribute("r", ((b.major ? 120 : 56) * k * (1 + Math.sin(t * 9) * 0.06)).toFixed(1));
    at(b.flare, x, y);
    b.flare.setAttribute("rx", ((b.major ? 72 : 34) * k * rand(0.85, 1.2)).toFixed(1));
    b.glints.forEach((gl, i) => {                      // twinkling four-point glints strewn along the trail
      const q = T[Math.min(T.length - 1, Math.floor(T.length * (0.35 + 0.22 * i)))] || { x, y }, sc = Math.abs(Math.sin(t * 17 + i * 2.1)) * (b.major ? 0.9 : 0.55) * sk;
      gl.setAttribute("transform", `translate(${(q.x + Math.sin(t * 5 + i) * 4).toFixed(1)} ${(q.y + Math.cos(t * 6 + i) * 4).toFixed(1)}) rotate(${(t * 40 + i * 30).toFixed(0)}) scale(${sc.toFixed(2)})`);
    });
    if (b.rib) {
      b.rib.setAttribute("d", ribbon(T, (b.major ? 7 : 4) * k));
      b.rib2.setAttribute("d", ribbon(T, (b.major ? 3 : 1.8) * k, 1.4));
    }
    if (b.kind === "p0") {
      b.strands.forEach((n, i) => n.setAttribute("points", strand(T, i * Math.PI, 9 * k, t)));   // a double helix winds up the trail
      b.bloom.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(t * 200).toFixed(0)}) scale(${(k * 0.6).toFixed(2)})`);
      at(b.runes, x, y);
      b.runes.style.strokeDashoffset = (-t * 22).toFixed(1);
      b.orbs.forEach((o, i) => {                       // three stars on a helix: depth shows in size and brightness
        const ang = t * 9 + i * 2.094, dp = Math.cos(ang);
        at(o, x + px * Math.sin(ang) * 11 * k - ux * dp * 7 * k, y + py * Math.sin(ang) * 11 * k - uy * dp * 7 * k);
        o.setAttribute("r", ((1.3 + 0.7 * dp) * k).toFixed(2));
        o.setAttribute("opacity", (0.65 + 0.35 * dp).toFixed(2));
      });
      at(b.core, x, y);
      if (Math.random() < 0.8) mote(x - ux * 8 + jit() * 4, y - uy * 8 + jit() * 4, -ux * 0.3 + jit() * 0.4, -uy * 0.3 + jit() * 0.4 - 0.1, rand(0.5, 0.9), rand(0.7, 1.7) * sk, Math.random() < 0.5 ? "p0" : "white", -0.01);
    } else if (b.kind === "p1") {
      b.tail.setAttribute("d", taper(46 * k, 6 * k, Math.sin(t * 5) * 3));
      b.arms.forEach((n, i) => {                       // accretion arms spiralling into the void
        n.setAttribute("points", Array.from({ length: 11 }, (_, j) => {
          const r = (5 + j * 1.6) * k, a = t * 11 + i * 2.094 + r * 0.16;
          return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
        }).join(" "));
      });
      b.tent.forEach((n, i) => {                       // tendrils coil around the orb
        const a = t * 4 + i * 1.257, w = Math.sin(t * 9 + i * 2) * 5;
        n.setAttribute("d", `M${x.toFixed(1)} ${y.toFixed(1)} Q${(x + Math.cos(a) * 11 * k - ux * 4).toFixed(1)} ${(y + Math.sin(a) * 11 * k - uy * 4 + w).toFixed(1)} ${(x + Math.cos(a + 0.9) * 19 * k - ux * 8 * k).toFixed(1)} ${(y + Math.sin(a + 0.9) * 19 * k - uy * 8 * k).toFixed(1)}`);
      });
      let th = "";
      for (let i = 0; i < 10; i++) {                   // crown of thorns, counter-rotating
        const a0 = -t * 3 + (i / 10) * Math.PI * 2, a1 = a0 + 0.31, a2 = a0 + 0.62;
        th += `${i ? "L" : "M"}${(x + Math.cos(a0) * 7.5 * k).toFixed(1)} ${(y + Math.sin(a0) * 7.5 * k).toFixed(1)}L${(x + Math.cos(a1) * 12.5 * k).toFixed(1)} ${(y + Math.sin(a1) * 12.5 * k).toFixed(1)}L${(x + Math.cos(a2) * 7.5 * k).toFixed(1)} ${(y + Math.sin(a2) * 7.5 * k).toFixed(1)}`;
      }
      b.thorns.setAttribute("d", th + "Z");
      at(b.voidc, x, y);
      at(b.photon, x, y);
      b.photon.setAttribute("r", (6.4 * k * (1 + Math.sin(t * 20) * 0.06)).toFixed(2));
      at(b.eye, x + ux * 1.6 * k, y + uy * 1.6 * k);
      b.eye.setAttribute("r", (1.3 * k * (0.8 + 0.4 * Math.sin(t * 17))).toFixed(2));
      if (Math.random() < 0.7) mote(x - ux * 6 + jit() * 5, y - uy * 6 + jit() * 5, -ux * 0.4 + jit() * 0.3, -uy * 0.4 + jit() * 0.3 - 0.15, rand(0.6, 1.1), rand(2.5, 4.5) * sk, "smoke", -0.01, 1.3);
      if (Math.random() < 0.6) {                       // embers pulled inward toward the singularity
        const an = rand(0, 6.3), rr = rand(16, 24) * k;
        mote(x + Math.cos(an) * rr, y + Math.sin(an) * rr, -Math.cos(an) * 1.6 + ux * b.speed * 0.9, -Math.sin(an) * 1.6 + uy * b.speed * 0.9, 0.25, rand(0.7, 1.3), "p1");
      }
    } else if (b.kind === "orange") {
      b.flames.forEach((n, i) => {
        const len = (16 + i * 9 + rand(0, 7)) * k, w = (4.4 - i * 1.1) * k;
        n.setAttribute("d", `M${P(0, w)} Q${P(len * 0.6, w * 1.1)} ${P(len, jit() * 4)} Q${P(len * 0.6, -w * 1.1)} ${P(0, -w)}Z`);
        n.setAttribute("fill", i === 2 ? COL.orange[1] : COL.orange[0]);
      });
      at(b.core, x, y);
      if (Math.random() < 0.7) mote(x - ux * 10 + jit() * 3, y - uy * 10 + jit() * 3, -ux * 0.3 + jit() * 0.3, -0.5 + jit() * 0.3, rand(0.4, 0.8), rand(0.7, 1.5) * sk, "orange", -0.02);
    } else if (b.kind === "white") {
      const pts = Array.from({ length: 9 }, (_, i) => ({ x: x - ux * (i * 4 * k - 2) + px * (i ? jit() * 4 * k : 0), y: y - uy * (i * 4 * k - 2) + py * (i ? jit() * 4 * k : 0) }));
      const str = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      b.l1.setAttribute("points", str);
      b.l2.setAttribute("points", str);
      b.l3.setAttribute("points", str);
      b.forks.forEach((fk) => {                        // a branching tree of arcs, re-rolled every frame
        const base = pts[1 + Math.floor(rand(0, 6))], sgn = Math.random() < 0.5 ? 1 : -1, hd = Math.atan2(-uy, -ux) + sgn * rand(0.5, 1.1);
        let cx = base.x, cy = base.y, a = hd, out = `${cx.toFixed(1)},${cy.toFixed(1)}`;
        for (let j = 0; j < 4; j++) { a += rand(-0.5, 0.5); cx += Math.cos(a) * 5 * k; cy += Math.sin(a) * 5 * k; out += ` ${cx.toFixed(1)},${cy.toFixed(1)}`; }
        fk.setAttribute("points", out);
      });
      at(b.core, x, y);
      if (Math.random() < 0.35) mote(x + jit() * 5, y + jit() * 5, jit() * 1.5, jit() * 1.5, 0.3, rand(0.6, 1.2), "white");
    } else {
      b.shards.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(t * 140).toFixed(0)}) scale(${(k * 0.85).toFixed(2)})`);
      b.flake.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-t * 90).toFixed(0)}) scale(${(k * 0.9).toFixed(2)})`);
      at(b.ring, x, y);
      b.ring.style.strokeDashoffset = (t * 18).toFixed(1);
      at(b.core, x, y);
      if (Math.random() < 0.6) mote(x - ux * 5 + jit() * 5, y - uy * 5 + jit() * 5, jit() * 0.4, 0.1 + jit() * 0.3, rand(0.5, 0.9), rand(0.5, 1.3) * sk, Math.random() < 0.5 ? "blue" : "white", 0.03);
    }
  }

  function drawFx() {
    fx = fx.filter((f) => {
      const k = (clock - f.born) / f.life;
      if (k >= 1) { f.node.remove(); return false; }
      f.node.setAttribute("opacity", (1 - k).toFixed(2));
      if (f.flat) return true;
      if (f.sparks) {
        for (const p of f.sparks) {
          p.x += p.vx * F; p.y += p.vy * F; p.vy += 0.12 * F;
          p.n.setAttribute("x1", p.x.toFixed(1)); p.n.setAttribute("y1", p.y.toFixed(1));
          p.n.setAttribute("x2", (p.x - p.vx * 2).toFixed(1)); p.n.setAttribute("y2", (p.y - p.vy * 2).toFixed(1));
        }
        return true;
      }
      f.node.setAttribute("transform", `translate(${f.x} ${f.y}) scale(${(f.grow ? (f.s0 ?? 0.3) + k * f.grow : 0.6 + k * 0.7).toFixed(2)}) translate(${-f.x} ${-f.y})`);
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------
  function resize() {
    sizeFire();
    size = clamp(Math.min(innerWidth, innerHeight) * 0.1, 44, 84);
    s = size / 80;
    const k = Math.min(1, size / 72);    // 72px is a 720px-tall desktop window: unchanged from there up
    for (const [a, b] of SCALED) { if (b) R[a][b] = R0[a][b] * k; else R[a] = R0[a] * k; }
    mh = size * 0.66;
    msc = mh / 40;
    for (const e of [...(wiz || []), ...clones]) e.r = size * 0.34;
    for (const m of minions) m.r = size * (m.big ? 0.48 : 0.22);
    wallsDirty = true;
  }

  let raf = null, last = 0;
  function tick(ms) {
    const rd = Math.min(0.05, last ? (ms - last) / 1000 : 1 / 60);
    last = ms;
    nowMs = ms;
    tscale += ((ms < slowUntil ? slowTo : 1) - tscale) * (1 - Math.exp(-rd * 10));   // ease in and out of slow motion
    const dt = rd * tscale;
    clock += dt;
    F = dt * 60;
    frame++;
    if (frame % 7 === 0) boil = (boil + 1) % 3;
    if (frame % 3 === 0) flameTurb?.setAttribute("seed", String(frame % 40));   // flames shimmer
    if (wallsDirty || frame % 15 === 0) readWalls();   // fades and scrolling move the walls

    for (const w of wiz) {
      think(w, dt);
      if (w.state !== "DEAD") { move(w); watchStuck(w); }
    }
    reactToVisitor(dt);
    updateBubbles();
    updateClones();
    updateSigils(dt);
    updateDuel(dt);
    updateMeteors();
    updatePortals();
    updateDragon(dt);
    drawFire(dt);
    updateMinions(dt);
    updateArrows(dt);
    updateBolts();
    updateDebris();
    updateMotes();
    for (const w of wiz) { if (w.state !== "DEAD") drawBody(w); drawExtras(w); updateShield(w); }
    clones.forEach(drawBody);
    minions.forEach(drawMinion);
    if (frame % 6 === 0) {                         // painter's order: lower on screen is nearer; corpses lie underneath
      [...minions].sort((a, b) => (a.dying ? -1e4 : a.y) - (b.dying ? -1e4 : b.y)).forEach((m) => crowd.appendChild(m.n.g));
    }
    cine.classList.toggle("on", clock < cineUntil);
    bolts.forEach(drawBolt);
    drawFx();
    raf = requestAnimationFrame(tick);
  }

  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };

  resize();
  readWalls();
  wiz = [makeWizard(0), makeWizard(1)];
  nextDragon = clock + rand(30, 50);
  wiz.forEach((w) => { if (!free(w.x, w.y, w.r)) unwedge(w); say(w, [LINES.start[w.i]]); });

  // Poke a wizard 3 times within 2s and he turns to complain to you. The overlay takes no
  // clicks, so this listens on the window and checks whether the click landed on a wizard.
  addEventListener("click", (e) => {
    const w = wiz.find((w) => alive(w) && Math.hypot(e.clientX - w.x, e.clientY - w.y) < w.r * 1.5);
    if (!w || w.state === "DISTRACTED" || w.state === "VICTORY") return;
    w.pokes = w.pokes.filter((ts) => e.timeStamp - ts < R.poke.within * 1000);
    w.pokes.push(e.timeStamp);
    if (w.pokes.length < R.poke.clicks) return;
    w.pokes = [];
    go(w, "DISTRACTED");
    say(w, LINES.poked);
  });
  // The fourth wall: the wizards watch the visitor. A wall scrolled onto them, a wheel spun too fast, a page that boxes them in, a visitor who
  // goes quiet or leaves and returns, and a window that changes size all earn a line, at most one every few seconds.
  const V = { y: scrollY, t: performance.now(), v: 0, fastFor: 0, lastScroll: -99, lastInput: performance.now(), sayAt: 0, away: false, back: false, resizedAt: -99 };
  const seen = () => (V.lastInput = performance.now());
  function complain(w, key, gap = 8) {
    if (!w || !alive(w) || clock < V.sayAt || w.state === "DISTRACTED" || (w.talk && w.talk.until > clock)) return;
    say(w, LINES[key]);
    V.sayAt = clock + gap;
  }
  function reactToVisitor(dt) {
    const live = wiz.filter(alive);
    if (!live.length) return;
    const one = () => live[(Math.random() * live.length) | 0];
    V.v *= Math.pow(0.9, F);                                   // the speed coasts to zero when the wheel stops
    V.fastFor = Math.abs(V.v) > 2000 ? V.fastFor + dt : 0;
    const buried = live.find((w) => clock - (w.squashedAt ?? -99) < 0.4 && clock - V.lastScroll < 0.8);
    if (buried) return complain(buried, "squashed");
    if (V.fastFor > 0.4) return complain(one(), "fast");
    if (V.back) { V.back = false; return complain(one(), "back", 5); }
    if (clock - V.resizedAt < 0.8 && clock - V.resizedAt > 0.4) return complain(one(), "resized", 12);
    if (performance.now() - V.lastInput > 25000) { complain(one(), "idle", 20); V.lastInput = performance.now() - 10000; }
  }
  addEventListener("scroll", () => {
    const now = performance.now(), dy = scrollY - V.y;
    V.v = V.v * 0.6 + ((dy / Math.max(8, now - V.t)) * 1000) * 0.4;
    V.y = scrollY; V.t = now; V.lastScroll = clock; V.lastInput = now;
    wallsDirty = true;
  }, { passive: true });
  for (const ev of ["pointermove", "keydown", "touchstart", "wheel"]) addEventListener(ev, seen, { passive: true });
  addEventListener("resize", () => { V.resizedAt = clock; resize(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { V.away = true; stop(); } else { if (Show.mode === "run") start(); if (V.away) { V.away = false; V.back = true; seen(); } }
  });
  Show.on((m) => {                                              // Petrify stops the clock and every animation; Silence also hides it all (CSS)
    if (m === "run") { start(); svg.unpauseAnimations?.(); fxSvg.unpauseAnimations?.(); } else { stop(); svg.pauseAnimations?.(); fxSvg.pauseAnimations?.(); }
  });
  if (Show.mode === "run") start();
  return true;
}

// ---------------------------------------------------------------------------
// Public API.  <script src="wizardclash.js" data-header=".nav" data-walls="h1, p"></script> starts on its own;
// add data-manual to start it yourself with WizardClash.start({ walls, header, controls }).
// ---------------------------------------------------------------------------
const DEFAULT_WALLS = "h1, h2, h3, h4, p, li, img, video, pre, blockquote, table, button, input, textarea, .wizard-wall";
let started = false;
window.WizardClash = {
  start(options = {}) {
    if (started) return true;
    const opts = { walls: DEFAULT_WALLS, header: "", controls: true, ...options };
    started = boot(opts) !== false;
    return started;
  },
  freeze() { Show.set("freeze"); },
  resume() { Show.set("run"); },
  silence() { Show.set("off"); },
  get mode() { return Show.mode; },
};
{
  const tag = document.currentScript;
  if (tag && !tag.hasAttribute("data-manual")) {
    const go = () => window.WizardClash.start({
      ...(tag.dataset.walls ? { walls: tag.dataset.walls } : {}),
      ...(tag.dataset.header ? { header: tag.dataset.header } : {}),
      ...(tag.hasAttribute("data-no-controls") ? { controls: false } : {}),
    });
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
  }
}
