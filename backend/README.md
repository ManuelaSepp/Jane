# Vorbereitetes Apps-Script-Backend – kein Deployment

`Code.gs` ist eine vollständige Datei auf Basis des von der Nutzerin am
19.10.2026 gelieferten produktiven Editorstands. Sie enthält dessen bisherige
Funktionen plus die geprüfte Stornoergänzung und sperrt alte Zahlungsaktionen.
Keine Setup- oder Resetfunktion wurde hinzugefügt oder ausgeführt.

## Journalformat und Storno

Die sechs Spalten von `Zahlungen` bleiben erhalten. Normale Zahlungszeilen
speichern wie bisher eine Zuordnungsliste in `Zuordnung_JSON`.
Stornozeilen speichern dort `{version:1,stornoVon,positionen}`. Die API liefert
weiterhin `positionen` als Liste und `stornoVon` als eigenes Feld, wie es das
Frontend erwartet. Betrag und Zuordnungsbeträge sind bei der Gegenbuchung negativ.
Die ursprüngliche Zahlung wird nie verändert oder gelöscht.

`reversePayment` erhält `{id,datum}`. Der Server bestimmt die Gegenbuchung
ausschließlich aus der gespeicherten Originalzahlung; er akzeptiert keine vom
Client vorgegebenen Stornobeträge oder Zuordnungen. Ein deterministischer
Stornoschlüssel und derselbe `ScriptLock` wie für alle Schreibaktionen verhindern
doppelte Gegenbuchungen. Ein erneuter Aufruf für eine bereits stornierte Zahlung
ist erfolgreich, ohne eine Zeile anzulegen. Stornierung einer Stornierung,
unbekannte Zahlung und ungültiges/früheres Stornodatum werden abgelehnt.

Der Journalreader prüft Schema, Vorzeichen, Centbeträge, Summen, eindeutige IDs
und Zuordnungen sowie die vollständige Übereinstimmung jeder Gegenbuchung mit
ihrem Original. Beschädigte oder nicht zuordenbare negative Altzeilen führen zu
einem Fehler, nicht zu erfundenen Restbeträgen. Bestehende Test-Stornoformate
werden nicht blind übernommen: Die geplante Produktionsumstellung beginnt mit
dem bereits auf Kopien geprüften leeren Journal.

Stornierte Zahlungspaare bleiben in der Historie, zählen aber nicht zu aktiven
Zahlungen. Solange eine weitere Teilzahlung aktiv ist, bleiben deren Bewertung
und Tagessperre bestehen. Nach vollständiger Stornierung aller Zahlungen eines
Postens gilt wieder dessen aktuelle Leistungsbewertung; der Tag ist nicht mehr
wegen des Journals gesperrt. IDs der Originalzahlungen bleiben verbraucht:
ein altes Zahlungs-Retry kann eine stornierte Zahlung nicht wieder aktivieren.

`setBezahlt` und `setLeistungBezahlt` werden in `doPost` unabhängig vom
Journalinhalt abgelehnt, damit alte Browserfenster keine neuen Legacy-Flags setzen.

## Prüfung und Inbetriebnahmegrenze

`node --test backend-payments.test.cjs payment-regression.test.cjs tools/payment-reset-plan.test.cjs`

Die Tests verwenden lokale Sheets-/DOM-/Netzwerk-Doubles und führen die tatsächlichen
Backend-Funktionen aus. Zusätzlich wurde das Backend lokal gegen eine Nachbildung
der ausgelesenen, zurückgesetzten Produktionsprüfkopie gestartet: sieben Einträge,
35,25 Stunden, 53,8 km, leeres Journal, alle Positionen offen, keine Datenänderungen.
Dieser lokale Wiederanlauf ist kein Apps-Script-Cloudtest.

Vor der Produktion bleiben ein isoliertes Deployment auf einer separaten Kopie,
Browser-/Cloudtest, Sicherung von Script/Properties/Triggern, Wiederherstellungsprobe
und Zuordnung der tatsächlich bereitgestellten produktiven Version erforderlich.
Ein Editorstand allein belegt keine Deployment-Version. Keine alten Projekte
blind überschreiben; im Apps-Script-Projekt dürfen Funktionen/Konstanten nicht
doppelt vorhanden sein. Kein Setup auf bestehenden Tabellen ausführen.

Das Frontend und dieses Backend müssen koordiniert umgestellt werden.
Vor produktiver Rücksetzung Schreibzugriffe aller Clients/Trigger schließen,
frisches Backup und Quellenabgleich durchführen und Replay-/Ack-Zustände gezielt
prüfen. Ein alter Request mit vorher unbekannter ID bleibt sonst erneut buchbar.
Dieser Entwurf enthält keine unbestätigte automatische Produktionsmigration.
