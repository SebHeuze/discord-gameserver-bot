// Elles arrivent par le .env que Komodo écrit depuis le champ `environment`
// du [[stack]] : tout secret utilisé ici doit y être déclaré en [[NOM]].
import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  /** Jamais en global : les commandes seraient proposées partout où le
   *  bot est invité. */
  DISCORD_GUILD_ID: z.string().regex(/^\d{17,20}$/),
  AUDIT_CHANNEL_ID: z.string().regex(/^\d{17,20}$/),

  KOMODO_URL: z.url(),
  KOMODO_API_KEY: z.string().min(1),
  KOMODO_API_SECRET: z.string().min(1),
  /** Seulement si Core sert un certificat auto-signé. */
  KOMODO_TLS_INSECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  CONFIG_PATH: z.string().default('/app/config.yaml'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`incomplete environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
