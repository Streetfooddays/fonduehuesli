# Automatische Bestätigung – vorbereitet, nicht aktiviert

Die Konfiguration `private.automatic_confirmation_config` startet mit `enabled=false`, `activated_at=null` und `activated_by=null`. Es gibt keinen Aktivierungsschalter in der Oberfläche. In diesem Zustand bricht der Maileingang vor jedem Versandaufruf und vor jeder definitiven Eintragung ab. Der bisherige vorläufige Maileingang bleibt unverändert.

Vorschau: «Bestätigungsvorlage» → «Automatische Bestätigung». Die Vorschau ist ausschliesslich lesend.

## Regeln

- Alle nicht stornierten Reservationen eines Tages werden zusammengezählt, einschliesslich Mittag, Abend, offenen Anfragen und der gerade eingetragenen neuen Anfrage. 70 ist zulässig, 71 nicht.
- Keine Bemerkungen, internen Notizen oder offenen Rückfragen. Bekannte technische Weebly-Trackinglinks gelten nicht als Bemerkung.
- Eindeutiges Datum, Uhrzeit, Name, gültige E-Mail und mindestens eine Person. Keine Prüfwarnungen, möglichen Doppelreservationen, Gondelwünsche oder manuell gesperrten Tage.
- Bereits bearbeitete Anfragen bleiben manuell. Eine spätere Aktivierung verarbeitet keinen alten Rückstand.
- Vorlage und Signatur werden aus den bestehenden Einstellungen eingefroren. Ohne bereits geprüfte Anrede wird «Hallo [Name]» verwendet.

## Ablauf nach einer ausdrücklich beauftragten späteren Aktivierung

Ein signierter Maileingang erstellt weiterhin zuerst die vorläufige Reservation. Der vorbereitete Handler prüft danach die Konfiguration. Nur bei Aktivierung durch ein aktives, verifiziertes Administrationskonto und nur für Mails ab `activated_at` kann die Automatik fortfahren.

Nach der Absenderdomainprüfung werden Datum, Bemerkungen und Kapazität innerhalb derselben Datenbanksperre wie manuelle Reservationen nochmals geprüft. Die vorhandene Reservation wird aktualisiert, ohne einen zweiten Listeneintrag anzulegen. Ein eindeutiger Ausgangseintrag friert Empfänger und Mailtext ein. Versand verwendet denselben Idempotenzschlüssel wie die bestehende Bestätigungsfunktion. Fehler erscheinen unter «Versand offen» und bleiben manuell erneut ausführbar. Eine Pause stoppt auch automatische Wiederholungen.

## Prüfung

`automatic-confirmation.test.mjs` prüft insbesondere, dass deaktivierte Automatik keinerlei Provideraufruf oder schreibenden Folgeaufruf ausführt. `server/automatic-confirmation-test.sql` prüft lesend die Grenzwerte 70/71, Bemerkungen, Trackinglinks, interne Notizen, unklare Angaben und manuelle Tage. Die SQL-Tests aktivieren die Konfiguration zu keinem Zeitpunkt und rollen alle synthetischen Daten zurück.
