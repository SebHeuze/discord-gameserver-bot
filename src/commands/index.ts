// Les boutons repassent par le même contrôle que les commandes : un message
// public reste cliquable par n'importe qui, longtemps après avoir été posté.
import {
  MessageFlags,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { Action } from '../config.js';
import { memberOf, optionServer, serverFor, type Context } from '../context.js';
import { log } from '../log.js';
import { can, visibleServers } from '../permissions.js';
import { BUTTON_PREFIX } from '../ui.js';
import { handlePlayers, handleServers, handleStatus } from './info.js';
import { handlePower, isPowerAction, REFUSED } from './power.js';

const COMMAND_ACTIONS: Record<string, Action> = {
  etat: 'status',
  joueurs: 'players',
  demarrer: 'start',
  arreter: 'stop',
  redemarrer: 'restart',
};

export async function onInteraction(ctx: Context, interaction: Interaction): Promise<void> {
  try {
    if (interaction.isAutocomplete()) await onAutocomplete(ctx, interaction);
    else if (interaction.isChatInputCommand()) await onCommand(ctx, interaction);
    else if (interaction.isButton()) await onButton(ctx, interaction);
  } catch (err) {
    log.error('interaction non traitée', err);
  }
}

async function onAutocomplete(ctx: Context, interaction: AutocompleteInteraction): Promise<void> {
  const member = memberOf(interaction);
  if (!member) {
    await interaction.respond([]);
    return;
  }
  const search = interaction.options.getFocused().toLowerCase();
  const choices = visibleServers(member, ctx.config)
    .filter((server) => server.key.includes(search) || server.label.toLowerCase().includes(search))
    .slice(0, 25)
    .map((server) => ({ name: server.label, value: server.key }));
  await interaction.respond(choices);
}

async function onCommand(ctx: Context, interaction: ChatInputCommandInteraction): Promise<void> {
  const member = memberOf(interaction);
  if (!member) {
    await interaction.reply({
      content: 'Cette commande ne fonctionne que depuis le serveur Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'serveurs') {
    await handleServers(ctx, interaction, member);
    return;
  }

  const action = COMMAND_ACTIONS[interaction.commandName];
  const server = serverFor(ctx, member, optionServer(interaction));
  if (!action || !server || !can(member, server, action)) {
    await interaction.reply(REFUSED);
    await ctx.audit.record({
      userId: member.id,
      userTag: interaction.user.username,
      action: interaction.commandName,
      server: optionServer(interaction) ?? '—',
      outcome: 'refusé',
    });
    return;
  }

  await interaction.deferReply();

  if (action === 'status') await handleStatus(ctx, interaction, member, server);
  else if (action === 'players') await handlePlayers(ctx, interaction, server);
  else if (isPowerAction(action)) {
    await handlePower(ctx, interaction, member, server, action, {
      userTag: interaction.user.username,
    });
  }
}

async function onButton(ctx: Context, interaction: ButtonInteraction): Promise<void> {
  const [prefix, rawAction, key] = interaction.customId.split(':');
  if (prefix !== BUTTON_PREFIX || !rawAction || !key) return;

  const confirmed = rawAction === 'stop-confirm';
  const action = (confirmed ? 'stop' : rawAction) as Action;

  const member = memberOf(interaction);
  const server = member ? serverFor(ctx, member, key) : undefined;
  if (!member || !server || !can(member, server, action)) {
    await interaction.reply(REFUSED);
    if (member) {
      await ctx.audit.record({
        userId: member.id,
        userTag: interaction.user.username,
        action: `bouton ${rawAction}`,
        server: key,
        outcome: 'refusé',
      });
    }
    return;
  }

  await interaction.deferReply();

  if (action === 'status') {
    await handleStatus(ctx, interaction, member, server);
    return;
  }
  if (isPowerAction(action)) {
    await handlePower(ctx, interaction, member, server, action, {
      confirmed,
      userTag: interaction.user.username,
    });
  }
}

export { definitions } from './definitions.js';
