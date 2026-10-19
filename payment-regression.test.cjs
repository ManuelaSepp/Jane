const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
function fixture(){
 const elements=new Map();
 const element=()=>({value:'',textContent:'',disabled:false,children:[],style:{},dataset:{},classList:{toggle(){}},addEventListener(){},setAttribute(){},append(...xs){this.children.push(...xs)},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}});
 const context=vm.createContext({console,Date,URLSearchParams,Set,Map,Number,String,Math,Promise,
  document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element},
  localStorage:{getItem(){return null}},confirm:()=>true,
  fetch(){throw Error('Real network writes forbidden in regression tests')},
  setTimeout,clearTimeout});
 vm.runInContext(source.replace('\ninit();','\n// Startup disabled in isolated regression harness.'),context);
 vm.runInContext(`const originalRenderKalender=renderKalender;renderZahlungsHistorie=()=>{};renderStatistik=()=>{};renderMonatsGrid=()=>{};renderKalender=()=>{renders++};renderZahlungsEntwurf=()=>{};let renders=0;schlafen=async()=>{};`,context);
 const run=code=>vm.runInContext(code,context);
 run(`state.kalenderDatum=new Date(2026,9,1);state.cacheJahr=2026;
 state.jahresBestaetigung={jahr:2026,seq:ladeSequenz};state.jahresLadezustand='bereit';
 state.paymentLadezustand='bereit';state.paymentVersion=1;state.paymentPositionen=[{datum:'2026-10-09',art:'stunden',id:'',label:'Arbeitszeit',gesamtCent:10000,bezahltCent:0,offenCent:10000}];
 const payment={id:'synthetic-payment',datum:'2026-10-19',betrag:25,positionen:[{datum:'2026-10-09',art:'stunden',id:'',betragCent:2500,gesamtCent:10000}]};
 const entry={datum:'2026-10-09',stunden:8,bezahlt:false};`);
 return {run,elements,context};
}

function startupFixture(cached=false){
 const f=fixture();
 f.context.cached=cached;
 f.run(`state.paymentLadezustand='laden';state.paymentVersion=0;state.paymentPositionen=[];
 state.jahresBestaetigung=null;state.jahresLadezustand='laden';
 stundenBerechnen=()=>{};renderLeerzustand=()=>{};renderFahrzielDropdown=()=>{};
 renderFahrziele=()=>{};renderStundenlohn=()=>{};pruefeKonfiguration=()=>true;
 ladeLokalenCache=()=>{if(cached){state.eintraege=[{...entry,bezahlt:true}];state.jahresEintraege=state.eintraege;}return cached};
 schreiben=()=>{throw Error('Unexpected startup write')};
 const calls=[],pending={};
 jsonp=({action})=>{calls.push(action);if(!['init','paymentOverview'].includes(action))throw Error('Unexpected startup action');return new Promise((resolve,reject)=>{pending[action]={resolve,reject}})};
 const yearResponse={ok:true,eintraegeJahr:[entry]};
 const overviewResponse={ok:true,paymentVersion:1,positionen:[{datum:entry.datum,art:'stunden',id:'',gesamtCent:10000,bezahltCent:2500,offenCent:7500}],zahlungen:[]};`);
 return f;
}

test('startup starts exactly two reads immediately and joins either completion order, with/without cache',async()=>{
 for(const cached of [false,true])for(const first of ['init','paymentOverview']){
  const {run}=startupFixture(cached);
  run('const startup=init()');
  assert.equal(run('JSON.stringify(calls)'),JSON.stringify(['init','paymentOverview']));
  run(`pending['${first}'].resolve(${first==='init'?'yearResponse':'overviewResponse'})`);
  await new Promise(setImmediate);
  assert.equal(run('state.paymentLadezustand'),'laden');
  assert.equal(run('kalenderZahlung(entry).status'),'laden');
  const last=first==='init'?'paymentOverview':'init';
  run(`pending['${last}'].resolve(${last==='init'?'yearResponse':'overviewResponse'})`);
  await run('startup');
  assert.equal(run('kalenderZahlung(state.eintraege[0]).status'),'teilbezahlt');
  assert.equal(run('calls.length'),2);
 }
});

test('startup overview failure remains unknown after later year success',async()=>{
 const {run}=startupFixture(true);run('const startup=init();pending.paymentOverview.reject(Error("synthetic failure"))');
 await new Promise(setImmediate);
 assert.equal(run('kalenderZahlung(entry).status'),'unbekannt');
 run('pending.init.resolve(yearResponse)');await new Promise(setImmediate);await run('startup');
 assert.equal(run('kalenderZahlung(entry).status'),'unbekannt');
 assert.equal(run('calls.length'),2);
});

test('year retries do not restart the concurrent journal read',async()=>{
 const {run}=startupFixture(true);
 run('const startup=init();pending.paymentOverview.resolve(overviewResponse);pending.init.reject(Error("synthetic init failure"))');
 await new Promise(setImmediate);
 assert.equal(run('JSON.stringify(calls)'),JSON.stringify(['init','paymentOverview','init']));
 assert.equal(run('state.paymentLadezustand'),'laden');
 run('pending.init.resolve(yearResponse)');await run('startup');
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
 assert.equal(run('calls.filter(x=>x==="paymentOverview").length'),1);
});

test('both year attempts failing with paid cache and empty valid journal stay unknown; full retry recovers',async()=>{
 for(const journalFirst of [false,true]){
  const {run,elements}=startupFixture(true);
  run(`const startup=init();renderKalender=originalRenderKalender;overviewResponse.positionen=[]`);
  if(journalFirst)run('pending.paymentOverview.resolve(overviewResponse)');
  run('pending.init.reject(Error("first year failure"))');await new Promise(setImmediate);
  run('pending.init.reject(Error("second year failure"))');await new Promise(setImmediate);
  if(!journalFirst)run('pending.paymentOverview.resolve(overviewResponse)');
  await run('startup');
  assert.equal(run('state.eintraege[0].bezahlt'),true);
  assert.equal(run('state.paymentLadezustand'),'fehler');
  assert.equal(run('kalenderZahlung(state.eintraege[0]).status'),'unbekannt');
  assert.equal(run('state.jahresBestaetigung'),null);
  assert.match(elements.get('kalenderZahlungsstatus').textContent,/unbekannt/);
  const cell=elements.get('calendarGrid').children.filter(x=>x.dataset.datum==='2026-10-09').at(-1);
  assert.match(cell.className,/status-unbekannt/);
  assert.doesNotMatch(cell.className,/status-(bezahlt|teilbezahlt)/);
  assert.doesNotMatch(cell.innerHTML,/✓ bezahlt/);
  // Retrying only the journal must not legitimize the old year cache.
  run('const journalRetry=zahlungenLaden();pending.paymentOverview.resolve(overviewResponse)');
  assert.equal(await run('journalRetry'),false);
  assert.equal(run('kalenderZahlung(state.eintraege[0]).status'),'unbekannt');
  run('const retry=init();pending.init.resolve(yearResponse);pending.paymentOverview.resolve(overviewResponse)');
  await run('retry');
  assert.equal(run('kalenderZahlung(state.eintraege[0]).status'),'offen');
  assert.equal(elements.get('kalenderZahlungsstatus').hidden,true);
 }
});

test('invalid year payload or mismatched year never confirms cached paid flags',async()=>{
 for(const response of [null,{ok:false},{ok:true},{ok:true,eintraegeJahr:{}},
  {ok:true,jahr:2025,eintraegeJahr:[]},{ok:true,eintraegeJahr:[{datum:'2025-10-09',bezahlt:true}]}]){
  const {run,context}=startupFixture(true);context.response=response;
  run('const startup=init();pending.init.resolve(response);pending.paymentOverview.resolve(overviewResponse)');
  await new Promise(setImmediate);
  // laden() retries null/ok:false responses; shape/year validation happens afterwards.
  run('pending.init.resolve(response)');await run('startup');
  assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'unbekannt');
  assert.equal(run('state.paymentLadezustand'),'fehler');
 }
});

test('successful empty year is explicitly confirmed and fresh legacy flags remain supported',async()=>{
 for(const entries of ['[]','[{...entry,bezahlt:true}]']){
  const {run}=startupFixture(true);
  run(`yearResponse.eintraegeJahr=${entries};overviewResponse.positionen=[];
   const startup=init();pending.init.resolve(yearResponse);pending.paymentOverview.resolve(overviewResponse)`);
  await run('startup');
  assert.equal(run('state.paymentLadezustand'),'bereit');
  assert.equal(run('jahresdatenAktuell()'),true);
  if(entries!=='[]')assert.equal(run('kalenderZahlung(state.eintraege[0]).status'),'bezahlt');
 }
});

test('superseded year success/failure cannot confirm or invalidate a newer year',async()=>{
 for(const staleFailure of [false,true]){
  const {run}=startupFixture(true);
  run(`const oldYear=ladeJahr(2026);const oldRead=pending.init;
   state.kalenderDatum=new Date(2027,0,1);const newYear=ladeJahr(2027);
   const journal=zahlungenLaden(newYear);
   pending.paymentOverview.resolve(overviewResponse);pending.init.resolve({ok:true,eintraegeJahr:[]})`);
  assert.equal(await run('journal'),true);
  run(staleFailure?'oldRead.reject(Error("obsolete year failure"))':'oldRead.resolve(yearResponse)');
  await new Promise(setImmediate);
  if(staleFailure)run('pending.init.reject(Error("obsolete retry failure"))');
  assert.equal(await run('oldYear'),null);
  assert.equal(run('state.jahresBestaetigung.jahr'),2027);
  assert.equal(run('kalenderZahlungsLadezustand()'),'bereit');
  assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'unbekannt');
  run('state.kalenderDatum=new Date(2026,9,1);originalRenderKalender()');
  assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'unbekannt');
 }
});

test('older year promise cannot release a journal after newer year confirmation',async()=>{
 const {run}=startupFixture(true);
 run(`const oldYear=ladeJahr(2026);const oldRead=pending.init;const journal=zahlungenLaden(oldYear);
  pending.paymentOverview.resolve(overviewResponse);
  const newer=ladeJahr(2026);pending.init.resolve(yearResponse)`);
 await run('newer');run('oldRead.resolve(yearResponse)');
 assert.equal(await run('journal'),false);
 assert.equal(run('state.paymentLadezustand'),'fehler');
 assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'unbekannt');
});

test('year refresh masks existing colors and confirmation cannot bypass failed year',async()=>{
 const {run}=startupFixture(true);
 run(`state.paymentLadezustand='bereit';const year=ladeJahr(2026)`);
 assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'laden');
 run('pending.init.reject(Error("year failure"))');await new Promise(setImmediate);
 run('pending.init.reject(Error("year retry failure"))');assert.equal(await run('year'),null);
 run('bestaetigteZahlungAnzeigen(payment)');
 assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'unbekannt');
});

test('journal waiting for year data cannot overwrite a later confirmed payment',async()=>{
 const {run}=fixture();
 run(`let finishYear;const year=new Promise(resolve=>finishYear=resolve);
 jsonp=async()=>({ok:true,paymentVersion:1,positionen:[],zahlungen:[]});const loading=zahlungenLaden(year)`);
 await new Promise(setImmediate);
 run('bestaetigteZahlungAnzeigen(payment);finishYear()');
 assert.equal(await run('loading'),false);
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
 assert.equal(run('state.paymentJournal[0].id'), 'synthetic-payment');
});
test('dropdown formats display date and preserves ISO identity',()=>{
 const {run,elements}=fixture();run('renderZahlungsAuswahl()');
 const option=elements.get('zahlungManuellNeu').children[1];
 assert.match(option.textContent,/^09\.10\.2026 · Arbeitszeit · offen /);
 assert.equal(option.value,JSON.stringify(['2026-10-09','stunden','']));
});
test('confirmed partial payment updates calendar immediately and only once',()=>{
 const {run}=fixture();run('bestaetigteZahlungAnzeigen(payment)');
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
 assert.equal(run('kalenderZahlung(entry).anteil'),'2 von 8 h bezahlt');
 assert.equal(run('state.paymentPositionen[0].offenCent'),7500);
 assert.equal(run('renders'),1);
 run('bestaetigteZahlungAnzeigen(payment)');
 assert.equal(run('state.paymentPositionen[0].bezahltCent'),2500);
 assert.equal(run('state.paymentJournal.length'),1);
});
test('stale overview retries without rolling back confirmed payment',async()=>{
 const {run}=fixture();run(`bestaetigteZahlungAnzeigen(payment);let calls=0;jsonp=async()=>{calls++;return {ok:true,paymentVersion:1,positionen:[],zahlungen:[]}}`);
 assert.equal(await run('zahlungenLaden()'),false);
 assert.equal(run('calls'),3);
 assert.equal(run('kalenderZahlung(entry).status'),'unbekannt');
 assert.equal(run('state.paymentPositionen[0].bezahltCent'),2500);
 assert.equal(run('state.paymentVersion'),1);
 assert.match(run('$("zahlungStatusNeu").textContent'),/noch nicht aktuell/);
 run(`jsonp=async()=>({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:[payment]})`);
 assert.equal(await run('zahlungenLaden()'),true);
 assert.equal(run('bestaetigteZahlungsIds.size'),0);
});
test('late responses cannot overwrite a confirmation or a newer overview',async()=>{
 const {run}=fixture();run(`let finish;jsonp=()=>new Promise(r=>finish=r);const oldRequest=zahlungenLaden();bestaetigteZahlungAnzeigen(payment);finish({ok:true,paymentVersion:1,positionen:[],zahlungen:[]});`);
 assert.equal(await run('oldRequest'),false);
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
 run(`const older=zahlungenLaden();const oldFinish=finish;const newer=zahlungenLaden();finish({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:[payment]});`);
 await run('newer');run('oldFinish({ok:true,paymentVersion:1,positionen:[],zahlungen:[]})');
 assert.equal(await run('older'),false);
 assert.equal(run('state.paymentJournal.length'),1);
});
test('confirmed amounts survive read errors; display stays unknown until confirmation',async()=>{
 const {run}=fixture();assert.equal(run('kalenderZahlung(entry).status'),'offen');
 run(`bestaetigteZahlungAnzeigen(payment);jsonp=async()=>{throw Error('synthetic read failure')}`);
 await run('zahlungenLaden()');assert.equal(run('kalenderZahlung(entry).status'),'unbekannt');
 assert.equal(run('state.paymentPositionen[0].bezahltCent'),2500);
 run(`bestaetigteZahlungAnzeigen({...payment,id:'synthetic-rest',betrag:75,positionen:[{...payment.positionen[0],betragCent:7500}]})`);
 assert.equal(run('kalenderZahlung(entry).status'),'bezahlt');
 assert.equal(run('kalenderZahlung(entry).anteil'),'8 von 8 h bezahlt');
});

test('cold start and cached legacy flags never render final payment status',()=>{
 const {run,elements}=fixture();
 // The real initial value must stay independent of paymentVersion and legacy flags.
 assert.match(source,/paymentLadezustand:"laden"/);
 run(`state.paymentLadezustand='laden';state.paymentVersion=0;
 state.kalenderDatum=new Date(2026,9,1);state.ausgewaehlt='2026-10-12';
 state.eintraege=[{...entry,datum:'2026-10-12',bezahlt:true}];originalRenderKalender()`);
 const cell=elements.get('calendarGrid').children.find(x=>x.dataset.datum==='2026-10-12');
 assert.match(cell.className,/status-laden/);
 assert.doesNotMatch(cell.className,/status-(bezahlt|teilbezahlt)/);
 assert.doesNotMatch(cell.innerHTML,/✓ bezahlt|offen/);
 assert.match(cell.title,/Zahlungsstatus wird geladen/);
 assert.match(elements.get('tagZahlungsinfo').textContent,/Zahlungsstatus wird geladen/);
 assert.equal(elements.get('kalenderZahlungsstatus').hidden,false);
 run(`state.eintraege[0].bezahlt=false;originalRenderKalender()`);
 assert.equal(run('kalenderZahlung(state.eintraege[0]).status'),'laden');
});

test('slow overview renders October 12 partial status only after valid response, without writes',async()=>{
 const {run,elements}=fixture();
 run(`state.paymentLadezustand='laden';state.paymentVersion=0;
 state.kalenderDatum=new Date(2026,9,1);state.eintraege=[{...entry,datum:'2026-10-12',bezahlt:true}];
 renderKalender=originalRenderKalender;let finish;let reads=0;
 schreiben=()=>{throw Error('Unexpected booking')};
 jsonp=({action})=>{if(action!=='paymentOverview')throw Error('Unexpected read');reads++;return new Promise(r=>finish=r)};
 const loading=zahlungenLaden();`);
 const cell=()=>elements.get('calendarGrid').children.filter(x=>x.dataset.datum==='2026-10-12').at(-1);
 assert.match(cell().className,/status-laden/);
 run(`finish({ok:true,paymentVersion:1,positionen:[{...state.paymentPositionen[0],datum:'2026-10-12',bezahltCent:2500,offenCent:7500}],zahlungen:[]})`);
 assert.equal(await run('loading'),true);
 assert.match(cell().className,/status-teilbezahlt/);
 assert.match(cell().innerHTML,/2 von 8 h bezahlt/);
 assert.equal(elements.get('kalenderZahlungsstatus').hidden,true);
 assert.equal(run('reads'),1);
});

test('initial read failure and invalid payloads stay unknown; successful retry recovers',async()=>{
 for(const response of [null,{ok:false},{ok:true,paymentVersion:0},
  {ok:true,paymentVersion:1},{ok:true,paymentVersion:1,positionen:{},zahlungen:[]}]){
  const {run,elements,context}=fixture();context.response=response;
  run(`state.paymentVersion=0;jsonp=async()=>response;renderKalender=originalRenderKalender`);
  assert.equal(await run('zahlungenLaden()'),false);
  assert.equal(run('kalenderZahlung({...entry,bezahlt:true}).status'),'unbekannt');
  assert.match(elements.get('kalenderZahlungsstatus').textContent,/unbekannt/);
  run(`jsonp=async()=>({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:[]})`);
  assert.equal(await run('zahlungenLaden()'),true);
  assert.equal(run('kalenderZahlung(entry).status'),'offen');
 }
 const {run}=fixture();run(`jsonp=async()=>{throw Error('synthetic network error')}`);
 assert.equal(await run('zahlungenLaden()'),false);
 assert.equal(run('kalenderZahlung(entry).status'),'unbekannt');
});

test('refresh masks old colors; obsolete failure cannot hide newer successful overview',async()=>{
 const {run}=fixture();
 run(`bestaetigteZahlungAnzeigen(payment);let resolveRead,rejectRead;
 jsonp=()=>new Promise((resolve,reject)=>{resolveRead=resolve;rejectRead=reject});
 const older=zahlungenLaden();const rejectOlder=rejectRead;`);
 assert.equal(run('kalenderZahlung(entry).status'),'laden');
 run(`const newer=zahlungenLaden();resolveRead({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:[payment]})`);
 assert.equal(await run('newer'),true);
 run(`rejectOlder(Error('obsolete failure'))`);
 assert.equal(await run('older'),false);
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
});
test('booking renders after write confirmation before slow reads and keeps ISO payload',async()=>{
 const {run,elements}=fixture();
 elements.get('zahlungDatumNeu').value='2026-10-19';elements.get('zahlungBetragNeu').value='25';
 run(`state.paymentEntwurf=[{p:state.paymentPositionen[0],cent:2500}];let confirmWrite,finishRead,written;
 schreiben=(action,payload)=>{written={action,payload};return new Promise(r=>confirmWrite=r)};
 jsonp=()=>new Promise(r=>finishRead=r);ladeJahr=async()=>{};const booking=zahlungBuchenNeu();`);
 assert.equal(run('kalenderZahlung(entry).status'),'offen');
 run('confirmWrite()');await new Promise(setImmediate);
 assert.equal(run('kalenderZahlung(entry).status'),'laden');
 assert.equal(run('state.paymentPositionen[0].bezahltCent'),2500);
 assert.equal(run('written.action'),'recordPayment');
 assert.equal(run('written.payload.positionen[0].datum'),'2026-10-09');
 run('finishRead({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:state.paymentJournal})');
 await run('booking');assert.equal(run('offeneZahlungsBuchung'),null);
});
test('failed unconfirmed booking changes no payment amounts and blocks duplicate retry',async()=>{
 const {run,elements}=fixture();elements.get('zahlungDatumNeu').value='2026-10-19';elements.get('zahlungBetragNeu').value='25';
 run(`state.paymentEntwurf=[{p:state.paymentPositionen[0],cent:2500}];schreiben=async()=>{throw Error('synthetic write failure')};jsonp=async()=>({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:[]});`);
 await run('zahlungBuchenNeu()');assert.equal(run('kalenderZahlung(entry).status'),'offen');
 assert.equal(run('bestaetigteZahlungsIds.size'),0);
 assert.equal(run('offeneZahlungsBuchung!==null'),true);
 assert.match(run('$("zahlungStatusNeu").textContent'),/Nicht erneut buchen/);
});
test('calendar DOM receives partial-payment class and badge',()=>{
 const {run,elements}=fixture();
 run(`state.kalenderDatum=new Date(2026,9,1);state.eintraege=[entry];state.ausgewaehlt=entry.datum;tooltipFuerEintrag=()=>'';bestaetigteZahlungAnzeigen(payment);originalRenderKalender()`);
 const cell=elements.get('calendarGrid').children.find(x=>x.dataset.datum==='2026-10-09');
 assert.match(cell.className,/status-teilbezahlt/);
 assert.match(cell.innerHTML,/2 von 8 h bezahlt/);
});
