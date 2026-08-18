import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { Action, ServerConfig } from './config.js';
import type { Players } from './games/index.js';
import { Komodo, type StackState } from './komodo.js';

export const BUTTON_PREFIX = 'gs';

const STATE_LABEL: Record<string, string> = {
  running: '🟢 en ligne',
  restarting: '🟠 redémarrage',
  deploying: '🟠 déploiement',
  stopped: '⚫ arrêté',
  created: '⚫ arrêté',
  down: '⚫ arrêté',
  paused: '⚫ en pause',
  dead: '🔴 mort',
  unhealthy: '🔴 dégradé',
  removing: '🟠 suppression',
  unknown: '❔ inconnu',
};

export function title(server: ServerConfig): string {
  return server.emoji ? `${server.emoji} ${server.label}` : server.label;
}

export function statusEmbed(
  server: ServerConfig,
  state: StackState,
  players: Players | undefined,
  error?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title(server))
    .setColor(Komodo.isUp(state) ? 0x2ecc71 : 0x95a5a6)
    .addFields({ name: 'État', value: STATE_LABEL[state] ?? state, inline: true });

  if (players) {
    const count = players.max === undefined ? `${players.online}` : `${players.online}/${players.max}`;
    embed.addFields({ name: 'Joueurs', value: count, inline: true });
    if (players.names && players.names.length > 0) {
      embed.addFields({ name: 'Connectés', value: players.names.join(', ').slice(0, 1024) });
    }
  } else if (Komodo.isUp(state) && error) {
    // Conteneur en marche, jeu muet : le cas nominal pendant une mise à jour.
    embed.addFields({ name: 'Joueurs', value: 'pas encore joignable' });
  }

  return embed;
}

export function buttons(
  server: ServerConfig,
  granted: Set<Action>,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const add = (action: Action, label: string, style: ButtonStyle): void => {
    if (!granted.has(action)) return;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:${action}:${server.key}`)
        .setLabel(label)
        .setStyle(style),
    );
  };

  add('status', '🔄 Rafraîchir', ButtonStyle.Secondary);
  add('start', '▶️ Démarrer', ButtonStyle.Success);
  add('restart', '🔁 Redémarrer', ButtonStyle.Primary);
  add('stop', '⏹️ Arrêter', ButtonStyle.Danger);

  return row.components.length > 0 ? [row] : [];
}

export function confirmStop(server: ServerConfig, online: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:stop-confirm:${server.key}`)
        .setLabel(`Arrêter quand même (${online} connecté${online > 1 ? 's' : ''})`)
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}
