// Offline regression checks with DOM/network doubles. These are not browser tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
class Element{
 constructor(){this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.classList={add(){},remove(){},contains(){return false;}};}
 replaceChildren(...children){this.children=children;this.textContent='';}
 append(...children){this.children.push(...children);}
 appendChild(child){this.append(child);return child;}
 addEventListener(){} setAttribute(){} focus(){this.focused=true;} scrollIntoView(){this.scrolled=true;}
}
function boot(){
 const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const context=vm.createContext({console,URLSearchParams,confirm:()=>true,
  localStorage:{getItem:()=>null},
  document:{getElementById:id=>{assert.ok(ids.has(id),'Missing HTML id: '+id);return ids.get(id);},createElement:()=>new Element(),addEventListener(){}},
  fetch:()=>{throw Error('Unexpected network access');}});
 // Only automatic startup is suppressed; actual handlers and declarations are evaluated.
 vm.runInContext(source.replace(/^init\(\);/m,'/* offline test: no automatic backend load */'),context);
 return {ids,run:code=>vm.runInContext(code,context)};
}
const fixture=`
 state.paymentVersion=1;
 state.jahresEintraege=[{datum:'2026-10-01',stunden:8,bezahlt:false}];
 state.paymentPositionen=[{datum:'2026-10-01',art:'stunden',id:'',label:'Arbeitsstunden',gesamtCent:16000,bezahltCent:4000,offenCent:12000},
 {datum:'2026-10-02',art:'fahrt',id:'f1',label:'Fahrt',gesamtCent:2000,bezahltCent:0,offenCent:2000}];
 state.paymentJournal=[{id:'alt',datum:'2026-10-02',betrag:40,positionen:[{datum:'2026-10-01',art:'stunden',betragCent:4000}]},
 {id:'alt-storno',datum:'2026-10-03',betrag:-40,stornoVon:'alt',positionen:[{datum:'2026-10-01',art:'stunden',betragCent:-4000}]}];
`;
function textTree(el){return el.textContent+' '+el.children.map(textTree).join(' ');}
test('page wiring: unique functions and no old status controls',()=>{
 const names=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)].map(m=>m[1]);
 assert.equal(new Set(names).size,names.length);
 assert.doesNotMatch(html,/id="zahlung(?:Bezahlt|Offen|Aktionen|Abbrechen)"/);
 const b=boot();b.run(fixture+'zahlungBearbeitenStart();leistungBezahlt("stunden");renderEinzelstatus(state.jahresEintraege[0]);');
 assert.equal(b.ids.get('zahlungenKarte').open,true);
 assert.equal(b.ids.get('zahlungBetragNeu').focused,true);
 assert.match(textTree(b.ids.get('einzelStatus')),/Zahlungsjournal/);
});
test('legacy writes blocked even when journal is unavailable',async()=>{
 const b=boot();
 await assert.rejects(b.run('schreiben("setLeistungBezahlt",{bezahlt:true})'),/Zahlungsjournal/);
 await assert.rejects(b.run('schreiben("setLeistungBezahlt",{bezahlt:false})'),/Zahlungsjournal/);
});
test('German dates in candidates and history, preserving journal and reversal',()=>{
 const b=boot();b.run(fixture);
 const before=b.run('JSON.stringify(state.paymentJournal)');
 b.run('renderJournalAuswahl();renderZahlungsHistorie();');
 assert.match(textTree(b.ids.get('zahlungManuellNeu')),/01\.10\.2026/);
 const history=textTree(b.ids.get('zahlungHistorieNeu'));
 assert.match(history,/Oktober 2026/);assert.match(history,/02\.10\.2026/);assert.match(history,/01\.10\.2026/);
 assert.match(history,/Stornierung/);assert.match(history,/\(storniert\)/);
 assert.doesNotMatch(history,/Zahlung stornieren/);
 assert.equal(b.run('JSON.stringify(state.paymentJournal)'),before);
 assert.equal(b.run('zahlungsDatumDeutsch("2026-10-01T00:00:00.000Z")'),'01.10.2026');
 assert.equal(b.run('zahlungsDatumDeutsch("01.10.2026")'),'01.10.2026');
 assert.equal(b.run('zahlungsDatumDeutsch(null)'),'');
});
test('partial allocation and calendar keep paid and open amounts separate',()=>{
 const b=boot();b.run(fixture);
 assert.equal(b.run('kalenderZahlung(state.jahresEintraege[0]).status'),'teilbezahlt');
 assert.match(b.run('kalenderZahlung(state.jahresEintraege[0]).details'),/2.*h.*6.*h/);
 assert.equal(b.run('zahlungsVorschlag(3000)[0].cent'),3000);
 b.run('$("zahlungBetragNeu").value="30,00";state.paymentEntwurf=[{p:state.paymentPositionen[0],cent:3000}];renderZahlungsEntwurf();');
 assert.equal(b.ids.get('zahlungBuchenNeu').disabled,false);
 assert.match(textTree(b.ids.get('zahlungTrefferNeu')),/01\.10\.2026/);
 b.run('offeneZahlungsBuchung={id:"pending"};renderZahlungsEntwurf();');
 assert.equal(b.ids.get('zahlungBuchenNeu').disabled,true);
});
test('empty form is neutral, malformed nonempty input still gives an error',()=>{
 const b=boot();b.run('renderZahlungsEntwurf();');
 assert.equal(b.ids.get('zahlungRestNeu').textContent,'');assert.equal(b.ids.get('zahlungBuchenNeu').disabled,true);
 b.run('$("zahlungBetragNeu").value="abc";renderZahlungsEntwurf();');
 assert.match(b.ids.get('zahlungRestNeu').textContent,/gültigen Zahlungsbetrag/);
});
for(const recovered of [false,true])test('save confirmation clears false validation message; recovered='+recovered,async()=>{
 const b=boot();b.run(fixture+`
 globalThis.writes=[];
 ladeJahr=async()=>{};renderStatistik=()=>{};renderMonatsGrid=()=>{};renderKalender=()=>{};
 schreiben=async(action,payload)=>{writes.push({action,payload});${recovered?'throw Error("Confirmation timeout");':''}};
 jsonp=async()=>({ok:true,paymentVersion:1,positionen:state.paymentPositionen,zahlungen:[...state.paymentJournal,{...writes[0].payload}]});
 $("zahlungBetragNeu").value="30,00";
 state.paymentEntwurf=[{p:state.paymentPositionen[0],cent:3000}];
 `);
 await b.run('zahlungBuchenNeu()');
 assert.equal(b.run('writes.length'),1);assert.equal(b.run('writes[0].action'),'recordPayment');
 assert.equal(b.run('writes[0].payload.positionen[0].betragCent'),3000);
 assert.equal(b.run('writes[0].payload.positionen[0].datum'),'2026-10-01');
 assert.equal(b.run('state.paymentJournal[1].stornoVon'),'alt');
 assert.equal(b.ids.get('zahlungRestNeu').textContent,'');assert.equal(b.ids.get('zahlungBetragNeu').value,'');
 assert.equal(b.ids.get('zahlungBuchenNeu').disabled,true);
 assert.match(b.ids.get('zahlungStatusNeu').textContent,recovered?/Journal bestätigt/:/gespeichert/);
});
test('unconfirmed save prevents repeat booking',async()=>{
 const b=boot();b.run(fixture+`
 globalThis.count=0;schreiben=async()=>{count++;throw Error('offline');};zahlungenLaden=async()=>{};
 $("zahlungBetragNeu").value="30,00";state.paymentEntwurf=[{p:state.paymentPositionen[0],cent:3000}];
 `);
 await b.run('zahlungBuchenNeu()');await b.run('zahlungBuchenNeu()');
 assert.equal(b.run('count'),1);assert.equal(b.ids.get('zahlungBuchenNeu').disabled,true);
});
test('reversal sends only reversePayment and retains original journal entries',async()=>{
 const b=boot();b.run(fixture+`
 globalThis.writes=[];ladeJahr=async()=>{};
 schreiben=async(action,payload)=>{writes.push({action,payload});};
 zahlungenLaden=async()=>{};
 `);
 const before=b.run('JSON.stringify(state.paymentJournal)');
 await b.run('zahlungStornierenNeu({id:"new",datum:"2026-10-04",betrag:30})');
 assert.equal(b.run('writes[0].action'),'reversePayment');assert.equal(b.run('writes[0].payload.id'),'new');
 assert.equal(b.run('JSON.stringify(state.paymentJournal)'),before);
});
