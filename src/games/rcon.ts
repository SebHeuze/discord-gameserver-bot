import type { RconConfig } from '../config.js';
import { resolveSecret } from './secrets.js';
import { rconExec } from './protocol-source.js';
import { webrconExec } from './protocol-webrcon.js';
import type { Players } from './types.js';

interface Dialect {
  playersCommands?: readonly string[];
  parsePlayers?: (responses: string[]) => Players;
  announce?: (message: string) => string;
  save?: string;
}

function lines(raw: string, skip: number): string[] {
  return raw
    .split(/\r?\n/)
    .slice(skip)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const DIALECTS: Record<string, Dialect> = {
  palworld: {
    playersCommands: ['ShowPlayers'],
    // CSV : name,playeruid,steamid
    parsePlayers: ([raw = '']) => {
      const names = lines(raw, 1)
        .map((line) => line.split(',')[0]?.trim() ?? '')
        .filter((name) => name.length > 0);
      return { online: names.length, names };
    },
    // Broadcast coupe au premier espace (bug amont) : d'où les underscores.
    announce: (message) => `Broadcast ${message.replace(/\s+/g, '_')}`,
    // `Save` et non `Shutdown` : avec `restart: unless-stopped`, un serveur
    // qui se termine seul serait relancé par Docker. L'arrêt, c'est StopStack.
    save: 'Save',
  },

  factorio: {
    playersCommands: ['/players online'],
    // « Online players (2): » puis « nom (online) » par ligne.
    parsePlayers: ([raw = '']) => {
      const names = lines(raw, 1).map((line) => line.replace(/\(online\)\s*$/, '').trim());
      return { online: names.length, names };
    },
    announce: (message) =>
      `/silent-command game.print("${message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
    save: '/server-save',
  },

  rust: {
    playersCommands: ['playerlist', 'serverinfo'],
    parsePlayers: ([listRaw = '[]', infoRaw = '{}']) => {
      const list = JSON.parse(listRaw) as { DisplayName?: string }[];
      const info = JSON.parse(infoRaw) as { Players?: number; MaxPlayers?: number };
      const names = list.map((player) => player.DisplayName ?? '?').filter((n) => n.length > 0);
      return {
        online: info.Players ?? names.length,
        ...(info.MaxPlayers === undefined ? {} : { max: info.MaxPlayers }),
        names,
      };
    },
    announce: (message) => `say ${message}`,
    save: 'server.save',
  },

  // Transport connu, commandes inconnues : ni annonce ni sauvegarde.
  generic: {},
};

export const DIALECT_NAMES = Object.keys(DIALECTS);

export interface Rcon {
  exec(commands: readonly string[]): Promise<string[]>;
  players?(): Promise<Players>;
  announce?(message: string): Promise<void>;
  save?(): Promise<void>;
}

export function buildRcon(config: RconConfig): Rcon {
  const password = resolveSecret(config.password);
  const target = { host: config.host, port: config.port, password, timeoutMs: config.timeout_ms };
  const exec =
    config.protocol === 'webrcon'
      ? (commands: readonly string[]) => webrconExec(target, commands)
      : (commands: readonly string[]) => rconExec(target, commands);

  const dialect = DIALECTS[config.dialect] ?? DIALECTS.generic!;

  return {
    exec,
    ...(dialect.playersCommands && dialect.parsePlayers
      ? {
          players: async (): Promise<Players> =>
            dialect.parsePlayers!(await exec(dialect.playersCommands!)),
        }
      : {}),
    ...(dialect.announce
      ? { announce: async (message: string) => void (await exec([dialect.announce!(message)])) }
      : {}),
    ...(dialect.save ? { save: async () => void (await exec([dialect.save!])) } : {}),
  };
}
