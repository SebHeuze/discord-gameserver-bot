# discord-gameserver-bot

Bot Discord pour piloter les serveurs de jeux du homelab : démarrer, arrêter,
redémarrer, et voir qui est connecté — sans donner à personne un accès à
l'infrastructure.

Il ne parle jamais au socket Docker. Toutes les actions passent par l'**API
Komodo**, avec une clé de Service User dont les permissions `Execute` se
limitent aux stacks `game-*`. Le déploiement (compose, matrice des droits,
secrets) vit dans [komodo-config](https://github.com/SebHeuze/komodo-config),
sous `stacks/discord-gamebot/`.

## Modèle de droits

Refus par défaut. Une action n'est accordée que par un **rôle Discord** porté
par l'appelant, ou par une exception nominative — les deux se cumulent, rien
ne retire jamais un droit.

```yaml
servers:
  palworld:
    stack: game-palworld
    roles:
      "<id du rôle joueurs>": [status, players, start, restart]
      "<id du rôle admin>":   [status, players, start, stop, restart]
    users:
      "<id discord>": [stop]
```

Conséquences voulues :

- ajouter un ami = lui donner le rôle dans Discord, sans commit ni
  redéploiement ;
- le salon d'où vient la commande n'entre **jamais** dans la décision — c'est
  précisément le raccourci qui rend DockerDiscordControl inutilisable pour cet
  usage : chez lui, un salon de contrôle donne accès à tous les conteneurs ;
- un serveur auquel on n'a aucun droit n'apparaît nulle part : ni dans
  `/serveurs`, ni dans l'autocomplétion, et une commande le visant répond la
  même chose qu'un serveur inexistant ;
- les boutons repassent par le même contrôle que les commandes, à chaque clic.

Chaque tentative, acceptée comme refusée, part dans un salon d'audit privé.

## Commandes

| Commande | Action requise |
|---|---|
| `/serveurs` | — (liste ce à quoi on a droit) |
| `/etat <serveur>` | `status` |
| `/joueurs <serveur>` | `players` |
| `/demarrer <serveur>` | `start` |
| `/arreter <serveur>` | `stop` |
| `/redemarrer <serveur>` | `restart` |

Un arrêt sur un serveur peuplé demande une confirmation explicite, prévient
les joueurs en jeu, puis force une sauvegarde avant de couper.

Au démarrage, la réponse arrive en deux temps : les images SteamCMD passent en
`running` bien avant que le jeu accepte une connexion, le bot attend donc que
le serveur réponde vraiment pour annoncer qu'il est prêt.

## Jeux supportés

La lecture (« qui est connecté ») passe par
[GameDig](https://github.com/gamedig/node-gamedig), qui implémente les
protocoles de requête publics de **358 jeux**. Ajouter un serveur ne demande
donc aucune ligne de code :

```yaml
  minecraft:
    label: Minecraft
    stack: game-minecraft
    query:
      type: gamedig
      game: minecraft     # identifiant GameDig
      host: Minecraft     # port omis : GameDig connaît celui du jeu
```

Ces protocoles sont en lecture seule et, pour la plupart, sans identifiants.

L'écriture — prévenir les joueurs d'un arrêt, forcer une sauvegarde — n'a pas
d'équivalent générique : elle passe par le RCON, dont les commandes changent
d'un jeu à l'autre. D'où un second bloc, facultatif, avec deux transports
(RCON Source, WebRCON de Rust) et une table de dialectes :

| Dialecte | Annonce | Sauvegarde |
|---|---|---|
| `palworld` | `Broadcast` | `Save` |
| `factorio` | `/silent-command game.print` | `/server-save` |
| `rust` | `say` | `server.save` |
| `generic` | — | — |

Un serveur sans bloc `rcon` reste pilotable : l'arrêt est simplement plus sec.
Un serveur sans `query` reste pilotable aussi, seul `/joueurs` lui manque.

Deux cas méritent un mot :

- **Factorio** s'interroge par son RCON local (`query: { type: rcon }`) et non
  par GameDig, qui passe par le serveur de matchmaking public de l'éditeur —
  ce qui suppose un serveur publié et une sortie Internet.
- **Palworld** s'interroge par son API REST, qui donne les pseudos *et* la
  limite de joueurs, là où son RCON ne donne que les pseudos. Elle demande
  `RESTAPIEnabled=True` ; à défaut, `query: { type: rcon }` fait l'affaire.

Les mots de passe ne sont pas recopiés dans la configuration quand le jeu les
génère lui-même : Factorio tire son `rconpw` au premier démarrage et Palworld
garde son `AdminPassword` dans `PalWorldSettings.ini` — les deux fichiers sont
montés en lecture seule et lus à la source, ce qui évite une duplication qui
se désynchroniserait en silence.

## Développement

```bash
npm ci
npm run lint
npm run typecheck
npm test          # droits, chargement de config, protocole RCON
npm run build
```

Les tests de `src/permissions.ts` sont les plus importants du dépôt : c'est le
seul endroit où un bug est une faille et non une gêne.

### Configuration locale

```bash
cp config.example.yaml config.yaml   # ignoré par git
DISCORD_TOKEN=… DISCORD_GUILD_ID=… AUDIT_CHANNEL_ID=… \
KOMODO_URL=https://… KOMODO_API_KEY=… KOMODO_API_SECRET=… \
CONFIG_PATH=./config.yaml npm start
```

| Variable | Rôle |
|---|---|
| `DISCORD_TOKEN` | jeton du bot |
| `DISCORD_GUILD_ID` | guilde où les commandes sont enregistrées (jamais en global) |
| `AUDIT_CHANNEL_ID` | salon privé du journal d'audit |
| `KOMODO_URL` | URL de Komodo Core |
| `KOMODO_API_KEY` / `KOMODO_API_SECRET` | clé du Service User |
| `KOMODO_TLS_INSECURE` | `true` si Core sert un certificat auto-signé |
| `CONFIG_PATH` | défaut `/app/config.yaml` |
| `LOG_LEVEL` | `debug`, `info` (défaut), `warn`, `error` |
| `RUST_RCON_PASSWORD`, … | tout secret référencé par un `from_env` du config.yaml |

Le bot refuse de démarrer si la configuration est invalide, si un secret de jeu
est introuvable, ou si une stack déclarée est hors du périmètre de la clé
Komodo. C'est délibéré : mieux vaut ne pas démarrer que découvrir le problème
au premier `/demarrer` d'un ami.

## Livraison

Chaque push sur `main` pousse `ghcr.io/sebheuze/discord-gameserver-bot:main`.
Le proxy cache Harbor l'expose en `harbor.lan/ghcr-prive/…`, Renovate y suit le
digest et met à jour le compose de la stack, que le sync Komodo redéploie.
Aucun report manuel de tag.
