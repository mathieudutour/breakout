# AEGIS — Brick Survivors

A **Breakout × Vampire Survivors** roguelite. Smash the descending crystalline
swarm, collect XP gems, and pick a power-up every level — then *evolve* your
build. When you fall, salvage your Cores and forge permanent upgrades for the
next run.

> **Play:** just open `index.html` in any modern browser. No build step, no
> dependencies. Works on desktop and mobile.

## The story

The sky is falling — not as rain, but as **the Tessellation**, a crystalline
corruption that crushes everything it lands on, growing row by row. You are
**AEGIS**, the last deflector core. Hold the line.

## Controls

| | Move paddle | Launch ball | Pause |
|--|--|--|--|
| **Desktop** | Mouse / `← →` (or `A` `D`) | Click / `Space` | `P` / `Esc` |
| **Mobile** | Drag anywhere | Tap | — |

## Mechanics

### In-run power-ups (Vampire-Survivors style)
Every level-up offers a choice of 3 upgrades that stack as you take them:

- **Weapons** — Multiball, Piercing, Cannons (auto-fire), Orbitals, Fireball.
- **Passives** — Power Ball, Overdrive, Wide Paddle, Magnet, Greed (XP),
  Gravity Well (slow the swarm), Repair Kit (lives).

### Evolutions
Max out a weapon **and** own its catalyst passive, and a fused **Evolution**
becomes offered:

| Evolution | = maxed weapon | + catalyst |
|--|--|--|
| **Artillery** | Cannons | Power Ball |
| **Meteor** | Fireball | Overdrive |
| **Ball Storm** | Multiball | Orbitals |
| **Singularity** | Magnet | Greed |

### Roguelite meta-progression — The Forge
Each run banks **Cores** based on score, bricks broken, level and time. Spend
them in **The Forge** on permanent upgrades that carry across every future run:
reinforced hull, tempered core, hot-start weapons, neural uplink (XP), salvage
net (more cores), reroll & banish modules, and aegis plating. Progress is saved
in `localStorage`.

## Files

- `index.html` — markup and screens
- `style.css` — all styling / UI
- `game.js` — engine: physics, the descending swarm, weapons, evolutions, juice
- `upgrades.js` — in-run upgrade pool + evolution rules
- `meta.js` — persistent Cores currency + The Forge shop
