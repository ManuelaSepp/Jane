// Append-only journal. Existing rows, paid flags, rates and templates are untouched.
const PAYMENT_SHEET = 'Zahlungen';
const PAYMENT_HEADERS = ['ID','Zahlungsdatum','Betrag','Zuordnung_JSON','Notiz','Erstellt_am'];
function paymentRows_() {
  const sh=SpreadsheetApp.getActive().getSheetByName(PAYMENT_SHEET);
  if(!sh || sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,6).getValues().map(r=>({
    id:String(r[0]),datum:toIsoDate_(r[1]),betrag:Number(r[2]),positionen:JSON.parse(r[3]),notiz:String(r[4]||'')
  }));
}
function paymentKey_(p){return JSON.stringify([p.datum,p.art,p.id||'']);}
function paymentCents_(v){
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000000)throw new Error('Ungültiger Geldbetrag.');
  const c=Math.round(v*100);
  if(Math.abs(v*100-c)>0.00001)throw new Error('Höchstens zwei Nachkommastellen erlaubt.');
  return c;
}
function paymentDate_(d){
  if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||toIsoDate_(parseIsoDate_(d))!==d)throw new Error('Ungültiges Zahlungsdatum.');
  return d;
}
function paymentItems_(entries,journal) {
  const ss=SpreadsheetApp.getActive(),result=[];
  const rates=readStundenloehne_(ss.getSheetByName(SHEET_STUNDENLOHN));
  const kmRates=readKilometersaetze_(ss.getSheetByName(SHEET_KM_SATZ));
  const rate=(list,d,key)=>{let v=null;list.forEach(x=>{if(x.ab<=d)v=Number(x[key]);});return v;};
  const paid=new Map();
  journal.forEach(z=>z.positionen.forEach(p=>{const k=paymentKey_(p),a=paid.get(k)||[];a.push({...p,zahlungsdatum:z.datum,zahlungId:z.id});paid.set(k,a);}));
  for(const e of entries){
    const add=(art,id,label,total,legacy)=>{
      const p={datum:e.datum,art,id:id||'',label};
      const records=paid.get(paymentKey_(p))||[];
      // Freeze the entire item valuation at its first partial payment.
      const cents=records.length?records[0].gesamtCent:(total===null?null:Math.round(total*100));
      if(cents===0)return;
      const paidCent=legacy?(cents||0):records.reduce((s,x)=>s+x.betragCent,0);
      result.push({...p,gesamtCent:cents,bezahltCent:paidCent,offenCent:cents===null?null:Math.max(0,cents-paidCent),altBezahlt:!!legacy,zahlungen:records});
    };
    const h=rate(rates,e.datum,'lohn'),km=rate(kmRates,e.datum,'satz');
    if(!e.abwesenheit&&e.stunden>0)add('stunden','','Arbeitsstunden',e.bezahlt&&e.stundenFix!=null?e.stundenFix:h===null?null:e.stunden*h,e.bezahlt);
    if(e.kmModus==='pauschal'||e.kmBezahlt||!e.fahrten.length){
      add('km','','Fahrtkosten',e.kmBezahlt&&e.kmFix!=null?e.kmFix:e.kmModus==='pauschal'?e.kmPauschal:e.kilometer===0?0:km===null?null:e.kilometer*km,e.kmBezahlt);
    }else e.fahrten.forEach(f=>add('fahrt',f.id,'Fahrt: '+f.fahrziel,f.bezahlt&&f.fixbetrag!=null?f.fixbetrag:km===null?null:f.kilometer*km,f.bezahlt));
    (e.sonderleistungen||[]).forEach(x=>add('sonder',x.id,'Sonderleistung: '+x.name,x.bezahlt&&x.fixbetrag!=null?x.fixbetrag:x.betrag,x.bezahlt));
  }
  return result.sort((a,b)=>a.datum.localeCompare(b.datum)||paymentKey_(a).localeCompare(paymentKey_(b)));
}
function paymentOverview_(){
  const ss=SpreadsheetApp.getActive(),journal=paymentRows_();
  return {ok:true,paymentVersion:1,positionen:paymentItems_(readEntries_(ss.getSheetByName(SHEET_ARBEITSZEITEN),ss.getSheetByName(SHEET_FAHRTEN),null),journal),zahlungen:journal};
}
function protectJournalEntry_(datum){
  if(paymentRows_().some(z=>z.positionen.some(p=>p.datum===datum)))throw new Error('Dieser Tag enthält journalisierte Zahlungen und ist gegen Änderung, Löschung und alte Zahlungsmarkierungen geschützt.');
}
function paymentEnrich_(entries){
  const items=paymentItems_(entries,paymentRows_());
  return entries.map(e=>{
    const positions=items.filter(p=>p.datum===e.datum);
    const hours=positions.find(p=>p.art==='stunden'),km=positions.filter(p=>p.art==='km'||p.art==='fahrt');
    return {...e,paymentItems:positions,journalLock:positions.some(p=>p.zahlungen.length),
      bezahlt:hours?hours.offenCent===0:e.bezahlt,
      stundenFix:hours&&hours.zahlungen.length?hours.gesamtCent/100:e.stundenFix,
      kmBezahlt:km.length?km.every(p=>p.offenCent===0):e.kmBezahlt,
      sonderleistungen:e.sonderleistungen.map(x=>{const p=positions.find(p=>p.art==='sonder'&&p.id===x.id);return {...x,zahlungsBetrag:p&&p.gesamtCent!==null?p.gesamtCent/100:x.betrag,bezahlt:p?p.offenCent===0:x.bezahlt,fixbetrag:p&&p.zahlungen.length?p.gesamtCent/100:x.fixbetrag};})};
  });
}
function recordPayment_(p){
  if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{12,100}$/.test(p.id))throw new Error('Ungültige Zahlungs-ID.');
  paymentDate_(p.datum);
  const total=paymentCents_(p.betrag);
  if(total<=0)throw new Error('Zahlungsbetrag muss positiv sein.');
  if(!Array.isArray(p.positionen)||!p.positionen.length||p.positionen.length>200)throw new Error('Bitte 1 bis 200 Leistungen auswählen.');
  const note=String(p.notiz||'').trim();if(note.length>500||/^[=+@]/.test(note))throw new Error('Notiz zu lang oder beginnt mit einem Formelzeichen.');
  const journal=paymentRows_(),existing=journal.find(x=>x.id===p.id);
  // Retry of the same immutable request is safe; a changed payload is rejected.
  const signature=x=>JSON.stringify({datum:x.datum,betrag:x.betrag,notiz:String(x.notiz||'').trim(),positionen:x.positionen.map(a=>({datum:a.datum,art:a.art,id:a.id||'',betragCent:a.betragCent,gesamtCent:a.gesamtCent}))});
  if(existing){if(signature(existing)!==signature(p))throw new Error('Zahlungs-ID wurde bereits mit anderen Daten verwendet.');return;}
  const overview=paymentOverview_(),seen=new Set();let sum=0;
  const allocations=p.positionen.map(a=>{
    const key=paymentKey_(a);if(seen.has(key))throw new Error('Leistung doppelt ausgewählt.');seen.add(key);
    const item=overview.positionen.find(x=>paymentKey_(x)===key);
    if(!item||item.offenCent===null)throw new Error('Leistung fehlt oder Vergütung unbekannt.');
    if(!Number.isSafeInteger(a.betragCent)||a.betragCent<=0||a.betragCent>item.offenCent)throw new Error('Betrag überschreitet den offenen Rest. Bitte neu laden.');
    if(a.gesamtCent!==item.gesamtCent)throw new Error('Vergütung hat sich geändert. Vorschlag neu laden.');
    sum+=a.betragCent;
    return {datum:item.datum,art:item.art,id:item.id,label:item.label,betragCent:a.betragCent,gesamtCent:item.gesamtCent};
  });
  if(sum!==total)throw new Error('Zuordnungen müssen genau dem Überweisungsbetrag entsprechen.');
  const json=JSON.stringify(allocations);if(json.length>45000)throw new Error('Zu viele Zuordnungen. Zahlung aufteilen.');
  const ss=SpreadsheetApp.getActive(),sh=getOrCreateSheet_(ss,PAYMENT_SHEET);
  if(sh.getLastRow()===0)sh.getRange(1,1,1,6).setValues([PAYMENT_HEADERS]);
  else if(JSON.stringify(sh.getRange(1,1,1,6).getValues()[0])!==JSON.stringify(PAYMENT_HEADERS))throw new Error('Blatt Zahlungen hat ein unerwartetes Format.');
  // One write for the whole bank transfer: no partial batch across service rows.
  sh.getRange(sh.getLastRow()+1,1,1,6).setValues([[p.id,p.datum,p.betrag,json,note,new Date()]]);
  SpreadsheetApp.flush();
}
