/* Gemeinsame Helfer für Host- und Spieler-Seite */

function esc(s){ return (s??"").toString().replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function photoHtml(p){
  p = (p||"").trim();
  if(/^https?:\/\//.test(p)) return `<img src="${esc(p)}" alt="">`;
  return esc(p || "👤");
}

async function api(path, body){
  const opts = body ? {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)} : {};
  const r = await fetch("/api/"+path, opts);
  let data = {};
  try { data = await r.json(); } catch(e) {}
  if(!r.ok) { const e = new Error(data.error || ("Fehler "+r.status)); e.status = r.status; throw e; }
  return data;
}

const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} },
};

/** Fragt regelmäßig den Zustand ab; pausiert im Hintergrund-Tab etwas länger. */
function startPolling(fn, ms=1500){
  let timer, stopped=false;
  async function tick(){
    try { await fn(); } catch(e) { console.warn(e); }
    if(!stopped) timer = setTimeout(tick, document.hidden ? ms*3 : ms);
  }
  tick();
  return { stop(){ stopped=true; clearTimeout(timer); }, now(){ clearTimeout(timer); tick(); } };
}

function leaderboardHtml(lb, limit){
  if(!lb.length) return '<p class="muted">Noch niemand beigetreten.</p>';
  const list = limit ? lb.slice(0, limit) : lb;
  let html = list.map((p,i)=>`<div class="score ${p.me?"me":""}"><div>${["🥇","🥈","🥉"][i]||`<span class="muted">${i+1}.</span>`} <b>${esc(p.name)}</b></div><span class="pts">${p.score}</span></div>`).join("");
  const me = lb.findIndex(p=>p.me);
  if(limit && me >= limit) html += `<div class="score me"><div><span class="muted">${me+1}.</span> <b>${esc(lb[me].name)}</b></div><span class="pts">${lb[me].score}</span></div>`;
  return html;
}

function questionHtml(q, progressive){
  if(!progressive){
    const h = q.hints[0];
    return `<div class="cat">Wer aus dem Team ist das?</div>
      <div class="answer"><div class="q-label">${esc(h.label)}</div>„${esc(h.value)}“</div>`;
  }
  return `<div class="cat">Wer aus dem Team ist das?</div>` +
    q.hints.map((h,i)=>`<div class="hint"><span class="hl">Hinweis ${i+1}</span><span class="q-label">${esc(h.label)}</span>${esc(h.value)}</div>`).join("");
}

/* CSV / Excel-Einfügen: Trennzeichen , ; oder Tab automatisch erkennen */
function parseDelimited(text){
  text = text.replace(/^﻿/,"").replace(/\r\n?/g,"\n").trim();
  const first = text.split("\n")[0];
  const counts = {",":(first.match(/,/g)||[]).length, ";":(first.match(/;/g)||[]).length, "\t":(first.match(/\t/g)||[]).length};
  const d = Object.keys(counts).reduce((a,b)=>counts[a]>=counts[b]?a:b);
  const rows=[]; let row=[], cell="", q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=c; }
    else if(c==='"') q=true;
    else if(c===d){ row.push(cell); cell=""; }
    else if(c==="\n"){ row.push(cell); rows.push(row); row=[]; cell=""; }
    else cell+=c;
  }
  row.push(cell); rows.push(row);
  return rows.filter(r=>r.some(c=>c.trim()!==""));
}

/* ---------- Timer (Uhrzeit des Servers, damit alle Geräte gleich zählen) ---------- */
let clockOffset = 0;
function syncClock(S){ if(S && S.serverNow) clockOffset = S.serverNow - Date.now(); }
function serverNow(){ return Date.now() + clockOffset; }
/** Verbleibende Millisekunden der aktuellen Frage, null = ohne Timer. */
function timeLeft(S){
  const q = S && S.question;
  if(!q || !q.deadline || S.phase !== "question") return null;
  return Math.max(0, q.deadline - serverNow());
}
function timerHtml(){ return `<div class="timer" id="timer"><div class="timer-bar" id="timerBar"></div><span class="timer-num" id="timerNum"></span></div>`; }

/** Aktualisiert Balken + Zahl und spielt in den letzten 5 Sekunden ein Ticken. Gibt die Restzeit zurück. */
let lastTickSec = null;
function updateTimer(S){
  const left = timeLeft(S), el = document.getElementById("timer");
  if(!el) return left;
  if(left == null){ el.style.display = "none"; return null; }
  el.style.display = "";
  const total = (S.timer || 15) * 1000;
  document.getElementById("timerBar").style.width = Math.min(100, left / total * 100) + "%";
  const sec = Math.ceil(left / 1000);
  document.getElementById("timerNum").textContent = left > 0 ? sec : "⏰ Zeit!";
  el.classList.toggle("urgent", left <= 5000);
  if(sec !== lastTickSec && sec > 0 && sec <= 5 && typeof Sound !== "undefined") Sound.sfx(sec <= 3 ? "tickUrgent" : "tick");
  lastTickSec = sec;
  return left;
}

function pointsHint(q, progressive){
  return progressive
    ? `Hinweis ${q.hintIdx} von ${q.maxHints} · schnellste richtige Antwort: <b>${q.pointsNow} Punkte</b>`
    : `Schnellste richtige Antwort: <b>${q.pointsNow} Punkte</b> · danach 400 / 300 / 250 / 200`;
}

function winnersHtml(winners){
  return winners.length
    ? winners.map((w,i)=>`<span class="pill" style="color:var(--ok)">${["⚡","🥈","🥉"][i]||"✓"} ${esc(w.name)} +${w.pts}</span>`).join(" ")
    : "Niemand lag richtig 🙈";
}
