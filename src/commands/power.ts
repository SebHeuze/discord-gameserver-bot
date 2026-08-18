// Sauter la sauvegarde avant un arrêt coûte jusqu'à deux heures de
// progression sur Palworld, dont le backup tourne toutes les 120 minutes.
import { MessageFlags, type RepliableInteraction } from 'discord.js';
import type { Action, ServerConfig } from '../config.js';
import type { Context } from '../context.js';
import { log } from '../log.js';
import type { MemberLike } from '../permissions.js';
import { confirmStop, title } from '../ui.js';
import { describe } from './info.js';

const VERBS: Record<'start' | 'stop' | 'restart', string> = {
  start: 'démarrage',
  stop: 'arrêt',
  restart: 'redémarrage',
};

export async function handlePower(
  ctx: Context,
  interaction: RepliableInteraction,
  member: MemberLike,
  server: ServerConfig,
  action: 'start' | 'stop' | 'restart',
  options: { confirmed?: boolean; userTag: string } = { userTag: 'inconnu' },
): Promise<void> {
  const audit = (outcome: 'ok' | 'refusé' | 'erreur', detail?: string): Promise<void> =>
    ctx.audit.record({
      userId: member.id,
      userTag: options.userTag,
      action,
      server: server.key,
      outcome,
      ...(detail === undefined ? {} : { detail }),
    });

  const left = ctx.locks.cooldownLeft(member.id, server.key);
  if (left > 0) {
    await interaction.editReply(`Doucement : attends ${left} s avant de rejouer sur ce serveur.`);
    await audit('refusé', `cooldown ${left} s`);
    return;
  }

  if (!ctx.locks.acquire(server.key)) {
    await interaction.editReply(`Une action est déjà en cours sur **${title(server)}**.`);
    await audit('refusé', 'action concurrente');
    return;
  }

  try {
    const adapter = ctx.adapters.get(server.key);

    if (action === 'stop' && !options.confirmed && adapter?.query) {
      const players = await adapter.query().catch(() => undefined);
      if (players && players.online > 0) {
        await interaction.editReply({
          content: `**${title(server)}** : ${players.online} joueur(s) connecté(s)${
            players.names?.length ? ` (${players.names.join(', ')})` : ''
          }.`,
          components: confirmStop(server, players.online),
        });
        await audit('refusé', 'confirmation demandée');
        return;
      }
    }

    if (action === 'stop' && adapter) {
      const message = `Arret du serveur demande par ${options.userTag}`;
      await adapter.announce?.(message).catch((err: Error) =>
        log.warn(`${server.key} : annonce impossible`, err.message),
      );
      await adapter.save?.().catch((err: Error) =>
        log.warn(`${server.key} : sauvegarde impossible`, err.message),
      );
    }

    await ctx.komodo[action](server.stack);
    ctx.locks.markUsed(member.id, server.key);
    await audit('ok');

    if (action === 'stop') {
      await interaction.editReply(`**${title(server)}** : arrêt demandé. ⏹️`);
      return;
    }

    await interaction.editReply(
      `**${title(server)}** : ${VERBS[action]} lancé. Ça peut prendre plusieurs minutes ` +
        `(mise à jour du jeu au démarrage), je préviens ici dès qu'il répond.`,
    );
    void announceWhenReady(ctx, interaction, member, server);
  } catch (err) {
    log.error(`${action} ${server.key}`, err);
    await interaction.editReply(`Échec du ${VERBS[action]} de **${title(server)}**.`);
    await audit('erreur', (err as Error).message);
  } finally {
    ctx.locks.release(server.key);
  }
}

/** L'état du conteneur ne suffit pas : les images SteamCMD passent en
 *  `running` bien avant que le jeu accepte une connexion.
 *
 *  Annonce dans le salon et non en `followUp` : un jeton d'interaction meurt
 *  à 15 minutes, qu'une mise à jour de Rust dépasse régulièrement. */
async function announceWhenReady(
  ctx: Context,
  interaction: RepliableInteraction,
  member: MemberLike,
  server: ServerConfig,
): Promise<void> {
  const adapter = ctx.adapters.get(server.key);
  if (!adapter?.query) return;

  const timeout = server.startup_timeout_seconds ?? ctx.config.startupTimeoutSeconds;
  const say = async (message: string): Promise<void> => {
    const channel = interaction.channel;
    if (channel?.isSendable()) await channel.send(message);
    else await interaction.followUp(message).catch(() => undefined);
  };

  const deadline = Date.now() + timeout * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    try {
      await adapter.query();
      await say(`<@${member.id}> **${title(server)}** est prêt. ✅`);
      return;
    } catch {
      // pas encore prêt
    }
  }

  const { state } = await describe(ctx, server);
  await say(
    `<@${member.id}> **${title(server)}** ne répond toujours pas après ` +
      `${Math.round(timeout / 60)} min (état Docker : ${state}).`,
  );
}

export function isPowerAction(action: Action): action is 'start' | 'stop' | 'restart' {
  return action === 'start' || action === 'stop' || action === 'restart';
}

export const REFUSED = {
  flags: MessageFlags.Ephemeral,
  content: "Serveur inconnu, ou tu n'as pas le droit d'y toucher.",
} as const;
