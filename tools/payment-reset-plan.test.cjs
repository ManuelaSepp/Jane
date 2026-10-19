const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planReset,AZ,FR,JOURNAL}=require('./payment-reset-plan.cjs');
function fixture(){
 const az=AZ.map(()=>''),fr=FR.map(()=>'');
 Object.assign(az,{0:'day1',1:'2025-10-01',2:'08:00',3:'16:00',4:8,9:23,12:true,13:'17:00',14:'18:00',15:JSON.stringify([{id:'s1',name:'Dienst',betrag:30,bezahlt:true,fixbetrag:30}]),16:160,17:true,18:6.9,19:'pauschal',20:12});
 Object.assign(fr,{0:'trip1',1:'2025-10-01',2:'target1',3:'Ziel',4:23,5:'timestamp',6:true,7:6.9});
 const sheets={Arbeitszeiten:{headers:AZ,rows:[az]},Fahrten:{headers:FR,rows:[fr]},Zahlungen:{headers:JOURNAL,rows:[['payment1','2026-10-01',40,'[]','','timestamp']]}};
 for(const name of ['Fahrziele','Einstellungen','Stundenlohn','Kilometerpauschale'])sheets[name]={headers:['preserved'],rows:[[19.5]]};
 return {format:'jane-sheet-snapshot-v1',spreadsheetId:'synthetic-only',sheets};
}
test('all-year candidate clears only payment fields and preserves service data and input',()=>{
 const input=fixture(),before=JSON.stringify(input),p=planReset(input),r=p.candidate.sheets.Arbeitszeiten.rows[0];
 assert.equal(JSON.stringify(input),before);
 assert.equal(r[12],false);assert.equal(r[16],'');assert.equal(r[17],false);assert.equal(r[18],'');
 for(const i of [0,1,2,3,4,9,13,14,19,20])assert.equal(r[i],input.sheets.Arbeitszeiten.rows[0][i]);
 assert.deepEqual(JSON.parse(r[15]),[{id:'s1',name:'Dienst',betrag:30,bezahlt:false,fixbetrag:null}]);
 assert.deepEqual(p.candidate.sheets.Fahrten.rows[0].slice(0,6),input.sheets.Fahrten.rows[0].slice(0,6));
 for(const name of ['Fahrziele','Einstellungen','Stundenlohn','Kilometerpauschale'])assert.deepEqual(p.candidate.sheets[name],input.sheets[name]);
 assert.equal(p.candidate.sheets.Zahlungen.rows.length,0);
 assert.equal(p.counts.journalRowsToClear,1);
});
test('empty historical journal and repeated planning are safe',()=>{
 const p=planReset(fixture());assert.deepEqual(planReset(p.candidate).candidate,p.candidate);
 const s=fixture();delete s.sheets.Zahlungen;assert.equal(planReset(s).counts.journalRowsToClear,0);
});
test('unknown columns, reversal schemas, additional sheets and truncated rows abort',()=>{
 for(const mutate of [s=>s.sheets.Zahlungen.headers=[...JOURNAL,'Storno_von'],s=>s.sheets.Arbeitszeiten.headers=[...AZ,'Extra'],s=>s.sheets.Stornos={headers:[],rows:[]},s=>s.sheets.Fahrten.rows[0].pop()]){
  const s=fixture();mutate(s);assert.throws(()=>planReset(s));
 }
});
test('malformed special services never silently become empty',()=>{
 for(const raw of ['broken','{}','[null]','[{"bezahltCent":100}]']){
  const s=fixture();s.sheets.Arbeitszeiten.rows[0][15]=raw;assert.throws(()=>planReset(s));
 }
});
test('incomplete snapshots abort before proposing changes',()=>{
 for(const key of ['spreadsheetId','format']){const s=fixture();delete s[key];assert.throws(()=>planReset(s));}
 const s=fixture();delete s.sheets.Stundenlohn;assert.throws(()=>planReset(s));
});
