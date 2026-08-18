import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import type { Audit } from './audit.js';
import type { Config, ServerConfig } from './config.js';
import type { Env } from './env.js';
import type { GameAdapter } from './games/index.js';
import type { Komodo } from './komodo.js';
import type { Locks } from './locks.js';
import type { MemberLike } from './permissions.js';
import { visibleServers } from './permissions.js';

export interface Context {
  env: Env;
  config: Config;
  komodo: Komodo;
  adapters: Map<string, GameAdapter>;
  locks: Locks;
  audit: Audit;
}

/** discord.js donne un GuildMember quand la guilde est en cache, la charge
 *  d'interaction brute sinon. Les deux arrivent en pratique. */
export function memberOf(interaction: Interaction): MemberLike | undefined {
  const member = interaction.member;
  if (!member) return undefined;
  const roleIds = Array.isArray(member.roles)
    ? member.roles
    : [...member.roles.cache.keys()];
  return { id: interaction.user.id, roleIds };
}

/** N'accepte que ce que l'appelant a le droit de voir. Interdit et
 *  inexistant renvoient la même chose : rien ne distingue les deux. */
export function serverFor(
  ctx: Context,
  member: MemberLike,
  key: string | null,
): ServerConfig | undefined {
  if (!key) return undefined;
  return visibleServers(member, ctx.config).find((server) => server.key === key);
}

export function optionServer(interaction: ChatInputCommandInteraction): string | null {
  const option = interaction.options.get('serveur');
  return typeof option?.value === 'string' ? option.value : null;
}
