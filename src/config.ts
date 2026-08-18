// Le fichier réel est versionné dans komodo-config et monté en lecture
// seule ; ici, seul config.example.yaml.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const ACTIONS = ['status', 'players', 'start', 'stop', 'restart'] as const;
export type Action = (typeof ACTIONS)[number];

const action = z.enum(ACTIONS);
const snowflake = z.string().regex(/^\d{17,20}$/, 'ID Discord invalide');

/** Aucun secret n'est écrit dans le YAML. Le lire dans le fichier du jeu
 *  évite de dupliquer une valeur que celui-ci génère lui-même. */
const secretRef = z.union([
  z.object({ from_env: z.string().min(1) }),
  z.object({ from_file: z.string().min(1) }),
  z.object({
    from_ini: z.string().min(1),
    key: z.string().min(1).default('AdminPassword'),
  }),
]);
export type SecretRef = z.infer<typeof secretRef>;

/** https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md */
const gamedigQuery = z.object({
  type: z.literal('gamedig'),
  /** `palworld`, `minecraft`, `valheim`, … */
  game: z.string().min(1),
  host: z.string().min(1),
  /** Omis, GameDig prend le port par défaut du jeu. */
  port: z.number().int().positive().optional(),
  /** Propres à certains protocoles : Palworld veut `admin` et son
   *  AdminPassword, Terraria un token. */
  username: z.string().optional(),
  password: secretRef.optional(),
  token: secretRef.optional(),
  timeout_ms: z.number().int().positive().default(5000),
});
export type GamedigQuery = z.infer<typeof gamedigQuery>;

const query = z.discriminatedUnion('type', [
  gamedigQuery,
  /** Interrogation par le RCON déclaré plus bas, quand le protocole de
   *  requête est absent ou moins bon : GameDig n'interroge Factorio qu'à
   *  travers le matchmaking public de l'éditeur. */
  z.object({ type: z.literal('rcon') }),
  /** Pilotable mais muet : /joueurs répondra « non supporté ». */
  z.object({ type: z.literal('none') }),
]);
export type QueryConfig = z.infer<typeof query>;

/** Sans bloc rcon, l'arrêt se fait sans prévenir ni sauvegarder. */
const rcon = z.object({
  protocol: z.enum(['source', 'webrcon']).default('source'),
  /** `generic` ne connaît aucune commande : ni annonce ni sauvegarde. */
  dialect: z.enum(['palworld', 'factorio', 'rust', 'generic']).default('generic'),
  host: z.string().min(1),
  port: z.number().int().positive(),
  password: secretRef,
  timeout_ms: z.number().int().positive().default(5000),
});
export type RconConfig = z.infer<typeof rcon>;

const server = z
  .object({
    label: z.string().min(1),
    /** La seule chose que le bot touche. */
    stack: z.string().min(1),
    emoji: z.string().optional(),
    query: query.default({ type: 'none' }),
    rcon: rcon.optional(),
    /** Surcharge du plafond global : Rust vérifie une dizaine de
     *  gigaoctets au démarrage, Factorio est prêt en secondes. */
    startup_timeout_seconds: z.number().int().positive().optional(),
    /** Ajouter un ami, c'est lui donner le rôle dans Discord, sans
     *  toucher à ce fichier. */
    roles: z.record(snowflake, z.array(action)).default({}),
    /** Cumulé avec les rôles, jamais soustrait. */
    users: z.record(snowflake, z.array(action)).default({}),
  })
  .check((ctx) => {
    // Dit au chargement, plutôt qu'au premier /joueurs, qu'il ne sortira rien.
    if (ctx.value.query.type !== 'rcon') return;
    if (!ctx.value.rcon) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value,
        path: ['query'],
        message: "query.type « rcon » demande un bloc « rcon »",
      });
      return;
    }
    if (ctx.value.rcon.dialect === 'generic') {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value,
        path: ['rcon', 'dialect'],
        message: "le dialecte « generic » ne sait pas lister les joueurs",
      });
    }
  });
export type ServerConfig = z.infer<typeof server> & { key: string };

const configSchema = z.object({
  cooldown_seconds: z.number().int().nonnegative().default(60),
  /** Large : les images SteamCMD mettent le jeu à jour à chaque démarrage. */
  startup_timeout_seconds: z.number().int().positive().default(1800),
  servers: z.record(z.string().regex(/^[a-z0-9-]+$/), server),
});

export type Config = {
  cooldownSeconds: number;
  startupTimeoutSeconds: number;
  servers: Map<string, ServerConfig>;
};

/** Lus en BigInt puis ramenés en number : un ID Discord non quoté dépasse
 *  MAX_SAFE_INTEGER et arriverait arrondi — 111111111111111111 devient
 *  111111111111111100, un rôle qui ne correspond à personne, sans erreur. */
function fromBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Entier hors limites dans config.yaml : ${value}`);
    }
    return Number(value);
  }
  if (Array.isArray(value)) return value.map(fromBigInt);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromBigInt(v)]));
  }
  return value;
}

export function loadConfig(path: string): Config {
  const raw = fromBigInt(parse(readFileSync(path, 'utf8'), { intAsBigInt: true }));
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`config.yaml invalide :\n${z.prettifyError(parsed.error)}`);
  }
  const servers = new Map<string, ServerConfig>(
    Object.entries(parsed.data.servers).map(([key, value]) => [key, { ...value, key }]),
  );
  if (servers.size === 0) throw new Error('config.yaml ne déclare aucun serveur');
  return {
    cooldownSeconds: parsed.data.cooldown_seconds,
    startupTimeoutSeconds: parsed.data.startup_timeout_seconds,
    servers,
  };
}
