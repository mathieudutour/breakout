/* ============================================================
   UPGRADES  —  the Vampire-Survivors style power-up pool.
   Each upgrade levels up; some combine into EVOLUTIONS.
   game.js reads the resulting levels via computeStats().
   ============================================================ */

const UPGRADES = [
  {
    id: "multiball", name: "Multiball", icon: "⚪", kind: "weapon", max: 4,
    blurb: "Launch an extra ball each life.",
    desc: (l) => `+${l} ball${l > 1 ? "s" : ""} on launch.`,
  },
  {
    id: "pierce", name: "Piercing", icon: "🔱", kind: "weapon", max: 4,
    blurb: "Balls punch through bricks without bouncing.",
    desc: (l) => `Pierce ${l} brick${l > 1 ? "s" : ""} before bouncing.`,
  },
  {
    id: "cannons", name: "Cannons", icon: "🔫", kind: "weapon", max: 5,
    blurb: "Your paddle auto-fires bullets upward.",
    desc: (l) => `${1 + Math.floor(l / 2)} barrel(s), faster fire.`,
  },
  {
    id: "orbit", name: "Orbitals", icon: "🛰️", kind: "weapon", max: 4,
    blurb: "Balls orbit your paddle, grinding bricks.",
    desc: (l) => `${l} orbiting ball${l > 1 ? "s" : ""}.`,
  },
  {
    id: "fireball", name: "Fireball", icon: "🔥", kind: "weapon", max: 4,
    blurb: "Ball impacts trigger fiery explosions.",
    desc: (l) => `Explosion radius +${l}. Area damage.`,
  },
  {
    id: "power", name: "Power Ball", icon: "💥", kind: "passive", max: 6,
    blurb: "Raise the damage of every ball.",
    desc: (l) => `+${l} ball damage.`,
  },
  {
    id: "bounce", name: "Overdrive", icon: "⚡", kind: "passive", max: 5,
    blurb: "Balls move faster and hit harder.",
    desc: (l) => `+${l * 8}% ball speed, +damage.`,
  },
  {
    id: "wide", name: "Wide Paddle", icon: "📏", kind: "passive", max: 5,
    blurb: "Widen your paddle.",
    desc: (l) => `+${l * 16}% paddle width.`,
  },
  {
    id: "magnet", name: "Magnet", icon: "🧲", kind: "passive", max: 5,
    blurb: "Pull XP gems from farther away.",
    desc: (l) => `+${l * 40}% pickup range.`,
  },
  {
    id: "xpgain", name: "Greed", icon: "💎", kind: "passive", max: 5,
    blurb: "Gain more XP from every gem.",
    desc: (l) => `+${l * 15}% XP.`,
  },
  {
    id: "slowfall", name: "Gravity Well", icon: "🪐", kind: "passive", max: 3,
    blurb: "Slow the descent of the brick swarm.",
    desc: (l) => `Bricks fall ${l * 18}% slower.`,
  },
  {
    id: "life", name: "Repair Kit", icon: "❤️", kind: "passive", max: 5,
    blurb: "Restore a life and raise your max.",
    desc: () => `+1 max life, fully repaired.`,
  },
];

/* EVOLUTIONS: max the base weapon + own the catalyst passive, then
   this powerful fused upgrade is offered. */
const EVOLUTIONS = [
  {
    id: "artillery", name: "Artillery", icon: "💣", base: "cannons", catalyst: "power",
    blurb: "EVO — cannon rounds detonate on impact for splash damage.",
  },
  {
    id: "meteor", name: "Meteor", icon: "☄️", base: "fireball", catalyst: "bounce",
    blurb: "EVO — colossal explosions that leave burning ground.",
  },
  {
    id: "ballstorm", name: "Ball Storm", icon: "🌀", base: "multiball", catalyst: "orbit",
    blurb: "EVO — orbitals fling extra balls outward as you play.",
  },
  {
    id: "singularity", name: "Singularity", icon: "🌟", base: "magnet", catalyst: "xpgain",
    blurb: "EVO — vacuum every gem on screen; gems briefly boost damage.",
  },
];

/* Build a randomized set of upgrade choices for a level-up. */
function rollChoices(run, count = 3) {
  const owned = run.up;
  const evo = run.evo;
  const pool = [];

  // 1) Evolutions take priority — offer any newly unlocked, not-yet-taken evo.
  for (const e of EVOLUTIONS) {
    if (evo[e.id]) continue;
    const baseDef = UPGRADES.find((u) => u.id === e.base);
    const baseMaxed = (owned[e.base] || 0) >= baseDef.max;
    const hasCatalyst = (owned[e.catalyst] || 0) >= 1;
    if (baseMaxed && hasCatalyst) {
      pool.push({ evo: true, def: e });
    }
  }

  // 2) Regular upgrades that aren't maxed.
  const avail = UPGRADES.filter((u) => (owned[u.id] || 0) < u.max);

  // Always surface up to one evolution first, then fill with randoms.
  const choices = [];
  if (pool.length) {
    choices.push(pool[(Math.random() * pool.length) | 0]);
  }

  const shuffled = avail.sort(() => Math.random() - 0.5);
  for (const u of shuffled) {
    if (choices.length >= count) break;
    choices.push({ evo: false, def: u, level: (owned[u.id] || 0) + 1 });
  }

  // Edge case: everything maxed — offer a small score/heal filler.
  if (choices.length === 0) {
    choices.push({ evo: false, def: UPGRADES.find((u) => u.id === "life"), level: 99, filler: true });
  }
  return choices.slice(0, count);
}

if (typeof window !== "undefined") {
  window.UPGRADES = UPGRADES;
  window.EVOLUTIONS = EVOLUTIONS;
  window.rollChoices = rollChoices;
}
