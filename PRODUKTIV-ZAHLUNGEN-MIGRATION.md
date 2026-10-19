# Entwurf: Zahlungsfunktion übernehmen, Zahlungsstände neu beginnen

Stand 19.10.2026. **Nicht zur Live-Ausführung oder zum Merge freigegeben.**
Ziel: vollständige Zahlungsoberfläche aus `jane-zahlungen-test`, aber keinerlei bisherige
Zahlungen, Teilzahlungen, Bezahlt-Markierungen oder Journal-/Testbuchungen übernehmen.
Arbeitszeiten und Fahrten aller Jahre bleiben unverändert.

## Geprüfte Quellen und Grenze der Prüfung

- Ausgangspunkt `main`: `a26c7b424285b6b50a4200b188c8d51a8b56715a`.
- Aktuelle Zahlungsoberfläche: `jane-zahlungen-test/app.js` und `index.html` aus diesem Stand.
- Produktion und Test verwenden unterschiedliche Apps-Script-Web-App-URLs. Die produktive
  `config.js` wird beibehalten; Test-URL oder Testdaten werden nicht kopiert.
- `main` enthält keinen Backend-Quellcode. Im Zweig
  `codex/jane-dated-payments-20261013` liegen `backend/Code.gs` und `Payments.gs`.
  Dieser Entwurf besitzt sechs Journalspalten, datierte Teilzahlungen, Legacy-Flags,
  ScriptLock und Schreibbestätigungen, aber keine `reversePayment`-Implementierung.
- Die aktuelle Oberfläche verwendet `recordPayment`, `reversePayment`, `writeStatus`,
  `paymentOverview`, `stornoVon` und negative Gegenbuchungen. Deshalb kann der ältere
  Backend-Entwurf **nicht ungeprüft als aktuelles Backend übernommen werden**.
- Lokale frühere Lieferungen wurden ebenfalls geprüft: `Jane-Apps-Script.gs` vom
  13.10.2026 entspricht der früheren Journalentwicklung; der produktive Datumsfix
  `Jane_PRODUKTIV_Datumsvalidierung_FIX.gs` enthält die alte Funktion
  `janeVerguetungenZuruecksetzen_EINMALIG`. Diese löscht zusätzlich Vergütungssätze und
  Sonderleistungen und darf für diese Migration nicht verwendet werden.
- Die früheren Jane-Chats bestätigen, dass spätere Frontend-Arbeiten das Backend
  unverändert ließen; ein Abgleich mit dem tatsächlich bereitgestellten Quellstand
  ist damit weiterhin erforderlich. Deployment-ID ist keine Script-Projekt-ID.
- Keine produktiven Tabellen gelesen oder verändert; kein Live-Backup erstellt.
  Die Existenz oder Vollständigkeit produktiver Daten wurde hier nicht live geprüft.

## Zahlungsfelder: explizite Grenze

| Speicher | Zurücksetzen | Erhalten |
| --- | --- | --- |
| Arbeitszeiten | M `Bezahlt` → false; Q `Stunden_Fixbetrag` → leer; R `Km_Bezahlt` → false; S `Km_Fixbetrag` → leer | A–L, N–O, T–U vollständig: IDs, Datum, Dienste, Stunden, Abwesenheit, Notiz, Ziele, km, Zeitstempel, Abrechnungsmodus, vereinbarte Fahrtpauschale |
| Arbeitszeiten P `Sonderleistungen` | ausschließlich `bezahlt` → false, `fixbetrag` → null | Einträge, IDs, Namen und `betrag` als Leistungswert |
| Fahrten | G `Bezahlt` → false, H `Fixbetrag` → leer | A–F unverändert, insbesondere ID, Datum, Ziel und Kilometer |
| Zahlungen | sämtliche Journalzeilen einschließlich Testzahlungen, Zuordnungen, Notizen und Gegenbuchungen leeren, nach vollständigem Backup | geprüfte Struktur/Kopfzeile |
| Sonstige Speicher | weitere Zahlungs-/Stornoblätter, Properties, Cache und Wiederholschlüssel erst nach Quellprüfung gezielt behandeln | Vergütungen, Vorlagen, Einstellungen und unbekannte Daten nicht pauschal löschen |

Zahlungsbeträge sind von Leistungswerten zu unterscheiden: Stundenlohn, km-Satz,
Sonderleistungsbetrag und vereinbarte Fahrtpauschale sind keine bereits geleisteten
Zahlungen. Sie bleiben erhalten, damit offene Forderungen korrekt berechenbar bleiben.
Null bezahlte Euro bedeutet deshalb nicht null offene Euro.

## Vorbereitete Änderung

Die Dateien im Repository-Stamm übernehmen die aktuelle Zahlungsoberfläche.
Die produktive URL bleibt erhalten. Ein eigener Jahrescache-Namensraum verhindert
das Einlesen alter Zahlungsfelder aus dem bisherigen lokalen Cache; bestehende
Browserdaten und Sondervorlagen werden nicht gelöscht. HTML und Service Worker
verwenden dieselbe neue Skriptversion. Die Testseite bleibt unverändert.

`tools/payment-reset-plan.cjs` erzeugt ausschließlich im Arbeitsspeicher einen
Kandidaten aus einem vollständigen Rohdaten-Snapshot. Keine Dateioperationen,
Google-Zugriffe, Rücksetz-Endpunkte oder Live-Ausführung sind enthalten.
Eingabeformat: `{format:'jane-sheet-snapshot-v1', spreadsheetId, sheets:{Name:{headers,rows}}}`.
Die bekannten Arbeitszeiten-/Fahrtenspalten werden exakt geprüft. Unbekannte
Blätter, neue Journalspalten und unbekannte Sonderleistungsfelder führen zum Abbruch.
Der Planer ist derzeit nur für das **historisch belegte Schema** geeignet;
das aktuelle Stornoschema muss zuerst ergänzt und separat getestet werden.
SHA-256 vor/nach Ausschluss der erlaubten Zahlungsfelder prüft alle übrigen
Snapshot-Inhalte einschließlich Reihenfolge und Zeilenzahl. Das ersetzt keinen
vollständigen Sheet-Backupvergleich mit Formeln, Formaten und Datenvalidierungen.

## Verbindlicher Ablauf vor einer Freigabe

1. Tatsächliche Apps-Script-Projekte, Quellstände und verknüpfte Spreadsheet-IDs
   für Produktion und Test eindeutig zuordnen. Alle Dateien, Journal-/Stornostrukturen,
   Properties und Trigger prüfen. Bestehende alte Zahlungsaktionen serverseitig
   sperren; nur die Frontendsperre genügt bei noch geöffneten alten Clients nicht.
2. Private vollständige Kopie der produktiven Tabelle inklusive aller Jahre,
   versteckter Blätter, Formeln, Formate und Validierungen anlegen. Backend-Dateien,
   Properties, Trigger, Version und Deployment-Zuordnung separat sichern. Backup-ID,
   Zeitpunkt, Tabellenköpfe, Zeilenzahlen und Prüfsummen protokollieren und die Kopie
   wieder öffnen. Keine personenbezogenen Daten oder Backups in dieses öffentliche Repo.
3. Rohdatenexport aller Blätter aus der gesicherten Kopie erstellen; Kopfzeilen und
   sämtliche alten Zahlungsfelder prüfen. Planer an das belegte aktuelle Schema
   anpassen; geplante Zelländerungen mit Zeilenzahlen und Invarianten ausgeben.
   Bei unbekanntem Feld, fehlerhaftem JSON oder Formel in einem Zahlungsfeld abbrechen.
4. Ausschließlich auf einer weiteren Kopie migrieren. Keine Setup-Funktion aufrufen:
   sie kann Fahrten importieren und Altfelder automatisch neu berechnen.
   Journal und Zahlungsflags aller Jahre zurücksetzen; keine Leistungszeilen löschen.
   Arbeitszeiten, Fahrten, Vergütungssätze und Sonderleistungen vollständig vergleichen,
   zusätzlich Stunden/km pro Jahr und pro ID. Journal leer, Bezahltbeträge null,
   sämtliche Positionen offen; Neuinitialisierung darf keine Zahlungen wiederherstellen.
5. Aktuelles Backend mit der Kopie und isoliertem Frontend prüfen: leeres Journal,
   Teil-/Vollzahlung, Sammelüberweisung, Storno, Jahreswechsel, Wiederholschutz,
   alte Clients, Netzfehler, Cache und Schreibbestätigung. Danach Testbuchungen nur
   auf der Kopie erneut entfernen und wieder den Nullzustand prüfen.
6. Konkrete Prüfergebnisse und Wiederherstellungsprobe zur ausdrücklichen Freigabe
   vorlegen. Erst danach Wartungsfenster mit Schreibsperre für alle Clients und
   Trigger, frisches Backup und erneutem Quellen-/Datenabgleich. Migration muss
   denselben Schreiblock wie alle Backend-Mutationen verwenden. Kein atomarer
   Mehrblatt-Commit in Sheets: Unterbrechungen müssen erkannt und gesichert behandelt werden.
7. Genehmigte Migration unter Schreibsperre ausführen, vollständige Invarianten
   vergleichen, Backend und Frontend koordiniert bereitstellen. Alte Zahlungs-/Ack-
   Wiederholschlüssel nach geprüfter Semantik entwerten, damit alte Anfragen keine
   Zahlungen neu anlegen. Erst nach erfolgreicher Prüfung Schreiben wieder zulassen.

Rollback: Unter Schreibsperre aus der verifizierten vollständigen Sicherung wiederherstellen
und Backend/Frontend passend zurücksetzen; nicht eigenmächtig die Sheet-ID wechseln.
Nach neuen echten Buchungen niemals blind ein älteres Backup überschreiben: diese
zunächst sichern und abgleichen. Bei fehlgeschlagener Prüfung geschlossen bleiben.

## Prüfung dieses Entwurfs

`node --test payment-regression.test.cjs tools/payment-reset-plan.test.cjs`
prüft die übertragene Oberfläche mit synthetischen DOM-/Netzwerk-Doubles sowie
Erhalt der Leistungen, alle Jahre, fehlerhafte JSON-Daten, unbekannte Schemata und
wiederholte Planung. Ergänzend JS-Syntax und `git diff --check`.
Browser-, aktueller Backend-, Tabellenkopie- und Wiederherstellungstest stehen aus.
**Keine Löschung, Buchung, Backend-Bereitstellung oder Merge in diesem Auftrag ausgeführt.**
