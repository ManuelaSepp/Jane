# Konkrete Übernahme – Releasekandidat 19.10.2026

## Dateien

- `backend/Code.gs`: vollständiger Ersatz des vom Nutzer gelieferten Backend-Codes,
  inklusive Zahlungsjournal, Storno und administrativer Schreibpause.
- Stammdateien `app.js`, `index.html`, `service-worker.js`: neue produktive Oberfläche.
  Die bestehende produktive `config.js` bleibt erhalten.
- `tools/payment-reset-plan.cjs`: Offlineplaner, keine automatische Live-Löschung.

Der Code wird vollständig ersetzt, nicht zusätzlich zum alten Backend eingefügt.
Andere Projektdateien dürfen keine gleichnamigen Funktionen oder Konstanten enthalten.
Der separate Cloud-Prüflauf für die Testkopie gehört nicht in den produktiven Code.
Keine Setup- oder alte Rücksetzfunktion starten.

## Ein koordinierter Wechsel, erst nach Produktionsfreigabe

1. Aktuelle produktive Deployment-ID und vorherige Versionsnummer sichern; alten
   Quellstand, Properties und Triggerinventar sichern. Vorhandene Projektdateien mit
   dem gelieferten vollständigen Editorstand abgleichen. Noch keine Zahlungen leeren.
2. Vollständigen neuen Code einfügen und speichern. `janeSchreibpauseAktivieren`
   im Editor ausführen; danach dieselbe produktive Web-App-Bereitstellung auf die
   neue Version aktualisieren, damit ihre bestehende URL erhalten bleibt.
3. Über `action=releaseStatus` die neue Revision
   `jane-zahlungsneustart-20261019-r3`, `writePaused:true` und den SHA-256 der tatsächlichen
   Tabellenbindung prüfen. Der Fingerprint muss zur zuvor verifizierten echten
   Jane-Tabelle gehören. Die Property allein sperrt keine alte Deployment-Version.
   Vor der Migration müssen sämtliche noch laufenden alten Ausführungen beendet sein.
4. Unter dieser bestätigten Schreibpause frische vollständige Tabellensicherung
   anlegen und verifizieren. Quellen erneut lesen, ausschließlich die geprüften
   Zahlungsfelder und alle Journaldaten zurücksetzen; alle Arbeitszeiten, Fahrten,
   Leistungswerte und übrigen Daten vollständig vergleichen. Keine Testdaten übernehmen.
   Diesen Google-Tabellen-Schritt kann Codex mit dem verbundenen Zugang übernehmen.
5. Den konkret geprüften PR #5 erst nach Freigabe zusammenführen. Backend und neue
   Oberfläche kontrollieren, dann `janeSchreibpauseBeenden` im Editor ausführen.
   Diese Funktion verweigert die Freigabe, wenn das Journal oder alte Zahlungsfelder
   noch befüllt sind oder die Tabellenbindung nicht zur aktivierten Schreibpause passt.
6. Mit einem Browser-Reload den echten Start, leeres Journal und offene Beträge prüfen.
   Vor Freigabe bestehende Replay-/Ack-Zustände und ausstehende Clientanfragen gezielt
   prüfen; alte unbekannte Requests dürfen nach dem Neustart keine Zahlungen wiederherstellen.
   Keine Testzahlung in die Produktion schreiben.

Die Editorfunktionen ändern keine Arbeitszeit-/Fahrtzeilen. Schreibpause und
Statusprüfung besitzen keine Rücksetz- oder Sicherungsautomatik. Die Funktionen
sind keine über `doGet`/`doPost` erreichbaren administrativen Schreibaktionen.

## Rückfall und Grenzen

Bei Fehlern Schreibpause beibehalten. Neue Buchungen nicht zulassen. Tabellenbestand
aus verifizierter Sicherung sowie passende alte Backend-/Frontendversionen gemeinsam
wiederherstellen. Nach neuen echten Buchungen niemals blind eine ältere Sicherung
darüberkopieren; neue Daten vorher sichern und abgleichen.

Der Tabellenreset wurde auf getrennten Kopien tatsächlich ausgeführt und vollständig
verglichen. Cloud-Kerntest und beide privaten GET-Endpunkte sind durch Nutzerbelege
bestätigt. Ein vollständiger lokaler Browserlauf mit POST/Ack, Teilzahlung, Kalender
und Storno wurde ausgeführt. 50 lokale Tests bestehen, einschließlich Schreibpause
und verweigerter Freigabe bei Restzahlungen oder falscher Tabellenbindung.

Der komplette Browser-POST-/Ack-Pfad gegen Google ist weiterhin nicht nachgewiesen.
Die zuletzt ergänzten administrativen Funktionen wurden lokal geprüft, noch nicht
in der Cloud ausgeführt. Vollständiger Restore von Script/Properties/Triggern ist
nicht nachgewiesen. Die Dateien sind ein konkret vorbereitetes Übernahmepaket,
keine Behauptung, dass diese offenen Prüfungen bereits erledigt seien.

Produktive Rücksetzung, Backend-Bereitstellung und Merge wurden nicht ausgeführt.
