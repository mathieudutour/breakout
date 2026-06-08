/* ============================================================
   META  —  roguelite persistent progression.
   Earn CORES per run; spend them in THE FORGE on permanent
   upgrades to the Aegis that carry across every future run.
   Saved in localStorage.
   ============================================================ */

const META_KEY = "aegis_meta_v1";

const META_UPGRADES = [
  {
    id: "hull", name: "Reinforced Hull", icon: "🛡️", max: 3, base: 50,
    desc: (t) => `Begin each run with +${t} max life.`,
  },
  {
    id: "tempered", name: "Tempered Core", icon: "💥", max: 4, base: 45,
    desc: (t) => `+${(t * 0.5).toFixed(1)} starting ball damage.`,
  },
  {
    id: "hotstart", name: "Combat Boot", icon: "⚔️", max: 3, base: 80,
    desc: (t) => `Start every run with ${t} random weapon${t > 1 ? "s" : ""}.`,
  },
  {
    id: "study", name: "Neural Uplink", icon: "🧠", max: 5, base: 35,
    desc: (t) => `+${t * 10}% XP gained, always.`,
  },
  {
    id: "salvage", name: "Salvage Net", icon: "💰", max: 5, base: 40,
    desc: (t) => `+${t * 20}% Cores earned from runs.`,
  },
  {
    id: "reroll", name: "Reroll Module", icon: "🎲", max: 3, base: 60,
    desc: (t) => `${t} reroll${t > 1 ? "s" : ""} on the upgrade screen each run.`,
  },
  {
    id: "banish", name: "Banish Protocol", icon: "🚫", max: 2, base: 70,
    desc: (t) => `Skip an upgrade choice ${t} time${t > 1 ? "s" : ""} per run.`,
  },
  {
    id: "aegis", name: "Aegis Plating", icon: "📏", max: 4, base: 30,
    desc: (t) => `+${t * 8}% starting paddle width.`,
  },
];

function costOf(def, tier) {
  return Math.floor(def.base * Math.pow(1.8, tier));
}

function loadMeta() {
  let m;
  try { m = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { m = null; }
  if (!m || typeof m !== "object") m = {};
  if (typeof m.cores !== "number") m.cores = 0;
  if (!m.owned || typeof m.owned !== "object") m.owned = {};
  if (typeof m.bestScore !== "number") m.bestScore = 0;
  if (typeof m.runs !== "number") m.runs = 0;
  return m;
}

function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
}

/* Translate owned meta tiers into concrete run-start effects. */
function metaEffects() {
  const m = loadMeta();
  const t = (id) => m.owned[id] || 0;
  return {
    bonusLives: t("hull"),
    startDamage: t("tempered") * 0.5,
    hotStart: t("hotstart"),
    xpMult: 1 + t("study") * 0.1,
    coreMult: 1 + t("salvage") * 0.2,
    rerolls: t("reroll"),
    banishes: t("banish"),
    paddleMult: 1 + t("aegis") * 0.08,
  };
}

/* Cores awarded at the end of a run. */
function computeCores(run, seconds) {
  const raw = run.score / 40 + run.bricksBroken * 0.5 + run.level * 3 + seconds / 4;
  return Math.max(1, Math.floor(raw * metaEffects().coreMult));
}

/* Award + persist after a run. Returns cores earned. */
function bankRun(run, seconds) {
  const m = loadMeta();
  const earned = computeCores(run, seconds);
  m.cores += earned;
  m.runs += 1;
  if (run.score > m.bestScore) m.bestScore = run.score;
  saveMeta(m);
  return earned;
}

/* ---- THE FORGE UI ---- */
function renderForge(container, onChange) {
  const m = loadMeta();
  container.innerHTML = "";

  const head = document.createElement("div");
  head.className = "forge-head";
  head.innerHTML = `<span class="cores">◈ ${m.cores} CORES</span>` +
    `<span class="forge-meta">Best ${m.bestScore.toLocaleString()} · ${m.runs} run${m.runs === 1 ? "" : "s"}</span>`;
  container.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "forge-grid";
  container.appendChild(grid);

  for (const def of META_UPGRADES) {
    const tier = m.owned[def.id] || 0;
    const maxed = tier >= def.max;
    const cost = costOf(def, tier);
    const afford = m.cores >= cost;

    const card = document.createElement("div");
    card.className = "forge-card" + (maxed ? " maxed" : afford ? "" : " locked");
    card.innerHTML =
      `<div class="ficon">${def.icon}</div>` +
      `<div class="fname">${def.name}</div>` +
      `<div class="ftier">${maxed ? "MAX" : "Tier " + tier + " / " + def.max}</div>` +
      `<div class="fdesc">${def.desc(Math.min(tier + 1, def.max))}</div>` +
      `<div class="fbuy">${maxed ? "MAXED" : "◈ " + cost}</div>`;

    if (!maxed) {
      card.onclick = () => {
        const cur = loadMeta();
        const c = costOf(def, cur.owned[def.id] || 0);
        if (cur.cores >= c && (cur.owned[def.id] || 0) < def.max) {
          cur.cores -= c;
          cur.owned[def.id] = (cur.owned[def.id] || 0) + 1;
          saveMeta(cur);
          renderForge(container, onChange);
          if (onChange) onChange();
        }
      };
    }
    grid.appendChild(card);
  }
}

if (typeof window !== "undefined") {
  window.META_UPGRADES = META_UPGRADES;
  window.loadMeta = loadMeta;
  window.saveMeta = saveMeta;
  window.metaEffects = metaEffects;
  window.computeCores = computeCores;
  window.bankRun = bankRun;
  window.renderForge = renderForge;
}
