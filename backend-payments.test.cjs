const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

class Sheet{
 constructor(rows=[]){this.rows=rows;this.writes=0;}
 getLastRow(){return this.rows.length;}
 getRange(row,col,n=1,m=1){const sheet=this;return {
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[row+i-1]?.[col+j-1]??'')),
  setValues(values){sheet.writes++;values.forEach((r,i)=>{sheet.rows[row+i-1]??=[];r.forEach((v,j)=>sheet.rows[row+i-1][col+j-1]=v);});return this;},
  getValue:()=>sheet.rows[row-1]?.[col-1]??'',setValue(v){return this.setValues([[v]]);},setNumberFormat(){return this;}
 };}
}
function fixture(){
 const row=Array(21).fill('');Object.assign(row,{0:'entry-1',1:'2026-10-01',2:'09:00',3:'14:00',4:5,9:20,12:false,15:JSON.stringify([{id:'special-1',name:'Extra',betrag:40,bezahlt:false,fixbetrag:null}]),17:false,19:'km'});
 const sheets={Arbeitszeiten:new Sheet([Array(21).fill('header'),row]),Fahrten:new Sheet([Array(8).fill('header'),['trip-1','2026-10-01','dest','Ziel',20,'',false,'']]),Stundenlohn:new Sheet([['Gültig_ab','Lohn',''],['2026-01-01',20,'']]),Kilometerpauschale:new Sheet([['Gültig_ab','Satz',''],['2026-01-01',0.3,'']]),Fahrziele:new Sheet([Array(7).fill('')]),Einstellungen:new Sheet([['','']])};
 const props={},locks={acquired:0,released:0};
 const ctx={console,SpreadsheetApp:{getActive:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet())}),flush(){}},Utilities:{formatDate:(d,tz,fmt)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return fmt==='yyyy-MM-dd'?`${y}-${m}-${day}`:'';}},LockService:{getScriptLock:()=>({waitLock(){locks.acquired++;},releaseLock(){locks.released++;}})},PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>props[k]=v,getProperty:k=>props[k]})},ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/backend/Code.gs','utf8'),ctx);
 const overview=()=>JSON.parse(JSON.stringify(ctx.paymentOverview_()));
 const post=(action,p)=>JSON.parse(ctx.doPost({parameter:{action,payload:JSON.stringify(p),requestId:'request_123456789'}}).text);
 const payload=(amount=25,id='payment_123456789',art='stunden')=>{const p=overview().positionen.find(p=>p.art===art);return{id,datum:'2026-10-12',betrag:amount,notiz:'Bank 123',positionen:[{datum:p.datum,art:p.art,id:p.id,betragCent:Math.round(amount*100),gesamtCent:p.gesamtCent}]};};
 return {ctx,sheets,overview,post,payload,locks};
}
test('partial and full dated payments preserve original rows, rates and old flags',()=>{
 const f=fixture(),original=JSON.stringify(f.sheets);let p=f.payload();assert.equal(f.post('recordPayment',p).ok,true);
 assert.equal(f.overview().positionen.find(x=>x.art==='stunden').offenCent,7500);
 assert.equal(f.ctx.init_(2026).eintraegeJahr[0].bezahlt,false);
 assert.equal(f.ctx.init_(2026).eintraegeJahr[0].journalLock,true);
 for(const art of ['stunden','fahrt','sonder']){const item=f.overview().positionen.find(x=>x.art===art);assert.equal(f.post('recordPayment',f.payload(item.offenCent/100,'payment_rest_'+art,art)).ok,true);}
 assert.ok(f.overview().positionen.every(x=>x.offenCent===0));
 const journal=f.sheets.Zahlungen;delete f.sheets.Zahlungen;assert.equal(JSON.stringify(f.sheets),original);f.sheets.Zahlungen=journal;
 assert.equal(f.overview().zahlungen[0].datum,'2026-10-12');assert.equal(f.locks.acquired,f.locks.released);
});
test('same payment retry is idempotent; reused ID with different data rejected',()=>{
 const f=fixture(),p=f.payload();assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.sheets.Zahlungen.getLastRow(),2);p.notiz='changed';assert.equal(f.post('recordPayment',p).ok,false);
});
test('one bank transfer allocates three service kinds in a single row',()=>{
 const f=fixture(),items=f.overview().positionen;
 const p={id:'payment_bank_123456',datum:'2026-10-13',betrag:146,positionen:items.map(x=>({...x,betragCent:x.offenCent})),notiz:'Gesamtüberweisung'};
 assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.sheets.Zahlungen.getLastRow(),2);assert.equal(f.overview().zahlungen[0].positionen.length,3);assert.ok(f.overview().positionen.every(x=>x.offenCent===0));
});
test('flat mileage avoids trip double counting and missing rates prevent booking',()=>{
 const f=fixture();f.sheets.Arbeitszeiten.rows[1][19]='pauschal';f.sheets.Arbeitszeiten.rows[1][20]=15;
 const km=f.overview().positionen.filter(x=>x.art==='km'||x.art==='fahrt');assert.equal(km.length,1);assert.equal(km[0].gesamtCent,1500);
 assert.equal(f.post('recordPayment',f.payload(10,'payment_flat_1234','km')).ok,true);assert.equal(f.overview().positionen.find(x=>x.art==='km').offenCent,500);
 const g=fixture();g.sheets.Stundenlohn.rows.length=1;const p=g.payload();assert.equal(p.positionen[0].gesamtCent,null);assert.equal(g.post('recordPayment',p).ok,false);assert.equal(g.sheets.Zahlungen,undefined);
});
test('overpayment, stale valuation, duplicate allocation, total mismatch and impossible date write nothing',()=>{
 for(const modify of [p=>p.positionen[0].betragCent=10001,p=>p.positionen[0].gesamtCent++,p=>p.positionen.push(p.positionen[0]),p=>p.betrag=26,p=>p.datum='2026-02-30',p=>p.betrag=25.001,p=>p.positionen[0].betragCent=-1]){
  const f=fixture(),p=f.payload();modify(p);assert.equal(f.post('recordPayment',p).ok,false);assert.equal(f.sheets.Zahlungen,undefined);
 }
});
test('concurrent stale remainder cannot overpay and partial valuation survives rate change',()=>{
 const f=fixture(),stale=f.payload(80,'payment_stale_123');assert.equal(f.post('recordPayment',f.payload()).ok,true);assert.equal(f.post('recordPayment',stale).ok,false);
 f.sheets.Stundenlohn.rows[1][1]=30;assert.equal(f.overview().positionen.find(x=>x.art==='stunden').gesamtCent,10000);
});
test('paid journal day protected from update/delete/legacy resets',()=>{
 const f=fixture();f.post('recordPayment',f.payload());
 for(const [a,p] of [['update',{originalDatum:'2026-10-01'}],['delete',{datum:'2026-10-01'}],['setLeistungBezahlt',{datum:'2026-10-01',art:'stunden',bezahlt:false}],['setBezahlt',{daten:['2026-10-01'],bezahlt:false}]])assert.equal(f.post(a,p).ok,false);
});
test('legacy paid item remains paid with unknown date; cross-year open items included',()=>{
 const f=fixture();f.sheets.Arbeitszeiten.rows[1][12]=true;f.sheets.Arbeitszeiten.rows[1][16]=100;
 assert.equal(f.overview().positionen.find(x=>x.art==='stunden').offenCent,0);assert.equal(f.overview().positionen.find(x=>x.art==='stunden').zahlungen.length,0);
 const row=[...f.sheets.Arbeitszeiten.rows[1]];row[0]='old';row[1]='2025-01-01';row[12]=false;row[15]='[]';f.sheets.Arbeitszeiten.rows.push(row);assert.ok(f.overview().positionen.some(p=>p.datum==='2025-01-01'));
});

test('reversal preserves original journal and all service data, restores open amounts and is idempotent',()=>{
 const f=fixture(),before=JSON.stringify(f.sheets),p=f.payload();
 assert.equal(f.post('recordPayment',p).ok,true);
 const original=JSON.stringify(f.sheets.Zahlungen.rows[1]);
 assert.equal(f.post('reversePayment',{id:p.id,datum:'2026-10-19'}).ok,true);
 assert.equal(JSON.stringify(f.sheets.Zahlungen.rows[1]),original);
 const overview=f.overview();assert.equal(overview.zahlungen.length,2);
 assert.equal(overview.zahlungen[1].stornoVon,p.id);assert.equal(overview.zahlungen[1].betrag,-25);
 const item=overview.positionen.find(x=>x.art==='stunden');assert.equal(item.bezahltCent,0);assert.equal(item.offenCent,10000);
 assert.equal(f.ctx.init_(2026).eintraegeJahr[0].journalLock,false);
 assert.doesNotThrow(()=>f.ctx.protectJournalEntry_('2026-10-01'));
 assert.equal(f.post('reversePayment',{id:p.id,datum:'2026-10-20'}).ok,true);
 assert.equal(f.sheets.Zahlungen.rows.length,3);
 assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.sheets.Zahlungen.rows.length,3);
 const journal=f.sheets.Zahlungen;delete f.sheets.Zahlungen;assert.equal(JSON.stringify(f.sheets),before);f.sheets.Zahlungen=journal;
 assert.equal(f.locks.acquired,f.locks.released);
});

test('reversing one of multiple payments retains remaining payment, lock and frozen valuation',()=>{
 const f=fixture(),a=f.payload(25,'payment_first_123'),b=f.payload(30,'payment_second_123');
 f.post('recordPayment',a);f.post('recordPayment',b);
 assert.equal(f.post('reversePayment',{id:a.id,datum:'2026-10-19'}).ok,true);
 f.sheets.Stundenlohn.rows[1][1]=30;
 let item=f.overview().positionen.find(x=>x.art==='stunden');assert.equal(item.gesamtCent,10000);assert.equal(item.bezahltCent,3000);assert.equal(item.offenCent,7000);
 assert.throws(()=>f.ctx.protectJournalEntry_('2026-10-01'));
 f.post('reversePayment',{id:b.id,datum:'2026-10-19'});
 item=f.overview().positionen.find(x=>x.art==='stunden');assert.equal(item.gesamtCent,15000);assert.equal(item.bezahltCent,0);
});

test('unknown payment, reversal of reversal, impossible/early dates and reserved IDs write nothing',()=>{
 const f=fixture(),p=f.payload();f.post('recordPayment',p);
 for(const data of [{id:'missing_123456789',datum:'2026-10-19'},{id:p.id,datum:'2026-02-30'},{id:p.id,datum:'2026-10-01'}]){
  assert.equal(f.post('reversePayment',data).ok,false);assert.equal(f.sheets.Zahlungen.rows.length,2);
 }
 f.post('reversePayment',{id:p.id,datum:'2026-10-19'});
 assert.equal(f.post('reversePayment',{id:'storno_'+p.id,datum:'2026-10-19'}).ok,false);
 assert.equal(f.sheets.Zahlungen.rows.length,3);
 assert.equal(f.post('recordPayment',f.payload(25,'storno_reserved_123')).ok,false);
});

test('all legacy payment writes blocked even with empty journal',()=>{
 const f=fixture(),before=JSON.stringify(f.sheets);
 for(const action of ['setBezahlt','setLeistungBezahlt'])assert.equal(f.post(action,{datum:'2026-10-01',art:'stunden',bezahlt:true,daten:['2026-10-01']}).ok,false);
 assert.equal(JSON.stringify(f.sheets),before);
});

test('inconsistent valuation or aggregate overpayment in stored journal blocks overview',()=>{
 for(const change of [data=>data[0].gesamtCent++,data=>data[0].betragCent=8000]){
  const f=fixture();f.post('recordPayment',f.payload(25,'payment_first_123'));f.post('recordPayment',f.payload(25,'payment_second_123'));
  const row=f.sheets.Zahlungen.rows[2],data=JSON.parse(row[3]);change(data);row[2]=data[0].betragCent/100;row[3]=JSON.stringify(data);
  assert.throws(()=>f.overview());
 }
});

test('corrupt, unlinked negative and duplicate reversal journal rows fail closed',()=>{
 for(const corrupt of [
  rows=>rows[1][2]=-25,
  rows=>rows[2][3]=JSON.stringify({...JSON.parse(rows[2][3]),stornoVon:'missing'}),
  rows=>rows.push([...rows[2]]),
  rows=>{const data=JSON.parse(rows[2][3]);data.positionen[0].betragCent=-2000;rows[2][3]=JSON.stringify(data);},
  rows=>rows[0][0]='unexpected'
 ]){
  const f=fixture(),p=f.payload();f.post('recordPayment',p);f.post('reversePayment',{id:p.id,datum:'2026-10-19'});
  corrupt(f.sheets.Zahlungen.rows);assert.throws(()=>f.overview());
  const before=JSON.stringify(f.sheets.Zahlungen.rows);assert.equal(f.post('reversePayment',{id:p.id,datum:'2026-10-19'}).ok,false);assert.equal(JSON.stringify(f.sheets.Zahlungen.rows),before);
 }
});

test('bank-transfer reversal restores all allocations and new payment can use restored remainder',()=>{
 const f=fixture(),items=f.overview().positionen;
 const p={id:'payment_bank_123456',datum:'2026-10-13',betrag:146,positionen:items.map(x=>({...x,betragCent:x.offenCent})),notiz:''};
 assert.equal(f.post('recordPayment',p).ok,true);
 assert.equal(f.post('reversePayment',{id:p.id,datum:'2026-10-19'}).ok,true);
 assert.ok(f.overview().positionen.every(x=>x.bezahltCent===0&&x.offenCent===x.gesamtCent));
 assert.equal(f.post('recordPayment',f.payload(25,'payment_new_12345')).ok,true);
 assert.equal(f.overview().positionen.find(x=>x.art==='stunden').bezahltCent,2500);
});

test('frontend loads empty backend, books partial payment and confirms reversal through real backend functions',async()=>{
 const f=fixture(),elements=new Map();
 const element=()=>({value:'',textContent:'',disabled:false,children:[],style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},append(...xs){this.children.push(...xs)},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}});
 const ui=vm.createContext({console,Date,URLSearchParams,Set,Map,Number,String,Math,Promise,setTimeout,clearTimeout,
  document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element},localStorage:{getItem(){return null}},confirm:()=>true,
  fetch(){throw Error('Real network forbidden')},
  backendRead:action=>action==='paymentOverview'?f.overview():JSON.parse(JSON.stringify(f.ctx.init_(2026))),
  backendWrite:(action,payload)=>{const result=f.post(action,JSON.parse(JSON.stringify(payload)));if(!result.ok)throw Error(result.message);}
 });
 vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8').replace('\ninit();','\n// offline startup'),ui);
 const run=code=>vm.runInContext(code,ui);
 run(`renderKalender=()=>{};renderStatistik=()=>{};renderMonatsGrid=()=>{};renderZahlungsHistorie=()=>{};renderJournalAuswahl=()=>{};renderZahlungsEntwurf=()=>{};
 state.kalenderDatum=new Date(2026,9,1);state.cacheJahr=2026;
 ladeJahr=async()=>{state.jahresBestaetigung={jahr:2026,seq:ladeSequenz};state.jahresLadezustand='bereit';return state.jahresBestaetigung};
 jsonp=async({action})=>backendRead(action);schreiben=async(action,payload)=>backendWrite(action,payload);`);
 await run('ladeJahr();zahlungenLaden()');
 assert.equal(run('state.paymentJournal.length'),0);assert.equal(run('state.paymentPositionen.every(p=>p.bezahltCent===0)'),true);
 run(`$('zahlungDatumNeu').value='2026-10-12';$('zahlungBetragNeu').value='25,00';state.paymentEntwurf=[{p:state.paymentPositionen.find(p=>p.art==='stunden'),cent:2500}];`);
 await run('zahlungBuchenNeu()');assert.equal(f.overview().positionen.find(p=>p.art==='stunden').bezahltCent,2500);
 await run('zahlungStornierenNeu(state.paymentJournal.find(p=>p.betrag>0))');
 assert.equal(run('state.paymentJournal.length'),2);assert.equal(run('state.paymentJournal.some(p=>p.stornoVon)'),true);
 assert.equal(run('state.paymentPositionen.every(p=>p.bezahltCent===0)'),true);
 assert.equal(run('offeneStornierung'),null);
});

function releaseFixture(){
 const f=fixture(),ss=f.ctx.SpreadsheetApp.getActive();ss.getId=()=> 'synthetic-sheet';
 f.ctx.SpreadsheetApp.getActive=()=>ss;
 f.ctx.Utilities.DigestAlgorithm={SHA_256:'SHA_256'};
 f.ctx.Utilities.computeDigest=(_,value)=>Array.from(require('node:crypto').createHash('sha256').update(value).digest());
 f.ctx.Logger={log(){}};return {...f,ss};
}

test('editor write pause blocks all POST actions, records failure Ack and keeps reads available',()=>{
 const f=releaseFixture(),before=JSON.stringify(f.sheets);f.ctx.janeSchreibpauseAktivieren();
 for(const action of ['save','update','delete','recordPayment','reversePayment','saveStartAdresse','saveFahrziel','deleteFahrziel','saveStundenlohn','saveKilometersatz','setBezahlt','setLeistungBezahlt']){
  const result=f.post(action,{});assert.equal(result.ok,false);assert.match(result.message,/vorübergehend gesperrt/);
 }
 assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.overview().ok,true);
 const ack=f.ctx.PropertiesService.getScriptProperties().getProperty('jane_ack_request_123456789');assert.equal(JSON.parse(ack).ok,false);
 const status=f.ctx.janeReleaseStatus_();assert.equal(status.writePaused,true);
 assert.equal(status.bindingSha256,require('node:crypto').createHash('sha256').update('synthetic-sheet').digest('hex'));
 assert.equal(f.locks.acquired,f.locks.released);
});

test('unpause requires matching table binding and a completely cleared payment state',()=>{
 for(const dirty of [
  f=>{f.sheets.Arbeitszeiten.rows[1][12]=true;},
  f=>{f.sheets.Arbeitszeiten.rows[1][16]=100;},
  f=>{f.sheets.Arbeitszeiten.rows[1][18]=5;},
  f=>{f.sheets.Fahrten.rows[1][7]=5;},
  f=>{f.sheets.Arbeitszeiten.rows[1][15]=JSON.stringify([{id:'s1',name:'Extra',betrag:1,bezahlt:false,fixbetrag:1}]);},
  f=>{f.ss.getId=()=> 'wrong-sheet';},
  f=>{f.ctx.recordPayment_(f.payload());}
 ]){
  const f=releaseFixture();f.ctx.janeSchreibpauseAktivieren();dirty(f);
  assert.throws(()=>f.ctx.janeSchreibpauseBeenden());assert.equal(f.ctx.janeReleaseStatus_().writePaused,true);
 }
});

test('clean reset can be unpaused without changing any table data',()=>{
 const f=releaseFixture();assert.throws(()=>f.ctx.janeSchreibpauseBeenden());
 const before=JSON.stringify(f.sheets);f.ctx.janeSchreibpauseAktivieren();f.ctx.janeSchreibpauseBeenden();
 assert.equal(f.ctx.janeReleaseStatus_().writePaused,false);assert.equal(JSON.stringify(f.sheets),before);
 assert.equal(f.post('recordPayment',f.payload()).ok,true);
});

test('releaseStatus read endpoint identifies the prepared code and exposes no raw spreadsheet ID',()=>{
 const f=releaseFixture();const text=f.ctx.doGet({parameter:{action:'releaseStatus',callback:'check'}}).text;
 const status=JSON.parse(text.slice(6,-2));assert.equal(status.backendRevision,'jane-zahlungsneustart-20261019-r3');
 assert.equal(status.writePaused,false);assert.equal(text.includes('synthetic-sheet'),false);
});
