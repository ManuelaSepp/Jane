# Zahlungsverwaltung

Stand: 13.10.2026. Grundlage Frontend: Commit `6105ae3`; Backend: beigefügtes `Eingefügtes Markdown(3).md`.

## Bedienung

„Zahlung / Überweisung erfassen“ lädt offene Arbeitsstunden, Einzelfahrten, Fahrtkostenpauschalen und Sonderleistungen aus allen Jahren. Zahlungsdatum angeben und Teilbeträge je Leistung eintragen. Für Vollzahlungen Posten anhaken und „Ausgewählte Restbeträge übernehmen“ wählen. Der Gesamtbetrag muss genau zur Summe der Zuordnungen passen.

Für eine Banküberweisung den Gesamtbetrag eingeben und „Passende Posten vorschlagen“ wählen. Die Suche liefert bis zu drei passende Kombinationen voller Restbeträge. Bei begrenzter Suche oder ohne volle Kombination wird ein ausdrücklich gekennzeichneter Vorschlag nach ältesten Posten mit einer letzten Teilzahlung angeboten. Vorschläge lassen sich ändern. Erst die abschließende Bestätigung speichert. Überzahlungen werden abgelehnt; fehlende Vergütung wird angezeigt.

Das Zahlungsjournal zeigt Datum, Betrag, Notiz und alle Zuordnungen. Bereits zuvor als bezahlt markierte Leistungen bleiben bezahlt; ihr Zahlungsdatum wird nicht erfunden. Der PDF-Zahlungsanhang zeigt Teilzahlungen und Restbeträge, die Excel- und Monatsübersichten berücksichtigen Teilzahlungen.

## Daten und Schutz

Die neue Tabelle `Zahlungen` wird bei der ersten gültigen Buchung angelegt. Arbeitszeiten, Fahrten, bestehende Zahlungsmarkierungen, Sätze und lokale Sonderleistungsvorlagen werden beim Buchen nicht verändert. Auch die vorhandenen Vorschau- und Testversionen bleiben unverändert.

Bei der ersten Teilzahlung wird der Gesamtbetrag einer Leistung fixiert. Spätere Satzänderungen ändern diesen gebuchten Betrag nicht. Für Sonderleistungen gilt der im Backend gespeicherte Eintragsbetrag; lokale Vorlagen bleiben erhalten und werden beim Anlegen neuer Leistungen verwendet. Vor einer Buchung deshalb die angezeigten Sonderleistungsbeträge prüfen.

Tage mit Journalzahlungen sind über die API gegen Bearbeitung, Löschung und alte Bezahlt/Offen-Umschaltungen gesperrt. Journalbuchungen werden in dieser Version nicht storniert oder gelöscht. Unbezahlte Tage und alte Zahlungsmarkierungen ohne Journal bleiben mit den vorhandenen Funktionen bearbeitbar.

Eine Überweisung wird nach vollständiger serverseitiger Prüfung als eine Journalzeile gespeichert. Ein ScriptLock serialisiert Schreibzugriffe. Die unveränderte Zahlungs-ID macht Wiederholungen nach Verbindungsfehlern sicher. Nach unklarer Bestätigung entweder unverändert erneut versuchen oder Journal neu laden, bevor eine neue Zahlung eingegeben wird.

## Koordinierte Inbetriebnahme

1. Zuerst eine Kopie des Google Sheets samt Apps-Script-Projekt sichern. Lokale Sondervorlagen liegen weiterhin unter dem bisherigen Browser-Schlüssel und werden nicht gelöscht.
2. Im Apps-Script-Editor den vorhandenen Backend-Code durch den vollständigen Download `Jane-Apps-Script.gs` ersetzen. Alternativ die beiden Repository-Dateien `backend/Code.gs` und `backend/Payments.gs` verwenden; nicht beide Varianten zugleich. Bestehende Projektberechtigungen beibehalten, Projektzeitzone auf Europe/Berlin setzen.
3. Bei einer vorhandenen Installation **kein Setup und keine Rücksetzfunktion ausführen**. Die Datenstruktur der bisherigen Tabellen ist bereits vorhanden. Der im Anhang enthaltene destruktive Vergütungs-Reset wurde aus dem Download entfernt.
4. Auf einer Sheet-Kopie eine eigene Web-App-Bereitstellung anlegen. In einer getrennten Frontend-Kopie `config.js` auf deren URL setzen. Voll- und Teilzahlung, wiederholte Anfrage, Satzänderung, Jahreswechsel, PDF/Excel und Bestandsdaten prüfen.
5. Erst nach diesem Test die bestehende Apps-Script-Bereitstellung auf die neue Version aktualisieren. Wenn die Bereitstellung dieselbe URL behält, bleibt `config.js` unverändert. Danach die zusammengehörigen Frontend-Dateien `index.html`, `app.js`, `payment-ui.js`, `payment-matching.js` und `service-worker.js` gemeinsam veröffentlichen. Neues Frontend mit altem Backend zeigt eine klare Fehlermeldung und bucht keine Journalzahlungen.

Es wurde keine Live-Bereitstellung ausgeführt und kein Hauptbranch geändert. Der Entwurf bleibt bis zum Test gegen das echte Apps-Script-Projekt unge­merged.

## Tests

`npm ci && npm test`

Backendtests verwenden einen simulierten Spreadsheet-Service, Frontendtests die vollständige HTML-Seite und simulierte JSONP-/POST-Antworten. Syntax und Git-Diff werden zusätzlich geprüft. Ein echter Browser-/Sheets-Test ist noch erforderlich; ein Headless-Edge-Start war in der Arbeitsumgebung nicht möglich.
