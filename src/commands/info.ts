import { MessageFlags, type RepliableInteraction } from 'discord.js';
import type { ServerConfig } from '../config.js';
import type { Context } from '../context.js';
import type { Players } from '../games/index.js';
import type { StackState } from '../komodo.js';
import { log } from '../log.js';
import { resolve, visibleServers, type MemberLike } from '../permissions.js';
import { buttons, statusEmbed, title } from '../ui.js';

/** L'échec de l'interrogation n'est pas une erreur : un serveur éteint ou en
 *  pleine mise à jour ne répond pas, et c'est une information. */
export async function describe(
  ctx: Context,
  server: ServerConfig,
): Promise<{ state: StackState; players?: Players; error?: string }> {
  const state = await ctx.komodo.state(server.stack);
  const adapter = ctx.adapters.get(server.key);
  if (!adapter?.query) return { state };
  try {
    return { state, players: await adapter.query() };
  } catch (err) {
    log.debug(`${server.key} unreachable`, (err as Error).message);
    return { state, error: (err as Error).message };
  }
}

export async function handleServers(
  ctx: Context,
  interaction: RepliableInteraction,
  member: MemberLike,
): Promise<void> {
  const servers = visibleServers(member, ctx.config);
  if (servers.length === 0) {
    await interaction.reply({
      content: "You don't have access to any server. Ask for the matching role.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = servers.map((server) => {
    const actions = [...resolve(member, server)].sort().join(', ');
    return `**${title(server)}** — \`${server.key}\`\n> ${actions}`;
  });
  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

export async function handleStatus(
  ctx: Context,
  interaction: RepliableInteraction,
  member: MemberLike,
  server: ServerConfig,
): Promise<void> {
  const { state, players, error } = await describe(ctx, server);
  await interaction.editReply({
    embeds: [statusEmbed(server, state, players, error)],
    components: buttons(server, resolve(member, server)),
  });
}

export async function handlePlayers(
  ctx: Context,
  interaction: RepliableInteraction,
  server: ServerConfig,
): Promise<void> {
  const adapter = ctx.adapters.get(server.key);
  if (!adapter?.query) {
    await interaction.editReply(`**${title(server)}** can't report who is online.`);
    return;
  }

  let players: Players;
  try {
    players = await adapter.query();
  } catch {
    await interaction.editReply(
      `**${title(server)}** isn't answering — it's off, or not ready yet.`,
    );
    return;
  }

  if (players.online === 0) {
    await interaction.editReply(`**${title(server)}**: nobody online.`);
    return;
  }

  const count = players.max === undefined ? `${players.online}` : `${players.online}/${players.max}`;
  const names = players.names?.length ? `\n> ${players.names.join(', ')}` : '';
  await interaction.editReply(`**${title(server)}**: ${count} online.${names}`);
}
