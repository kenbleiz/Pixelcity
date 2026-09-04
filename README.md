# Chatville / Pixelcity

Ville pixel persistante construite **en live par le chat Twitch**. Pas de caméra streamer : la ville **est** le stream. OBS charge une URL Browser Source.

The repo may be named Pixelcity — the product is Chatville. Same app.

---

## Démarrer

```bash
cp .env.example .env   # optionnel
npm install
npm run dev
```

Le serveur écoute sur [http://localhost:3000](http://localhost:3000) :

| URL | Usage |
| --- | --- |
| `/` ou `/simulator` | Simulateur chat + follow/sub/bits (dev) |
| `/overlay` | **Ville** — Browser Source principal OBS (opaque, 1920×1080) |
| `/overlay/alerts` | Dernier tip / derniers events (fond **transparent**) |
| `/overlay/goal` | Barre d’objectif collectif (fond **transparent**) |

Persistance : `data/town.json` (la carte survit à un restart). Tests : `npm test`.

---

## OBS — Browser Sources

Ajoute **3 sources** (scène 1920×1080). Ordre du bas vers le haut :

1. **Ville** (fond de stream)
   - Source → *Browser*
   - URL : `http://localhost:3000/overlay`
   - Width `1920` / Height `1080`
   - **Ne pas** cocher de fond personnalisé : la page est déjà opaque.
   - Décoche « Shutdown source when not visible » si tu coupes la scène souvent.

2. **Objectif**
   - URL : `http://localhost:3000/overlay/goal`
   - Width `1920` / Height `1080`
   - Fond transparent (la page utilise `background: transparent`). Dans OBS, aucun Custom CSS n’est requis. Si le fond reste noir : Custom CSS `body { background-color: rgba(0,0,0,0) !important; }`

3. **Alerts / last tip**
   - URL : `http://localhost:3000/overlay/alerts`
   - Width `1920` / Height `1080`
   - Même transparence que l’objectif.

Si OBS tourne sur **une autre machine**, remplace `localhost` par l’IP LAN du PC qui lance `npm run dev` (ex. `http://192.168.1.20:3000/overlay`).

Refresh : clic droit sur la source → *Refresh*. Le overlay se met à jour tout seul via WebSocket.

---

## Commandes chat

Insensibles à la casse, préfixe `!`. Coordonnées optionnelles **0–49**.

| Commande | Effet |
| --- | --- |
| `!build` / `!build x y` | Maison sur une case libre (auto ou coords) |
| `!road` / `!road x y` | Route |
| `!park` / `!park x y` | Parc |
| `!demolish` / `!demolish x y` | Enlève une case **non protégée** |
| `!vote` | +1 à l’objectif collectif |

Chaque pose enregistre le **dernier builder** (pseudo).

### Anti-spam

- Cooldown court par viewer (`COOLDOWN_MS`, défaut 2 s).
- Démolition : max 3 / minute et 8 / 10 min par viewer — un seul chat ne peut pas raser la carte.
- Les tuiles `metro` (récompense d’objectif) sont protégées.

### Events Twitch (simulés)

| Event | Effet |
| --- | --- |
| Follow | Un arbre pousse |
| Sub | Maison ou boutique |
| Bits | Flash visuel or + log « last tip » |

Objectif par défaut : **100** (maisons + votes) → débloque une **station de métro** au centre.

---

## Brancher Twitch plus tard

Le MVP **n’ouvre pas** IRC ni EventSub. Le simulateur POST sur :

- `POST /api/chat` `{ user, message }`
- `POST /api/twitch/follow` `{ user }`
- `POST /api/twitch/sub` `{ user, tier? }`
- `POST /api/twitch/bits` `{ user, amount }`

Extension points (TODOs dans le code) :

- `src/twitch/irc.ts` — client IRC / `tmi.js`, variables `TWITCH_CHANNEL`, `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`
- `src/twitch/eventsub.ts` — webhook EventSub (`channel.follow`, `channel.subscribe`, `channel.cheer`) + HMAC, variables `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_BROADCASTER_ID`, `TWITCH_EVENTSUB_CALLBACK_URL`

Copie `.env.example` → `.env`. Même `Game.handleChat` / `handleFollow` / `handleSub` / `handleBits` pour le simulé et le vrai Twitch.

---

## English (short)

```bash
npm install && npm run dev
```

Point OBS Browser Sources at:

- `http://localhost:3000/overlay` — opaque town (1920×1080)
- `http://localhost:3000/overlay/alerts` — transparent last-tip / events
- `http://localhost:3000/overlay/goal` — transparent metro goal bar

Use `/simulator` to fake chat (`!build`, `!road`, `!park`, `!demolish`, `!vote`) and follow/sub/bits. Town state is saved to `data/town.json`. Twitch IRC/EventSub are stubbed; fill `TWITCH_*` env vars and implement `src/twitch/*` when you go live.
