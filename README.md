# Steckbrief-Quiz online

Multiplayer-Version des Team-Steckbrief-Quiz: Der Host lädt die CSV hoch und erstellt eine Session.
Alle Teammitglieder treten per Code/QR-Code bei und raten gleichzeitig auf ihrem eigenen Gerät.
Die Punkte werden automatisch vergeben.

- `/` – Beitreten (Code + Name)
- `/host` – CSV laden, Session erstellen, Quiz steuern (am besten per Bildschirm teilen)
- `/play` – Spieler-Ansicht

## Lokal testen

```bash
npm install
npm run dev      # http://localhost:3000 – nutzt einen In-Memory-Speicher
```

## Auf Vercel deployen

1. Ordner `online/` in ein GitHub-Repo pushen (oder `npx vercel` direkt in diesem Ordner ausführen).
2. Auf vercel.com: **Add New → Project** → Repo importieren. Framework Preset: **Other** (alles andere steht in `vercel.json`).
3. Im Projekt unter **Storage → Create Database → Upstash for Redis** (Free-Plan) anlegen und mit dem Projekt verbinden.
   Dadurch werden `KV_REST_API_URL`/`KV_REST_API_TOKEN` (bzw. `UPSTASH_REDIS_REST_*`) automatisch gesetzt.
4. Optional, empfohlen: Umgebungsvariable `HOST_PASSWORD` setzen. Dann kann nur, wer das Passwort kennt, Sessions erstellen.
5. Neu deployen, fertig.

## Spielablauf

- **Timer:** standardmäßig 15 Sekunden pro Frage (beim Erstellen einstellbar, 0 = ohne Timer). Zu späte Antworten lehnt der Server ab.
- **Punkte nach Schnelligkeit:** Die schnellste richtige Antwort bekommt 500 Punkte, dann 400, 300 und 250. Alle weiteren Richtigen bekommen 200, falsche Antworten 0.
- **Hinweis-Modus:** bis zu 3 Hinweise zur selben Person, der Timer startet bei jedem Hinweis neu. Wer erst beim 2. Hinweis antwortet, bekommt ⅔ der Punkte, beim 3. Hinweis ⅓.
- **⚡ Automatisch weiter** (in der Host-Ansicht): löst auf, sobald alle geantwortet haben oder die Zeit abgelaufen ist (im Hinweis-Modus kommt dann erst der nächste Hinweis).
- **Musik & Sounds:** Chiptune-Hintergrundmusik und Effekte, komplett im Browser erzeugt (keine Audiodateien). Jedes Gerät schaltet Musik (🎵) und Effekte (🔔) getrennt ein und aus.
- Jede*r kann pro Frage nur einmal antworten. Die Lösung verlässt den Server erst bei „Auflösen“.
- Personen, die seltener dran waren, werden bevorzugt gezogen.
- Der Host kann über „Selbst mitspielen“ mitraten. Sein Tipp wird auf dem geteilten Bildschirm nicht angezeigt, und die Lösung bekommt er vorab nicht.
- „Neue Runde“ setzt die Punkte auf 0, die Spieler*innen bleiben in der Session.

## Hinweise

- Sessions und Steckbrief-Daten werden 12 Stunden in Redis gespeichert und dann automatisch gelöscht.
- Die Clients fragen den Spielstand alle 1,5 s ab (Polling). Bei 10 Spieler*innen sind das ca. 50–70 Tsd.
  Redis-Befehle pro Stunde Spielzeit; der Upstash-Free-Plan reicht für gelegentliche Quizrunden.
