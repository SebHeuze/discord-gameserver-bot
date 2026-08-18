import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { Audit } from './audit.js';
import { definitions, onInteraction } from './commands/index.js';
import { loadConfig } from './config.js';
import type { Context } from './context.js';
import { loadEnv } from './env.js';
import { buildAdapters } from './games/index.js';
import { Komodo } from './komodo.js';
import { Locks } from './locks.js';
import { log, setLevel } from './log.js';

async function main(): Promise<void> {
  const env = loadEnv();
  setLevel(env.LOG_LEVEL);

  const config = loadConfig(env.CONFIG_PATH);
  log.info(`${config.servers.size} serveur(s) déclaré(s) : ${[...config.servers.keys()].join(', ')}`);

  const komodo = new Komodo(
    env.KOMODO_URL,
    env.KOMODO_API_KEY,
    env.KOMODO_API_SECRET,
    env.KOMODO_TLS_INSECURE,
  );
  await komodo.checkAccess([...config.servers.values()].map((server) => server.stack));

  const adapters = buildAdapters(config.servers.values());

  // Guilds seul : les rôles arrivent dans la charge de l'interaction.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ctx: Context = {
    env,
    config,
    komodo,
    adapters,
    locks: new Locks(config.cooldownSeconds),
    audit: new Audit(client, env.AUDIT_CHANNEL_ID),
  };

  client.once(Events.ClientReady, async (ready) => {
    const rest = new REST().setToken(env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(ready.application.id, env.DISCORD_GUILD_ID), {
      body: definitions,
    });
    await ctx.audit.init();
    log.info(`connecté en ${ready.user.tag}, commandes enregistrées sur ${env.DISCORD_GUILD_ID}`);
  });

  client.on(Events.InteractionCreate, (interaction) => void onInteraction(ctx, interaction));
  client.on(Events.Error, (err) => log.error('erreur discord.js', err));

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.info(`${signal} reçu, fermeture`);
      void client.destroy().then(() => process.exit(0));
    });
  }

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err: unknown) => {
  log.error('démarrage impossible', err);
  process.exit(1);
});
