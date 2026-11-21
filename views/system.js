(function () {
  'use strict';
  var crew = [['muse','Luna'],['claude','Atlas'],['chatgpt','Argus'],['claude-jdm','Athena'],['orion','Orion']];
  function id(v) { v=String(v||'').trim().toLowerCase(); var c=crew.find(function(c){return c[0]===v||c[1].toLowerCase()===v;}); return c?c[0]:v; }
  function time(v) {
    if (typeof v==='number') return Number.isFinite(v)?v:NaN;
    if (v instanceof Date) return v.getTime();
    var s=String(v||'').trim(), m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,]?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!m) return /(?:Z|[+-]\d\d:\d\d)$/.test(s)?Date.parse(s):NaN;
    var hour=Number(m[4])%12+(/PM/i.test(m[7])?12:0), target=Date.UTC(+m[3],+m[1]-1,+m[2],hour,+m[5],+(m[6]||0));
    if (+m[1]>12||+m[2]>31||+m[4]<1||+m[4]>12||+m[5]>59) return NaN;
    var guess=target+5*3600000;
    for(var i=0;i<2;i++) { var parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(new Date(guess)), p={}; parts.forEach(function(x){p[x.type]=x.value;}); guess+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second); }
    return guess;
  }
  function fmt(v) { var n=time(v); return Number.isFinite(n)?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(n))+' ET':'Not available yet'; }
  function reading(rows,who,now) {
    var own=rows.filter(function(r){return id(r.writer)===who;}), valid=own.filter(function(r){return Number.isFinite(time(r.read_time));}).sort(function(a,b){return time(b.read_time)-time(a.read_time);}), r=valid[0];
    if (!r) return {ok:false,reason:own.length?'Invalid reading time':'Not reported',last:null};
    var raw=r.percent, n=Number(raw), age=now-time(r.read_time), reset=time(r.reset_time);
    var good=raw!==null&&raw!==undefined&&String(raw).trim()!==''&&Number.isFinite(n)&&n>=0&&n<=100;
    var reason=!good?'Percentage unavailable':age< -60000?'Reading time is in the future':age>86400000?'Reading older than 24 hours':Number.isFinite(reset)&&reset<=now?'Reset passed; refresh needed':'';
    return {ok:!reason,pct:n,last:r.read_time,reset:r.reset_time,reason:reason};
  }
  var css='#app:has(>.sys-root)>.wall.stripe{display:none}.sys-root{display:grid;gap:18px;min-width:0}.sys-root *{box-sizing:border-box}.sys-root h2,.sys-root h3{margin:0 0 14px;text-align:center}.sys-panel{padding:20px;border:1px solid var(--line);border-radius:22px;background:var(--card);min-width:0}.sys-usage{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.sys-tile{padding:16px;border:1px solid var(--line);border-radius:16px;min-width:0;background:var(--panel,var(--card))}.sys-name{font-weight:700}.sys-number{font-size:clamp(24px,3vw,40px);font-weight:750;line-height:1.2;margin:14px 0;color:var(--text)}.sys-meta{font-size:12px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}.sys-meter{height:6px;border-radius:4px;background:var(--line);margin:12px 0;overflow:hidden}.sys-fill{height:100%;background:var(--accent)}.sys-crew{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.sys-live{color:var(--green)}.sys-idle{color:var(--muted)}.sys-row{padding:10px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.sys-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}.sys-root summary{cursor:pointer;font-weight:700}.sys-root details>div{margin-top:12px}@media(max-width:1000px){.sys-usage,.sys-crew{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.sys-usage,.sys-crew{grid-template-columns:1fr}.sys-panel{padding:14px}.sys-number{font-size:32px}}';
  window.CC=window.CC||{views:{},subviews:{}};
  window.CC.views.System=function(api){
    var h=api.h,d=api.data||{},now=api.nowMs(),rows=d.usage||[],messages=d.messages||[];
    // Fictional fixtures never enter the Sheet or the live branch.
    if(d.sample) rows=crew.map(function(c,i){return {writer:c[0],percent:[67,42,24,81,null][i],read_time:new Date(now-(i+1)*600000).toISOString(),reset_time:new Date(now+86400000).toISOString()};});
    function panel(title,kids){return h('section',{class:'sys-panel'},h('h2',null,title),kids);}
    var usage=crew.map(function(c){var u=reading(rows,c[0],now);return h('article',{class:'sys-tile','aria-label':c[1]+' usage'},h('div',{class:'sys-name'},c[1]),h('div',{class:'sys-number'},u.ok?Math.round(u.pct*10)/10+'%':'No reading'),u.ok?h('div',{class:'sys-meter',role:'meter','aria-label':c[1]+' percent used','aria-valuenow':u.pct,'aria-valuemin':0,'aria-valuemax':100},h('div',{class:'sys-fill',style:'width:'+u.pct+'%;background:var('+ (u.pct>=90?'--red':u.pct>=70?'--amber':'--accent') +')'})):null,h('div',{class:'sys-meta'},'Read: '+(u.last?fmt(u.last):'Not reported')),h('div',{class:'sys-meta'},'Resets: '+fmt(u.reset)),u.reason?h('div',{class:'sys-meta'},u.reason):null);});
    var activity=crew.map(function(c){var mine=messages.filter(function(m){return id(m.from)===c[0]&&Number.isFinite(time(m.time));}).sort(function(a,b){return time(b.time)-time(a.time);}),last=mine[0],age=last?now-time(last.time):Infinity,active=age>=0&&age<=3600000;return h('div',{class:'sys-tile'},h('div',{class:'sys-name'},c[1]),h('p',{class:active?'sys-live':'sys-idle'},active?'● Reported within 1 hour':'○ No recent report'),h('div',{class:'sys-meta'},'Last report: '+(last?fmt(last.time):'Not reported')));});
    var handoffs=messages.filter(function(m){return /^(handoff|request)$/.test(m.type)&&Number.isFinite(time(m.time));}).sort(function(a,b){return time(b.time)-time(a.time);}).slice(0,5);
    function name(v){var c=crew.find(function(c){return c[0]===id(v);});return c?c[1]:String(v||'Unassigned');}
    var depts=['Calendar','Equipment','Business and vocational','Health','AI and systems'];
    var structure=h('div',{class:'sys-grid'},Object.keys(d.modules||{}).map(function(section){return h('div',null,h('h3',null,section),(d.modules[section]||[]).map(function(m){var s=api.moduleStatus(m.name)||{};return h('div',{class:'sys-row'},h('b',null,m.name),h('div',{class:'sys-meta'},s.text||'Not available yet'));}));}));
    return h('div',{class:'sys-root'},h('style',null,css),panel('AI usage',h('div',null,d.sample?h('p',{class:'sys-meta'},'Fictional preview readings'):null,h('div',{class:'sys-usage'},usage))),panel('Crew activity',h('div',null,h('div',{class:'sys-crew'},activity),h('h3',{style:'margin-top:20px'},'Recent handoffs'),handoffs.length?handoffs.map(function(m){return h('div',{class:'sys-row'},h('b',null,name(m.from)+' → '+name(m.to)),h('div',{class:'sys-meta'},m.type+' · '+fmt(m.time)));}):h('p',{class:'sys-meta'},'No handoffs reported'))),panel('Departments',h('div',{class:'sys-grid'},depts.map(function(dep){return h('div',{class:'sys-row'},h('b',null,dep),h('div',{class:'sys-meta'},name(api.cfgVal('dept.'+dep)||'Unassigned')));}))),h('details',{class:'sys-panel'},h('summary',null,'Structure'),structure),h('details',{class:'sys-panel'},h('summary',null,'Diagnostics'),h('div',null,(d.problems||[]).length?(d.problems||[]).map(function(p){return h('div',{class:'sys-row'},h('b',null,p.problem||'Issue reported'),h('div',{class:'sys-meta'},'Owner: '+(p.owner||'Unassigned')));}):'No problems reported')));
  };
})();
