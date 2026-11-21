/* ============================================================================
 * Circuit Breaker —— 前端交互与适配器预留
 * 所有可配置值来自 config.js（window.MCB_CONFIG）。
 * 未配置的适配器保持 throw / 状态显示，绝不伪造成功。
 * ========================================================================== */
(function () {
"use strict";
const CFG = window.MCB_CONFIG || {};
const $ = (id) => document.getElementById(id);
const NET = CFG.network || {};

/* ---------- Monad 链守卫：所有链上访问强制锁定 Monad Testnet ----------
 * 目的：确保本站任何链交互只能发生在 Monad Testnet (chainId 10143)。
 * - 拒绝其它链（含 Monad 主网 143、以太坊等）
 * - 拒绝看起来像主网/其它链的 RPC 端点
 * - 将来接 Privy 时，钱包切换链必须经 assertWalletChain() 才允许写操作
 * 站点本身是静态前端，托管在 Vercel；链上部分全部指向 Monad Testnet。      */
const MONAD_CHAIN_ID = Number(NET.chainId) || 10143;
const MONAD_HOST_HINTS = ["monad.xyz", "monad-testnet", "testnet-rpc", "10143"];
const ChainGuard = {
  expected: MONAD_CHAIN_ID,
  // 校验 RPC 返回的 chainId（16进制字符串或数字）是否为 Monad Testnet
  assertChainId(raw, source = "RPC") {
    const id = typeof raw === "string" ? parseInt(raw, 16) : Number(raw);
    if (id !== MONAD_CHAIN_ID) {
      const msg = `链不匹配：${source} 返回 chainId=${id}(0x${id.toString(16)})，本站仅允许 Monad Testnet ${MONAD_CHAIN_ID}`;
      console.error("[ChainGuard]", msg);
      throw new Error(msg);
    }
    return id;
  },
  // 校验用户填写的 RPC URL 是否疑似 Monad 测试网（防止误填主网/其它链）
  assertEndpoint(url) {
    if (!url || typeof url !== "string") throw new Error("RPC URL 为空");
    const lower = url.toLowerCase();
    // 先排除主网与其它链的明显特征（优先级高于 host 白名单）
    if (lower.includes("mainnet") || lower.includes("//rpc.monad.xyz") || lower.includes("//rpc.monad.xyz/")) {
      throw new Error("这是主网端点，本站仅允许 Monad Testnet (10143)");
    }
    if (!MONAD_HOST_HINTS.some((h) => lower.includes(h))) {
      throw new Error(`RPC 端点不像 Monad Testnet（应包含 ${MONAD_HOST_HINTS.join(" / ")} 之一）：${url}`);
    }
    return url;
  },
  // 将来接 Privy/wallet 后，任何写操作前调用：校验钱包当前链
  assertWalletChain(walletChainId) {
    this.assertChainId(walletChainId, "Wallet");
    return true;
  },
};
window.MONAD_CHAIN_GUARD = ChainGuard; // 供钱包/保护适配器复用

/* ---------- 合成测试数据（标注 SIMULATED）---------- */
const TEST_DATA = {
  normal:   { label:"NORMAL / SIMULATED",   risk:18, states:{cex:"NORMAL",dex:"NORMAL",div:"NORMAL"},   metrics:{cex:"-0.24%",dex:"98.2%",div:"0.16%",age:"34 ms"} },
  priceShock:{label:"PRICE SHOCK / SIMULATED",risk:82, states:{cex:"CRITICAL",dex:"WARNING",div:"CRITICAL"},metrics:{cex:"-4.80%",dex:"63.0%",div:"1.72%",age:"42 ms"} },
  liquidity:{label:"LIQUIDITY SHOCK / SIMULATED",risk:71, states:{cex:"NORMAL",dex:"CRITICAL",div:"WARNING"},metrics:{cex:"-0.31%",dex:"41.5%",div:"0.88%",age:"51 ms"} },
  custom:   { label:"CUSTOM / SIMULATED",   risk:55, states:{cex:"WARNING",dex:"WARNING",div:"NORMAL"},metrics:{cex:"-1.20%",dex:"82.0%",div:"0.65%",age:"40 ms"} },
};
let activeData = TEST_DATA.normal;

/* ---------- 适配器预留：接入真实能力时实现这些方法 ----------
 * 1) marketData.connect()  —— 接 CEX WebSocket（CFG.dataSources.cexWs）
 * 2) chainData.readPool()  —— 读 Monad DEX 池状态/报价（CFG.dataSources.quoteApi）
 * 3) wallet.connect()      —— 接 Privy SDK（CFG.wallet.privyAppId）
 * 4) gas.sponsor()         —— 接无 Gas / Paymaster（CFG.links.tutorial1）
 * 5) protection.*          —— 接保护合约写操作（CFG.protection.contractAddress）
 * 未配置时保持 notConfigured()，页面显示真实状态。                       */
const notConfigured = (name) => async () => { throw new Error(name + " adapter not configured"); };
const ADAPTERS = {
  marketData: { connect: notConfigured("CEX market data"), disconnect(){} },
  chainData:  { readPool: notConfigured("DEX chain data") },
  wallet:     { connect: notConfigured("Privy wallet") },
  gas:        { sponsor: notConfigured("Gas sponsorship") },
  protection: {
    pauseBuys: notConfigured("Pause buys"),
    cancelOrders: notConfigured("Cancel orders"),
    protectedExit: notConfigured("Protected exit"),
  },
};
if (window.CIRCUIT_BREAKER_ADAPTERS) Object.assign(ADAPTERS, window.CIRCUIT_BREAKER_ADAPTERS);
window.CIRCUIT_BREAKER_ADAPTERS = ADAPTERS; // 供外部脚本覆盖

/* ---------- 全局状态 ---------- */
let mode = "sim", risk = 18, events = 0, flowPackets = 0;
let ws = null, wsId = 1, blockNo = null;
const journeyDone = new Set();

function toast(s){ const t=$("toast"); if(!t) return; t.textContent=s; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2800); }
function log(title,detail,state="INFO",color=""){
  const el=document.createElement("div"); el.className="event"; el.innerHTML=`<time></time><div><b></b><span></span></div><span class="tag ${color}"></span>`;
  el.querySelector("time").textContent=new Date().toLocaleTimeString("en-GB",{hour12:false});
  el.querySelector("b").textContent=title; el.querySelector("span").textContent=detail; el.lastElementChild.textContent=state;
  $("eventLog").prepend(el); events++; $("eventCount").textContent=events+" EVENTS";
  while($("eventLog").children.length>40) $("eventLog").lastChild.remove();
  evidence(title, `${state} · ${detail}`);
}
function evidence(title,detail){
  const box=$("evidenceLog"); if(!box) return;
  if(box.querySelector(".muted")) box.innerHTML="";
  const d=document.createElement("div"); d.className="evidence-item";
  const b=document.createElement("b"); b.textContent=title;
  const s=document.createElement("small"); s.textContent=new Date().toISOString()+" · "+detail;
  d.append(b,s); box.prepend(d);
}

/* ---------- 风险状态渲染 ---------- */
function setRisk(v,states){
  risk=Math.max(0,Math.min(100,v));
  $("riskScore").innerHTML=risk+'<span style="font-size:11px;color:var(--muted)"> / 100</span>';
  $("riskFill").style.width=risk+"%";
  const hi=risk>=Number($("riskThreshold").value||65), med=risk>=40;
  $("riskState").textContent=hi?"HIGH RISK":med?"ELEVATED":"NORMAL";
  $("riskState").style.color=hi?"var(--red)":med?"var(--amber)":"var(--green)";
  $("riskTag").textContent=mode==="sim"?"SIMULATED":"LIVE SIGNAL";
  $("riskTag").className="tag"+(hi?"":" good");
  $("coreValue").textContent=risk;
  $("coreState").textContent=hi?"PROTECTION":med?"CAUTION":"MONITORING";
  $("riskFill").style.background=hi?"var(--red)":med?"var(--amber)":"var(--green)";
  const map=[["cex","dotCex","cexState","cexDesc"],["dex","dotDex","dexState","dexDesc"],["div","dotDiv","divState","divDesc"]];
  const desc={NORMAL:{cex:"短周期价格变化处于正常区间",dex:"池深与可执行报价稳定",div:"CEX / DEX 报价偏离较小"},WARNING:{cex:"外部市场出现快速价格变化",dex:"可执行深度下降或滑点扩大",div:"跨市场报价偏离正在扩大"},CRITICAL:{cex:"价格冲击超过风险阈值",dex:"流动性明显收缩",div:"跨市场价格发现存在显著滞后"}};
  map.forEach(([k,dot,st,ds])=>{ const x=(states&&states[k])||"NORMAL"; $(dot).className="dot"+(x==="CRITICAL"?" red":x==="WARNING"?" warn":""); $(st).textContent=x; $(st).style.color=x==="CRITICAL"?"var(--red)":x==="WARNING"?"var(--amber)":"var(--muted)"; $(ds).textContent=(desc[x]||desc.NORMAL)[k]; });
}
function timeline(vals){ for(let i=0;i<6;i++){ const v=vals[i]||"—"; $("t"+i).textContent=v; $("tp"+i).classList.toggle("active",!!vals[i]); } }

/* ---------- 场景 ---------- */
function scenarioNormal(){
  activeData=TEST_DATA.normal; mode="sim";
  document.querySelector(".center-core").classList.remove("alert");
  setRisk(18,TEST_DATA.normal.states);
  $("flowMode").firstChild.textContent="NORMAL FLOW · "; $("flowMode").className="tag good"; $("flowMode").style.color=""; $("flowMode").style.borderColor="";
  $("captureStatus").textContent="AWAITING SIGNAL"; $("modeChip").textContent="演示模式"; $("modeChip").className="chip warn";
  ["cex","dex","div","age"].forEach(k=>{ const id="field"+k[0].toUpperCase()+k.slice(1); $(id+"Value").textContent=TEST_DATA.normal.metrics[k]; $(id+"Hint").textContent="simulated · normal"; });
  log("Market normalized","Signals returned to baseline","OK","good"); stream(18,"green");
}
function scenarioShock(){
  activeData=TEST_DATA.priceShock; mode="sim";
  document.querySelector(".center-core").classList.add("alert");
  $("modeChip").textContent="SCENARIO REPLAY"; $("modeChip").className="chip warn";
  timeline(["T0 · signal","—","—","—","—","—"]);
  setRisk(82,TEST_DATA.priceShock.states);
  $("flowMode").firstChild.textContent="SIGNAL SHOCK · CAPTURE · "; $("flowMode").className="tag"; $("flowMode").style.color="var(--red)"; $("flowMode").style.borderColor="rgba(255,107,142,.4)";
  ["cex","dex","div","age"].forEach(k=>{ const id="field"+k[0].toUpperCase()+k.slice(1); $(id+"Value").textContent=TEST_DATA.priceShock.metrics[k]; $(id+"Hint").textContent="simulated · price shock"; });
  log("CEX price shock detected","Simulated external price drop; ghost packets entering capture ring","TRIGGERED","");
  stream(76,"red");
  setTimeout(()=>{ timeline(["T0 · signal","T1 · received","T2 · risk 82","—","—","—"]); log("Risk engine decision","Multiple independent signals crossed threshold","HIGH RISK",""); },800);
  setTimeout(()=>{ log("Protection policy evaluated","Pause buys / cancel orders / protected exit","READY","good"); $("protectBtn").classList.add("green"); },1450);
}
function scenarioLiquidity(){
  activeData=TEST_DATA.liquidity; mode="sim";
  document.querySelector(".center-core").classList.add("alert");
  $("modeChip").textContent="SCENARIO REPLAY"; $("modeChip").className="chip warn";
  setRisk(71,TEST_DATA.liquidity.states);
  $("flowMode").firstChild.textContent="DEX LIQUIDITY SHOCK · "; $("flowMode").className="tag"; $("flowMode").style.color="var(--red)"; $("flowMode").style.borderColor="rgba(255,107,142,.4)";
  ["cex","dex","div","age"].forEach(k=>{ const id="field"+k[0].toUpperCase()+k.slice(1); $(id+"Value").textContent=TEST_DATA.liquidity.metrics[k]; $(id+"Hint").textContent="simulated · liquidity shock"; });
  timeline(["T0 · pool event","—","—","—","—","—"]);
  log("DEX liquidity shock","Simulated depth deterioration; pool quote not connected","TRIGGERED","");
  stream(58,"red");
  setTimeout(()=>timeline(["T0 · pool event","T1 · received","T2 · risk 71","—","—","—"]),760);
}
async function runProtection(){
  if(risk<Number($("riskThreshold").value||65)){ toast("风险尚未达到触发阈值"); return; }
  log("Protection requested","SIMULATION ONLY · adapter not connected","SIM ONLY","");
  $("captureStatus").textContent="PROTECTION ROUTE"; $("coreState").textContent="PROTECTION";
  stream(44,"purple"); timeline(["Signal","Received","Decision","SIM submit","No chain tx","Not finalized"]);
  log("Fail-safe check","No Privy authorization / no live order state; write action blocked","BLOCKED","");
  toast("已模拟保护流程。未连接钱包授权、未接链上写入适配器，因此未发送交易。");
}

/* ---------- 粒子 / 环形捕获动画 ---------- */
const canvas=$("particleCanvas"), ctx=canvas.getContext("2d");
let ghosts=[], scale=1;
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function resizeCanvas(){ const r=$("graphStage").getBoundingClientRect(), d=Math.min(devicePixelRatio||1,2); canvas.width=Math.round(r.width*d); canvas.height=Math.round(r.height*d); scale=d; ctx.setTransform(d,0,0,d,0,0); }
if(window.ResizeObserver) new ResizeObserver(resizeCanvas).observe($("graphStage"));
function cubic(a,b,c,d,t){ const u=1-t; return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x, y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y}; }
const sources=[{x:32,y:80,key:"cex"},{x:648,y:80,key:"dex"},{x:32,y:390,key:"div"},{x:648,y:390,key:"age"}];
function syncField(g){
  if(g.synced) return; g.synced=true;
  const stage=$("graphStage"); stage.classList.remove("shockwave"); void stage.offsetWidth; stage.classList.add("shockwave");
  const m=activeData.metrics, map={cex:{v:m.cex,h:"CEX reference price change · fixture"},dex:{v:m.dex,h:"DEX executable depth · fixture"},div:{v:m.div,h:"CEX / DEX divergence · fixture"},age:{v:m.age,h:"source → received · fixture"}};
  const info=map[g.key]||map.cex, cap=g.key[0].toUpperCase()+g.key.slice(1), box=$("field"+cap);
  $("field"+cap+"Value").textContent=info.v; $("field"+cap+"Hint").textContent=info.h;
  box.classList.remove("syncing"); void box.offsetWidth; box.classList.add("syncing");
  box.querySelector("b").textContent="SYNC: CAPTURED · "+new Date().toLocaleTimeString("en-GB");
  $("captureStatus").textContent="SIGNAL CAPTURED"; $("captureStatus").style.color=g.color==="red"?"var(--red)":"var(--cyan)";
  const f=$("captureFlash"); f.classList.remove("active"); void f.getBoundingClientRect(); f.classList.add("active");
  const cv=$("coreValue"); cv.classList.remove("core-capture"); void cv.offsetWidth; cv.classList.add("core-capture");
  log("Signal captured → field synced",g.key.toUpperCase()+" telemetry synchronized","CAPTURED","good");
}
function syncBlock(){
  const box=$("fieldBlock");
  if(blockNo!==null){ $("blockHeight").textContent=blockNo.toLocaleString(); box.querySelector("b").textContent="SYNC: BLOCK CAPTURED"; box.classList.remove("syncing"); void box.offsetWidth; box.classList.add("syncing"); }
  $("captureStatus").textContent="BLOCK CAPTURED"; $("captureStatus").style.color="var(--cyan)";
  const f=$("captureFlash"); f.classList.remove("active"); void f.getBoundingClientRect(); f.classList.add("active");
}
function spawnGhost(color="cyan",forcedKey=null,doSync=true){
  if(reduceMotion){ if(doSync) syncField({key:forcedKey||"cex",color,synced:false}); else syncBlock(); return; }
  if(ghosts.length>180) return;
  const src=sources[Math.floor(Math.random()*sources.length)], key=forcedKey||src.key;
  const a=Math.random()*Math.PI*2, cap={x:340+Math.cos(a)*161,y:235+Math.sin(a)*161};
  const dx=cap.x-src.x, dy=cap.y-src.y, perp={x:-dy*.18,y:dx*.18};
  ghosts.push({x:src.x,y:src.y,src,cap,key,color,started:performance.now(),travel:850+Math.random()*700,orbit:480+Math.random()*400,collapse:420,phase:0,angle:a,spin:(Math.random()>.5?1:-1)*(.55+Math.random()*.7),trail:[],size:1.4+Math.random()*2.2,c1:{x:src.x+dx*.32+perp.x,y:src.y+dy*.32+perp.y},c2:{x:cap.x-dx*.22+perp.x*.35,y:cap.y-dy*.22+perp.y*.35},synced:false,doSync});
  flowPackets++; $("flowCount").textContent=flowPackets;
}
function drawGhost(g,now){
  const el=now-g.started; let t,x,y,alpha=1;
  if(g.phase===0){ t=Math.min(1,el/g.travel); const s=g.src||{x:32,y:80}; const p=cubic(s,g.c1,g.c2,g.cap,t); x=p.x; y=p.y; alpha=.15+.85*Math.sin(Math.PI*t*.5); if(t>=1){ g.phase=1; g.phaseAt=now; g.doSync?syncField(g):syncBlock(); } }
  else if(g.phase===1){ const u=Math.min(1,(now-g.phaseAt)/g.orbit), an=g.angle+g.spin*u*.95; x=340+Math.cos(an)*161; y=235+Math.sin(an)*161; alpha=.95; if(u>=1){ g.phase=2; g.phaseAt=now; g.from={x,y}; } }
  else{ const u=Math.min(1,(now-g.phaseAt)/g.collapse), p=cubic(g.from,{x:g.from.x+(340-g.from.x)*.28,y:g.from.y+(235-g.from.y)*.28-18},{x:340+(g.from.x-340)*.10,y:235+(g.from.y-235)*.10},{x:340,y:235},u); x=p.x; y=p.y; alpha=1-u; if(u>=1) g.dead=true; }
  g.x=x; g.y=y; g.trail.push({x,y,life:1}); if(g.trail.length>24) g.trail.shift(); return alpha;
}
function palette(c){ return c==="red"?{d:"#ff7896",h:"#ffe8ee",s:"#ff557b"}:c==="purple"?{d:"#b4a1ff",h:"#f1edff",s:"#9a7cff"}:c==="green"?{d:"#72f5c1",h:"#eafff5",s:"#43e6ad"}:{d:"#75eaff",h:"#e9fcff",s:"#45dcff"}; }
function drawBeam(g,w,h,alpha){
  const pts=g.trail; if(!pts.length) return; const p=palette(g.color), fade=Math.max(0,alpha);
  ctx.save(); ctx.globalCompositeOperation="lighter";
  const n=Math.min(pts.length,24);
  for(let i=0;i<n;i++){ const pt=pts[n-1-i], age=i/Math.max(1,n-1), x=pt.x*w/680, y=pt.y*h/470, r=(1.9+g.size*.48)*(1-age*.78), a=fade*(1-age)*.72; if(a<=.015) continue; ctx.globalAlpha=a; ctx.shadowBlur=7*(1-age)+2; ctx.shadowColor=p.s; ctx.fillStyle=p.d; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); if(i%3===0){ ctx.globalAlpha=a*.65; ctx.fillStyle=p.h; ctx.beginPath(); ctx.arc(x,y,Math.max(.55,r*.34),0,Math.PI*2); ctx.fill(); } }
  ctx.restore();
}
function frame(now){
  const r=$("graphStage").getBoundingClientRect(), w=r.width, h=r.height;
  ctx.globalCompositeOperation="source-over"; ctx.fillStyle="rgba(8,11,18,.13)"; ctx.fillRect(0,0,w,h);
  for(let i=ghosts.length-1;i>=0;i--){ const g=ghosts[i], a=drawGhost(g,now); drawBeam(g,w,h,a); if(g.dead) ghosts.splice(i,1); }
  requestAnimationFrame(frame);
}
function stream(n,color="cyan"){
  const c=(color==="red"||color==="purple"||color==="green")?color:"cyan", keys=["cex","dex","div","age"];
  for(let i=0;i<n;i++) setTimeout(()=>spawnGhost(c,keys[i%4],true), i*(color==="red"?17:27)+Math.random()*40);
}
function arcBand(cx,cy,ro,ri,s,e){ const rad=d=>d*Math.PI/180, pt=(rr,a)=>({x:cx+rr*Math.cos(rad(a)),y:cy+rr*Math.sin(rad(a))}), a=pt(ro,s),b=pt(ro,e),cc=pt(ri,e),d=pt(ri,s),lg=e-s>180?1:0; return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${ro} ${ro} 0 ${lg} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${cc.x.toFixed(2)} ${cc.y.toFixed(2)} A ${ri} ${ri} 0 ${lg} 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)} Z`; }
function buildGraph(){
  const ticks=$("ringTicks"), shield=$("shieldLayer"), ns="http://www.w3.org/2000/svg"; ticks.innerHTML=""; shield.innerHTML="";
  for(let i=0;i<96;i++){ const a=i*Math.PI*2/96-Math.PI/2, r1=i%8===0?181:185, r2=i%8===0?194:189, l=document.createElementNS(ns,"line"); l.setAttribute("x1",340+Math.cos(a)*r1); l.setAttribute("y1",235+Math.sin(a)*r1); l.setAttribute("x2",340+Math.cos(a)*r2); l.setAttribute("y2",235+Math.sin(a)*r2); l.setAttribute("class","ring-tick"+(i%8===0?" major":"")); ticks.appendChild(l); }
  const specs=[{cls:"a",ri:198,ro:211,count:6,span:34,step:60,fill:"url(#shieldFillA)"},{cls:"b",ri:215,ro:227,count:5,span:39,step:72,fill:"url(#shieldFillB)"},{cls:"c",ri:190,ro:196,count:8,span:17,step:45,fill:"none"}];
  specs.forEach((sp,layer)=>{ const g=document.createElementNS(ns,"g"); g.setAttribute("class","shield-rotor "+sp.cls); for(let i=0;i<sp.count;i++){ const c=-90+i*sp.step+(layer===1?14:layer===2?22:0), s=c-sp.span/2, e=c+sp.span/2, path=document.createElementNS(ns,"path"); path.setAttribute("d",arcBand(340,235,sp.ro,sp.ri,s,e)); path.setAttribute("class","shield-blade"+(i%2===0?" hot":"")); path.setAttribute("fill",sp.fill); g.appendChild(path); const edge=document.createElementNS(ns,"path"); edge.setAttribute("d",`M ${340+sp.ro*Math.cos(s*Math.PI/180)} ${235+sp.ro*Math.sin(s*Math.PI/180)} A ${sp.ro} ${sp.ro} 0 0 1 ${340+sp.ro*Math.cos(e*Math.PI/180)} ${235+sp.ro*Math.sin(e*Math.PI/180)}`); edge.setAttribute("class","shield-edge"); g.appendChild(edge); [s,e].forEach(a=>{ const bc=document.createElementNS(ns,"circle"); bc.setAttribute("cx",340+(sp.ri+sp.ro)/2*Math.cos(a*Math.PI/180)); bc.setAttribute("cy",235+(sp.ri+sp.ro)/2*Math.sin(a*Math.PI/180)); bc.setAttribute("r",i%2===0?2.2:1.5); bc.setAttribute("class","shield-beacon"); g.appendChild(bc); }); } shield.appendChild(g); });
}

/* ---------- 只读 RPC 观察 ---------- */
function rpcSend(method,params=[]){ return new Promise((resolve,reject)=>{ const id=wsId++, timer=setTimeout(()=>reject(new Error("RPC timeout: "+method)),8000); const h=e=>{ let d; try{ d=JSON.parse(e.data); }catch{ return; } if(d.id===id){ ws.removeEventListener("message",h); clearTimeout(timer); d.error?reject(new Error(d.error.message)):resolve(d.result); } }; ws.addEventListener("message",h); ws.send(JSON.stringify({jsonrpc:"2.0",id,method,params})); }); }
async function connectLive(){
  const url=$("wsUrl").value.trim() || NET.rpcWs;
  if(!url){ toast("请填写或允许用户默认 WSS RPC"); return; }
  try{
    ChainGuard.assertEndpoint(url); // 只允许 Monad Testnet 端点
    stopWs(false); ws=new WebSocket(url); $("chkRpc").textContent="CONNECTING";
    await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=()=>rej(new Error("WebSocket 连接失败")); });
    const chain=await rpcSend("eth_chainId");
    ChainGuard.assertChainId(chain, "WSS RPC"); // 强制 chainId=10143
    mode="live"; $("modeChip").textContent="LIVE · READ ONLY"; $("modeChip").className="chip";
    $("chkRpc").textContent="CONNECTED"; $("chkChain").textContent="10143 OK";
    const sub=await rpcSend("eth_subscribe",[NET.blockSubscription]);
    ws.addEventListener("message",e=>{ let d; try{ d=JSON.parse(e.data); }catch{ return; } if(d.method==="eth_subscription"&&d.params&&d.params.subscription===sub){ const b=d.params.result; blockNo=parseInt(b.number,16); $("blockHeight").textContent=blockNo.toLocaleString(); log("Monad block observed","block "+blockNo+" · "+((b.hash||"").slice(0,12))+"…","NEW HEAD","good"); stream(4,"cyan"); } });
    $("evChain").textContent="LIVE · READ ONLY";
    log("Monad Testnet connected","chainId "+NET.chainId+" · new heads subscribed","LIVE","good");
    toast("Monad Testnet 只读观察连接成功");
  }catch(e){ $("chkRpc").textContent="ERROR"; $("evChain").textContent="NOT CONNECTED"; log("RPC connection failed",e.message,"ERROR",""); toast(e.message); stopWs(false); }
}
function stopWs(resetMode=true){ if(ws){ try{ ws.close(); }catch{} ws=null; } if(resetMode&&mode==="live"){ mode="sim"; $("modeChip").textContent="演示模式"; $("modeChip").className="chip warn"; } $("chkRpc").textContent="—"; }

/* ---------- 合约清单 ---------- */
function renderContracts(){
  const tb=$("contractRows"); if(!tb) return; tb.innerHTML="";
  (CFG.contracts||[]).forEach(c=>{
    const tr=document.createElement("tr");
    const n=document.createElement("td"); n.textContent=c.name;
    const a=document.createElement("td");
    if(c.address){ const link=document.createElement("a"); link.href=(NET.explorer||"")+"/address/"+c.address; link.target="_blank"; link.rel="noopener"; link.textContent=c.address; a.appendChild(link); }
    else { a.textContent="— 待核验 —"; a.className="note"; }
    const note=document.createElement("td"); note.className="note"; note.textContent=c.note||"";
    const st=document.createElement("td"); st.className="state"; st.textContent=c.address?"REGISTRY":"ADDRESS REQUIRED";
    tr.append(n,a,note,st); tb.appendChild(tr);
  });
}
async function verifyContracts(){
  const rpc=(NET.rpcHttp||"").trim(); if(!rpc){ toast("未配置 RPC"); return; }
  try{ ChainGuard.assertEndpoint(rpc); } catch(e){ toast(e.message); return; }
  try{ const r=await fetch(rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]})}); const j=await r.json(); ChainGuard.assertChainId(j.result,"HTTP RPC"); }
  catch(e){ toast("RPC / Chain ID 检查失败："+e.message); return; }
  const rows=$("contractRows").children; let count=0;
  for(let i=0;i<rows.length;i++){
    const c=(CFG.contracts||[])[i], cell=rows[i].children[3];
    if(!c||!c.address){ continue; }
    cell.textContent="CHECKING…";
    try{ const r=await fetch(rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:i+2,method:"eth_getCode",params:[c.address,"latest"]})}); const j=await r.json(); if(j.error) throw new Error(j.error.message); const ok=j.result&&j.result!=="0x"&&j.result!=="0x0"; cell.textContent=ok?"BYTECODE FOUND":"NO BYTECODE"; cell.className="state "+(ok?"ok":"bad"); count+=ok?1:0; }
    catch(e){ cell.textContent="RPC ERROR"; cell.className="state bad"; }
  }
  log("Contract bytecode check",count+" address(es) returned bytecode · chainId "+NET.chainId+" · not source verification","CHECKED","good");
  toast("检查完成："+count+" 个地址存在字节码（不代表已审计或身份可信）");
}

/* ---------- 配置驱动的链接 / 状态 ---------- */
function setLink(id,url,warnText){
  const el=$(id); if(!el) return;
  if(url){ el.href=url; el.style.pointerEvents="auto"; el.style.opacity="1"; }
  else { el.href="#"; el.style.pointerEvents="none"; el.style.opacity=".55"; const s=el.querySelector(".res-status"); if(s&&warnText){ s.textContent=warnText; s.className="res-status warn"; } }
}
function applyConfigToUI(){
  const L=CFG.links||{}, W=CFG.wallet||{}, P=CFG.protection||{}, F=CFG.flags||{};
  $("networkChip").textContent=(NET.chainName||"MONAD TESTNET").toUpperCase()+" · "+(NET.chainId||10143);
  setLink("resExplorer",NET.explorer); setLink("resDocs",L.monadDocs); setLink("resFaucet",NET.faucet);
  setLink("resNotion",L.resources); setLink("resPrivy",L.privyDocs);
  setLink("resPrivyApi",L.privyApiDocs); setLink("resTutorial",L.tutorial1,"需配置 URL"); setLink("resBridge",L.monadBridge,"未配置");
  $("privyAppIdState").textContent=W.privyAppId?("已填 · "+W.privyAppId.slice(0,6)+"…"):"未配置";
  $("privyWalletState").textContent=W.privyConfigured?"ENABLED":"待接 SDK";
  $("chkPrivy").textContent=W.privyConfigured?"ENABLED":"未配置";
  $("chkGas").textContent=W.gasSponsorshipConfigured?"CONFIGURED":"未配置";
  $("gasState").textContent=W.gasSponsorshipConfigured?"CONFIGURED":"NOT CONFIGURED";
  $("sponsorState").textContent=W.gasSponsorshipConfigured?"CONNECTED":"未连接";
  $("chkContract").textContent=P.contractAddress?"ADDRESS SET":"未部署";
  $("chkFeed").textContent=(L.monadDocs&&F.demoMode)?"SIMULATED":"SIMULATED";
  if(L.tutorial1){ const h=$("tutorialHint"); if(h) h.innerHTML='tutorial1 = Pimlico 无 Gas 教程（permissionless.js + Verifying Paymaster）：<a href="'+L.tutorial1+'" target="_blank" rel="noopener" style="color:var(--cyan)">打开 ↗</a>'; }
  // 测试代币状态（未核验时明确标注）
  const token=(P.testTokenAddress||"").trim();
  const ts=$("testTokenState");
  if(ts){ if(token){ ts.textContent=token.slice(0,6)+"…"+token.slice(-4)+(P.testTokenVerified?"":" · 未核验"); ts.style.color=P.testTokenVerified?"var(--green)":"var(--amber)"; } else ts.textContent="未配置"; }
  // 顶部提示按配置更新
  if(!F.demoMode){ $("topNotice").style.display="none"; $("heroNote").textContent="实时模式"; }
  $("timelineMode").textContent=F.demoMode?"SIMULATION":"LIVE";
}

/* ---------- 旅程 ---------- */
function markJourney(n,label){
  journeyDone.add(n);
  document.querySelectorAll(".journey-step").forEach(el=>{ const k=Number(el.dataset.step); el.classList.toggle("done",journeyDone.has(k)); el.classList.toggle("active",k===n); const st=$("stepState"+k); if(journeyDone.has(k)&&st) st.textContent="COMPLETED · "+(label||"DEMO"); });
  const c=journeyDone.size; $("journeyStatus").textContent=c+" / 8 · 演示旅程"; $("journeyProgress").style.width=(c/8*100)+"%";
}
function openDeck(tab){ const b=document.querySelector('[data-tab="'+tab+'"]'); if(b) b.click(); const p=$("mvp-control"); if(p) p.parentElement.open=true; const s=document.querySelector(".advanced-shell>summary"); if(s&&s.parentElement) s.parentElement.open=true; document.querySelector(".advanced-shell").scrollIntoView({behavior:"smooth",block:"start"}); }

/* ---------- 钱包（演示 / 预留真实 Privy）---------- */
function mockConnect(){ $("walletState").textContent="SIMULATED WALLET"; $("walletState").className="tag sim"; $("evWallet").textContent="SIMULATED"; evidence("Wallet state","SIMULATED ONLY · no key, no signature"); toast("模拟钱包已连接；未调用 Privy、未签名。"); }
function mockAuthorize(){ if($("walletState").textContent!=="SIMULATED WALLET"){ toast("请先模拟连接钱包"); return; } $("demoAuthState").textContent="DEMO AUTHORIZED · LOCAL ONLY"; evidence("Demo authorization","LOCAL ONLY · no on-chain approval, no signature"); markJourney(4,"LOCAL DEMO AUTH"); toast("本地模拟授权已记录；未发生链上授权。"); }
function disconnectWallet(){ $("walletState").textContent="NOT CONNECTED"; $("walletState").className="tag"; $("evWallet").textContent="NOT CONNECTED"; $("demoAuthState").textContent="NOT AUTHORIZED"; }

/* ---------- 集成检查 ---------- */
function runChecks(){
  const W=CFG.wallet||{}, P=CFG.protection||{};
  $("chkRpc").textContent=ws?"CONNECTED":"NOT CONNECTED";
  $("chkChain").textContent=ws?"10143 OK":"10143 REQUIRED";
  $("chkPrivy").textContent=W.privyConfigured?"ENABLED":"未配置";
  $("chkGas").textContent=W.gasSponsorshipConfigured?"CONFIGURED":"未配置";
  $("chkContract").textContent=P.contractAddress?"ADDRESS SET":"未部署";
  $("chkFeed").textContent="SIMULATED";
  log("Integration check","status refreshed from config.js","INFO","");
  toast("集成状态已按 config.js 刷新");
}
function crashIntegration(){
  $("s1").textContent="01 · 市场信号：已捕获（模拟）";
  $("s2").textContent="02 · 策略检查："+($("demoAuthState").textContent.indexOf("AUTHORIZED")>=0?"本地演示授权":"无授权 · 阻断");
  $("s3").textContent="03 · 执行：无实时适配器 · 已阻断";
  scenarioShock();
}

/* ---------- 事件绑定 ---------- */
function bind(){
  $("headerConnect").onclick=()=>{ document.querySelector(".advanced-shell").open=true; openDeck("wallet"); };
  $("heroTry").onclick=()=>{ scenarioShock(); markJourney(1,"SCENARIO PLAYED"); $("journeyExecState").textContent="RISK SIGNAL GENERATED · SYNTHETIC"; $("journey").scrollIntoView({behavior:"smooth"}); };
  $("normalBtn").onclick=scenarioNormal; $("shockBtn").onclick=scenarioShock; $("liquidityBtn").onclick=scenarioLiquidity; $("protectBtn").onclick=runProtection;
  $("journey1").onclick=()=>{ scenarioShock(); markJourney(1,"SCENARIO PLAYED"); $("journeyExecState").textContent="RISK SIGNAL GENERATED · SYNTHETIC"; };
  $("journey2").onclick=()=>{ markJourney(2,"CAPABILITIES REVIEWED"); document.querySelectorAll(".left-stack .panel")[1].scrollIntoView({behavior:"smooth",block:"center"}); };
  $("journey3").onclick=()=>{ markJourney(3,"POLICY PANEL OPENED"); $("riskThreshold").scrollIntoView({behavior:"smooth",block:"center"}); };
  $("journey4").onclick=()=>{ openDeck("wallet"); markJourney(4,"WALLET PANEL OPENED"); toast("请先模拟连接钱包，再模拟授权。连接钱包不等于资产授权。"); };
  $("journey5").onclick=()=>{ openDeck("integration"); markJourney(5,"CHECKS AVAILABLE"); runChecks(); };
  $("journey6").onclick=()=>{ markJourney(6,"MONITOR VIEWED"); document.querySelector(".viz-panel").scrollIntoView({behavior:"smooth",block:"center"}); };
  $("journey7").onclick=async()=>{ if(!journeyDone.has(1)){ toast("请先播放市场波动，验证价值后再触发保护。"); return; } await runProtection(); markJourney(7,"PROTECTION SIMULATED"); $("journeyExecState").textContent="BLOCKED · NO LIVE ADAPTER"; $("journeyExecState").style.color="var(--red)"; $("journeyTxState").textContent="NONE · NO TX"; $("journeyImpactState").textContent="NO REALIZED SAVINGS"; };
  $("journey8").onclick=()=>{ openDeck("evidence"); markJourney(8,"EVIDENCE REVIEWED"); $("journeyExecState").textContent="SIMULATION ONLY"; $("journeyTxState").textContent="NONE"; $("journeyImpactState").textContent="COUNTERFACTUAL ONLY"; };
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{ document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("primary",x===b)); document.querySelectorAll(".addon-pane").forEach(x=>x.classList.toggle("active",x.id==="pane-"+b.dataset.tab)); });
  $("mockWallet").onclick=mockConnect; $("mockAuthorize").onclick=mockAuthorize; $("disconnectWallet").onclick=disconnectWallet;
  $("connectWs").onclick=connectLive; $("disconnectWs").onclick=()=>{ stopWs(); toast("已断开 RPC"); };
  $("verifyContracts").onclick=verifyContracts; $("runChecks").onclick=runChecks; $("crashBtn").onclick=crashIntegration;
  $("exportEvidence").onclick=()=>{ const entries=[...$("evidenceLog").querySelectorAll(".evidence-item")].map(x=>({title:x.querySelector("b").textContent,detail:x.querySelector("small").textContent})); const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),environment:{chainId:MONAD_CHAIN_ID,network:NET.chainName,chainGuard:"LOCKED TO MONAD TESTNET 10143"},marketData:"SIMULATED unless connected",wallet:$("walletState").textContent,protectionWrite:"BLOCKED · NO ADAPTER",entries},null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="monad-circuit-breaker-evidence.json"; a.click(); URL.revokeObjectURL(a.href); };
  $("clearEvidence").onclick=()=>{ $("evidenceLog").innerHTML='<div class="mini muted">等待测试事件…</div>'; };
}

/* ---------- 启动 ---------- */
function init(){
  applyConfigToUI();
  buildGraph(); resizeCanvas();
  setRisk(18,TEST_DATA.normal.states);
  ["cex","dex","div","age"].forEach(k=>{ const id="field"+k[0].toUpperCase()+k.slice(1); $(id+"Value").textContent=TEST_DATA.normal.metrics[k]; });
  renderContracts(); bind();
  log("Circuit Breaker initialized","Ghost arrival → ring capture → field sync","READY","good");
  stream(28,"cyan");
  requestAnimationFrame(frame);
  setInterval(()=>{ if(mode==="sim"&&!reduceMotion) stream(2+Math.floor(Math.random()*3),"cyan"); },2200);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
