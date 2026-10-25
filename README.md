# Fonduehüsli Reservationsbuch

Eigenständige Oberfläche mit E-Mail-/Passwortanmeldung, freigeschaltetem Teamzugang, Tagesverwaltung, manuellen Zusagen, Druck und CSV-Export. Daten verbleiben in Supabase. Keine automatischen Reservations-E-Mails.

Build und Tests: `npm run build`. Auf Render als Static Site mit Publish Directory `public` bereitstellen. Es gibt keine Build-Abhängigkeiten.

Neue Teamzugänge werden durch die Administration angelegt. Der persönliche Aktivierungslink kann einmalig verwendet werden, um ein Passwort festzulegen. Der Erstzugang der bereits freigeschalteten Administration wird unter «Erstzugang einrichten» erstellt und per E-Mail verifiziert.

Der im Browser verwendete Supabase Publishable Key ist öffentlich. Zugriffsschutz wird durch Datenbankrichtlinien und verifizierte Teamzugehörigkeit erzwungen. Keine Datenexporte oder geheimen Schlüssel in dieses Repository aufnehmen.
