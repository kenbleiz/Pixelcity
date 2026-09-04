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

### Events Twitch (simulés **ou** réels)

| Event | Effet |
| --- | --- |
| Follow | Un arbre pousse |
| Sub | Maison ou boutique |
| Bits | Flash visuel or + log « last tip » |

Objectif par défaut : **100** (maisons + votes) → débloque une **station de métro** au centre.

Sans variables `TWITCH_*`, le simulateur reste suffisant :

- `POST /api/chat` `{ user, message }`
- `POST /api/twitch/follow` `{ user }`
- `POST /api/twitch/sub` `{ user, tier? }`
- `POST /api/twitch/bits` `{ user, amount }`

Les vrais events Twitch appellent **les mêmes** `Game.handleChat` / `handleFollow` / `handleSub` / `handleBits`.

---

## Brancher Twitch (IRC + EventSub)

Copie `.env.example` → `.env`. **Ne commite jamais `.env`** (déjà dans `.gitignore`).

Chat seul (commandes `!build` etc. depuis le salon) : remplis IRC, relance `npm run dev`. Follow / sub / bits : EventSub en plus, avec une URL **HTTPS publique**.

### 1. Créer une application Twitch

1. Va sur [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) (compte Twitch du streamer, ou un compte bot).
2. **Register Your Application**.
3. Name : `Chatville` (ou ce que tu veux).
4. OAuth Redirect URLs : `http://localhost:3000` (suffit pour l’autorisation EventSub ci‑dessous).
5. Category : *Application Integration* / *Chat Bot*.
6. Crée l’app, puis **Manage** → copie **Client ID** et génère un **Client Secret**.

Dans `.env` :

```
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
```

### 2. Token chat (IRC)

Le bot doit pouvoir lire le chat. Le plus simple :

1. Connecte-toi sur Twitch **avec le compte bot** (ou le compte streamer).
2. Ouvre [twitchapps.com/tmi](https://twitchapps.com/tmi/) → **Connect** → autorise → copie le token `oauth:…`.
   Alternative : [twitchtokengenerator.com](https://twitchtokengenerator.com/) (scope `chat:read`) ou Twitch CLI `twitch token -u -s "chat:read"`.
3. Dans `.env` :

```
TWITCH_CHANNEL=ton_salon          # sans #
TWITCH_BOT_USERNAME=ton_bot       # optionnel : défaut = le channel
TWITCH_OAUTH_TOKEN=oauth:xxxxxxxx
```

Le token `oauth:` expire parfois : régénère-le si IRC refuse la connexion.

Relance `npm run dev`. Les logs doivent afficher `[twitch/irc] connected to #ton_salon`. Un `!build` dans le chat Twitch pose une maison sur le overlay.

### 3. Broadcaster ID (EventSub)

L’ID numérique du streamer, **pas** le pseudo.

```bash
curl -s -H "Client-ID: $TWITCH_CLIENT_ID" \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN" \
  "https://api.twitch.tv/helix/users?login=ton_salon"
```

Ou un convertisseur du type [streamweasels.com/tools/convert-twitch-username-to-user-id](https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/).

```
TWITCH_BROADCASTER_ID=123456789
```

### 4. Secret EventSub (tu le choisis)

Ce n’est **pas** le Client Secret. Une chaîne ASCII **10–100** caractères, par ex. :

```
openssl rand -hex 32
```

```
TWITCH_EVENTSUB_SECRET=une_chaine_aleatoire_longue
```

Twitch s’en sert pour signer les POST. Le serveur vérifie `Twitch-Eventsub-Message-Signature` (HMAC-SHA256) et refuse tout le reste (403).

### 5. URL publique HTTPS (ngrok en local)

Twitch n’appelle **pas** `http://localhost`. En local :

```bash
# autre terminal — installe ngrok si besoin : https://ngrok.com
ngrok http 3000
```

Copie l’URL **https** (ex. `https://abcd-12.ngrok-free.app`) :

```
TWITCH_EVENTSUB_CALLBACK_URL=https://abcd-12.ngrok-free.app
```

Le serveur ajoute `/twitch/eventsub` si tu ne mets que l’origine. En prod, pointe vers ton HTTPS public.

**Relance `npm run dev` après ngrok** (l’URL change à chaque session gratuite). Au boot, Chatville prend un *app access token* et crée les subs `channel.follow`, `channel.subscribe`, `channel.subscription.message`, `channel.cheer` si elles n’existent pas déjà.

Webhook : `POST /twitch/eventsub` (challenge + notifications). `GET /twitch/eventsub` sert à vérifier que l’endpoint répond.

### 6. Autoriser l’app (scopes EventSub)

Les webhooks utilisent un **app access token**, mais Twitch exige que le **streamer** ait déjà autorisé l’app :

- `moderator:read:followers` (follows)
- `channel:read:subscriptions` (subs)
- `bits:read` (cheers)

Ouvre cette URL dans le navigateur **connecté au compte streamer** (remplace `CLIENT_ID`) :

```
https://id.twitch.tv/oauth2/authorize?client_id=CLIENT_ID&redirect_uri=http://localhost:3000&response_type=token&scope=moderator:read:followers+channel:read:subscriptions+bits:read
```

Accepte. Le token dans le fragment d’URL n’a **pas** besoin d’être collé dans `.env` — l’autorisation est liée au Client ID. Relance le serveur si les subs EventSub avaient échoué en `forbidden`.

### 7. Vérifier

```bash
curl -s http://localhost:3000/api/health
```

`irc.connected` et `eventSub.ready` doivent passer à `true` une fois configurés. Sans `TWITCH_*`, l’app tourne quand même (simulateur seul) — les logs indiquent clairement ce qui est skippé.

---

## English (short)

```bash
cp .env.example .env   # fill TWITCH_* to go live; leave blank for simulator-only
npm install && npm run dev
```

OBS Browser Sources:

- `http://localhost:3000/overlay` — opaque town (1920×1080)
- `http://localhost:3000/overlay/alerts` — transparent last-tip / events
- `http://localhost:3000/overlay/goal` — transparent metro goal bar

`/simulator` still fakes chat (`!build`, `!road`, `!park`, `!demolish`, `!vote`) and follow/sub/bits. Town state is saved to `data/town.json`.

**IRC:** set `TWITCH_CHANNEL` + `TWITCH_OAUTH_TOKEN` (token from [twitchapps.com/tmi](https://twitchapps.com/tmi/); `TWITCH_BOT_USERNAME` optional). Chat commands hit the same `Game.handleChat` path as `POST /api/chat`. Reconnects with backoff.

**EventSub:** set Client ID/Secret, a 10–100 char `TWITCH_EVENTSUB_SECRET`, broadcaster id, and a **public HTTPS** `TWITCH_EVENTSUB_CALLBACK_URL` (ngrok for local: `ngrok http 3000`). The streamer must authorize the app once (`moderator:read:followers`, `channel:read:subscriptions`, `bits:read`). Follow / sub / cheer call the same handlers as the simulator. Signatures are verified strictly; `.env` is gitignored.
