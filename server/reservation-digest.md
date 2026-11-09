# Reservationsübersicht per Mail

Empfänger und Absender: reservation@fonduehuesli.ch.

Die aktivierte ChatGPT-Automation «Reservationsübersicht per Mail» ruft um 05:00 und 18:00 Uhr in Europe/Zurich die eingeschränkte Datenbankfunktion auf:

```sql
select private.reservation_digest_run() as result;
```

Die Funktion erstellt einen eingefrorenen Textbericht aus neuen Maileingängen und neuen manuellen Reservationen seit dem letzten erfolgreichen Bericht. Verknüpfte Reservationen werden nicht doppelt gezählt. Excel-Importe werden nicht als neue Maileingänge ausgegeben. Der erste Berichtszeitraum beginnt am 09.11.2026 um 18:00 Uhr; der erste Versand ist am 10.11.2026 um 05:00 Uhr fällig. Auch bei null neuen Eingängen wird ein Bericht gesendet.

Die Antwort `pending` erfordert weitere Statusprüfungen in neuen Transaktionen. Erst eine erfolgreiche Resend-Antwort mit Versand-ID verschiebt den Zeitstempel. Versandannahme ist keine Bestätigung der Zustellung im Postfach. Wiederholungen verwenden denselben Idempotenzschlüssel; nach drei Versuchen oder Ablauf der sicheren Wiederholungsfrist ist eine manuelle Prüfung erforderlich. Geheimnisse bleiben in Vault und verlassen die Datenbank nur im Authentifizierungsheader an Resend. Es gibt keine öffentliche RPC und keinen Zugriff für anonyme oder angemeldete Frontend-Benutzer.

Die Übersicht selbst wird beim erneuten Eingang über die Mailweiterleitung ignoriert. Keine Reservation wird durch diese Routine verändert oder bestätigt. Die SQL-Tests laufen ausschliesslich innerhalb einer zurückgerollten Transaktion; pg_net startet HTTP-Anfragen erst nach einem Commit.
