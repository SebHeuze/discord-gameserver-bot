// Les secrets sont résolus ici, au démarrage : un rconpw absent fait échouer
// le lancement, pas la première commande d'un ami.
import type { ServerConfig } from '../config.js';
import { buildGamedigQuery } from './gamedig.js';
import { buildRcon } from './rcon.js';
import type { GameAdapter, Players } from './types.js';

function build(server: ServerConfig): GameAdapter | undefined {
  const rcon = server.rcon ? buildRcon(server.rcon) : undefined;

  let query: (() => Promise<Players>) | undefined;
  if (server.query.type === 'gamedig') query = buildGamedigQuery(server.query);
  else if (server.query.type === 'rcon') query = rcon?.players;

  if (!query && !rcon) return undefined;

  return {
    ...(query ? { query } : {}),
    ...(rcon?.announce ? { announce: rcon.announce } : {}),
    ...(rcon?.save ? { save: rcon.save } : {}),
  };
}

export function buildAdapters(servers: Iterable<ServerConfig>): Map<string, GameAdapter> {
  const adapters = new Map<string, GameAdapter>();
  for (const server of servers) {
    try {
      const adapter = build(server);
      if (adapter) adapters.set(server.key, adapter);
    } catch (err) {
      throw new Error(`Serveur « ${server.key} » : ${(err as Error).message}`);
    }
  }
  return adapters;
}

export type { GameAdapter, Players } from './types.js';
