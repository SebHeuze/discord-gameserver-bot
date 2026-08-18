import { EmbedBuilder, type Client, type TextBasedChannel } from 'discord.js';
import { log } from './log.js';

export type Outcome = 'ok' | 'refusé' | 'erreur';

const COLORS: Record<Outcome, number> = {
  ok: 0x2ecc71,
  refusé: 0xe67e22,
  erreur: 0xe74c3c,
};

export class Audit {
  private channel: TextBasedChannel | undefined;

  constructor(
    private readonly client: Client,
    private readonly channelId: string,
  ) {}

  async init(): Promise<void> {
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel?.isTextBased() || !('send' in channel)) {
      throw new Error(`AUDIT_CHANNEL_ID ${this.channelId} n'est pas un salon textuel accessible`);
    }
    this.channel = channel;
  }

  /** Ne jette jamais : un audit muet ne doit pas faire échouer l'action. */
  async record(entry: {
    userId: string;
    userTag: string;
    action: string;
    server: string;
    outcome: Outcome;
    detail?: string;
  }): Promise<void> {
    const line = `[audit] ${entry.userTag} · ${entry.action} ${entry.server} · ${entry.outcome}${
      entry.detail ? ` · ${entry.detail}` : ''
    }`;
    log.info(line);

    const embed = new EmbedBuilder()
      .setColor(COLORS[entry.outcome])
      .setDescription(`<@${entry.userId}> · \`${entry.action}\` · **${entry.server}** → ${entry.outcome}`)
      .setTimestamp(new Date());
    if (entry.detail) embed.addFields({ name: 'Détail', value: entry.detail.slice(0, 1024) });

    try {
      if (!this.channel || !('send' in this.channel)) return;
      await this.channel.send({ embeds: [embed] });
    } catch (err) {
      log.error("échec d'écriture dans le salon d'audit", err);
    }
  }
}
