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
 run(`state.paymentLadezustand='bereit';state.paymentVersion=1;state.paymentPositionen=[{datum:'2026-10-09',art:'stunden',id:'',label:'Arbeitszeit',gesamtCent:10000,bezahltCent:0,offenCent:10000}];
 const payment={id:'synthetic-payment',datum:'2026-10-19',betrag:25,positionen:[{datum:'2026-10-09',art:'stunden',id:'',betragCent:2500,gesamtCent:10000}]};
 const entry={datum:'2026-10-09',stunden:8,bezahlt:false};`);
 return {run,elements,context};
}
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
