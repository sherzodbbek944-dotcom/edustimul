const TABS=[["cards","Cards"],["words","Words"],["focus","Focus"],["today","Today"],["quiz","Quiz"],["chat","Chat"]];
let token="";try{token=localStorage.getItem("es_token")||""}catch(e){}
const EMPTY=()=>({cards:[],sets:[],plans:{},quizzes:[],sites:[]});
let S=EMPTY(),coins=0,user="",saveT,ws=null,CH=[];
async function api(p,o={}){const r=await fetch(p,{method:o.method||"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:o.body?JSON.stringify(o.body):undefined});let d={};try{d=await r.json()}catch(e){}
if(!r.ok){if(r.status==401&&token)logout();throw new Error(Array.isArray(d.detail)?"Check your input: username 3-20 letters, numbers or _; password 8+ characters":(d.detail||"Something went wrong"))}return d}
const save=()=>{clearTimeout(saveT);saveT=setTimeout(()=>api("/api/state",{method:"PUT",body:{state:S}}).catch(()=>{}),600)};
function setCoins(n){coins=n;$("#coins").textContent="Coins: "+n}
function toast(t){const d=document.createElement("div");d.className="toast";d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
async function reward(kind,key){try{const d=await api("/api/reward",{method:"POST",body:{kind,key}});setCoins(d.coins);if(d.awarded)toast("+"+d.awarded+" coins")}catch(e){}}
function logout(){token="";try{localStorage.removeItem("es_token")}catch(e){}if(ws)ws.close();ws=null;CH=[];$("#coins").textContent="";$("#out").style.display="none";showAuth()}
function showAuth(msg){$("#nav").innerHTML="";$("#app").innerHTML=`<div class="card"><h2>Welcome to EduStimul</h2><p class="sub">Log in to keep your cards, plans and coins.</p><label>Username</label><input id="au" autocomplete="username" maxlength="20"><label>Password</label><input id="ap" type="password" autocomplete="current-password"><div class="row"><button class="b p" id="lg">Log in</button><button class="b" id="rg">Create account</button></div><div id="ae" class="sub" style="color:var(--bad)">${esc(msg||"")}</div></div>`;
const go=async path=>{try{const d=await api(path,{method:"POST",body:{username:v("au"),password:$("#ap").value}});token=d.token;try{localStorage.setItem("es_token",token)}catch(e){}boot()}catch(e){$("#ae").textContent=e.message}};
$("#lg").onclick=()=>go("/api/login");$("#rg").onclick=()=>go("/api/register");$("#ap").onkeydown=e=>{if(e.key=="Enter")go("/api/login")}}
async function boot(){if(!token)return showAuth();try{const d=await api("/api/me");user=d.username;S=Object.assign(EMPTY(),d.state||{});setCoins(d.coins);$("#out").style.display="";connectChat();render()}catch(e){if(token)showAuth(e.message)}}
function connectChat(){if(ws||!token)return;const p=location.protocol=="https:"?"wss":"ws";ws=new WebSocket(`${p}://${location.host}/ws?token=${encodeURIComponent(token)}`);
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.type=="history")CH=d.items;else CH.push(d);CH=CH.slice(-100);if(tab=="chat")drawChat()};
ws.onclose=()=>{ws=null;if(token)setTimeout(connectChat,3000)}}
function drawChat(){const b=$("#msgs");if(!b)return;b.innerHTML=CH.length?CH.map(m=>`<div class="msg ${m.user==user?"me":""}"><b>${esc(m.user)}</b> ${esc(m.text)}</div>`).join(""):`<div class="empty">No messages yet. Say hello.</div>`;b.scrollTop=b.scrollHeight}
function rChat(){$("#app").innerHTML=`<h2>Student chat</h2><p class="sub">One public room. Be kind, and never share personal details.</p><div class="card chat" id="msgs"></div><div class="row"><input id="cm" maxlength="300" placeholder="Write a message" style="flex:1;min-width:180px"><button class="b p" id="cs">Send</button></div>`;drawChat();
const send=()=>{const t=v("cm");if(!t||!ws||ws.readyState!=1)return;ws.send(JSON.stringify({text:t}));$("#cm").value=""};$("#cs").onclick=send;$("#cm").onkeydown=e=>{if(e.key=="Enter")send()}}
let tab="cards",ui={};
const $=s=>document.querySelector(s),esc=t=>String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const uid=()=>Math.random().toString(36).slice(2,9),today=()=>new Date().toISOString().slice(0,10);
const v=id=>($("#"+id)?.value||"").trim();
const shuf=a=>a.map(x=>[Math.random(),x]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
/* sound + notifications */
let AC,beepT;
function beep(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();[0,.3,.6].forEach(t=>{const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=880;g.gain.value=.25;o.connect(g);g.connect(AC.destination);o.start(AC.currentTime+t);o.stop(AC.currentTime+t+.2)})}catch(e){}}
function ring(title,msg){beep();clearInterval(beepT);beepT=setInterval(beep,2500);
try{if("Notification"in window&&Notification.permission==="granted")new Notification(title,{body:msg})}catch(e){}
const old=document.title;document.title="⏰ "+title;
$("#al").innerHTML=`<div class="alarm"><div><h2>${esc(title)}</h2><p>${esc(msg)}</p><button class="b p" id="stop">Stop alarm</button></div></div>`;
$("#stop").onclick=()=>{clearInterval(beepT);$("#al").innerHTML="";document.title=old}}
function askNotif(){try{if("Notification"in window&&Notification.permission==="default")Notification.requestPermission()}catch(e){}}
/* nav */
function nav(){$("#nav").innerHTML=TABS.map(t=>`<button class="${t[0]==tab?"on":""}" data-t="${t[0]}">${t[1]}</button>`).join("");
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{tab=b.dataset.t;ui={};render()})}
function render(){nav();({cards:rCards,words:rWords,focus:rFocus,today:rToday,quiz:rQuiz,chat:rChat})[tab]()}
$("#theme").onclick=()=>{const r=document.documentElement,d=getComputedStyle(r).getPropertyValue("--bg").trim()=="#17141f";r.dataset.theme=d?"light":"dark"};
/* CARDS */
function rCards(){const due=S.cards.filter(c=>(c.due||"")<=today());
let h=`<h2>Smart cards</h2><p class="sub">Each card answers three questions: what to remember, why it matters, when you will need it.</p>`;
if(ui.rev&&ui.rev.length){const c=S.cards.find(x=>x.id==ui.rev[0]);
h+=`<div class="flash" id="fl">${ui.show?`<span class="q">WHY IT MATTERS</span><p>${esc(c.why)}</p><span class="q">WHEN YOU NEED IT</span><p>${esc(c.when)}</p>`:`<span class="q">WHAT TO REMEMBER</span>${esc(c.what)}<small>Tap to reveal</small>`}</div>`;
if(ui.show)h+=`<div class="row" style="margin-top:12px"><button class="b r" id="again">Again</button><button class="b g" id="good">I knew it</button></div>`;
h+=`<p class="sub">${ui.rev.length} left in this round</p><button class="b" id="end">End round</button>`}
else{h+=`<div class="row" style="margin-bottom:12px"><button class="b p" id="go" ${due.length?"":"disabled"}>Review ${due.length} due</button><span class="sub" style="margin:0">${S.cards.length} cards total</span></div>
<div class="card"><label>What do I need to remember?</label><input id="cw" placeholder="e.g. Quadratic formula"><label>Why does it matter?</label><input id="cy"><label>When will I need it?</label><input id="cn"><button class="b p" id="add">Save card</button></div>`;
h+=S.cards.length?S.cards.map(c=>`<div class="card"><b>${esc(c.what)}</b><div class="sub" style="margin:4px 0">${esc(c.why)} — ${esc(c.when)}</div><button class="b" data-d="${c.id}">Delete</button></div>`).join(""):`<div class="empty">No cards yet. Add a formula or a fact you cannot afford to forget.</div>`}
$("#app").innerHTML=h;
if($("#fl"))$("#fl").onclick=()=>{ui.show=true;rCards()};
if($("#again"))$("#again").onclick=()=>{const c=S.cards.find(x=>x.id==ui.rev[0]);c.iv=1;c.due=today();ui.rev.push(ui.rev.shift());ui.show=false;save();rCards()};
if($("#good"))$("#good").onclick=()=>{const c=S.cards.find(x=>x.id==ui.rev[0]);c.iv=Math.max(1,(c.iv||1)*2);c.due=new Date(Date.now()+c.iv*864e5).toISOString().slice(0,10);ui.rev.shift();ui.show=false;save();rCards()};
if($("#end"))$("#end").onclick=()=>{ui={};rCards()};
if($("#go"))$("#go").onclick=()=>{ui.rev=shuf(due.map(c=>c.id));ui.show=false;rCards()};
if($("#add"))$("#add").onclick=()=>{if(!v("cw"))return;S.cards.push({id:uid(),what:v("cw"),why:v("cy"),when:v("cn"),iv:1,due:today()});save();rCards()};
document.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{S.cards=S.cards.filter(c=>c.id!=b.dataset.d);save();rCards()})}
/* WORDS */
function rWords(){let h=`<h2>Word sets</h2><p class="sub">Any language pair. Choose how you want to study.</p>`;
const st=S.sets.find(s=>s.id==ui.sid);
if(!st){h+=`<div class="card"><label>New set name</label><input id="sn" placeholder="e.g. German travel words"><div class="grid2"><div><label>Word language</label><input id="sa" placeholder="German"></div><div><label>Translation language</label><input id="sb" placeholder="English"></div></div><button class="b p" id="mk">Create set</button></div>`;
h+=S.sets.length?S.sets.map(s=>`<div class="card"><b>${esc(s.name)}</b> <span class="tag">${esc(s.a)} → ${esc(s.b)}</span><div class="sub">${s.w.length} words</div><button class="b p" data-o="${s.id}">Open</button> <button class="b" data-x="${s.id}">Delete</button></div>`).join(""):`<div class="empty">Create your first set above.</div>`}
else if(!ui.mode){h+=`<button class="b" id="back">Back</button><div class="card" style="margin-top:10px"><b>${esc(st.name)}</b> <span class="tag">${esc(st.a)} → ${esc(st.b)}</span>
<div class="grid2"><div><label>${esc(st.a)}</label><input id="wa"></div><div><label>${esc(st.b)}</label><input id="wb"></div></div><button class="b p" id="aw">Add word</button></div>
<div class="row" style="margin-bottom:10px"><button class="b g" data-m="flip" ${st.w.length?"":"disabled"}>Flashcards</button><button class="b g" data-m="type" ${st.w.length?"":"disabled"}>Translate</button><button class="b g" data-m="match" ${st.w.length>=3?"":"disabled"}>Match game</button></div>
<div class="card">${st.w.length?st.w.map((w,i)=>`<div class="item"><span>${esc(w[0])} — ${esc(w[1])}</span><button class="b" data-r="${i}">×</button></div>`).join(""):`<div class="empty">Add words to unlock study modes. Match needs 3+.</div>`}</div>`}
else h+=wordMode(st);
$("#app").innerHTML=h;wordBind(st)}
function wordMode(st){const m=ui.mode;let h=`<button class="b" id="exit">Exit mode</button><div style="height:12px"></div>`;
if(m=="match"){if(!ui.pairs){const p=shuf(st.w).slice(0,6);ui.pairs=p;ui.tiles=shuf(p.flatMap((w,i)=>[{i,t:w[0]},{i,t:w[1]}]));ui.sel=null;ui.found=0}
h+=`<div class="bar"><i style="width:${ui.found/ui.pairs.length*100}%"></i></div>`;
if(ui.found==ui.pairs.length)return h+`<div class="card empty"><h2>All matched</h2><button class="b p" id="again2">Play again</button></div>`;
return h+`<div class="grid2" style="grid-template-columns:1fr 1fr">${ui.tiles.map((t,k)=>`<button class="m ${ui.sel===k?"sel":""} ${t.gone?"gone":""}" data-k="${k}">${esc(t.t)}</button>`).join("")}</div>`}
if(!ui.q){ui.q=shuf(st.w.map((w,i)=>i));ui.n=0;ui.ok=0}
if(!ui.q.length)return h+`<div class="card empty"><h2>Round finished</h2><p>${ui.ok} of ${ui.n} correct</p><button class="b p" id="again2">Again</button></div>`;
const w=st.w[ui.q[0]];
if(m=="flip")h+=`<div class="flash" id="wf">${ui.show?esc(w[1]):esc(w[0])+"<small>Tap to flip</small>"}</div>${ui.show?`<div class="row" style="margin-top:12px"><button class="b r" id="wno">Again</button><button class="b g" id="wyes">Got it</button></div>`:""}`;
else h+=`<div class="card"><span class="tag">${esc(st.a)}</span><h2 style="margin-top:10px">${esc(w[0])}</h2><input id="ans" placeholder="Type in ${esc(st.b)}" autocomplete="off"><button class="b p" id="chk">Check</button><div id="fb" class="sub"></div></div>`;
return h}
function wordBind(st){
if($("#mk"))$("#mk").onclick=()=>{if(!v("sn"))return;S.sets.push({id:uid(),name:v("sn"),a:v("sa")||"Language A",b:v("sb")||"Language B",w:[]});save();rWords()};
document.querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{ui.sid=b.dataset.o;rWords()});
document.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{S.sets=S.sets.filter(s=>s.id!=b.dataset.x);save();rWords()});
if($("#back"))$("#back").onclick=()=>{ui={};rWords()};
if($("#aw"))$("#aw").onclick=()=>{if(!v("wa")||!v("wb"))return;st.w.push([v("wa"),v("wb")]);save();rWords()};
document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{st.w.splice(+b.dataset.r,1);save();rWords()});
document.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{ui.mode=b.dataset.m;rWords()});
if($("#exit"))$("#exit").onclick=()=>{ui={sid:st.id};rWords()};
if($("#again2"))$("#again2").onclick=()=>{ui={sid:st.id,mode:ui.mode};rWords()};
if($("#wf"))$("#wf").onclick=()=>{ui.show=true;rWords()};
if($("#wno"))$("#wno").onclick=()=>{ui.q.push(ui.q.shift());ui.show=false;rWords()};
if($("#wyes"))$("#wyes").onclick=()=>{ui.q.shift();ui.show=false;rWords()};
if($("#chk")){const go=()=>{const w=st.w[ui.q[0]],ok=v("ans").toLowerCase()==w[1].toLowerCase();ui.n++;if(ok)ui.ok++;ui.q.shift();$("#fb").innerHTML=ok?"Correct":`Answer: <b>${esc(w[1])}</b>`;$("#chk").disabled=true;setTimeout(rWords,ok?500:1500)};$("#chk").onclick=go;$("#ans").onkeydown=e=>{if(e.key=="Enter"&&!$("#chk").disabled)go()};$("#ans").focus()}
document.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{const k=+b.dataset.k;if(ui.sel===null)ui.sel=k;else if(ui.sel===k)ui.sel=null;else{const a=ui.tiles[ui.sel],c=ui.tiles[k];if(a.i==c.i){a.gone=c.gone=true;ui.found++}ui.sel=null}rWords()})}
/* FOCUS */
let T=null;
function fmt(s){s=Math.max(0,s);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}
function rFocus(){const run=T&&T.end;
let h=`<h2>Focus timer</h2><p class="sub">Start it, then leave. Study on any site you need. An alarm rings here when time is up, so keep this tab open.</p>
<div class="card"><div class="time" id="tm">${fmt(run?Math.round((T.end-Date.now())/1000):(+ui.min||25)*60)}</div><div class="ring"><i id="rg"></i></div><div class="row" style="margin-top:14px;justify-content:center">`;
h+=run?`<button class="b r" id="stp">Stop</button>`:`<input id="mn" type="number" min="1" max="180" value="${ui.min||25}" style="width:90px" aria-label="Minutes"><button class="b p" id="st">Start</button>`;
h+=`</div></div><div class="card"><label>My study sites</label><div class="row"><input id="su" placeholder="https://..." style="flex:1;min-width:200px"><button class="b" id="sa2">Save site</button></div>
${S.sites.length?S.sites.map((s,i)=>`<div class="item"><span>${esc(s)}</span><button class="b p" data-u="${i}">Open</button><button class="b" data-ds="${i}">×</button></div>`).join(""):`<div class="empty">Save the sites you study on. Each opens in a new tab.</div>`}</div>`;
$("#app").innerHTML=h;
if($("#st"))$("#st").onclick=()=>{askNotif();ui.min=Math.min(180,Math.max(1,+$("#mn").value||25));T={end:Date.now()+ui.min*6e4,total:ui.min*60};beep();clearInterval(beepT);rFocus()};
if($("#stp"))$("#stp").onclick=()=>{T=null;rFocus()};
if($("#sa2"))$("#sa2").onclick=()=>{let u=v("su");if(!u)return;if(!/^https?:\/\//.test(u))u="https://"+u;S.sites.push(u);save();rFocus()};
document.querySelectorAll("[data-u]").forEach(b=>b.onclick=()=>window.open(S.sites[b.dataset.u],"_blank","noopener"));
document.querySelectorAll("[data-ds]").forEach(b=>b.onclick=()=>{S.sites.splice(+b.dataset.ds,1);save();rFocus()})}
/* TODAY */
function rToday(){const k=today(),L=S.plans[k]||(S.plans[k]=[]),d=L.filter(x=>x.done).length;
let h=`<h2>Today</h2><p class="sub">Plan your day this morning. Items with a time remind you when it comes.</p><div class="bar"><i style="width:${L.length?d/L.length*100:0}%"></i></div>
<div class="card"><div class="row"><input id="pt" placeholder="What will you do today?" style="flex:1;min-width:180px"><input id="pm" type="time" style="width:130px" aria-label="Time"><button class="b p" id="pa">Add</button></div></div>
<div class="card">${L.length?[...L].sort((a,b)=>(a.time||"99")>(b.time||"99")?1:-1).map(x=>`<div class="item ${x.done?"done":""}"><input type="checkbox" data-c="${x.id}" ${x.done?"checked":""} aria-label="Done"><span>${x.time?`<b>${x.time}</b> `:""}${esc(x.t)}</span><button class="b" data-p="${x.id}">×</button></div>`).join(""):`<div class="empty">Nothing planned yet. Write down your first task.</div>`}</div>`;
$("#app").innerHTML=h;
$("#pa").onclick=()=>{if(!v("pt"))return;askNotif();L.push({id:uid(),t:v("pt"),time:v("pm"),done:false});save();rToday()};
document.querySelectorAll("[data-c]").forEach(b=>b.onchange=()=>{const x=L.find(y=>y.id==b.dataset.c);x.done=b.checked;save();if(b.checked)reward("task",k+":"+x.id);rToday()});
document.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{S.plans[k]=L.filter(y=>y.id!=b.dataset.p);save();rToday()})}
/* QUIZ */
function rQuiz(){let h=`<h2>Quiz builder</h2><p class="sub">Write questions about what you are learning, then test yourself.</p>`;const z=S.quizzes.find(q=>q.id==ui.qid);
if(!z){h+=`<div class="card"><label>New quiz title</label><div class="row"><input id="qt" placeholder="e.g. Biology chapter 3" style="flex:1;min-width:180px"><button class="b p" id="qm">Create</button></div></div>`;
h+=S.quizzes.length?S.quizzes.map(q=>`<div class="card"><b>${esc(q.t)}</b><div class="sub">${q.q.length} questions</div><button class="b p" data-q="${q.id}">Open</button> <button class="b" data-xq="${q.id}">Delete</button></div>`).join(""):`<div class="empty">No quizzes yet.</div>`}
else if(ui.play){const i=ui.i;if(i>=z.q.length){h+=`<div class="card empty"><h2>${ui.score} / ${z.q.length}</h2><div class="bar"><i style="width:${ui.score/z.q.length*100}%"></i></div><button class="b p" id="rp">Try again</button> <button class="b" id="bk">Back</button></div>`}
else{const q=z.q[i];h+=`<div class="bar"><i style="width:${i/z.q.length*100}%"></i></div><div class="card"><span class="tag">Question ${i+1} of ${z.q.length}</span><h2 style="margin-top:10px">${esc(q.q)}</h2>${ui.ord.map(j=>`<button class="opt ${ui.pick!=null?(j==q.c?"ok":j==ui.pick?"no":""):""}" data-a="${j}" ${ui.pick!=null?"disabled":""}>${esc(q.o[j])}</button>`).join("")}${ui.pick!=null?`<button class="b p" id="nx" style="margin-top:8px">${i+1<z.q.length?"Next":"Finish"}</button>`:""}</div>`}}
else h+=`<button class="b" id="bk">Back</button><div class="card" style="margin-top:10px"><b>${esc(z.t)}</b><label style="display:block;margin-top:8px">Question</label><input id="qq"><label>Correct answer</label><input id="o0"><label>Wrong answers</label><input id="o1" placeholder="Wrong 1"><input id="o2" placeholder="Wrong 2"><input id="o3" placeholder="Wrong 3"><button class="b p" id="qa">Add question</button></div>
<button class="b g" id="pl" ${z.q.length?"":"disabled"}>Start quiz</button><div class="card" style="margin-top:12px">${z.q.length?z.q.map((q,n)=>`<div class="item"><span>${esc(q.q)}</span><button class="b" data-dq="${n}">×</button></div>`).join(""):`<div class="empty">Add at least one question.</div>`}</div>`;
$("#app").innerHTML=h;
if($("#qm"))$("#qm").onclick=()=>{if(!v("qt"))return;S.quizzes.push({id:uid(),t:v("qt"),q:[]});save();rQuiz()};
document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{ui.qid=b.dataset.q;rQuiz()});
document.querySelectorAll("[data-xq]").forEach(b=>b.onclick=()=>{S.quizzes=S.quizzes.filter(q=>q.id!=b.dataset.xq);save();rQuiz()});
if($("#bk"))$("#bk").onclick=()=>{ui={};rQuiz()};
if($("#qa"))$("#qa").onclick=()=>{if(!v("qq")||!v("o0"))return;z.q.push({q:v("qq"),o:[v("o0"),v("o1"),v("o2"),v("o3")].filter(Boolean),c:0});save();rQuiz()};
document.querySelectorAll("[data-dq]").forEach(b=>b.onclick=()=>{z.q.splice(+b.dataset.dq,1);save();rQuiz()});
const start=()=>{ui={qid:z.id,play:true,i:0,score:0,pick:null};ui.ord=shuf(z.q[0].o.map((_,j)=>j));rQuiz()};
if($("#pl"))$("#pl").onclick=start;if($("#rp"))$("#rp").onclick=start;
document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{ui.pick=+b.dataset.a;if(ui.pick==z.q[ui.i].c)ui.score++;rQuiz()});
if($("#nx"))$("#nx").onclick=()=>{ui.i++;ui.pick=null;if(ui.i<z.q.length)ui.ord=shuf(z.q[ui.i].o.map((_,j)=>j));rQuiz()}}
/* background tick: timer + reminders */
setInterval(()=>{
if(T&&T.end){const left=Math.round((T.end-Date.now())/1000);
if(tab=="focus"&&$("#tm")){$("#tm").textContent=fmt(left);$("#rg").style.width=(100-left/T.total*100)+"%"}
if(left<=0){T=null;ring("Time is up","Your focus session has ended. Take a short break.");reward("focus","t"+Date.now());if(tab=="focus")rFocus()}}
const L=S.plans[today()]||[],n=new Date(),hm=String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0");
L.forEach(x=>{if(x.time&&!x.done&&!x.fired&&x.time<=hm){x.fired=1;save();ring("Reminder",x.t)}})},1000);
boot();
