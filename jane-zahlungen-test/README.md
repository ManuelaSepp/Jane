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

Cache-Busting: `index.html` lädt `app.js?v=zahlungen-test-20261019-parallel-start5`.
Produktion, Apps Script, `config.js` und Daten wurden nicht geändert.

## Prüfung

Aus dem Repository-Stamm:

```sh
node --check jane-zahlungen-test/app.js
node --check jane-zahlungen-test/payment-regression.test.cjs
node --test jane-zahlungen-test/payment-regression.test.cjs
git diff --check
```

Ergebnis: 16 Tests bestanden. Die Tests verwenden synthetische Daten und simulierte
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

## Analyse der Ladegeschwindigkeit (19.10.2026)

Der Startablauf wurde vollständig im Frontend nachverfolgt:

1. HTML/CSS, danach die beiden lokalen Skripte `config.js` und `app.js`.
2. `app.js` ruft `init()` einmal direkt auf; es wartet auf kein Window-Load-Event.
   ExcelJS wird separat mit `async` geladen und ist keine Voraussetzung für den Kalender.
3. Leerzustand und gegebenenfalls lokaler Jahrescache erscheinen sofort. Der Cache
   enthält keinen aktuellen Journalstatus und erspart die beiden Serverabfragen nicht.
4. Bisher: `ladeJahr()` → JSONP `action=init&jahr=…` → Aufbereitung/Rendern/Cache →
   erst danach `zahlungenLaden()` → JSONP `action=paymentOverview` → Zahlungsfarben.
   Dadurch addierten sich zwei voneinander unabhängige Serverlaufzeiten.
5. Jetzt starten dieselben beiden Abfragen gleichzeitig. Eine frühere Journalantwort
   wird erst nach Abschluss des Jahresladens angewendet, damit alte Cache-Einträge
   nicht vorzeitig als endgültig gelten. Der Wartepfad ist somit die längere der
   beiden Abfragen statt ihrer Summe. Sequenzkontrolle wird nach dem Warten erneut geprüft.

Beim normalen erfolgreichen Öffnen gibt es genau einen `init`- und einen
`paymentOverview`-Aufruf; keine doppelte Startinitialisierung und kein Status-Polling.
JSONP nutzt einen individuellen Callback und Zeitparameter sowie maximal 45 Sekunden
Timeout. Google-Weiterleitungen gehören zum jeweiligen Aufruf, nicht zu zusätzlichen
Frontend-Abfragen. Jahresdaten werden nach Fehler einmal mit 900 ms Pause wiederholt.
Journalabfragen werden nur bei noch fehlenden, lokal bestätigten Buchungs-IDs bis zu
dreimal mit 400 ms Pause versucht; beim frischen Öffnen ist diese Menge leer.
Diese Fehler-/Bestätigungssicherungen bleiben unverändert.

Benutzeraktionen können weitere Abfragen auslösen. Insbesondere lädt die bestehende
Zahlungssuche bei noch nicht initialisiertem Zahlungsmodul zunächst dessen Daten und
danach vor dem Vorschlag nochmals die Übersicht. Dieser Pfad läuft beim bloßen Öffnen
nicht; Suche, Buchen, Storno und deren Bestätigungsabläufe wurden nicht geändert.

Reine GET/JSONP-Lesemessung am konfigurierten Endpunkt um 17:05 Uhr (Europe/Berlin),
ein Paar pro Modus, einschließlich Antwortinhalt und Weiterleitungen:

| Modus | Jahresdaten | Journal | Gesamt |
| --- | ---: | ---: | ---: |
| Nacheinander | 6.182 ms | 3.672 ms | 9.854 ms |
| Parallel | 4.028 ms | 3.607 ms | 4.028 ms |

Beide Antworten waren erfolgreich, das Journal lieferte Version 1 und beide Listen.
Es wurden genau vier Leseabfragen für diesen Vergleich ausgeführt, keine Schreibaufrufe.
Keine Zahlungsinhalte wurden gespeichert oder in die Dokumentation übernommen.
Die Messung belegt mehrsekündige Endpunktlaufzeiten und deren vermeidbare Addition.
Sie misst weder Browserdarstellung noch interne Apps-Script-/Sheets-Laufzeiten.
Wegen schwankender Netz-/Serverzeiten ist die Differenz kein garantierter Zeitgewinn;
ein bestimmter Serverengpass oder ein Cold Start lässt sich daraus nicht ableiten.

Zusätzliche Regressionen prüfen beide Antwortreihenfolgen mit/ohne Cache, exakt zwei
Startabfragen, Journalfehler vor späterem Jahreserfolg, Jahresretry ohne Journal-Doppelaufruf
und eine spätere Buchungsbestätigung während des Wartens. Browser-/End-to-End-Test bleibt offen.
