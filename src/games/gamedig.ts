import { GameDig, type QueryOptions } from 'gamedig';
import type { GamedigQuery } from '../config.js';
import { resolveSecret } from './secrets.js';
import type { Players } from './types.js';

export function buildGamedigQuery(config: GamedigQuery): () => Promise<Players> {
  const options: QueryOptions = {
    type: config.game,
    host: config.host,
    ...(config.port === undefined ? {} : { port: config.port }),
    ...(config.username === undefined ? {} : { username: config.username }),
    ...(config.password === undefined ? {} : { password: resolveSecret(config.password) }),
    ...(config.token === undefined ? {} : { token: resolveSecret(config.token) }),
    // Un serveur éteint est le cas fréquent : une tentative, et les deux
    // plafonds au même niveau — sinon un hôte qui ne résout pas fait
    // attendre `attemptTimeout` en entier.
    maxRetries: 1,
    socketTimeout: config.timeout_ms,
    attemptTimeout: config.timeout_ms,
    // Le port configuré, pas une base à explorer.
    givenPortOnly: true,
  };

  return async (): Promise<Players> => {
    const state = await GameDig.query(options);
    const names = state.players
      .map((player) => player.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
    return {
      online: state.numplayers,
      ...(state.maxplayers ? { max: state.maxplayers } : {}),
      // Certains protocoles ne donnent qu'un compteur (Satisfactory) : pas
      // de liste vaut mieux qu'une liste tronquée sans le dire.
      ...(names.length > 0 ? { names } : {}),
    };
  };
}
