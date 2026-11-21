/* ============================================================================
 * Circuit Breaker —— 产品交互
 * 面向终端用户：连接钱包 → 创建保护 → 实时监测 → 风险触发 → 查看记录
 * 链上访问锁定 Monad Testnet (10143)；站点为静态前端，托管在 Vercel。
 * ========================================================================== */
(function () {
"use strict";

const CFG = window.MCB_CONFIG || {};
const $ = (id) => document.getElementById(id);
const NET = CFG.network || {};
const CHAIN_ID = Number(NET.chainId) || 10143;

/* ---------- 链守卫：所有链上访问锁定 Monad Testnet ---------- */
const ChainGuard = {
  expected: CHAIN_ID,
  hints: ["monad.xyz", "monad-testnet", "testnet-rpc", "10143"],
  assertChainId(raw, source = "RPC") {
    const id = typeof raw === "string" ? parseInt(raw, 16) : Number(raw);
    if (id !== CHAIN_ID) throw new Error(`${source} 链不匹配：${id}，需要 ${CHAIN_ID}`);
    return id;
  },
  assertEndpoint(url) {
    if (!url) throw new Error("RPC 地址为空");
    const s = url.toLowerCase();
    if (s.includes("mainnet") || s.includes("//rpc.monad.xyz")) throw new Error("仅允许 Monad Testnet 端点");
    if (!this.hints.some((h) => s.includes(h))) throw new Error("RPC 端点不属于 Monad Testnet");
    return url;
  },
};
window.MONAD_CHAIN_GUARD = ChainGuard;

/* ---------- 产品数据模型 ---------- */
const ASSETS = {
  MON:  { symbol: "MON",  name: "Monad",       price: 1.24,  balance: 4200 },
  WMON: { symbol: "WMON", name: "Wrapped MON", price: 1.23,  balance: 1500 },
  USDC: { symbol: "USDC", name: "USD Coin",    price: 1.00,  balance: 2600 },
};

const state = {
  connected: false,
  address: "",
  positions: [],   // {id, asset, amount, drop, exitPct, slip, duration, status, createdAt}
  activities: [],  // {type, title, detail, time}
  risk: 12,
  scenario: "normal",
};

const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtMoney = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (d = new Date()) => d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const shortAddr = (a) => a.slice(0, 6) + "…" + a.slice(-4);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3000);
}

/* ---------- 视图切换 ---------- */
function showApp() {
  state.connected = true;
  $("landingView").hidden = true;
  $("appView").hidden = false;
  $("connectBtn").hidden = true;
  $("walletChip").hidden = false;
  $("siteNav").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
  resizeCanvas();
  renderAll();
}
function disconnect() {
  state.connected = false;
  state.positions = [];
  state.activities = [];
  $("appView").hidden = true;
  $("landingView").hidden = false;
  $("connectBtn").hidden = false;
  $("walletChip").hidden = true;
  $("walletDropdown").hidden = true;
  $("siteNav").hidden = false;
  addActivity("disconnect", "钱包已断开", "保护面板已退出");
  toast("钱包已断开连接");
}

/* ---------- 钱包连接 ---------- */
function randomAddress() {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 40; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}
function openWalletModal() { $("walletModal").hidden = false; }
function connectWallet(provider) {
  const btn = document.querySelector(`[data-provider="${provider}"]`);
  if (btn) { btn.classList.add("loading"); btn.disabled = true; }
  const label = provider === "privy" ? "Privy 嵌入式钱包" : "已安装的钱包";
  setTimeout(() => {
    $("walletModal").hidden = true;
    if (btn) { btn.classList.remove("loading"); btn.disabled = false; }
    state.address = randomAddress();
    $("walletAddress").textContent = shortAddr(state.address);
    showApp();
    addActivity("connect", "钱包已连接", `${label} · Monad Testnet`);
    toast("钱包已连接，保护面板已就绪");
  }, 850);
}

/* ---------- 活动记录 ---------- */
const ACTIVITY_ICONS = { connect: "⇄", create: "◇", authorize: "✓", cancel: "×", trigger: "⚡", done: "✓", disconnect: "⇄" };
function addActivity(type, title, detail) {
  state.activities.unshift({ type, title, detail, time: fmtTime() });
  renderActivity();
}

/* ---------- 保护规则 ---------- */
function createProtection(data) {
  const p = { id: uid(), ...data, status: "active", createdAt: fmtTime() };
  state.positions.unshift(p);
  addActivity("create", "保护规则已创建", `${p.amount} ${p.asset} · 跌幅 ≥ ${p.drop}%`);
  addActivity("authorize", "授权完成", `最多退出 ${p.exitPct}% · 滑点 ≤ ${p.slip}% · ${p.duration}`);
  renderAll();
  return p;
}
function cancelProtection(id) {
  const p = state.positions.find((x) => x.id === id);
  if (!p || p.status !== "active") return;
  p.status = "cancelled";
  addActivity("cancel", "保护已撤销", `${p.amount} ${p.asset} · 不再执行自动动作`);
  renderAll();
  toast("保护已撤销");
}
function triggerProtections(dropPct) {
  const hit = state.positions.filter((p) => p.status === "active" && dropPct >= p.drop);
  hit.forEach((p) => {
    p.status = "triggered";
    const exited = (p.amount * p.exitPct / 100).toFixed(2);
    addActivity("trigger", "风险触发保护", `${p.asset} 跌幅 ${dropPct}% ≥ 阈值 ${p.drop}%`);
    addActivity("done", "保护性退出完成", `退出 ${exited} ${p.asset} · 滑点 ≤ ${p.slip}% · 已留在你的钱包`);
  });
  renderAll();
  return hit;
}

function renderPositions() {
  const list = $("positionsList"), empty = $("positionsEmpty");
  const active = state.positions.filter((p) => p.status === "active").length;
  $("positionsCount").textContent = state.positions.length + " 条";
  if (!state.positions.length) { list.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; list.hidden = false;
  list.innerHTML = "";
  state.positions.forEach((p) => {
    const asset = ASSETS[p.asset];
    const statusMap = { active: ["守护中", "active"], triggered: ["已执行", "done"], cancelled: ["已撤销", "off"] };
    const [label, cls] = statusMap[p.status];
    const card = document.createElement("article");
    card.className = "position-card";
    card.innerHTML = `
      <div class="position-top">
        <div class="position-asset"><span class="asset-icon ${p.asset.toLowerCase()}">${p.asset.slice(0, 1)}</span>
          <div><b>${p.amount} ${p.asset}</b><small>${asset.name} · 创建于 ${p.createdAt}</small></div>
        </div>
        <span class="position-status ${cls}"><i></i>${label}</span>
      </div>
      <div class="position-rule">
        <div><span>触发跌幅</span><b>≥ ${p.drop}%</b></div>
        <div><span>最多退出</span><b>${p.exitPct}%</b></div>
        <div><span>滑点上限</span><b>${p.slip}%</b></div>
        <div><span>有效期</span><b>${p.duration}</b></div>
      </div>
      <div class="position-bottom">
        <span>${p.status === "active" ? "规则生效中，持续为你值守" : p.status === "triggered" ? "已按规则完成保护性退出" : "已停止自动动作"}</span>
        ${p.status === "active" ? `<button class="btn btn-link cancel-btn" data-cancel="${p.id}">撤销保护</button>` : ""}
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll("[data-cancel]").forEach((b) => {
    b.onclick = () => {
      if (window.confirm("确定撤销这条保护规则吗？撤销后将不再自动执行保护。")) cancelProtection(b.dataset.cancel);
    };
  });
}

function renderActivity() {
  const list = $("activityList"), empty = $("activityEmpty");
  $("activityCount").textContent = state.activities.length + " 条";
  if (!state.activities.length) { list.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; list.hidden = false;
  list.innerHTML = "";
  state.activities.forEach((a) => {
    const row = document.createElement("div");
    row.className = "activity-row";
    row.innerHTML = `<span class="activity-icon ${a.type}">${ACTIVITY_ICONS[a.type] || "•"}</span>
      <div class="activity-copy"><b>${a.title}</b><small>${a.detail}</small></div>
      <time>${a.time}</time>`;
    list.appendChild(row);
  });
}

function renderStats() {
  const total = Object.values(ASSETS).reduce((s, a) => s + a.balance * a.price, 0);
  const active = state.positions.filter((p) => p.status === "active");
  const protectedSum = active.reduce((s, p) => s + (ASSETS[p.asset]?.price || 0) * p.amount, 0);
  $("statTotal").textContent = fmtMoney(total);
  $("statProtected").textContent = fmtMoney(protectedSum);
  $("statCoverage").textContent = Math.round(protectedSum / total * 100) + "% 已覆盖";
  $("statActive").textContent = active.length;
}
function renderAll() { renderPositions(); renderActivity(); renderStats(); }

/* ---------- 创建表单 ---------- */
function updatePolicyPreview() {
  const asset = $("fAsset").value;
  const amount = Number($("fAmount").value) || 0;
  const drop = Number($("fDrop").value) || 0;
  const exit = Number($("fExit").value) || 0;
  const slip = Number($("fSlip").value) || 0;
  const duration = $("fDuration").value;
  $("fAmountUnit").textContent = asset;
  $("policyPreview").innerHTML = `
    <span>规则预览</span>
    <p>当 <b>${asset}</b> 价格下跌 <b>${drop}%</b> 时，最多退出 <b>${amount * exit / 100} ${asset}</b>（持有量的 ${exit}%），滑点不超过 <b>${slip}%</b>，规则有效期 <b>${duration}</b>。</p>`;
}
function openCreateModal() {
  if (!state.connected) { openWalletModal(); return; }
  updatePolicyPreview();
  $("createModal").hidden = false;
}
function submitCreate(e) {
  e.preventDefault();
  const btn = $("createSubmit");
  btn.disabled = true; btn.textContent = "等待钱包确认…";
  setTimeout(() => {
    const data = {
      asset: $("fAsset").value,
      amount: Number($("fAmount").value),
      drop: Number($("fDrop").value),
      exitPct: Number($("fExit").value),
      slip: Number($("fSlip").value),
      duration: $("fDuration").value,
    };
    $("createModal").hidden = true;
    btn.disabled = false; btn.textContent = "确认并授权";
    createProtection(data);
    showResult("保护已开启", `你的 ${data.asset} 保护规则已生效，监测引擎开始值守。`, [
      ["保护资产", `${data.amount} ${data.asset}`],
      ["触发条件", `跌幅 ≥ ${data.drop}%`],
      ["最多退出", `${data.exitPct}%`],
      ["滑点上限", `${data.slip}%`],
      ["有效期", data.duration],
    ], "success");
  }, 900);
}

/* ---------- 结果弹窗 ---------- */
function showResult(title, sub, rows, kind) {
  $("resultTitle").textContent = title;
  $("resultSub").textContent = sub;
  $("resultIcon").textContent = kind === "warn" ? "!" : "✓";
  $("resultIcon").className = "result-icon " + (kind === "warn" ? "warn" : "");
  $("resultDetail").innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
  $("resultModal").hidden = false;
}

/* ---------- 风险监测与粒子动画 ---------- */
const SCENARIOS = {
  normal: { risk: 12, price: "0.12%", liquidity: "98%", divergence: "0.08%", latency: "34 ms", note: "所有信号处于正常区间" },
  drill:  { risk: 84, price: "9.40%", liquidity: "52%", divergence: "2.10%", latency: "38 ms", note: "检测到显著价格冲击与流动性收缩" },
};
function setRisk(v, note) {
  state.risk = Math.max(0, Math.min(100, v));
  const r = state.risk;
  const high = r >= 70, mid = r >= 40;
  $("riskScore").textContent = r;
  $("coreValue").textContent = r;
  $("riskTrackFill").style.width = r + "%";
  $("riskTrackFill").style.background = high ? "var(--red)" : mid ? "var(--amber)" : "var(--green)";
  $("riskState").textContent = high ? "高风险" : mid ? "需关注" : "平稳";
  $("riskState").style.color = high ? "var(--red)" : mid ? "var(--amber)" : "var(--green)";
  $("riskNote").textContent = note || SCENARIOS.normal.note;
  $("coreState").textContent = high ? "RISK ALERT" : mid ? "CAUTION" : "MONITORING";
  $("statRisk").textContent = high ? "高" : mid ? "中" : "低";
  $("statRisk").style.color = high ? "var(--red)" : mid ? "var(--amber)" : "var(--green)";
  $("statRiskNote").textContent = high ? "触发条件检查中" : mid ? "信号波动" : "市场平稳";
  $("centerCore").classList.toggle("alert", high);
}
function applyScenario(key) {
  const s = SCENARIOS[key];
  state.scenario = key;
  setRisk(s.risk, s.note);
  $("sigPrice").textContent = s.price;
  $("sigLiquidity").textContent = s.liquidity;
  $("sigDivergence").textContent = s.divergence;
  // sigLatency（链上区块）由 WSS 实时订阅驱动，不受模拟场景覆盖
  $("lastUpdate").textContent = fmtTime();
}
function runDrill() {
  if (!state.positions.some((p) => p.status === "active")) {
    toast("请先创建一条保护规则，再运行风险演练");
    openCreateModal();
    return;
  }
  const btn = $("drillBtn");
  btn.disabled = true; btn.textContent = "演练进行中…";
  applyScenario("drill");
  stream(70, "red");
  addActivity("trigger", "风险演练开始", "模拟价格冲击与流动性收缩，检验保护规则");
  setTimeout(() => {
    const hit = triggerProtections(9.4);
    if (hit.length) {
      showResult("保护已执行", `模拟行情触发了 ${hit.length} 条保护规则，资产已按你设定的边界退出，全程留在你的钱包。`, [
        ["触发跌幅", "9.4%"],
        ["触发规则", `${hit.length} 条`],
        ["执行方式", "按预设边界受限退出"],
        ["你的资产", "无需转出钱包"],
      ], "success");
    } else {
      showResult("规则未触发", "本次模拟跌幅未达到你设定的触发阈值，保护规则继续保持值守。", [
        ["模拟跌幅", "9.4%"],
        ["最低触发阈值", Math.min(...state.positions.filter(p => p.status === "active").map(p => p.drop), 99) + "%"],
        ["规则状态", "仍在守护中"],
      ], "warn");
    }
  }, 1400);
  setTimeout(() => {
    applyScenario("normal");
    stream(20, "green");
    btn.disabled = false; btn.textContent = "风险演练";
  }, 6000);
}

/* 粒子系统（保留原有视觉） */
const canvas = $("particleCanvas"), ctx = canvas.getContext("2d");
let ghosts = [], scale = 1, ws = null;
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sources = [{ x: 32, y: 80, key: "price" }, { x: 648, y: 80, key: "liquidity" }, { x: 32, y: 390, key: "divergence" }, { x: 648, y: 390, key: "chain" }];
function resizeCanvas() {
  const stage = $("graphStage");
  if (!stage || !canvas) return;
  const r = stage.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  if (!r.width || !r.height) return;
  canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
  scale = d; ctx.setTransform(d, 0, 0, d, 0, 0);
}
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe($("graphStage"));
function cubic(a, b, c, d, t) { const u = 1 - t; return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x, y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y }; }
function syncSignal(g) {
  if (g.synced) return; g.synced = true;
  const stage = $("graphStage");
  stage.classList.remove("shockwave"); void stage.offsetWidth; stage.classList.add("shockwave");
  const flash = $("captureFlash");
  flash.classList.remove("active"); void flash.getBoundingClientRect(); flash.classList.add("active");
  const cv = $("coreValue");
  cv.classList.remove("core-capture"); void cv.offsetWidth; cv.classList.add("core-capture");
  $("lastUpdate").textContent = fmtTime();
}
function spawnGhost(color = "cyan", forcedKey = null, doSync = true) {
  if (reduceMotion) { if (doSync) syncSignal({ key: forcedKey || "price", color, synced: false }); return; }
  if (ghosts.length > 160) return;
  const src = sources[Math.floor(Math.random() * sources.length)], key = forcedKey || src.key;
  const a = Math.random() * Math.PI * 2, cap = { x: 340 + Math.cos(a) * 161, y: 235 + Math.sin(a) * 161 };
  const dx = cap.x - src.x, dy = cap.y - src.y, perp = { x: -dy * .18, y: dx * .18 };
  ghosts.push({ x: src.x, y: src.y, src, cap, key, color, started: performance.now(), travel: 850 + Math.random() * 700, orbit: 480 + Math.random() * 400, collapse: 420, phase: 0, angle: a, spin: (Math.random() > .5 ? 1 : -1) * (.55 + Math.random() * .7), trail: [], size: 1.4 + Math.random() * 2.2, c1: { x: src.x + dx * .32 + perp.x, y: src.y + dy * .32 + perp.y }, c2: { x: cap.x - dx * .22 + perp.x * .35, y: cap.y - dy * .22 + perp.y * .35 }, synced: false, doSync });
}
function drawGhost(g, now) {
  const el = now - g.started; let t, x, y, alpha = 1;
  if (g.phase === 0) {
    t = Math.min(1, el / g.travel);
    const p = cubic(g.src, g.c1, g.c2, g.cap, t);
    x = p.x; y = p.y; alpha = .15 + .85 * Math.sin(Math.PI * t * .5);
    if (t >= 1) { g.phase = 1; g.phaseAt = now; if (g.doSync) syncSignal(g); }
  } else if (g.phase === 1) {
    const u = Math.min(1, (now - g.phaseAt) / g.orbit), an = g.angle + g.spin * u * .95;
    x = 340 + Math.cos(an) * 161; y = 235 + Math.sin(an) * 161; alpha = .95;
    if (u >= 1) { g.phase = 2; g.phaseAt = now; g.from = { x, y }; }
  } else {
    const u = Math.min(1, (now - g.phaseAt) / g.collapse);
    const p = cubic(g.from, { x: g.from.x + (340 - g.from.x) * .28, y: g.from.y + (235 - g.from.y) * .28 - 18 }, { x: 340 + (g.from.x - 340) * .10, y: 235 + (g.from.y - 235) * .10 }, { x: 340, y: 235 }, u);
    x = p.x; y = p.y; alpha = 1 - u;
    if (u >= 1) g.dead = true;
  }
  g.x = x; g.y = y; g.trail.push({ x, y, life: 1 });
  if (g.trail.length > 24) g.trail.shift();
  return alpha;
}
function palette(c) {
  return c === "red" ? { d: "#ff7896", h: "#ffe8ee", s: "#ff557b" }
    : c === "green" ? { d: "#72f5c1", h: "#eafff5", s: "#43e6ad" }
    : c === "purple" ? { d: "#b4a1ff", h: "#f1edff", s: "#9a7cff" }
    : { d: "#75eaff", h: "#e9fcff", s: "#45dcff" };
}
function drawBeam(g, w, h, alpha) {
  const pts = g.trail; if (!pts.length) return;
  const p = palette(g.color), fade = Math.max(0, alpha);
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const n = Math.min(pts.length, 24);
  for (let i = 0; i < n; i++) {
    const pt = pts[n - 1 - i], age = i / Math.max(1, n - 1);
    const x = pt.x * w / 680, y = pt.y * h / 470;
    const r = (1.9 + g.size * .48) * (1 - age * .78), a = fade * (1 - age) * .72;
    if (a <= .015) continue;
    ctx.globalAlpha = a; ctx.shadowBlur = 7 * (1 - age) + 2; ctx.shadowColor = p.s;
    ctx.fillStyle = p.d; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (i % 3 === 0) { ctx.globalAlpha = a * .65; ctx.fillStyle = p.h; ctx.beginPath(); ctx.arc(x, y, Math.max(.55, r * .34), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
function frame(now) {
  const stage = $("graphStage");
  if (stage && stage.offsetParent !== null) {
    const r = stage.getBoundingClientRect(), w = r.width, h = r.height;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(8,11,18,.13)"; ctx.fillRect(0, 0, w, h);
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i], a = drawGhost(g, now);
      drawBeam(g, w, h, a);
      if (g.dead) ghosts.splice(i, 1);
    }
  }
  requestAnimationFrame(frame);
}
function stream(n, color = "cyan") {
  const c = ["red", "purple", "green"].includes(color) ? color : "cyan";
  const keys = ["price", "liquidity", "divergence", "chain"];
  for (let i = 0; i < n; i++) setTimeout(() => spawnGhost(c, keys[i % 4], true), i * (color === "red" ? 14 : 30) + Math.random() * 30);
}
function arcBand(cx, cy, ro, ri, s, e) {
  const rad = (d) => d * Math.PI / 180, pt = (rr, a) => ({ x: cx + rr * Math.cos(rad(a)), y: cy + rr * Math.sin(rad(a)) });
  const a = pt(ro, s), b = pt(ro, e), c = pt(ri, e), d = pt(ri, s), lg = e - s > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${ro} ${ro} 0 ${lg} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${c.x.toFixed(2)} ${c.y.toFixed(2)} A ${ri} ${ri} 0 ${lg} 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)} Z`;
}
function buildGraph() {
  const ticks = $("ringTicks"), shield = $("shieldLayer"), ns = "http://www.w3.org/2000/svg";
  ticks.innerHTML = ""; shield.innerHTML = "";
  for (let i = 0; i < 96; i++) {
    const a = i * Math.PI * 2 / 96 - Math.PI / 2, r1 = i % 8 === 0 ? 181 : 185, r2 = i % 8 === 0 ? 194 : 189;
    const l = document.createElementNS(ns, "line");
    l.setAttribute("x1", 340 + Math.cos(a) * r1); l.setAttribute("y1", 235 + Math.sin(a) * r1);
    l.setAttribute("x2", 340 + Math.cos(a) * r2); l.setAttribute("y2", 235 + Math.sin(a) * r2);
    l.setAttribute("class", "ring-tick" + (i % 8 === 0 ? " major" : ""));
    ticks.appendChild(l);
  }
  const specs = [
    { cls: "a", ri: 198, ro: 211, count: 6, span: 34, step: 60, fill: "url(#shieldFillA)" },
    { cls: "b", ri: 215, ro: 227, count: 5, span: 39, step: 72, fill: "url(#shieldFillB)" },
    { cls: "c", ri: 190, ro: 196, count: 8, span: 17, step: 45, fill: "none" },
  ];
  specs.forEach((sp, layer) => {
    const g = document.createElementNS(ns, "g"); g.setAttribute("class", "shield-rotor " + sp.cls);
    for (let i = 0; i < sp.count; i++) {
      const c = -90 + i * sp.step + (layer === 1 ? 14 : layer === 2 ? 22 : 0), s = c - sp.span / 2, e = c + sp.span / 2;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", arcBand(340, 235, sp.ro, sp.ri, s, e));
      path.setAttribute("class", "shield-blade" + (i % 2 === 0 ? " hot" : ""));
      path.setAttribute("fill", sp.fill); g.appendChild(path);
      const edge = document.createElementNS(ns, "path");
      edge.setAttribute("d", `M ${340 + sp.ro * Math.cos(s * Math.PI / 180)} ${235 + sp.ro * Math.sin(s * Math.PI / 180)} A ${sp.ro} ${sp.ro} 0 0 1 ${340 + sp.ro * Math.cos(e * Math.PI / 180)} ${235 + sp.ro * Math.sin(e * Math.PI / 180)}`);
      edge.setAttribute("class", "shield-edge"); g.appendChild(edge);
      [s, e].forEach((ang) => {
        const bc = document.createElementNS(ns, "circle");
        bc.setAttribute("cx", 340 + (sp.ri + sp.ro) / 2 * Math.cos(ang * Math.PI / 180));
        bc.setAttribute("cy", 235 + (sp.ri + sp.ro) / 2 * Math.sin(ang * Math.PI / 180));
        bc.setAttribute("r", i % 2 === 0 ? 2.2 : 1.5);
        bc.setAttribute("class", "shield-beacon"); g.appendChild(bc);
      });
    }
    shield.appendChild(g);
  });
}

/* ---------- Monad Testnet 实时区块订阅（WSS · 只读） ----------
 * 连接公共 WSS → 校验 chainId=10143 → eth_subscribe(newHeads)
 * 每个新区块：更新链状态、驱动粒子信号、刷新「最近更新」。
 * 断线自动重连；所有链上访问经 ChainGuard 锁定测试网。            */
const chainLive = {
  ws: null,
  subId: null,
  reqId: 1,
  reconnectTimer: null,
  connected: false,
  lastBlock: null,
  pending: new Map(),
};

function chainSend(method, params = []) {
  return new Promise((resolve, reject) => {
    if (!chainLive.ws || chainLive.ws.readyState !== WebSocket.OPEN) return reject(new Error("WS 未连接"));
    const id = chainLive.reqId++;
    const timer = setTimeout(() => { chainLive.pending.delete(id); reject(new Error("RPC 超时: " + method)); }, 8000);
    chainLive.pending.set(id, { resolve, reject, timer });
    chainLive.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

function setChainStatus(kind) {
  const badge = document.querySelector(".live-badge");
  if (!badge) return;
  badge.className = "live-badge " + kind;
  const txt = kind === "live" ? "LIVE" : kind === "connecting" ? "CONNECTING" : "OFFLINE";
  badge.innerHTML = "<i></i> " + txt;
  if (kind === "connecting") $("sigLatency").textContent = "连接中…";
  else if (kind === "offline") $("sigLatency").textContent = "离线";
  // live 时区块高度由 handleNewBlock 填入真实数值
}

function handleNewBlock(block) {
  const num = parseInt(block.number, 16);
  if (!Number.isFinite(num)) return;
  chainLive.lastBlock = num;
  $("lastUpdate").textContent = fmtTime();
  // 用「链上区块」位显示真实区块高度，让实时性可见
  $("sigLatency").textContent = "#" + num.toLocaleString("en-US");
  // 每个新区块驱动一波信号粒子（视觉动画绑定到真实链事件）
  if (!reduceMotion) {
    const color = state.scenario === "drill" ? "red" : "cyan";
    const count = state.scenario === "drill" ? 3 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) setTimeout(() => spawnGhost(color, null, true), i * 60);
  }
}

function scheduleReconnect() {
  if (chainLive.reconnectTimer) return;
  chainLive.reconnectTimer = setTimeout(() => { chainLive.reconnectTimer = null; observeChain(); }, 5000);
}

async function observeChain() {
  const url = (NET.rpcWs || "").trim();
  if (!url) { setChainStatus("offline"); return; }
  setChainStatus("connecting");
  try {
    ChainGuard.assertEndpoint(url);
    chainLive.ws = new WebSocket(url);
  } catch (e) { setChainStatus("offline"); scheduleReconnect(); return; }

  const ws = chainLive.ws;
  const fail = () => { if (chainLive.ws === ws) { chainLive.connected = false; setChainStatus("offline"); scheduleReconnect(); } };
  ws.onerror = fail;
  ws.onclose = () => { if (chainLive.ws === ws) fail(); };
  ws.onopen = async () => {
    try {
      const chain = await chainSend("eth_chainId");
      ChainGuard.assertChainId(chain.result, "WSS RPC"); // 强制 10143，拒绝主网
      const sub = await chainSend("eth_subscribe", [NET.blockSubscription || "newHeads"]);
      if (sub.error) throw new Error(sub.error.message || "订阅失败");
      chainLive.subId = sub.result;
      chainLive.connected = true;
      setChainStatus("live");
      // 订阅成功后先取一次当前区块，避免面板空白等待
      try {
        const head = await chainSend("eth_getBlockByNumber", ["latest", false]);
        if (head.result && head.result.number) handleNewBlock(head.result);
      } catch (e) { /* 首个区块取不到不影响后续推送 */ }
    } catch (e) {
      console.warn("[ChainGuard] 实时订阅未建立：", e.message);
      try { ws.close(); } catch (_) {}
      fail();
    }
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch (_) { return; }
    if (msg.id && chainLive.pending.has(msg.id)) {
      const p = chainLive.pending.get(msg.id);
      chainLive.pending.delete(msg.id);
      clearTimeout(p.timer);
      msg.error ? p.reject(new Error(msg.error.message || "RPC 错误")) : p.resolve(msg);
      return;
    }
    if (msg.method === "eth_subscription" && msg.params && msg.params.subscription === chainLive.subId && msg.params.result) {
      handleNewBlock(msg.params.result);
    }
  };
}

/* ---------- 事件绑定 ---------- */
function bind() {
  ["connectBtn", "heroConnect", "bottomConnect"].forEach((id) => { $(id).onclick = openWalletModal; });
  $("walletModal").querySelectorAll("[data-provider]").forEach((b) => { b.onclick = () => connectWallet(b.dataset.provider); });
  $("walletMenuBtn").onclick = (e) => { e.stopPropagation(); const d = $("walletDropdown"); d.hidden = !d.hidden; };
  document.addEventListener("click", (e) => { if (!e.target.closest(".wallet-chip")) $("walletDropdown").hidden = true; });
  $("disconnectBtn").onclick = disconnect;
  $("copyAddressBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(state.address); toast("地址已复制"); } catch { toast("复制失败，请手动复制"); }
  };

  $("createBtn").onclick = openCreateModal;
  $("createFirstBtn").onclick = openCreateModal;
  $("createForm").addEventListener("submit", submitCreate);
  ["fAsset", "fAmount", "fDrop", "fExit", "fSlip", "fDuration"].forEach((id) => { $(id).addEventListener("input", updatePolicyPreview); $(id).addEventListener("change", updatePolicyPreview); });
  $("drillBtn").onclick = runDrill;

  document.querySelectorAll("[data-close]").forEach((b) => {
    b.onclick = () => { b.closest(".modal-backdrop").hidden = true; };
  });
  document.querySelectorAll(".modal-backdrop").forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach((m) => { m.hidden = true; });
  });
}

function init() {
  $("networkLabel").textContent = (NET.chainName || "MONAD TESTNET").toUpperCase();
  buildGraph(); resizeCanvas();
  applyScenario("normal");
  bind();
  renderAll();
  requestAnimationFrame(frame);
  stream(16, "cyan"); // 初始入场动画；此后粒子由真实区块驱动
  observeChain();     // 连接 Monad Testnet WSS，订阅实时区块
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
