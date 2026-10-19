# Zahlungsjournal-Testseite: Stabilisierung vom 19.10.2026

Geltungsbereich: ausschließlich `jane-zahlungen-test/`, Ausgangsstand `84197e9`.

## Änderungen

- Die frühere Aktion „Zahlungsstatus bearbeiten“ öffnet jetzt das Zahlungsjournal. Der alte Kalender-Auswahlmodus und seine Vollbezahlt-/Offen-Aktionen sind entfernt. Damit entfällt auch die doppelte Funktionsdeklaration `renderZahlungsAuswahl`, die zuvor die alte Auswahl überschrieben hat. Die Journal-Auswahl heißt eindeutig `renderJournalAuswahl`.
- Einzelaktionen für Arbeitsstunden, Fahrtkosten, einzelne Fahrten und Sonderleistungen führen ebenfalls zum Journal. Zusätzlich weist `schreiben` die alte Aktion `setLeistungBezahlt` vor jedem Netzwerkzugriff zurück, auch bei nicht verfügbarem Journal. Bestehende Alt-Bezahlt-Flags werden weiterhin gelesen und nicht umgewandelt.
- Teilzahlungen werden weiterhin als Cent-Zuordnungen mit unveränderten Positionsschlüsseln gebucht. Journalzahlungen lassen sich weiterhin über die vorhandene Stornofunktion aufheben. Buchungen und Gegenbuchungen werden weder gelöscht noch migriert.
- Auswahlliste, Entwurf, Historie einschließlich zugeordneter Leistungen und Bestätigungsdialoge zeigen ISO-Datumswerte als `TT.MM.JJJJ`. Der Formatierer übernimmt den Datumsanteil auch bei ISO-Zeitstempeln ohne Zeitzonenumrechnung; gespeicherte Datumswerte und Schlüssel bleiben unverändert.
- Ein leeres Formular ohne Zuordnungen zeigt keine Fehlermeldung. Das gilt auch nach erfolgreicher Speicherung und nach einer nachträglich im Journal bestätigten Speicherung. Nichtleere ungültige Beträge werden weiterhin beanstandet; leere Formulare bleiben nicht buchbar.
- Während einer laufenden oder ungeklärten Buchung/Stornierung kann das erneute Rendern den Buchungsknopf nicht freigeben. Die Buchungsfunktion prüft zusätzlich die Verfügbarkeit des Journals und eine offene Stornierung.
- Nur der Script-Versionsparameter dieser Testseite wurde erhöht, damit Browser die aktualisierte Datei abrufen.

## Durchgeführte Prüfungen

Mit Node.js 24.21.0 lokal und ohne Backendzugriffe:

```text
node --check jane-zahlungen-test/app.js
node --check jane-zahlungen-test/tests/payment-regression.cjs
node --test jane-zahlungen-test/tests/payment-regression.cjs
git diff --check
```

Ergebnis: Syntaxprüfungen erfolgreich, 9 Regressionstests erfolgreich, keine Whitespacefehler. Die Tests verwenden DOM- und Netzwerk-Doubles und unterdrücken den automatischen Backendstart. Sie prüfen die neue Navigation und HTML-Verknüpfung, eindeutige Funktionen, die Schreibsperre für alte Statusaktionen, deutsche Datumsanzeigen, unveränderte Journal-/Stornofiksturen, Teilzahlungen im Kalender und Entwurf, leere/ungültige Formulare, beide Speicherbestätigungspfade, Wiederholschutz und den Stornierungsaufruf. Alle Daten dafür sind synthetische Testdaten.

Der Diff betrifft ausschließlich Dateien in `jane-zahlungen-test/`. Produktivdateien im Repository-Stamm, andere Testseiten, `config.js`, Google Apps Script, tatsächliche Buchungsdaten und lokale Browserdaten wurden nicht geändert. Es wurden keine echten Zahlungs- oder Stornierungsaufrufe ausgeführt.

## Nicht durchgeführt

**Keine Browser-Tests durchgeführt.** Insbesondere wurden Darstellung und Bedienung auf Desktop/Mobilgeräten, native Datumseingaben, Fokus/Scrollen, Cacheverhalten sowie echte Apps-Script-Lese-, Schreib- und Bestätigungsabläufe nicht im Browser getestet. Die Offlineprüfungen ersetzen diese Tests nicht. Bestehende reale Testbuchungen und Stornierungen wurden nicht live geladen oder abgeglichen.

Vor einer Übernahme auf der isolierten Testseite manuell prüfen: deutschen Datumsaufbau in Auswahl und Historie; Navigation aller bisherigen Bezahlt-Aktionen zum Journal; Teilzahlung mit Restbetrag im Kalender; erfolgreiche Speicherung ohne anschließende Betragswarnung; Stornierung mit erhaltener ursprünglicher Buchung und Gegenbuchung. Schreibtests ausschließlich mit dafür vorgesehenen Testdaten durchführen.
