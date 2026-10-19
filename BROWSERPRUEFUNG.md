# Browser- und Cloudprüfungen – Stand 19.10.2026

## Tatsächlich im Browser geprüft

Die vollständige unveränderte HTML-Oberfläche und das vorbereitete Frontend liefen
in einem Browser gegen einen lokalen HTTP-Adapter der tatsächlichen Backend-Funktionen.
Frontend und API verwenden getrennte Origins. Sheets, Properties und ScriptLock
werden dort lokal simuliert; die Daten sind synthetisch. Kein Google- oder
Produktivendpunkt war an diesen Browserlauf angeschlossen.

Über die sichtbaren Bedienelemente wurden zweimal 25 Euro einer Stundenposition
zugeordnet und gespeichert, danach beide Zahlungen storniert. Der Ablauf umfasst:

- parallele JSONP-Startabfragen für Jahresdaten und Journal;
- manuelle Zuordnung, 1,25 von 5 Stunden, Bestätigungsdialog;
- echte HTTP-POST-Anfrage und JSONP-`writeStatus` mit übereinstimmender Request-ID;
- bestätigte Speicherung, korrekt geleertes Formular und 75 Euro Rest;
- Kalenderanzeige „teilbezahlt“, 1,25 von 5 Stunden bezahlt;
- Historie, Stornobestätigung, `reversePayment` und dessen Schreibbestätigung;
- danach Kalender „offen“, null bezahlt, 100 Euro Stundenrest;
- beide Originalzahlungen und beide Gegenbuchungen bleiben in der Historie.

HTTP-Audit: vier POSTs, vier Schreibbestätigungen, keine anderen Schreibaktionen;
sämtliche simulierten Leistungsdaten sind unverändert. Die zweite Runde wurde nach
dem unten beschriebenen Frontendfix vollständig wiederholt.

## Gefundener und behobener Frontendfehler

Das reale Rendering zeigte nach erfolgreichem Speichern erneut „Bitte gültigen
Zahlungsbetrag eingeben“, obwohl das Formular absichtlich geleert war. Das leere
Formular bleibt jetzt neutral; tatsächlich ungültige nichtleere Eingaben melden
weiter einen Fehler. Zusätzlich darf Neurendern während einer ungeklärten Zahlung
oder Stornierung den Buchungsbutton nicht wieder freigeben. Zwei Regressionen
prüfen den tatsächlichen Entwurfsrenderer, der in früheren Tests ersetzt war.
Neue Assetversion `journal-reset-v2` ist in HTML und Service Worker abgestimmt.

46 lokale Backend-/Frontend-/Migrationstests bestehen. Der Browserlauf ergänzt
diese Tests und ersetzt sie nicht.

## Bereits direkt bei Google belegt

Nutzerbelege aus der isolierten Prüfkopie zeigen einen erfolgreichen Cloud-Kerntest:
Teilzahlung, Storno, beide Retries, Bereinigung der eigenen Testbuchungen, sieben
Einträge, 35,25 Stunden und 53,8 km erhalten. Beide privaten `/dev`-GET-Endpunkte
(`paymentOverview`, `init&jahr=2026`) antworten erfolgreich; das Journal ist leer,
alle Positionen unbezahlt. Unabhängige anschließende Tabellenlesungen bestätigen
den Erhalt der Leistungsdaten. Vier leere Journalzellen behalten lediglich von Google
automatisch gesetzte Datumsformate nach `clearContent`.

Eine weitere vollständige native Kopie aus der unveränderten Sicherung wurde
vollständig mit dem Originalbestand verglichen: alle gelesenen Werte/Formeln,
Formate, Validierungen, Notizen und Textformatläufe stimmen. Das belegt die
Wiedergewinnung des Tabellenbestands aus der Sicherung als separate Kopie.

## Verbleibende Grenzen

Die tatsächliche Browser-POST-/Ack-Verbindung zur authentifizierten Google-`/dev`-
Bereitstellung ist noch nicht geprüft. Der lokale HTTP-Browserlauf bildet weder
Google-Anmeldung noch Google-Weiterleitungen, Cloud-Locks oder Laufzeitgrenzen ab.
Die produktive unveränderliche Deployment-Version ist noch nicht eindeutig zugeordnet;
ein vollständiges Script-/Properties-/Trigger-Backup und dessen Restore fehlen.
Diese Punkte sind ausdrücklich nicht durch den lokalen Browserlauf erledigt.

Keine Produktivdaten geändert, kein produktives Backend bereitgestellt, kein Merge.
