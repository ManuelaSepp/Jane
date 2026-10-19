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
 run(`state.paymentVersion=1;state.paymentPositionen=[{datum:'2026-10-09',art:'stunden',id:'',label:'Arbeitszeit',gesamtCent:10000,bezahltCent:0,offenCent:10000}];
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
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
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
test('confirmed view survives read errors; fully paid and unpaid states remain correct',async()=>{
 const {run}=fixture();assert.equal(run('kalenderZahlung(entry).status'),'offen');
 run(`bestaetigteZahlungAnzeigen(payment);jsonp=async()=>{throw Error('synthetic read failure')}`);
 await run('zahlungenLaden()');assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
 run(`bestaetigteZahlungAnzeigen({...payment,id:'synthetic-rest',betrag:75,positionen:[{...payment.positionen[0],betragCent:7500}]})`);
 assert.equal(run('kalenderZahlung(entry).status'),'bezahlt');
 assert.equal(run('kalenderZahlung(entry).anteil'),'8 von 8 h bezahlt');
});
test('booking renders after write confirmation before slow reads and keeps ISO payload',async()=>{
 const {run,elements}=fixture();
 elements.get('zahlungDatumNeu').value='2026-10-19';elements.get('zahlungBetragNeu').value='25';
 run(`state.paymentEntwurf=[{p:state.paymentPositionen[0],cent:2500}];let confirmWrite,finishRead,written;
 schreiben=(action,payload)=>{written={action,payload};return new Promise(r=>confirmWrite=r)};
 jsonp=()=>new Promise(r=>finishRead=r);ladeJahr=async()=>{};const booking=zahlungBuchenNeu();`);
 assert.equal(run('kalenderZahlung(entry).status'),'offen');
 run('confirmWrite()');await new Promise(setImmediate);
 assert.equal(run('kalenderZahlung(entry).status'),'teilbezahlt');
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
