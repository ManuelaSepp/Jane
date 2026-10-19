// Offline only. No Google API, network access, file writes or live apply function.
const {createHash}=require('node:crypto');
const AZ=['ID','Datum','Beginn','Ende','Stunden','Abwesenheit','Notiz','Fahrziel_ID','Fahrziel','Kilometer','Erstellt_am','Geändert_am','Bezahlt','Beginn_2','Ende_2','Sonderleistungen','Stunden_Fixbetrag','Km_Bezahlt','Km_Fixbetrag','Km_Modus','Km_Pauschalbetrag'];
const FR=['ID','Datum','Fahrziel_ID','Fahrziel','Kilometer','Erstellt_am','Bezahlt','Fixbetrag'];
// Historical repository schema only; current reversal schema must be inspected first.
const JOURNAL=['ID','Zahlungsdatum','Betrag','Zuordnung_JSON','Notiz','Erstellt_am'];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function check(sheet,headers,name){
 if(!sheet||JSON.stringify(sheet.headers)!==JSON.stringify(headers)||!Array.isArray(sheet.rows))throw Error('Ungeprüftes Schema: '+name);
 for(const row of sheet.rows)if(!Array.isArray(row)||row.length!==headers.length)throw Error('Ungültige Zeile: '+name);
}
function resetSonder(raw){
 if(raw===''||raw===null)return raw;
 if(typeof raw!=='string')throw Error('Sonderleistungen müssen JSON-Text sein');
 const list=JSON.parse(raw);
 if(!Array.isArray(list))throw Error('Sonderleistungen sind keine Liste');
 for(const item of list){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Ungültige Sonderleistung');
  const allowed=['id','name','betrag','bezahlt','fixbetrag'];
  if(Object.keys(item).some(k=>!allowed.includes(k)))throw Error('Ungeprüftes Sonderleistungsfeld');
  if('bezahlt' in item)item.bezahlt=false;
  if('fixbetrag' in item)item.fixbetrag=null;
 }
 return JSON.stringify(list);
}
function protectedData(snapshot){
 const s=JSON.parse(JSON.stringify(snapshot));
 for(const row of s.sheets.Arbeitszeiten.rows){
  for(const i of [12,16,17,18])row[i]=null;
  if(row[15]!==''&&row[15]!==null){
   const items=JSON.parse(row[15]);
   for(const item of items){delete item.bezahlt;delete item.fixbetrag;}
   row[15]=JSON.stringify(items);
  }
 }
 for(const row of s.sheets.Fahrten.rows){row[6]=null;row[7]=null;}
 if(s.sheets.Zahlungen)s.sheets.Zahlungen.rows=[];
 return s;
}
function planReset(snapshot){
 // All years and all sheets, including rates and settings, must be exported.
 if(snapshot?.format!=='jane-sheet-snapshot-v1'||!snapshot.spreadsheetId||!snapshot.sheets)throw Error('Vollständiger Rohdaten-Snapshot erforderlich');
 for(const name of ['Fahrziele','Einstellungen','Stundenlohn','Kilometerpauschale']){
  const sh=snapshot.sheets[name];
  if(!sh||!Array.isArray(sh.headers)||!Array.isArray(sh.rows))throw Error('Blatt fehlt: '+name);
 }
 check(snapshot.sheets.Arbeitszeiten,AZ,'Arbeitszeiten');
 check(snapshot.sheets.Fahrten,FR,'Fahrten');
 if(snapshot.sheets.Zahlungen)check(snapshot.sheets.Zahlungen,JOURNAL,'Zahlungen');
 // Unknown sheets may contain payment/reversal data: never silently leave them behind.
 const blank=snapshot.sheets.Tabellenblatt1;
 if(blank&&(!Array.isArray(blank.headers)||!Array.isArray(blank.rows)||[...blank.headers,...blank.rows.flat()].some(v=>v!==''&&v!==null)))throw Error('Tabellenblatt1 ist nicht leer');
 const known=['Arbeitszeiten','Fahrten','Fahrziele','Einstellungen','Stundenlohn','Kilometerpauschale','Zahlungen','Tabellenblatt1'];
 if(Object.keys(snapshot.sheets).some(n=>!known.includes(n)))throw Error('Ungeprüftes zusätzliches Blatt');
 const candidate=JSON.parse(JSON.stringify(snapshot));
 for(const row of candidate.sheets.Arbeitszeiten.rows){row[12]=false;row[16]='';row[17]=false;row[18]='';row[15]=resetSonder(row[15]);}
 for(const row of candidate.sheets.Fahrten.rows){row[6]=false;row[7]='';}
 const journalRows=candidate.sheets.Zahlungen?.rows.length||0;
 if(candidate.sheets.Zahlungen)candidate.sheets.Zahlungen.rows=[];
 const before=hash(protectedData(snapshot)),after=hash(protectedData(candidate));
 if(before!==after)throw Error('Erhaltungsprüfung fehlgeschlagen');
 return {status:'OFFLINE_CANDIDATE_ONLY_NOT_APPROVED',sourceSha256:hash(snapshot),protectedSha256:before,
  counts:{arbeitszeiten:candidate.sheets.Arbeitszeiten.rows.length,fahrten:candidate.sheets.Fahrten.rows.length,journalRowsToClear:journalRows},candidate};
}
module.exports={planReset,AZ,FR,JOURNAL};
