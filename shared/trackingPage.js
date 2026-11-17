// صفحة متابعة العميل لسيارته في الورشة. الملف ده بيتشارك بين:
//  - Cloudflare Worker (license-server): بيخدم الرابط العام /t/<token> ويحدّث الصفحة كل 15 ثانية.
//  - البرنامج: بيعرض نفس الصفحة جوه نافذة المعاينة (من غير تحديث تلقائي).
// الصفحة بتتبني من بيانات لقطة JSON واحدة (شوف buildSnapshot في electron/services/trackingSnapshot.service.js).
// ممنوع backtick و ${ جوه CSS و JS اللي تحت: هما نصوص خام بتتحقن في الصفحة زي ما هي.

const CSS = String.raw`
:root{--bg:#FFF6EA;--ink:#2A1D14;--mut:#8C7A69;--line:#F0E2D3;--or:#F97316;--or2:#FB923C;--am:#F5C86A;--gr:#2F9E6B;--grbg:#E6F5EC;--card:rgba(255,255,255,.86);--ease:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{color-scheme:light}
body{margin:0;min-height:100vh;color:var(--ink);font:15px/1.6 "Cairo","Segoe UI",Tahoma,sans-serif;background:radial-gradient(120% 60% at 50% -10%,#FFE2C2 0%,var(--bg) 55%,#FFFBF5 100%) fixed}
.wrap{max-width:460px;margin:0 auto;padding:14px 16px 40px;display:grid;gap:14px}
.card{background:var(--card);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.9);border-radius:22px;padding:18px;box-shadow:0 1px 0 #fff inset,0 10px 30px -14px rgba(120,70,20,.22)}
.rise{opacity:0;transform:translateY(14px) scale(.985);animation:rise .7s var(--ease) forwards;animation-delay:calc(var(--i,0)*70ms)}
@keyframes rise{to{opacity:1;transform:none}}
h2{margin:0 0 12px;font-size:17px;font-weight:800}
.mut{color:var(--mut);font-size:13px}
.head .row{display:flex;justify-content:space-between;align-items:center;gap:12px}
.head hr{border:0;border-top:1px solid var(--line);margin:14px 0}
.shop{display:flex;align-items:center;gap:12px}
.logo{inline-size:46px;block-size:46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,var(--or2),var(--or));box-shadow:0 8px 18px -8px rgba(249,115,22,.7)}
.logo svg{inline-size:24px;block-size:24px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.shop b{display:block;font-size:17px;line-height:1.3}
.ord{text-align:start}.ord b{display:block;font-size:19px;letter-spacing:.3px}
.car b{display:block;font-size:17px;line-height:1.3}
.plate{direction:ltr;inline-size:128px;border-radius:9px;overflow:hidden;border:2px solid var(--pc,#1F4E9E);background:#fff;box-shadow:0 4px 10px -4px rgba(0,0,0,.25);flex:none}
.plate .n{display:flex;justify-content:center;align-items:center;gap:8px;padding:5px 6px;font-weight:800;font-size:15px;direction:rtl}
.plate .n i{inline-size:1px;block-size:16px;background:#c9c9c9}
.plate .b{background:var(--pc,#1F4E9E);color:#fff;text-align:center;font-size:10px;font-weight:700;padding:1px 0}
.hero{text-align:center;position:relative;overflow:hidden}
.badge{inline-size:84px;block-size:84px;margin:6px auto 12px;border-radius:50%;display:grid;place-items:center;position:relative;transition:background .6s,box-shadow .6s}
.badge svg{inline-size:38px;block-size:38px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.badge.work{background:linear-gradient(145deg,var(--or2),var(--or));box-shadow:0 12px 26px -10px rgba(249,115,22,.75)}
.badge.work svg{animation:wrench 2.4s ease-in-out infinite;transform-origin:50% 50%}
.badge.work::after,.badge.ready::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(249,115,22,.35);animation:ping 2.2s ease-out infinite}
.badge.ready svg{stroke:#fff}.badge.ready{background:linear-gradient(145deg,#FDBA74,var(--or));box-shadow:0 12px 26px -10px rgba(249,115,22,.75)}
.badge.done{background:var(--grbg);box-shadow:0 10px 24px -12px rgba(47,158,107,.6)}
.badge.done svg{stroke:var(--gr)}
.badge.stop{background:#EFE6DC}.badge.stop svg{stroke:var(--mut)}
.badge .tick{stroke-dasharray:30;stroke-dashoffset:30;animation:draw .8s .25s var(--ease) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes ping{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.35);opacity:0}}
@keyframes wrench{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
.hero h1{margin:0 0 4px;font-size:25px;line-height:1.35;font-weight:800}
.hero p{margin:0 auto 12px;max-inline-size:30ch;color:var(--mut)}
.chip{display:inline-block;padding:3px 12px;border-radius:99px;font-size:13px;font-weight:700;background:#FDEFC8;color:#9A6A0B}
.chip.g{background:var(--grbg);color:var(--gr)}
.steps{display:flex;align-items:flex-start;margin-top:20px;direction:rtl}
.st{flex:none;inline-size:46px;text-align:center}
.dot{inline-size:30px;block-size:30px;margin:0 auto 6px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:#fff;border:1.5px dashed #D9CBBB;color:var(--mut);transition:all .5s var(--ease)}
.st.done .dot{background:var(--grbg);border:1.5px solid var(--gr);color:var(--gr);transform:scale(1)}
.st.now .dot{background:var(--or);border-color:var(--or);color:#fff;transform:scale(1.18);box-shadow:0 0 0 6px rgba(249,115,22,.16)}
.st.now.fin .dot{background:var(--gr);border-color:var(--gr);box-shadow:0 0 0 6px rgba(47,158,107,.16)}
.st span{display:block;font-size:11.5px;color:var(--mut);transition:color .4s}
.st.now span{color:var(--ink);font-weight:700}
.ln{flex:1;block-size:2px;margin-top:14px;background:#EADCCB;border-radius:2px;overflow:hidden}
.ln i{display:block;block-size:100%;background:var(--gr);transform:scaleX(0);transform-origin:right;transition:transform .9s var(--ease)}
.ln.on i{transform:scaleX(1)}
.due{background:linear-gradient(160deg,#FFF1D6,#FFE6BF);border-radius:18px;padding:16px 18px;margin-bottom:14px}
.due small{display:block;color:#8A6A2E;font-size:13px}
.due b{font-size:40px;line-height:1.2;font-weight:800;font-variant-numeric:tabular-nums}
.due b em{font-style:normal;font-size:16px;margin-inline-end:6px;font-weight:700}
.due p{margin:2px 0 0;color:#8A6A2E;font-size:12.5px}
.info{display:flex;gap:12px;align-items:flex-start;padding:8px 0}
.info .ic{flex:none;inline-size:34px;block-size:34px;border-radius:50%;display:grid;place-items:center;background:#FFF0DD}
.info .ic svg{inline-size:17px;block-size:17px;stroke:var(--or);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.info b{display:block;font-size:14px}.info span{color:var(--mut);font-size:13.5px}
.open{display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:1px 10px;border-radius:99px;background:var(--grbg);color:var(--gr);font-size:12px;font-weight:700}
.open::before{content:"";inline-size:7px;block-size:7px;border-radius:50%;background:var(--gr);animation:blink 1.6s infinite}
@keyframes blink{50%{opacity:.25}}
.btn{display:flex;justify-content:center;align-items:center;gap:8px;inline-size:100%;margin-top:10px;padding:14px;border-radius:16px;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit;font-weight:800;font-size:15px;text-decoration:none;cursor:pointer;transition:transform .25s var(--ease),box-shadow .25s}
.btn:active{transform:scale(.97)}
.btn.p{border:0;color:#fff;background:linear-gradient(135deg,var(--or2),var(--or));box-shadow:0 12px 22px -12px rgba(249,115,22,.9)}
.btn svg{inline-size:18px;block-size:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.inv{display:flex;justify-content:space-between;align-items:center;gap:10px}
.inv .ic{inline-size:40px;block-size:40px;border-radius:12px;display:grid;place-items:center;background:#FFF0DD}
.inv .ic svg{inline-size:20px;block-size:20px;stroke:var(--or);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.paidrow{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:12px 14px;border-radius:14px;background:#FFF8F0;border:1px solid var(--line)}
.paidrow b{font-size:22px;font-variant-numeric:tabular-nums}
.note{display:flex;gap:8px;align-items:center;margin:12px 0 0;color:var(--mut);font-size:13px}
.car-sl{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -18px;padding:2px 18px 4px;scrollbar-width:none}
.car-sl::-webkit-scrollbar{display:none}
.sl{flex:none;inline-size:84%;scroll-snap-align:center}
.sl .im{position:relative;aspect-ratio:4/3;border-radius:18px;overflow:hidden;background:linear-gradient(145deg,#C9A27A,#9D7650)}
.sl img{inline-size:100%;block-size:100%;object-fit:cover;display:block;transition:transform 1.2s var(--ease)}
.sl:hover img{transform:scale(1.04)}
.sl .tag{position:absolute;inset-block-start:10px;inset-inline-end:10px;padding:2px 12px;border-radius:99px;font-size:12px;font-weight:800;background:#FFE1DA;color:#C2412B}
.sl .tag.a{background:#D8F1E3;color:#1F7A4D}
.sl p{margin:8px 2px 0;color:var(--mut);font-size:13px}
.dots{display:flex;justify-content:center;gap:6px;margin-top:10px}
.dots i{inline-size:7px;block-size:7px;border-radius:99px;background:#E8D9C7;transition:all .4s var(--ease)}
.dots i.on{inline-size:22px;background:var(--or)}
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:18px 1fr auto;gap:12px;padding-bottom:18px;position:relative}
.tl li:last-child{padding-bottom:0}
.tl li::before{content:"";position:absolute;inset-inline-start:8px;inset-block:20px -2px;inline-size:1.5px;background:var(--line)}
.tl li:last-child::before{display:none}
.tl .pt{inline-size:12px;block-size:12px;margin:6px 3px 0;border-radius:50%;background:var(--am);position:relative;z-index:1}
.tl li:first-child .pt{background:var(--or);box-shadow:0 0 0 5px rgba(249,115,22,.18);animation:glow 2.4s ease-in-out infinite}
.tl li.dn:first-child .pt{background:var(--gr);box-shadow:0 0 0 5px rgba(47,158,107,.18);animation:none}
@keyframes glow{50%{box-shadow:0 0 0 8px rgba(249,115,22,.06)}}
.tl b{display:block;font-size:14.5px;line-height:1.4}.tl small{display:block;color:var(--mut);font-size:12.5px}
.tl time{color:var(--ink);font-weight:700;font-size:13px;white-space:nowrap}.tl time small{font-weight:400;text-align:end}
.tl li.new{animation:slide .8s var(--ease)}
@keyframes slide{from{opacity:0;transform:translateX(-18px)}}
.work-i{display:flex;justify-content:space-between;align-items:center;padding:9px 0;gap:10px}
.work-i .ck{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14.5px}
.work-i .ck u{inline-size:26px;block-size:26px;border-radius:50%;display:grid;place-items:center;background:var(--grbg);text-decoration:none;transition:background .4s}
.work-i .ck u svg{inline-size:14px;block-size:14px;stroke:var(--gr);fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.work-i .ck u.w{background:#FDEFC8}.work-i .ck u.w svg{stroke:#9A6A0B}
.st-c{padding:1px 10px;border-radius:99px;font-size:12px;font-weight:700;background:var(--grbg);color:var(--gr)}
.st-c.w{background:#FDEFC8;color:#9A6A0B}
.tot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:12px;border-top:1px solid var(--line)}
.tot b{font-size:26px;font-variant-numeric:tabular-nums}
.full{display:grid;grid-template-rows:0fr;transition:grid-template-rows .5s var(--ease)}
.full.open{grid-template-rows:1fr}
.full>div{overflow:hidden}
.full table{inline-size:100%;border-collapse:collapse;margin-top:10px;font-size:13.5px}
.full td{padding:6px 0;border-bottom:1px dashed var(--line)}
.full td:last-child{text-align:end;font-variant-numeric:tabular-nums}
.btn .chev{transition:transform .4s var(--ease)}.btn.o .chev{transform:rotate(-90deg)}
.note svg{inline-size:18px;block-size:18px;stroke:var(--or);fill:none;stroke-width:2;flex:none}
.foot{text-align:center;color:var(--mut);font-size:12.5px;margin:4px 8px 0}
.foot a{color:inherit}
.cf{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cf i{position:absolute;inset-block-start:-10px;inline-size:7px;block-size:12px;border-radius:2px;animation:fall 2.6s ease-in forwards}
@keyframes fall{to{transform:translateY(300px) rotate(540deg);opacity:0}}
.sw{animation:swap .55s var(--ease)}
@keyframes swap{from{opacity:.25;transform:translateY(8px)}}
::view-transition-old(root),::view-transition-new(root){animation-duration:.5s}
@media (prefers-reduced-motion:reduce){*,::before,::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
@media print{body{background:#fff}.card{box-shadow:none;backdrop-filter:none}.btn,.dots,#photos,#timeline{display:none}}
`;

// واجهة الصفحة. كل الحقول ممكن تكون ناقصة؛ الصفحة بتتجاهل اللي مش موجود.
const JS = String.raw`
(function(){
var D=JSON.parse(document.getElementById("d").textContent);
var $=function(s){return document.querySelector(s)};
var AR="٠١٢٣٤٥٦٧٨٩";
function e(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function num(n){return Number(n||0).toLocaleString("ar-EG-u-nu-latn",{maximumFractionDigits:2})}
function tm(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleTimeString("ar-EG-u-nu-latn",{hour:"numeric",minute:"2-digit"})}
function dt(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleDateString("ar-EG-u-nu-latn",{day:"numeric",month:"long",year:"numeric"})}
function sameDay(a,b){a=new Date(a);b=new Date(b);return a.toDateString()===b.toDateString()}
var ICON={
 wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.2-.4-.4-2.2z"/>',
 check:'<path class="tick" d="M5 12.5l4.5 4.5L19 7.5"/>',
 pin:'<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 nav:'<path d="M3 11l18-8-8 18-2-8z"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
 doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
 dl:'<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
 cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
 chev:'<path d="M15 6l-6 6 6 6"/>',
 stop:'<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>'
};
function ic(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[n]+'</svg>'}
var STEPS=["استلام","فحص","موافقة","تنفيذ","جاهزة","تسليم"];
var STEP={received:1,diagnosing:2,awaiting_approval:3,in_progress:4,ready:5,delivered:6,cancelled:0};
var HERO={
 received:["تم استلام سيارتك","سجّلنا شكواك وقراءة العدّاد، وسنبدأ الفحص قريبًا."],
 diagnosing:["جاري فحص سيارتك","الفني يفحص السيارة الآن ليحدد المطلوب بدقة."],
 awaiting_approval:["بانتظار موافقتك","أرسلنا لك تفاصيل الأعمال والتكلفة. تواصل معنا لتأكيد الموافقة."],
 in_progress:["سيارتك قيد الإصلاح","فريق الورشة يعمل على سيارتك الآن."],
 ready:["سيارتك جاهزة للاستلام","تفضّل بالمرور على الورشة، نحن بانتظارك."],
 delivered:["تم تسليم سيارتك","شكرًا لثقتك بنا. نتمنى لك قيادة آمنة."],
 cancelled:["تم إلغاء أمر الشغل","للاستفسار تواصل معنا."]
};
function plate(p){
 if(!p||!p.plate)return"";
 var s=String(p.plate),l=s.replace(/[0-9٠-٩\s-]/g,"").split("").join(" "),dg=(s.match(/[0-9]+/g)||[]).join("").replace(/\d/g,function(d){return AR[d]});
 var c=p.kind==="authority"?"#1B7A45":p.kind==="military"?"#1C1C1E":"#1F4E9E";
 return '<div class="plate" style="--pc:'+c+'"><div class="n"><b>'+e(l)+'</b><i></i><b>'+e(dg)+'</b></div><div class="b">'+e(p.city||"مصر")+'</div></div>';
}
function lines(){return D.lines||[]}
function doneCount(){return lines().filter(function(l){return l.done}).length}
function countUp(el,to){
 if(!el)return;var from=Number(el.getAttribute("data-v")||0);el.setAttribute("data-v",to);
 if(from===to||matchMedia("(prefers-reduced-motion:reduce)").matches){el.textContent=num(to);return}
 var t0=performance.now();(function f(t){var k=Math.min(1,(t-t0)/900),v=from+(to-from)*(1-Math.pow(1-k,3));el.textContent=num(v);if(k<1)requestAnimationFrame(f)})(t0);
}
function confetti(box){
 if(matchMedia("(prefers-reduced-motion:reduce)").matches)return;
 var h='',cs=["#F97316","#F5C86A","#2F9E6B","#FB923C","#FFD9A8"];
 for(var i=0;i<26;i++)h+='<i style="inset-inline-start:'+(Math.random()*100)+'%;background:'+cs[i%5]+';animation-delay:'+(Math.random()*.6)+'s;transform:rotate('+(Math.random()*90)+'deg)"></i>';
 var d=document.createElement("div");d.className="cf";d.innerHTML=h;box.appendChild(d);setTimeout(function(){d.remove()},3600);
}
var built=false,lastStatus=null,lastTl=0,shownConfetti=false;
function shell(){
 $("#app").innerHTML=
 '<div class="card head rise" style="--i:0" id="head"></div>'+
 '<section class="card hero rise" style="--i:1" id="hero"></section>'+
 '<div id="extra"></div><section class="card rise" style="--i:3" id="photos" hidden></section>'+
 '<section class="card rise" style="--i:4" id="timeline" hidden></section>'+
 '<section class="card rise" style="--i:5" id="summary" hidden></section>'+
 '<p class="foot rise" style="--i:6" id="foot"></p>';
 built=true;
}
function head(){
 var o=D.order||{},v=D.vehicle||{},s=D.shop||{};
 var car=[v.make,v.model].filter(Boolean).join(" "),sub=[v.year,v.color].filter(Boolean).join(" · ");
 $("#head").innerHTML='<div class="row"><div class="shop"><div class="logo">'+ic("wrench")+'</div><div><b>'+e(s.name||"الورشة")+'</b><span class="mut">'+e(s.tagline||"")+'</span></div></div>'+
  '<div class="ord"><span class="mut">رقم الأمر</span><b>#'+e(o.number)+'</b></div></div><hr>'+
  '<div class="row car"><div><b>'+e(car||"سيارتك")+'</b><span class="mut">'+e(sub)+'</span></div>'+plate(v)+'</div>';
}
function hero(){
 var o=D.order||{},st=o.status||"received",step=STEP[st],h=HERO[st]||HERO.received,box=$("#hero");
 var kind=st==="delivered"?"done":st==="ready"?"ready":st==="cancelled"?"stop":"work";
 var chip="";
 if(st==="in_progress"&&lines().length)chip='<span class="chip">التقدم: '+num(doneCount())+" من "+num(lines().length)+" مكتمل</span>";
 else if(st==="ready"&&o.ready_at)chip='<span class="chip">جاهزة منذ '+e(tm(o.ready_at))+"</span>";
 else if(st==="delivered"&&o.closed_at)chip='<span class="chip g">سُلّمت '+(sameDay(o.closed_at,Date.now())?"اليوم":e(dt(o.closed_at)))+" "+e(tm(o.closed_at))+"</span>";
 else if(st==="received"&&o.opened_at)chip='<span class="chip">استلمناها '+e(tm(o.opened_at))+"</span>";
 var first=!box.firstChild;
 if(first){
  var sh="";for(var i=1;i<=6;i++)sh+=(i>1?'<div class="ln"><i></i></div>':"")+'<div class="st"><div class="dot"></div><span>'+STEPS[i-1]+"</span></div>";
  box.innerHTML='<div id="hb"></div><div class="steps">'+sh+"</div>";
 }
 var text=o.mechanic&&st==="in_progress"?"الفني "+o.mechanic+" يعمل عليها الآن.":h[1];
 var key=st+"|"+chip+"|"+text,prev=box.getAttribute("data-s");
 if(box.getAttribute("data-k")!==key){
  box.setAttribute("data-k",key);box.setAttribute("data-s",st);
  $("#hb").innerHTML='<div class="badge '+kind+'">'+ic(st==="delivered"||st==="ready"?"check":st==="cancelled"?"stop":"wrench")+"</div><h1>"+e(h[0])+"</h1><p>"+e(text)+"</p>"+chip;
  if(prev&&prev!==st){$("#hb").classList.remove("sw");void $("#hb").offsetWidth;$("#hb").classList.add("sw")}
  if(st==="ready"&&!shownConfetti){shownConfetti=true;confetti(box)}
 }
 var steps=box.querySelector(".steps"),sts=box.querySelectorAll(".st"),lns=box.querySelectorAll(".ln");
 steps.hidden=st==="cancelled";
 var apply=function(){
  sts.forEach(function(n,i){var k=i+1,fin=st==="delivered",dn=fin||k<step;n.className="st"+(dn?" done":"")+(k===step?" now":"")+(fin&&k===6?" fin":"");n.firstChild.textContent=dn?"✓":num(k)});
  lns.forEach(function(n,i){n.classList.toggle("on",i+2<=step||st==="delivered")});
 };
 if(first)setTimeout(apply,450);else apply();
}
function extra(){
 var o=D.order||{},s=D.shop||{},box=$("#extra"),h="";
 if(o.status==="ready"){
  h='<section class="card rise" style="--i:2"><div class="due"><small>المبلغ المستحق عند الاستلام</small><b><em>ج.م</em><span id="due" data-v="0">0</span></b>'+(D.due_note?"<p>"+e(D.due_note)+"</p>":"")+"</div>";
  if(s.address)h+='<div class="info"><div class="ic">'+ic("pin")+"</div><div><b>العنوان</b><span>"+e(s.address)+"</span></div></div>";
  if(s.hours)h+='<div class="info"><div class="ic">'+ic("clock")+"</div><div><b>مواعيد العمل</b><span>"+e(s.hours)+"</span></div></div>";
  if(s.address)h+='<a class="btn p" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.address)+'">'+ic("nav")+"الاتجاهات إلى الورشة</a>";
  if(s.phone)h+='<a class="btn" href="tel:'+e(s.phone)+'">'+ic("phone")+"اتصل بنا  <bdi>"+e(s.phone)+"</bdi></a>";
  h+="</section>";
 }else if(o.status==="delivered"&&D.invoice){
  var iv=D.invoice;
  h='<section class="card rise" style="--i:2"><div class="inv"><div style="display:flex;gap:12px;align-items:center"><div class="ic">'+ic("doc")+'</div><div><b>الفاتورة #'+e(iv.number)+'</b><div class="mut">'+e(dt(iv.at))+" · "+e(tm(iv.at))+'</div></div></div><span class="chip g">مدفوعة</span></div>'+
   '<div class="paidrow"><span class="mut">المبلغ المدفوع نقدًا</span><b><span id="due" data-v="0">0</span> <small>ج.م</small></b></div>'+
   '<button class="btn p" type="button" onclick="window.print()">'+ic("dl")+"تنزيل الفاتورة (PDF)</button>"+
   (D.next_service?'<p class="note">'+ic("cal")+"<span>"+e(D.next_service)+"</span></p>":"")+"</section>";
 }
 if(box.getAttribute("data-k")!==h){box.setAttribute("data-k",h);box.innerHTML=h}
 countUp($("#due"),o.status==="delivered"?(D.invoice&&D.invoice.total):D.due);
}
function photos(){
 var box=$("#photos"),ph=D.photos||[];
 if(!ph.length){box.hidden=true;return}
 var key=ph.map(function(p){return p.id}).join(",");if(box.getAttribute("data-k")===key)return;box.setAttribute("data-k",key);box.hidden=false;
 var sl=ph.map(function(p){return '<div class="sl"><div class="im"><img loading="lazy" alt="" src="'+e(p.src)+'"><span class="tag'+(p.phase==="after"?" a":"")+'">'+(p.phase==="after"?"بعد":"قبل")+"</span></div>"+(p.caption?"<p>"+e(p.caption)+"</p>":"")+"</div>"}).join("");
 box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:baseline"><h2>صور من الورشة</h2><span class="mut">'+(ph.length>1?"مرّر لرؤية المزيد":"")+'</span></div><div class="car-sl">'+sl+'</div><div class="dots">'+ph.map(function(_,i){return "<i"+(i?"":' class="on"')+"></i>"}).join("")+"</div>";
 var sc=box.querySelector(".car-sl"),dots=box.querySelectorAll(".dots i");
 sc.addEventListener("scroll",function(){var w=sc.children[0].getBoundingClientRect().width+10,i=Math.min(dots.length-1,Math.round(Math.abs(sc.scrollLeft)/w));dots.forEach(function(d,k){d.classList.toggle("on",k===i)})},{passive:true});
}
function timeline(){
 var box=$("#timeline"),t=(D.timeline||[]).slice().sort(function(a,b){return new Date(b.at)-new Date(a.at)});
 if(!t.length){box.hidden=true;return}
 var key=t.length+"|"+t[0].at;if(box.getAttribute("data-k")===key)return;
 var fresh=lastTl&&t.length>lastTl;lastTl=t.length;box.setAttribute("data-k",key);box.hidden=false;
 var done=(D.order||{}).status==="delivered";
 box.innerHTML="<h2>آخر التحديثات</h2><ol class='tl'>"+t.map(function(x,i){
  var when=tm(x.at)+(sameDay(x.at,Date.now())?"":"<small>"+e(new Date(x.at).toLocaleDateString("ar-EG-u-nu-latn",{day:"numeric",month:"short"}))+"</small>");
  return "<li class='"+(done&&i===0?"dn ":"")+(fresh&&i===0?"new":"")+"'><span class='pt'></span><div><b>"+e(x.title)+"</b>"+(x.note?"<small>"+e(x.note)+"</small>":"")+"</div><time>"+when+"</time></li>"}).join("")+"</ol>";
}
function summary(){
 var box=$("#summary"),L=lines(),o=D.order||{};
 if(!L.length){box.hidden=true;return}
 box.hidden=false;var all=o.status==="ready"||o.status==="delivered";
 var open=box.querySelector(".full.open")?" open":"";
 var rows=L.map(function(l){var dn=all||l.done;return '<div class="work-i"><span class="ck"><u class="'+(dn?"":"w")+'">'+(dn?'<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"/></svg>')+"</u>"+e(l.description)+'</span><span class="st-c'+(dn?"":" w")+'">'+(dn?"تم":"جاري العمل")+"</span></div>"}).join("");
 var det=L.map(function(l){return "<tr><td>"+e(l.description)+(l.quantity>1?" × "+num(l.quantity):"")+"</td><td>"+num(l.total)+" ج.م</td></tr>"}).join("");
 var was=box.getAttribute("data-open")==="1";
 box.innerHTML="<h2>ملخص الأعمال</h2>"+rows+'<div class="tot"><span class="mut">الإجمالي'+(D.total_note?" ("+e(D.total_note)+")":"")+'</span><b><span id="tot" data-v="0">0</span> <small>ج.م</small></b></div>'+
  '<div class="full'+(was?" open":"")+'"><div><table>'+det+'</table></div></div><button class="btn'+(was?" o":"")+'" type="button" id="tg">عرض عرض السعر الكامل <svg class="chev" viewBox="0 0 24 24">'+ICON.chev+"</svg></button>";
 $("#tg").onclick=function(){var f=box.querySelector(".full"),on=f.classList.toggle("open");this.classList.toggle("o",on);box.setAttribute("data-open",on?"1":"0")};
 countUp($("#tot"),D.total);
}
function foot(){
 var s=D.shop||{};$("#foot").innerHTML="هذه الصفحة خاصة بك ولا تحتاج إلى حساب."+(s.phone?' للاستفسار تواصل معنا على <a href="tel:'+e(s.phone)+'"><bdi>'+e(s.phone)+"</bdi></a>.":"");
}
function render(){if(!built)shell();head();hero();extra();photos();timeline();summary();foot();document.title=((D.vehicle&&D.vehicle.plate)||"")+" · "+((D.shop&&D.shop.name)||"متابعة السيارة")}
render();
var url=document.documentElement.getAttribute("data-poll");
if(url){setInterval(function(){
 if(document.hidden)return;
 fetch(url,{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(n){
  if(!n||n.updated_at===D.updated_at)return;D=n;
  if(document.startViewTransition&&!matchMedia("(prefers-reduced-motion:reduce)").matches)document.startViewTransition(render);else render();
 }).catch(function(){});
},15000)}
})();
`;

const CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

// pollUrl: لو موجود الصفحة بتسأل عليه كل 15 ثانية (الرابط العام). من غيره الصفحة ثابتة (المعاينة جوه البرنامج).
function renderTrackingHtml(data, { pollUrl = '' } = {}) {
  // JSON inside a non-executed script tag: only '<' needs escaping so no </script> can close it.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ar" dir="rtl"${pollUrl ? ` data-poll="${pollUrl.replace(/"/g, '&quot;')}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="theme-color" content="#FFF6EA">
<title>متابعة السيارة</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<main class="wrap" id="app"></main>
<script type="application/json" id="d">${json}</script>
<script>${JS}</script>
</body>
</html>`;
}

module.exports = { renderTrackingHtml };
