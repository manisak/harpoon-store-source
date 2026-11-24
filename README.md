# Harpoon Store

Community-Verzeichnis für SailfishOS-Apps im Stil von Openrepos – jede App mit
QR-Code, den Harpoon direkt scannen kann.

- Node.js + Express + SQLite (`data/store.db`), läuft auf dem Pi
- Login/Registrierung (scrypt-Hashes, Sessions in SQLite, 30 Tage Cookie)
- **Der erste registrierte Account wird automatisch Admin.**
- Eingereichte Apps anderer User starten als `pending` und werden im Admin-Bereich freigegeben
- 13 Kategorien, Suche, Badge-Browse
- QR-Codes serverseitig (qrcode-NPM) generiert: `/app/<id>/qr`
  - ohne Quellenangabe/paketname: einfache Repo-URL (kürzester Code)
  - sonst: `harpoon://add?url=...&source=...&package=...` (vgl. Harpoon docs/add-to-harpoon.md)

## Start

```sh
cd harpoon-store && node server.js   # Port 8080
```

Läuft: http://192.168.1.107:8080 (LAN). Für öffentliche Erreichbarkeit:
Port-Forward/Tailscale/Reverse-Proxy + HTTPS (Caddy empfohlen) und statischen
`SESSION_SECRET` setzen.

## Admin

- Liste/Freigaben/Verstecken: `/admin` (nur Admins)

## Sicherheit

- scrypt-Passwort-Hashes, HttpOnly-Sessions (SQLite), Parameter-SQL, HTML-Escaping
- Security-Header (nosniff, DENY, Referrer-Policy, CSP) serverseitig gesetzt
- Rate-Limit: max. 8 Login/Registrierungs-Versuche pro IP und 10 Minuten
- Registrierungen brauchen Admin-Freigabe (users.active)
- Offene Punkte: DB-Backups, CSRF-Tokens, strengeres CSP

## Disclaimer

Footer + App-Seiten + Einreichformular: Community-Index „as is", Betreiber hostet/prüft/unterstützt keine Apps, keine Gewähr/Haftung.

## systemd (Autostart)

User-Unit: `~/.config/systemd/user/harpoon-store.service` (Restart=always, Linger=yes).
Verwalten mit: `systemctl --user status|restart|stop harpoon-store` – Port 8080.

## Hauptsicherung (Fallback)

Hauptzustand unter ~/backups/harpoon-store/main/ (MAIN.txt = aktuelle Referenz; DB-Integrität geprüft).
Wiederherstellen: systemctl --user stop harpoon-store; DB nach data/store.db kopieren; Icons aus dem Code-Paket nach data/icons entpacken; systemctl --user start harpoon-store.
- 2026-11-16 19:58: Stand = freie Veröffentlichung der Apps, „My apps"-Übersicht, Admin-Split (Pending/All apps), getestet & integritätsgeprüft.
- 2026-11-16 22:23: Stand = Screenshots beim Posten (Icon+screenshots in einem Formular), Upload-Limits angepasst, saubere Testdaten.
- 2026-11-17 19:47: Registrierung mit Pflicht-Message, Status-Checkseite, Newest-12-Sektion; Backup aktualisiert.
- 2026-11-22 21:41: Legal-Notice auf Startseite, Community-Forum hinzugekommen; Backup-Aktualisierung (forum.js im Tarball).
- 2026-11-23 13:00: Rollen (user/developer), Contributors, Install options, Current-Version-Anzeige + Automation harpoon-store-versions (4×/Tag).
