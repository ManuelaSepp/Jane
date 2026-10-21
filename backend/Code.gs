const SHEET_ARBEITSZEITEN = 'Arbeitszeiten';
const SHEET_FAHRZIELE = 'Fahrziele';
const SHEET_EINSTELLUNGEN = 'Einstellungen';
const SHEET_STUNDENLOHN = 'Stundenlohn';
const SHEET_FAHRTEN = 'Fahrten';
const TZ = 'Europe/Berlin';
const COL_BEZAHLT = 13;
const COL_BEGINN_2 = 14;
const COL_ENDE_2 = 15;
const COL_SONDERLEISTUNGEN = 16;
const COL_STUNDEN_FIX = 17; // eingefrorener Stundenbetrag bei bezahlt
const COL_KM_BEZAHLT = 18;
const COL_KM_FIX = 19; // eingefrorener Kilometerbetrag bei bezahlt
const COL_KM_MODUS = 20; // km oder pauschal
const COL_KM_PAUSCHAL = 21;
const SHEET_KM_SATZ = 'Kilometerpauschale';
const FAHRT_COLS = 8; // zwei zusätzliche Spalten für Einzelzahlung
const ENTRY_COLS = 21;
function setupArbeitszeitFahrtenSheet() {
  const ss = SpreadsheetApp.getActive();
  const az = getOrCreateSheet_(ss, SHEET_ARBEITSZEITEN);
  const fz = getOrCreateSheet_(ss, SHEET_FAHRZIELE);
  const es = getOrCreateSheet_(ss, SHEET_EINSTELLUNGEN);
  const sl = getOrCreateSheet_(ss, SHEET_STUNDENLOHN);
  const fr = getOrCreateSheet_(ss, SHEET_FAHRTEN);
  const kp = getOrCreateSheet_(ss, SHEET_KM_SATZ);
  if (az.getLastRow() === 0) {
    az.getRange(1, 1, 1, 13).setValues([[
      'ID','Datum','Beginn','Ende','Stunden','Abwesenheit','Notiz',
      'Fahrziel_ID','Fahrziel','Kilometer','Erstellt_am','Geändert_am','Bezahlt'
    ]]);
  } else if (String(az.getRange(1, COL_BEZAHLT).getValue() || '').trim() !== 'Bezahlt') {
    az.getRange(1, COL_BEZAHLT).setValue('Bezahlt');
  }
  // Zusatzspalten rechts anfügen: vorhandene Spalten A–M bleiben unverändert.
  az.getRange(1, COL_BEGINN_2, 1, 8).setValues([['Beginn_2','Ende_2','Sonderleistungen','Stunden_Fixbetrag','Km_Bezahlt','Km_Fixbetrag','Km_Modus','Km_Pauschalbetrag']]);
  if (kp.getLastRow() === 0) kp.getRange(1,1,1,3).setValues([['Gültig_ab','Euro_pro_km','Geändert_am']]);
  if (fz.getLastRow() === 0) {
    fz.getRange(1, 1, 1, 7).setValues([[
      'ID','Bezeichnung','Adresse','Einfache_km','Hin_Rueck_km','Aktiv','Letzte_Berechnung'
    ]]);
  }
  if (es.getLastRow() === 0) {
    es.getRange(1, 1, 1, 2).setValues([['Schlüssel','Wert']]);
    es.appendRow(['Startadresse','']);
  }
  if (sl.getLastRow() === 0) {
    sl.getRange(1, 1, 1, 3).setValues([['Gültig_ab','Stundenlohn','Geändert_am']]);
  }
  if (fr.getLastRow() === 0) {
    fr.getRange(1, 1, 1, 6).setValues([[
      'ID','Datum','Fahrziel_ID','Fahrziel','Kilometer','Erstellt_am'
    ]]);
  }
  fr.getRange(1,7,1,2).setValues([['Bezahlt','Fixbetrag']]);
  migriereBestehendeFahrten_(az, fr);
  migriereBezahlteStunden_(az, sl);
  [az,fz,es,sl,fr,kp].forEach(sh=>{
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,sh.getLastColumn()).setFontWeight('bold').setBackground('#70ad47').setFontColor('#ffffff');
    sh.autoResizeColumns(1, sh.getLastColumn());
  });
  az.getRange('E:E').setNumberFormat('0.00');
  fz.getRange('D:E').setNumberFormat('0.0');
  az.getRange('J:J').setNumberFormat('0.0');
  sl.getRange('B:B').setNumberFormat('0.00 €');
  sl.getRange('C:C').setNumberFormat('dd.MM.yyyy HH:mm:ss');
  fr.getRange('B:B').setNumberFormat('dd.MM.yyyy');
  fr.getRange('E:E').setNumberFormat('0.0');
  fr.getRange('F:F').setNumberFormat('dd.MM.yyyy HH:mm:ss');
  kp.getRange('B:B').setNumberFormat('0.00 €');
  if (az.getLastRow() > 1) {
    const bezahltRange = az.getRange(2, COL_BEZAHLT, az.getLastRow()-1, 1);
    bezahltRange.insertCheckboxes();
    const vals = bezahltRange.getValues().map(r=>[r[0] === true]);
    bezahltRange.setValues(vals);
    const kmPaidRange=az.getRange(2,COL_KM_BEZAHLT,az.getLastRow()-1,1);
    const kmPaidValues=kmPaidRange.getValues().map(r=>[r[0]===true]);
    kmPaidRange.insertCheckboxes();
    kmPaidRange.setValues(kmPaidValues);
  }
}
function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'init');
  const callbackRoh = String((e && e.parameter && e.parameter.callback) || 'callback');
  const callback = /^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/.test(callbackRoh) ? callbackRoh : 'callback';
  let result;
  try {
    if (!janeZugangOk_(e)) {
      result = { ok:false, zugang:false, message:'Kein Zugriff.' };
    } else if (action === 'releaseStatus') {
      result = janeReleaseStatus_();
    } else if (action === 'paymentOverview') {
      result = paymentOverview_();
    } else if (action === 'init') {
      result = init_(Number(e.parameter.jahr) || new Date().getFullYear());
    } else if (action === 'route') {
      result = route_(String(e.parameter.start || ''), String(e.parameter.ziel || ''));
    } else if (action === 'writeStatus') {
      const id=String(e.parameter.requestId||'');
      if (!/^[A-Za-z0-9_-]{12,100}$/.test(id)) throw new Error('Ungültige Anfragenummer.');
      const key='jane_ack_'+id;
      const props=PropertiesService.getScriptProperties();
      const value=props.getProperty(key);
      result=value?{done:true,...JSON.parse(value)}:{done:false};
    } else {
      throw new Error('Unbekannte Aktion: ' + action);
    }
  } catch (err) {
    result = { ok:false, message:String(err && err.message ? err.message : err) };
  }
  const json = JSON.stringify(result);
  return ContentService.createTextOutput(callback + '(' + json + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function doPost(e) {
  if (!janeZugangOk_(e)) {
    // Ohne gültigen Schlüssel: nichts sperren, nichts schreiben, keine Quittung speichern.
    return ContentService.createTextOutput(JSON.stringify({ok:false,zugang:false,message:'Kein Zugriff.'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  let result;
  const lock=LockService.getScriptLock();
  let locked=false;
  try {
    lock.waitLock(30000);locked=true;
    if (PropertiesService.getScriptProperties().getProperty('JANE_WRITE_PAUSE') === 'true') throw new Error('Jane wird gerade umgestellt. Speichern ist vorübergehend gesperrt.');
    const action = String((e && e.parameter && e.parameter.action) || '');
    const payload = JSON.parse(String((e && e.parameter && e.parameter.payload) || '{}'));
    if (action === 'setBezahlt' || action === 'setLeistungBezahlt') throw new Error('Alter Zahlungsstatus deaktiviert. Bitte das Zahlungsjournal verwenden.');
    if (action === 'update' || action === 'delete') protectJournalEntry_(String(payload.originalDatum||payload.datum||''));
    if (action === 'recordPayment') recordPayment_(payload);
    else if (action === 'reversePayment') reversePayment_(payload);
    else if (action === 'save') saveEntry_(payload);
    else if (action === 'update') updateEntry_(payload);
    else if (action === 'delete') deleteEntry_(payload);
    else if (action === 'saveStartAdresse') saveSetting_('Startadresse', String(payload.adresse || ''));
    else if (action === 'saveFahrziel') saveFahrziel_(payload);
    else if (action === 'deleteFahrziel') deleteFahrziel_(payload);
    else if (action === 'setBezahlt') setBezahlt_(payload);
    else if (action === 'saveStundenlohn') saveStundenlohn_(payload);
    else if (action === 'saveKilometersatz') saveKilometersatz_(payload);
    else if (action === 'setLeistungBezahlt') setLeistungBezahlt_(payload);
    else throw new Error('Unbekannte Aktion: ' + action);
    result = {ok:true};
  } catch (err) {
    result = {ok:false, message:String(err && err.message ? err.message : err)};
  }
  if(locked)lock.releaseLock();
  const requestId=String((e && e.parameter && e.parameter.requestId)||'');
  if (/^[A-Za-z0-9_-]{12,100}$/.test(requestId))
    PropertiesService.getScriptProperties().setProperty('jane_ack_'+requestId,JSON.stringify(result));
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
function init_(jahr) {
  const ss = SpreadsheetApp.getActive();
  const az = ss.getSheetByName(SHEET_ARBEITSZEITEN);
  const fz = ss.getSheetByName(SHEET_FAHRZIELE);
  const es = ss.getSheetByName(SHEET_EINSTELLUNGEN);
  const sl = ss.getSheetByName(SHEET_STUNDENLOHN);
  const fr = ss.getSheetByName(SHEET_FAHRTEN);
  const kp = ss.getSheetByName(SHEET_KM_SATZ);
  if (!az || !fz || !es || !sl || !fr) throw new Error('Bitte zuerst setupArbeitszeitFahrtenSheet() ausführen.');
  return {
    ok:true,
    paymentVersion:1,
    eintraegeJahr: paymentEnrich_(readEntries_(az, fr, jahr)),
    fahrziele: readFahrziele_(fz),
    startAdresse: readSetting_(es, 'Startadresse'),
    stundenloehne: readStundenloehne_(sl),
    kilometersaetze: readKilometersaetze_(kp)
  };
}
function readEntries_(sheet, fahrtenSheet, jahr) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2,1,lastRow-1,ENTRY_COLS).getValues();
  const fahrtenNachDatum = readFahrten_(fahrtenSheet, jahr);
  return values.map(r=>{
    const datumIso = toIsoDate_(r[1]);
    let fahrten = fahrtenNachDatum[datumIso] || [];
    if (!fahrten.length && (String(r[7] || '').trim() || String(r[8] || '').trim()) && Number(r[9] || 0) > 0) {
      fahrten = [{
        id:'legacy_' + datumIso,
        fahrzielId:String(r[7] || ''),
        fahrziel:String(r[8] || ''),
        kilometer:Number(r[9] || 0)
      }];
    }
    const kilometer = fahrten.reduce((sum,f)=>sum + Number(f.kilometer || 0), 0);
    const fahrzielText = fahrten.map(f=>f.fahrziel).filter(Boolean).join(' · ');
    return {
      id:String(r[0] || ''), datum:datumIso, beginn:toTime_(r[2]), ende:toTime_(r[3]),
        beginn2:toTime_(r[13]), ende2:toTime_(r[14]),
      sonderleistungen:parseSonderleistungen_(r[15]),
      stundenFix:r[16] === '' ? null : Number(r[16]),
      kmBezahlt:r[17] === true,kmFix:r[18] === '' ? null : Number(r[18]),
      kmModus:String(r[19]||'km'),kmPauschal:Number(r[20]||0),
      stunden:Number(r[4] || 0), abwesenheit:String(r[5] || ''), notiz:String(r[6] || ''),
      fahrzielId:fahrten.length===1 ? String(fahrten[0].fahrzielId || '') : '',
      fahrziel:fahrzielText,
      kilometer:kilometer,
      fahrten:fahrten,
      bezahlt:r[12] === true
    };
  }).filter(x=>x.datum && (jahr===null || Number(x.datum.slice(0,4)) === Number(jahr)));
}
function readFahrten_(sheet, jahr) {
  const result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;
  const values = sheet.getRange(2,1,sheet.getLastRow()-1,FAHRT_COLS).getValues();
  values.forEach(r=>{
    const datum = toIsoDate_(r[1]);
    if (!datum || (jahr!==null && Number(datum.slice(0,4)) !== Number(jahr))) return;
    if (!result[datum]) result[datum] = [];
    result[datum].push({
      id:String(r[0] || ''),
      fahrzielId:String(r[2] || ''),
      fahrziel:String(r[3] || ''),
      kilometer:Number(r[4] || 0),
      bezahlt:r[6]===true,fixbetrag:r[7]===''?null:Number(r[7])
    });
  });
  return result;
}
function readFahrziele_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2,1,lastRow-1,7).getValues().map(r=>({
    id:String(r[0] || ''), name:String(r[1] || ''), adresse:String(r[2] || ''),
    kmEinfach:Number(r[3] || 0), kmHinRueck:Number(r[4] || 0), aktiv:r[5] !== false
  })).filter(x=>x.id && x.name && x.aktiv);
}
function route_(start, ziel) {
  start = start.trim(); ziel = ziel.trim();
  if (!start) throw new Error('Startadresse fehlt.');
  if (!ziel) throw new Error('Zieladresse fehlt.');
  const directions = Maps.newDirectionFinder()
    .setOrigin(start)
    .setDestination(ziel)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setLanguage('de')
    .setRegion('de')
    .getDirections();
  if (!directions || !directions.routes || !directions.routes.length) {
    throw new Error('Google Maps konnte keine Fahrstrecke finden.');
  }
  const legs = directions.routes[0].legs || [];
  const meter = legs.reduce((sum, leg)=>sum + Number(leg.distance && leg.distance.value || 0), 0);
  if (!(meter > 0)) throw new Error('Google Maps hat keine Entfernung geliefert.');
  const kmEinfach = Math.round((meter / 1000) * 10) / 10;
  const kmHinRueck = Math.round((kmEinfach * 2) * 10) / 10;
  return {ok:true, kmEinfach:kmEinfach, kmHinRueck:kmHinRueck};
}
function saveEntry_(p) {
  validateEntry_(p);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_ARBEITSZEITEN);
  const fr = ss.getSheetByName(SHEET_FAHRTEN);
  if (findEntryRowByDate_(sh, p.datum)) throw new Error('Für dieses Datum gibt es bereits einen Eintrag.');
  const fahrten = normalizeFahrten_(p);
  const summary = fahrtenSummary_(fahrten);
  const now = new Date();
  sh.appendRow([
    'az_' + Date.now(), parseIsoDate_(p.datum), cleanTime_(p.beginn), cleanTime_(p.ende), Number(p.stunden || 0),
    String(p.abwesenheit || ''), String(p.notiz || ''), summary.fahrzielId, summary.fahrziel,
    summary.kilometer, now, now, false, cleanTime_(p.beginn2), cleanTime_(p.ende2), JSON.stringify(normalizeSonderleistungen_(p.sonderleistungen).map(x=>({...x,bezahlt:false,fixbetrag:null}))),
    '',false,'',String(p.kmModus||'km'),Number(p.kmPauschal||0)
  ]);
  formatEntryRow_(sh, sh.getLastRow());
  saveFahrtenForDatum_(fr, p.datum, fahrten);
}
function updateEntry_(p) {
  validateEntry_(p);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_ARBEITSZEITEN);
  const fr = ss.getSheetByName(SHEET_FAHRTEN);
  const originalDatum = String(p.originalDatum || '');
  const row = findEntryRowByDate_(sh, originalDatum);
  if (!row) throw new Error('Der ursprüngliche Eintrag wurde nicht gefunden.');
  const duplicate = findEntryRowByDate_(sh, p.datum);
  if (duplicate && duplicate !== row) throw new Error('Für das neue Datum gibt es bereits einen Eintrag.');
  const old = sh.getRange(row,1,1,ENTRY_COLS).getValues()[0];
  const fahrten = normalizeFahrten_(p), summary = fahrtenSummary_(fahrten);
  const altFahrten = readFahrten_(fr,Number(originalDatum.slice(0,4)))[originalDatum]||[];
  const altSonder = parseSonderleistungen_(old[15]);
  const neuSonder = normalizeSonderleistungen_(p.sonderleistungen);
  if (p.datum !== originalDatum && altSonder.some(x=>x.bezahlt))
    throw new Error('Datum mit bezahlten Sonderleistungen darf nicht verschoben werden.');
  if (old[12] === true && (String(old[5]||'')!==String(p.abwesenheit||'') || toIsoDate_(old[1]) !== p.datum || cleanTime_(old[2]) !== cleanTime_(p.beginn) || cleanTime_(old[3]) !== cleanTime_(p.ende) || cleanTime_(old[13]) !== cleanTime_(p.beginn2) || cleanTime_(old[14]) !== cleanTime_(p.ende2) || Number(old[4]) !== Number(p.stunden)))
    throw new Error('Bezahlte Arbeitsstunden dürfen nicht mehr geändert werden.');
  if (altFahrten.some(x=>x.bezahlt) && String(p.kmModus||'km') !== String(old[19]||'km'))
    throw new Error('Abrechnungsart mit bezahlten Einzelfahrten darf nicht geändert werden.');
  if (old[17] === true && (fahrten.length !== altFahrten.length || fahrten.some(f=>!altFahrten.some(a=>a.id===f.id && a.fahrzielId===f.fahrzielId && a.fahrziel===f.fahrziel && a.kilometer===f.kilometer))))
    throw new Error('Bereits bezahlte Fahrten dürfen nicht verändert werden.');
  if (old[17] === true && (toIsoDate_(old[1]) !== p.datum || Number(old[9]) !== summary.kilometer || String(old[19]||'km') !== String(p.kmModus||'km') || Number(old[20]||0) !== Number(p.kmPauschal||0)))
    throw new Error('Bezahlte Fahrtkosten dürfen nicht mehr geändert werden.');
  for (const alt of altFahrten.filter(x=>x.bezahlt)) {
    const neu=fahrten.find(x=>x.id===alt.id);
    if(!neu || neu.kilometer!==alt.kilometer || neu.fahrziel!==alt.fahrziel || neu.fahrzielId!==alt.fahrzielId || p.datum!==originalDatum)
      throw new Error('Bezahlte Einzelfahrten dürfen nicht geändert oder gelöscht werden.');
  }
  for (const alt of altSonder.filter(x=>x.bezahlt)) {
    const neu = neuSonder.find(x=>x.id === alt.id);
    if (!neu || neu.name !== alt.name || neu.betrag !== alt.betrag)
      throw new Error('Bezahlte Sonderleistungen dürfen nicht geändert oder gelöscht werden.');
  }
  const sonder = neuSonder.map(x=>{
    const alt=altSonder.find(y=>y.id===x.id);
    return {...x,bezahlt:!!(alt&&alt.bezahlt),fixbetrag:alt&&alt.bezahlt?alt.fixbetrag:null};
  });
  sh.getRange(row,1,1,ENTRY_COLS).setValues([[
    old[0],parseIsoDate_(p.datum),cleanTime_(p.beginn),cleanTime_(p.ende),Number(p.stunden||0),
    String(p.abwesenheit||''),String(p.notiz||''),summary.fahrzielId,summary.fahrziel,
    summary.kilometer,old[10],new Date(),old[12],cleanTime_(p.beginn2),cleanTime_(p.ende2),JSON.stringify(sonder),
    old[16],old[17],old[18],String(p.kmModus||'km'),Number(p.kmPauschal||0)
  ]]);
  formatEntryRow_(sh,row);
  const gesicherteFahrten=fahrten.map(x=>{const alt=altFahrten.find(y=>y.id===x.id);return {...x,bezahlt:!!(alt&&alt.bezahlt),fixbetrag:alt&&alt.bezahlt?alt.fixbetrag:null};});
  deleteFahrtenByDatum_(fr,originalDatum);
  saveFahrtenForDatum_(fr,p.datum,gesicherteFahrten);
}
function deleteEntry_(p) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_ARBEITSZEITEN);
  const fr = ss.getSheetByName(SHEET_FAHRTEN);
  const datum = String(p.datum || '');
  const row = findEntryRowByDate_(sh, datum);
  if (!row) throw new Error('Eintrag nicht gefunden.');
  const old=sh.getRange(row,1,1,ENTRY_COLS).getValues()[0];
  if (old[12]===true || old[17]===true || parseSonderleistungen_(old[15]).some(x=>x.bezahlt) || (readFahrten_(fr,Number(datum.slice(0,4)))[datum]||[]).some(x=>x.bezahlt))
    throw new Error('Eintrag enthält bezahlte Leistungen und darf nicht gelöscht werden.');
  sh.deleteRow(row);
  deleteFahrtenByDatum_(fr, datum);
}
function normalizeFahrten_(p) {
  let fahrten = Array.isArray(p.fahrten) ? p.fahrten : [];
  if (!fahrten.length && String(p.fahrziel || '').trim() && Number(p.kilometer || 0) > 0) {
    fahrten = [{
      id:String(p.fahrtId || ''),
      fahrzielId:String(p.fahrzielId || ''),
      fahrziel:String(p.fahrziel || ''),
      kilometer:Number(p.kilometer || 0)
    }];
  }
  return fahrten.map((f,i)=>({
    id:String(f.id || ('fahrt_' + Date.now() + '_' + i)),
    fahrzielId:String(f.fahrzielId || ''),
    fahrziel:String(f.fahrziel || '').trim(),
    kilometer:Number(f.kilometer || 0)
  })).filter(f=>f.fahrziel && f.kilometer > 0);
}
function fahrtenSummary_(fahrten) {
  const kilometer = fahrten.reduce((sum,f)=>sum + Number(f.kilometer || 0), 0);
  return {
    fahrzielId:fahrten.length===1 ? String(fahrten[0].fahrzielId || '') : '',
    fahrziel:fahrten.map(f=>f.fahrziel).filter(Boolean).join(' · '),
    kilometer:Math.round(kilometer * 10) / 10
  };
}
function saveFahrtenForDatum_(sheet, datumIso, fahrten) {
  if (!sheet || !fahrten.length) return;
  const rows = fahrten.map((f,i)=>[
    String(f.id || ('fahrt_' + Date.now() + '_' + i)),
    parseIsoDate_(datumIso),
    String(f.fahrzielId || ''),
    String(f.fahrziel || ''),
    Number(f.kilometer || 0),
    new Date(),f.bezahlt===true,f.fixbetrag==null?'':Number(f.fixbetrag)
  ]);
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow,1,rows.length,FAHRT_COLS).setValues(rows);
  sheet.getRange(startRow,2,rows.length,1).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(startRow,5,rows.length,1).setNumberFormat('0.0');
  sheet.getRange(startRow,6,rows.length,1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}
function deleteFahrtenByDatum_(sheet, datumIso) {
  if (!sheet || !datumIso || sheet.getLastRow() < 2) return;
  const values = sheet.getRange(2,2,sheet.getLastRow()-1,1).getValues();
  for (let i=values.length-1;i>=0;i--) {
    if (toIsoDate_(values[i][0]) === datumIso) sheet.deleteRow(i+2);
  }
}
function migriereBestehendeFahrten_(arbeitszeiten, fahrten) {
  if (!arbeitszeiten || arbeitszeiten.getLastRow() < 2) return;
  const bestehend = new Set();
  if (fahrten && fahrten.getLastRow() > 1) {
    fahrten.getRange(2,1,fahrten.getLastRow()-1,6).getValues().forEach(r=>{
      const datum=toIsoDate_(r[1]);
      bestehend.add(datum+'|'+String(r[2]||'')+'|'+String(r[3]||'')+'|'+Number(r[4]||0));
    });
  }
  const rows = arbeitszeiten.getRange(2,1,arbeitszeiten.getLastRow()-1,13).getValues();
  const neu=[];
  rows.forEach((r,i)=>{
    const datum=toIsoDate_(r[1]),zielId=String(r[7]||''),ziel=String(r[8]||''),km=Number(r[9]||0);
    if (!datum || !ziel || !(km>0)) return;
    // Nicht erneut importieren, wenn zu diesem Tag bereits einzelne Fahrten existieren.
    if (Array.from(bestehend).some(k=>k.startsWith(datum+'|'))) return;
    const key=datum+'|'+zielId+'|'+ziel+'|'+km;
    if (bestehend.has(key)) return;
    bestehend.add(key);
    neu.push(['legacy_'+datum+'_'+i,parseIsoDate_(datum),zielId,ziel,km,new Date()]);
  });
  if (neu.length) {
    const start=fahrten.getLastRow()+1;
    fahrten.getRange(start,1,neu.length,6).setValues(neu);
    fahrten.getRange(start,2,neu.length,1).setNumberFormat('dd.MM.yyyy');
    fahrten.getRange(start,5,neu.length,1).setNumberFormat('0.0');
    fahrten.getRange(start,6,neu.length,1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  }
}
function saveFahrziel_(p) {
  const id = String(p.id || '').trim();
  const name = String(p.name || '').trim();
  const adresse = String(p.adresse || '').trim();
  const kmEinfach = Number(p.kmEinfach || 0);
  const kmHinRueck = Number(p.kmHinRueck || 0);
  if (!id || !name || !adresse || !(kmHinRueck > 0)) throw new Error('Fahrziel ist unvollständig.');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FAHRZIELE);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues().flat() : [];
  const idx = ids.indexOf(id);
  const row = idx >= 0 ? idx + 2 : sh.getLastRow() + 1;
  sh.getRange(row,1,1,7).setValues([[id,name,adresse,kmEinfach,kmHinRueck,true,new Date()]]);
  sh.getRange(row,4,1,2).setNumberFormat('0.0');
}
function deleteFahrziel_(p) {
  const id = String(p.id || '').trim();
  if (!id) return;
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FAHRZIELE);
  if (sh.getLastRow() < 2) return;
  const ids = sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues().flat();
  const idx = ids.indexOf(id);
  if (idx >= 0) sh.getRange(idx+2,6).setValue(false);
}
function lohnZumDatum_(sheet,datum) {
  const liste=readStundenloehne_(sheet);let wert=null;
  liste.forEach(x=>{if(x.ab<=datum)wert=x.lohn;});return wert;
}
function kmSatzZumDatum_(sheet,datum) {
  const liste=readKilometersaetze_(sheet);let wert=null;
  liste.forEach(x=>{if(x.ab<=datum)wert=x.satz;});return wert;
}
function setBezahlt_(p) {
  const daten=Array.isArray(p.daten)?p.daten.map(String):[];
  if (!daten.length) return;
  daten.forEach(datum=>setLeistungBezahlt_({datum,art:'stunden',bezahlt:p.bezahlt===true}));
}
function setLeistungBezahlt_(p) {
  const ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName(SHEET_ARBEITSZEITEN);
  const row=findEntryRowByDate_(sh,String(p.datum||''));
  if (!row) throw new Error('Eintrag nicht gefunden.');
  const r=sh.getRange(row,1,1,ENTRY_COLS).getValues()[0];
  const bezahlt=p.bezahlt===true,art=String(p.art||'');
  if (art==='stunden') {
    if (!bezahlt && r[12]===true) {
      sh.getRange(row,COL_BEZAHLT).setValue(false);
      sh.getRange(row,COL_STUNDEN_FIX).clearContent();
    }
    if (bezahlt && r[12]!==true) {
      const lohn=lohnZumDatum_(ss.getSheetByName(SHEET_STUNDENLOHN),toIsoDate_(r[1]));
      if (!(lohn>0)) throw new Error('Vor der Bezahlung einen Stundenlohn hinterlegen.');
      sh.getRange(row,COL_STUNDEN_FIX).setValue(Math.round(Number(r[4])*lohn*100)/100);
      sh.getRange(row,COL_BEZAHLT).setValue(true);
    }
  } else if (art==='km') {
    if (readFahrten_(ss.getSheetByName(SHEET_FAHRTEN),Number(String(p.datum).slice(0,4)))[String(p.datum)]?.some(x=>x.bezahlt)) throw new Error('Einzelne Fahrten sind bereits bezahlt. Bitte jede Fahrt separat abrechnen.');
    if (!bezahlt && r[17]===true) {
      sh.getRange(row,COL_KM_BEZAHLT).setValue(false);
      sh.getRange(row,COL_KM_FIX).clearContent();
    }
    if (bezahlt && r[17]!==true) {
      let wert=Number(r[20]||0);
      if (String(r[19]||'km')!=='pauschal') {
        const satz=kmSatzZumDatum_(ss.getSheetByName(SHEET_KM_SATZ),toIsoDate_(r[1]));
        if (satz===null) throw new Error('Vor der Bezahlung eine Kilometerpauschale hinterlegen.');
        wert=Number(r[9]||0)*satz;
      }
      sh.getRange(row,COL_KM_FIX).setValue(Math.round(wert*100)/100);
      sh.getRange(row,COL_KM_BEZAHLT).setValue(true);
    }
  } else if (art==='fahrt') {
    if (r[17]===true) throw new Error('Fahrtkosten des Tages sind bereits bezahlt.');
    if (String(r[19]||'km')==='pauschal') throw new Error('Bei pauschaler Fahrtkostenabrechnung bitte den Tagesbetrag markieren.');
    const fr=ss.getSheetByName(SHEET_FAHRTEN);
    const fid=String(p.id||'');
    if(!fid || fr.getLastRow()<2) throw new Error('Fahrt nicht gefunden.');
    const vals=fr.getRange(2,1,fr.getLastRow()-1,FAHRT_COLS).getValues();
    const idx=vals.findIndex(x=>String(x[0])===fid && toIsoDate_(x[1])===String(p.datum));
    if(idx<0)throw new Error('Fahrt nicht gefunden.');
    const f=vals[idx];
    if(f[6]===true && !bezahlt)fr.getRange(idx+2,7,1,2).setValues([[false,'']]);
    if(bezahlt && f[6]!==true){
      const satz=kmSatzZumDatum_(ss.getSheetByName(SHEET_KM_SATZ),String(p.datum));
      if(satz===null)throw new Error('Bitte zuerst Kilometerpauschale hinterlegen.');
      fr.getRange(idx+2,7,1,2).setValues([[true,Math.round(Number(f[4]||0)*satz*100)/100]]);
    }
  } else if (art==='sonder') {
    const liste=parseSonderleistungen_(r[15]);
    const item=liste.find(x=>x.id===String(p.id||''));
    if (!item) throw new Error('Sonderleistung nicht gefunden.');
    if (!bezahlt) {item.bezahlt=false;item.fixbetrag=null;}
    if (bezahlt) {item.bezahlt=true;item.fixbetrag=item.betrag;}
    sh.getRange(row,COL_SONDERLEISTUNGEN).setValue(JSON.stringify(liste));
  } else throw new Error('Unbekannte Leistungsart.');
}
function migriereBezahlteStunden_(az,sl) {
  if (az.getLastRow()<2) return;
  const rows=az.getRange(2,1,az.getLastRow()-1,ENTRY_COLS).getValues();
  rows.forEach((r,i)=>{
    if (r[12]!==true || r[16]!=='' ) return;
    const lohn=lohnZumDatum_(sl,toIsoDate_(r[1]));
    if (lohn>0) az.getRange(i+2,COL_STUNDEN_FIX).setValue(Math.round(Number(r[4])*lohn*100)/100);
  });
}
function readStundenloehne_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().map(r=>({
    ab:verguetungDatum_(r[0]),
    lohn:Number(r[1] || 0)
  })).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.ab) && x.lohn > 0)
    .sort((a,b)=>a.ab.localeCompare(b.ab));
}
function saveStundenlohn_(p) {
  const ab = String(p.ab || '').trim();
  const lohn = Number(p.lohn || 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ab)) throw new Error('Datum für Stundenlohn ist ungültig.');
  if (!(lohn > 0)) throw new Error('Stundenlohn muss größer als 0 sein.');
  const az=SpreadsheetApp.getActive().getSheetByName(SHEET_ARBEITSZEITEN);
  if (az && az.getLastRow()>1) {
    const rows=az.getRange(2,1,az.getLastRow()-1,ENTRY_COLS).getValues();
    if (rows.some(r=>r[12]===true && r[16]==='' && toIsoDate_(r[1])>=ab))
      throw new Error('Bezahlte Alteinträge ohne fixierten Betrag vorhanden. Bitte zuerst prüfen.');
  }
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_STUNDENLOHN);
  if (!sh) throw new Error('Blatt Stundenlohn fehlt. Bitte Setup erneut ausführen.');
  const monate = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(r=>verguetungDatum_(r[0])) : [];
  const idx = monate.indexOf(ab);
  const row = idx >= 0 ? idx + 2 : sh.getLastRow() + 1;
  sh.getRange(row,1,1,3).setValues([[ab,lohn,new Date()]]);
  sh.getRange(row,2).setNumberFormat('0.00 €');
  sh.getRange(row,3).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}
function readKilometersaetze_(sheet) {
  if (!sheet || sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().map(r=>({ab:verguetungDatum_(r[0]),satz:Number(r[1]||0)})).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.ab)&&x.satz>=0).sort((a,b)=>a.ab.localeCompare(b.ab));
}
function saveKilometersatz_(p) {
  const ab=String(p.ab||''),satz=Number(p.satz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ab)||!Number.isFinite(satz)||satz<0||satz>100) throw new Error('Ungültiger Kilometersatz.');
  const sh=SpreadsheetApp.getActive().getSheetByName(SHEET_KM_SATZ);
  const monate=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(r=>verguetungDatum_(r[0])):[];
  const idx=monate.indexOf(ab),row=idx>=0?idx+2:sh.getLastRow()+1;
  sh.getRange(row,1,1,3).setValues([[ab,satz,new Date()]]);
}
function validateEntry_(p) {
  if (!String(p.datum || '').match(/^\d{4}-\d{2}-\d{2}$/)) throw new Error('Datum fehlt oder ist ungültig.');
  normalizeSonderleistungen_(p.sonderleistungen);
  if (!['km','pauschal'].includes(String(p.kmModus||'km'))) throw new Error('Unbekannte Kilometerabrechnung.');
  if (!Number.isFinite(Number(p.kmPauschal||0)) || Number(p.kmPauschal||0)<0) throw new Error('Ungültiger Fahrtkostenbetrag.');
  if (p.abwesenheit) {
    p.beginn=''; p.ende=''; p.beginn2=''; p.ende2=''; p.stunden=0;
    return;
  }
  const gueltigeZeit = t => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
  if (!gueltigeZeit(p.beginn) || !gueltigeZeit(p.ende)) throw new Error('Beginn oder Ende fehlt oder ist ungültig.');
  const zweiterBeginn = String(p.beginn2 || '').trim();
  const zweitesEnde = String(p.ende2 || '').trim();
  if (zweiterBeginn || zweitesEnde) {
    if (!gueltigeZeit(zweiterBeginn) || !gueltigeZeit(zweitesEnde))
      throw new Error('Zweiter Dienst: Beginn und Ende vollständig eintragen.');
    const minuten = t => Number(t.slice(0,2))*60 + Number(t.slice(3,5));
    if (minuten(p.ende) > minuten(zweiterBeginn))
      throw new Error('Der zweite Dienst darf sich nicht mit dem ersten überschneiden.');
  }
  const dauer = (a,b) => {
    const x = Number(a.slice(0,2))*60+Number(a.slice(3,5));
    const y = Number(b.slice(0,2))*60+Number(b.slice(3,5));
    return ((y-x+1440)%1440)/60;
  };
  const erwartet = dauer(p.beginn,p.ende) + (zweiterBeginn ? dauer(zweiterBeginn,zweitesEnde) : 0);
  if (!(erwartet > 0)) throw new Error('Arbeitszeit muss größer als 0 sein.');
  p.stunden = erwartet;
}
function normalizeSonderleistungen_(items) {
  if (!Array.isArray(items)) return [];
  if (items.length>30) throw new Error('Maximal 30 Sonderleistungen pro Tag.');
  const ids=new Set();
  return items.map((x,i)=>{
    const name=String(x.name||'').trim(),betrag=x.betrag===''||x.betrag==null?NaN:Number(x.betrag);
    if (!name||name.length>150||!Number.isFinite(betrag)||betrag<0||betrag>100000)
      throw new Error('Sonderleistung benötigt Bezeichnung und gültigen Betrag (auch 0 €).');
    const id=String(x.id||('sonder_'+Date.now()+'_'+i));
    if (ids.has(id)) throw new Error('Doppelte Sonderleistungs-ID.');ids.add(id);
    return {id,name,betrag:Math.round(betrag*100)/100,bezahlt:x.bezahlt===true,fixbetrag:x.fixbetrag==null?null:Number(x.fixbetrag)};
  });
}
function parseSonderleistungen_(v) {
  try{return normalizeSonderleistungen_(JSON.parse(String(v||'[]')));}catch(e){return [];}
}
function findEntryRowByDate_(sheet, datumIso) {
  if (!datumIso || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2,2,sheet.getLastRow()-1,1).getValues();
  for (let i=0;i<values.length;i++) if (toIsoDate_(values[i][0]) === datumIso) return i+2;
  return 0;
}
function saveSetting_(key, value) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_EINSTELLUNGEN);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,2).getValues() : [];
  const idx = rows.findIndex(r=>String(r[0])===key);
  if (idx >= 0) sh.getRange(idx+2,2).setValue(value);
  else sh.appendRow([key,value]);
}
function readSetting_(sheet, key) {
  if (sheet.getLastRow() < 2) return '';
  const rows = sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues();
  const row = rows.find(r=>String(r[0])===key);
  return row ? String(row[1] || '') : '';
}
function getOrCreateSheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
// Alte Monatswerte gelten ab dem ersten Kalendertag des Monats.
// Neue Werte behalten das genaue Datum (taggenaue Vergütung).
function verguetungDatum_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v,TZ,'yyyy-MM-dd');
  const s=String(v==null?'':v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return s+'-01';
  return '';
}
function monatIso_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v,TZ,'yyyy-MM');
  const s=String(v==null?'':v).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0,7);
  return '';
}
function parseIsoDate_(s) { const p=String(s).split('-').map(Number); return new Date(p[0],p[1]-1,p[2]); }
function toIsoDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s=String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}
function cleanTime_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'HH:mm');
  const s = String(v || '').trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? String(Number(m[1])).padStart(2,'0') + ':' + m[2] : s;
}
function toTime_(v) { return cleanTime_(v); }
function formatEntryRow_(sheet,row) {
  sheet.getRange(row,2).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(row,5).setNumberFormat('0.00');
  sheet.getRange(row,10).setNumberFormat('0.0');
  sheet.getRange(row,11,1,2).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  sheet.getRange(row,COL_BEZAHLT).insertCheckboxes();
  sheet.getRange(row,COL_KM_BEZAHLT).insertCheckboxes();
}
function mapsBerechtigungTest() {
  const result = Maps.newDirectionFinder()
    .setOrigin('Marienplatz, München')
    .setDestination('Odeonsplatz, München')
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .getDirections();
  Logger.log(result && result.routes ? 'Maps OK' : 'Keine Route');
}

// Administrative editor functions; not reachable through doGet/doPost actions.
function janeBinding_(){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,SpreadsheetApp.getActive().getId())
    .map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
// Zugangsschutz: aktiv, sobald die Script-Property JANE_ZUGANG gesetzt ist.
// Einrichten/Aufheben nur im Apps-Script-Editor über die beiden Funktionen unten.
function janeZugangOk_(e){
  const soll=PropertiesService.getScriptProperties().getProperty('JANE_ZUGANG');
  if(!soll)return true;
  const ist=String((e&&e.parameter&&e.parameter.zugang)||'');
  if(ist.length!==soll.length)return false;
  let diff=0;
  for(let i=0;i<soll.length;i++)diff|=soll.charCodeAt(i)^ist.charCodeAt(i);
  return diff===0;
}
function janeZugangEinrichten(){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+Utilities.getUuid()+Date.now());
  const schluessel=Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'').slice(0,32);
  PropertiesService.getScriptProperties().setProperty('JANE_ZUGANG',schluessel);
  Logger.log('Zugangsschutz aktiv. Dein Zugangsschlüssel (gut aufheben, in Jane auf Handy und PC eingeben): '+schluessel);
}
function janeZugangAnzeigen(){
  const s=PropertiesService.getScriptProperties().getProperty('JANE_ZUGANG');
  Logger.log(s?('Aktueller Zugangsschlüssel: '+s):'Zugangsschutz ist nicht aktiv.');
}
function janeZugangAufheben(){
  PropertiesService.getScriptProperties().deleteProperty('JANE_ZUGANG');
  Logger.log('Zugangsschutz aufgehoben. Jane ist wieder ohne Schlüssel erreichbar.');
}
function janeReleaseStatus_(){
  return {ok:true,backendRevision:'jane-zugangsschutz-20261021-r1',paymentVersion:1,
    zugangsschutz:!!PropertiesService.getScriptProperties().getProperty('JANE_ZUGANG'),
    writePaused:PropertiesService.getScriptProperties().getProperty('JANE_WRITE_PAUSE')==='true',
    bindingSha256:janeBinding_()};
}
function janeSchreibpauseAktivieren(){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const props=PropertiesService.getScriptProperties();
    props.setProperty('JANE_WRITE_PAUSE','true');
    props.setProperty('JANE_WRITE_PAUSE_BINDING',janeBinding_());
    Logger.log('Schreibpause gesetzt. Sie wirkt in Bereitstellungen, die diesen Code ausführen. Keine Tabellendaten verändert.');
  }finally{lock.releaseLock();}
}
function janeSchreibpauseBeenden(){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('JANE_WRITE_PAUSE')!=='true'||props.getProperty('JANE_WRITE_PAUSE_BINDING')!==janeBinding_())throw new Error('Keine passende Schreibpause für diese Tabelle vorhanden.');
    const overview=paymentOverview_();
    const ss=SpreadsheetApp.getActive();
    const entries=readEntries_(ss.getSheetByName(SHEET_ARBEITSZEITEN),ss.getSheetByName(SHEET_FAHRTEN),null);
    if(overview.zahlungen.length||overview.positionen.some(p=>p.altBezahlt||p.bezahltCent!==0)||entries.some(e=>e.bezahlt||e.kmBezahlt||e.stundenFix!=null||e.kmFix!=null||e.fahrten.some(f=>f.bezahlt||f.fixbetrag!=null)||e.sonderleistungen.some(x=>x.bezahlt||x.fixbetrag!=null)))throw new Error('Zahlungsneustart noch nicht leer. Schreibpause bleibt aktiv.');
    props.setProperty('JANE_WRITE_PAUSE','false');
    Logger.log('Zahlungsneustart geprüft: Journal und alte Zahlungsfelder leer. Schreiben freigegeben.');
  }finally{lock.releaseLock();}
}

// Append-only journal. Existing rows, paid flags, rates and templates are untouched.
const PAYMENT_SHEET = 'Zahlungen';
const PAYMENT_HEADERS = ['ID','Zahlungsdatum','Betrag','Zuordnung_JSON','Notiz','Erstellt_am'];
function paymentRows_() {
  const sh=SpreadsheetApp.getActive().getSheetByName(PAYMENT_SHEET);
  if(!sh || sh.getLastRow()<2)return [];
  if(JSON.stringify(sh.getRange(1,1,1,6).getValues()[0])!==JSON.stringify(PAYMENT_HEADERS))throw new Error('Unerwartetes Zahlungsjournalformat.');
  const rows=sh.getRange(2,1,sh.getLastRow()-1,6).getValues().filter(r=>r.some(v=>v!==''));
  const journal=rows.map(r=>{
    const data=JSON.parse(r[3]);
    const envelope=!Array.isArray(data);
    if(envelope&&(!data||data.version!==1||typeof data.stornoVon!=='string'||!data.stornoVon||Object.keys(data).some(k=>!['version','stornoVon','positionen'].includes(k))))throw new Error('Unbekanntes Journal-JSON.');
    return {id:String(r[0]),datum:toIsoDate_(r[1]),betrag:Number(r[2]),positionen:envelope?data.positionen:data,notiz:String(r[4]||''),...(envelope?{stornoVon:data.stornoVon}:{})};
  });
  const ids=new Set(),reversed=new Set();
  for(const z of journal){
    if(!z.id||ids.has(z.id)||!Array.isArray(z.positionen)||!z.positionen.length)throw new Error('Ungültiges Zahlungsjournal.');
    ids.add(z.id);paymentDate_(z.datum);
    const sign=z.stornoVon?-1:1;
    if(!Number.isFinite(z.betrag)||sign*z.betrag<=0)throw new Error('Zahlungsvorzeichen ohne gültige Stornozuordnung.');
    const cents=paymentCents_(sign*z.betrag),keys=new Set();let sum=0;
    for(const p of z.positionen){
      const key=paymentKey_(p);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(p.datum)||!['stunden','fahrt','km','sonder'].includes(p.art)||keys.has(key)||!Number.isSafeInteger(p.betragCent)||sign*p.betragCent<=0||!Number.isSafeInteger(p.gesamtCent)||p.gesamtCent<=0||Math.abs(p.betragCent)>p.gesamtCent)throw new Error('Ungültige Journalzuordnung.');
      keys.add(key);sum+=sign*p.betragCent;
    }
    if(sum!==cents)throw new Error('Journalsumme stimmt nicht.');
    if(z.stornoVon){
      const original=journal.find(x=>x.id===z.stornoVon);
      if(!original||original.stornoVon||reversed.has(original.id)||z.datum<original.datum||z.betrag!==-original.betrag||z.positionen.length!==original.positionen.length||z.positionen.some((p,i)=>paymentKey_(p)!==paymentKey_(original.positionen[i])||p.gesamtCent!==original.positionen[i].gesamtCent||p.betragCent!==-original.positionen[i].betragCent))throw new Error('Ungültige oder doppelte Stornierung.');
      reversed.add(original.id);
    }
  }
  return journal;
}
function activePayments_(journal){const reversed=new Set(journal.filter(z=>z.stornoVon).map(z=>z.stornoVon));return journal.filter(z=>!z.stornoVon&&!reversed.has(z.id));}
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
  activePayments_(journal).forEach(z=>z.positionen.forEach(p=>{const k=paymentKey_(p),a=paid.get(k)||[];a.push({...p,zahlungsdatum:z.datum,zahlungId:z.id});paid.set(k,a);}));
  for(const e of entries){
    const add=(art,id,label,total,legacy)=>{
      const p={datum:e.datum,art,id:id||'',label};
      const records=paid.get(paymentKey_(p))||[];
      // Freeze the entire item valuation at its first partial payment.
      const cents=records.length?records[0].gesamtCent:(total===null?null:Math.round(total*100));
      if(cents===0)return;
      const paidCent=legacy?(cents||0):records.reduce((s,x)=>s+x.betragCent,0);
      if(records.some(x=>x.gesamtCent!==cents)||(!legacy&&cents!==null&&paidCent>cents))throw new Error('Widersprüchliche Journalbewertung oder Überzahlung.');
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
  if(activePayments_(paymentRows_()).some(z=>z.positionen.some(p=>p.datum===datum)))throw new Error('Dieser Tag enthält journalisierte Zahlungen und ist gegen Änderung, Löschung und alte Zahlungsmarkierungen geschützt.');
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
  if(p.id.startsWith('storno_'))throw new Error('Reservierte Zahlungs-ID.');
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

// Called only through doPost under the same ScriptLock as recordPayment.
// Six columns stay intact. Reversal metadata lives in a versioned JSON envelope.
function reversePayment_(p){
  if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{12,100}$/.test(p.id))throw new Error('Ungültige Zahlungs-ID.');
  paymentDate_(p.datum);
  const journal=paymentRows_(),original=journal.find(z=>z.id===p.id);
  if(!original)throw new Error('Zahlung nicht gefunden.');
  if(original.stornoVon)throw new Error('Stornierungen können nicht erneut storniert werden.');
  if(journal.some(z=>z.stornoVon===original.id))return; // Idempotent even after an Ack timeout.
  if(p.datum<original.datum)throw new Error('Stornodatum liegt vor der Zahlung.');
  const id='storno_'+original.id;
  if(journal.some(z=>z.id===id))throw new Error('Storno-ID bereits belegt.');
  const data={version:1,stornoVon:original.id,positionen:original.positionen.map(x=>({...x,betragCent:-x.betragCent}))};
  const json=JSON.stringify(data);if(json.length>45000)throw new Error('Stornierung zu groß.');
  const sh=SpreadsheetApp.getActive().getSheetByName(PAYMENT_SHEET);
  sh.getRange(sh.getLastRow()+1,1,1,6).setValues([[id,p.datum,-original.betrag,json,'Storno',new Date()]]);
  SpreadsheetApp.flush();
}
