# Zahlungsneustart: Vorbereitung und geprüfter Kopientest

Stand 19.10.2026. **Entwurf, kein produktives Deployment oder Merge.**

Aktualisierung: Der Cloud-Kerntest und beide HTTP-GET-Endpunkte der isolierten
Google-Testkopie wurden inzwischen durch Nutzerbelege bestätigt. Der vollständige
lokale HTTP-Browserlauf (inklusive POST/Ack, Teilzahlung, Kalender und Storno) wurde
ebenfalls ausgeführt; dabei gefundene Frontendprobleme sind korrigiert. Grenzen
und Nachweise stehen in `BROWSERPRUEFUNG.md`. Die nachstehenden offenen Cloudtests
beziehen sich auf den noch nicht nachgewiesenen vollständigen Browserablauf gegen Google.

## Ziel und Umfang

Die produktive Jane erhält die vollständige Zahlungsoberfläche aus
`jane-zahlungen-test`, beginnt aber ohne bisherige Zahlungen, Teilzahlungen,
Bezahlt-Markierungen oder Testjournal. Alle Arbeitszeiten und Fahrten aller Jahre
bleiben erhalten. Vergütungssätze, Sonderleistungswerte und Fahrtpauschalen sind
Leistungswerte und bleiben ebenfalls erhalten; null bezahlt bedeutet nicht null offen.

Das Frontend im Repository-Stamm übernimmt den getesteten Zahlungsstand.
Die produktive `config.js` und Testseite bleiben unverändert. Ein eigener
Jahrescache-Namensraum verhindert, dass alte Zahlungsfelder aus dem bisherigen
Cache eingelesen werden; lokale Sondervorlagen werden nicht gelöscht.
HTML und Service Worker verwenden dieselbe neue Skriptversion.

`backend/Code.gs` enthält den vollständig gelieferten produktiven Editorstand mit
ergänztem Storno und serverseitiger Sperre alter Bezahlt-Aktionen. Details zu
Gegenbuchungen, Idempotenz, Journalformat und noch offenen Cloudtests stehen in
`backend/README.md`. Die unveränderliche tatsächlich bereitgestellte Version ist
noch nicht mit diesem Editorstand abgeglichen.

## Erhaltungsgrenze

| Speicher | Zurücksetzen | Unverändert erhalten |
| --- | --- | --- |
| Arbeitszeiten | M Bezahlt → false, Q Stunden_Fixbetrag → leer, R Km_Bezahlt → false, S Km_Fixbetrag → leer | IDs, Datum, Dienste, Stunden, Abwesenheit, Notiz, Ziele, km, Zeitstempel, Abrechnungsmodus, Fahrtpauschale |
| Sonderleistungen in P | nur bezahlt → false und fixbetrag → null | Einträge, IDs, Namen, betrag |
| Fahrten | G Bezahlt → false, H Fixbetrag → leer | A–F vollständig, insbesondere ID, Datum, Ziel, Kilometer |
| Zahlungen | alle Datenzeilen inklusive Stornos, Zuordnungen und Testbuchungen leeren | geprüfte Kopfzeile |
| Andere Blätter | keine pauschalen Löschungen | Sätze, Ziele, Einstellungen, leeres Tabellenblatt1 |

Der frühere Reset `janeVerguetungenZuruecksetzen_EINMALIG` aus dem lokalen
Datumsfix entfernt zusätzliche Leistungswerte und darf hier nicht verwendet werden.
Auch Setup darf nicht aufgerufen werden: Es kann Fahrten importieren und Altfelder
automatisch berechnen.

## Bereits ausgeführte Prüfung auf getrennten Kopien

Eine vollständige Google-Tabellenkopie wurde als unveränderte Sicherung angelegt,
eine weitere Kopie daraus als Produktionsprüfkopie. Zusätzlich wurde die bestehende
Zahlungs-Testtabelle kopiert. Nur die beiden Prüfkopien wurden nach ausdrücklicher
Freigabe zurückgesetzt; Originale und Sicherung blieben unverändert.

Vorher-/Nachher-Vergleich über alle Blätter und gemeldeten Blattgrenzen:
eingegebene Werte/Formeln, Formate, Validierungen, Notizen und Textformatläufe
entsprechen exakt dem vorab geprüften Kandidaten. Alle übrigen Daten bleiben erhalten.
Die Produktionsprüfkopie behält sieben Arbeitszeiteinträge mit 35,25 Stunden und
fünf Fahrten mit 53,8 km. Beide Journalblätter sind leer. In der Zahlungs-Testkopie
wurden auch vier bestehende Journalzeilen einschließlich Gegenbuchung geleert.
Unterschiedliche Eintragszahlen zwischen Produktion und Test wurden nicht angeglichen.

Private Tabellen-IDs, Datenexporte und Backups werden nicht in dieses öffentliche
Repository aufgenommen. Der private lokale Prüfbericht enthält die Zuordnung.

## Offlineplaner

`tools/payment-reset-plan.cjs` erzeugt ausschließlich im Arbeitsspeicher einen
Kandidaten aus `{format:'jane-sheet-snapshot-v1',spreadsheetId,sheets:{Name:{headers,rows}}}`.
Kein Netzwerk, keine Dateioperationen, kein Live-Reset. Bekannte Kopfzeilen werden
exakt geprüft. Das tatsächlich vorgefundene `Tabellenblatt1` wird nur akzeptiert,
wenn sämtliche exportierten Kopf-/Datenzellen leer sind, und unverändert erhalten.
Andere unbekannte Blätter, zusätzliche Journalspalten oder unbekannte
Sonderleistungsfelder führen zum Abbruch. SHA-256 prüft den Erhalt aller außerhalb
der Zahlungsfelder liegenden Snapshot-Inhalte inklusive Reihenfolge und Zeilenzahl.

Der angepasste Planer wurde gegen den privaten Rohdatenexport der Produktionsprüfkopie
geprüft und liefert dieselben Daten wie die tatsächlich zurückgesetzte Kopie
(das separat ergänzte leere Journal ist dabei eine Blattinitialisierung).
Die vollständige Cloud-Zellprüfung umfasst zusätzlich die Formate und Validierungen;
ein einfacher Rohwert-Snapshot allein ersetzt diese nicht.

## Noch erforderlich vor Produktionsfreigabe

1. Tatsächlich bereitgestellte Version, Script-Projekt und produktive Tabellenbindung
   eindeutig abgleichen. Alle Projektdateien, Properties, Trigger und Versionen sichern.
2. Backend in einem separaten Testprojekt mit einer separaten Tabellenkopie prüfen;
   niemals eine bestehende produktive Bereitstellung dafür ändern. Cloud-/Browsertests
   für leeren Start, Teil-/Voll-/Sammelzahlung, Storno, Retry, alte Clients und Netzfehler.
3. Wiederherstellung aus vollständiger Sicherung auf einer Kopie nachweisen.
4. Konkrete Prüfergebnisse zur ausdrücklichen Produktionsfreigabe vorlegen.
5. Erst danach Wartungsfenster, Schreibsperre für alle Clients/Trigger, frisches
   Backup und Quellen-/Datenabgleich. Produktionsreset unter demselben Schreiblock
   wie die Backend-Mutationen durchführen; Sheets bietet keinen allgemeinen
   atomaren Mehrblatt-Commit über getrennte Apps-Script-Schreibaufrufe.
6. Replay-/Ack-Zustände anhand des tatsächlichen Deployments prüfen und gezielt
   entwerten. Backend und Frontend koordiniert bereitstellen, vollständige Invarianten
   vergleichen und erst dann Schreiben wieder freigeben.

Rollback nur unter Schreibsperre aus verifizierter Sicherung und mit passenden
Backend-/Frontendversionen. Nach neuen echten Buchungen niemals blind eine ältere
Sicherung darüberkopieren; neue Buchungen zuerst sichern und abgleichen.

## Lokale Prüfungen

`node --test backend-payments.test.cjs payment-regression.test.cjs tools/payment-reset-plan.test.cjs`

Backend-/Frontend-Integration startet mit leerem Journal, bucht eine Teilzahlung
und bestätigt einen Storno über die echten vorbereiteten Backend-Funktionen mit
lokalen Sheets-/DOM-Doubles. Zusätzlich lokaler Backend-Wiederanlauf an einer
Nachbildung der ausgelesenen Produktionsprüfkopie: alle Positionen offen und
Leistungsdaten unverändert, keinerlei Schreibzugriffe. Das ersetzt keinen Cloudtest.

**Kein produktives Backend verändert, kein Deployment, kein Merge.**
