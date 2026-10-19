# Kalender: Zahlungsstatus beim Laden

Ursache: `init()` rendert zunächst lokale Cache-/Jahresdaten und lädt erst danach
`paymentOverview`. Bisher nutzte `kalenderZahlung()` in dieser Zeit das alte
Ja/Nein-Feld `bezahlt`. Teilzahlungen erschienen deshalb erst nach der Journalantwort
orange, beispielsweise am 12.10.2026.

Die Anzeige besitzt jetzt einen getrennten Zustand `paymentLadezustand`:

- `laden`: ab Start und während jeder Journalabfrage; neutrale graue Arbeitstage,
  Badge „lädt …“, Ladehinweis und `aria-busy`. Auch Tagesdetails/Tooltips zeigen
  keinen endgültigen Zahlungsstatus. Arbeitszeit und Abwesenheiten bleiben sichtbar.
- `bereit`: erst nach gültiger Journalantwort (Version 1 und beide Listen vorhanden).
  Die vorhandene Bezahlt-/Offen-/Teilbezahlt-Auswertung bleibt erhalten.
- `fehler`: neutraler Kalender mit „Status unbekannt“; keine Rückkehr zu alten Farben.
  Eine erfolgreiche erneute Abfrage stellt die reguläre Anzeige wieder her.

Die bestehende Sequenzkontrolle schützt vor überholten Antworten. Bereits bestätigte
Buchungen bleiben intern erhalten, auch wenn eine Aktualisierung scheitert. Eine
explizit bestätigte Buchung wird weiterhin unmittelbar angezeigt; die anschließende
Journalabfrage zeigt bis zum erfolgreichen Abschluss wieder den Ladezustand.
Keine automatische Buchung und keine neuen Schreibaufrufe.

Cache-Busting: `index.html` lädt `app.js?v=zahlungen-test-20261019-journal-loading4`.
Produktion, Apps Script, `config.js` und Daten wurden nicht geändert.

## Prüfung

Aus dem Repository-Stamm:

```sh
node --check jane-zahlungen-test/app.js
node --check jane-zahlungen-test/payment-regression.test.cjs
node --test jane-zahlungen-test/payment-regression.test.cjs
git diff --check
```

Ergebnis: 12 Tests bestanden. Die Tests verwenden synthetische Daten und simulierte
Lese-/Schreibfunktionen; keine realen Buchungen oder Apps-Script-Aufrufe.
Abgedeckt sind langsame Antworten, Cache-/Legacy-Flags, der 12.10.2026 mit
Teilzahlung, ungültige Antworten, Lesefehler, erfolgreiche Wiederholung,
überholte Antworten und bisherige Buchungsregressionen.

**Browser-Test offen:** In `jane-zahlungen-test/` mit und ohne lokalen Cache und
gedrosseltem Netzwerk laden: Arbeitstage müssen zunächst grau mit Ladehinweis sein;
der 12.10.2026 darf erst nach gültiger Journalantwort orange erscheinen. Bei
fehlgeschlagener Journalabfrage muss „Status unbekannt“ ohne Zahlungsfarbe stehen.
Monatswechsel während des Ladens und erneutes Laden nach einem Fehler prüfen.
Dabei keine Zahlung buchen oder stornieren. Kein Deployment durchgeführt.
