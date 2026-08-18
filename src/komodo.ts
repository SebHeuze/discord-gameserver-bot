// Pas de paquet `komodo_client` : il ré-exporte `mogh_auth_client`, qui
// touche `localStorage` au chargement et fait planter le process à l'import.
import { Agent, request } from 'undici';
import { log } from './log.js';

export type StackState =
  | 'deploying'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'created'
  | 'restarting'
  | 'dead'
  | 'removing'
  | 'unhealthy'
  | 'down'
  | 'unknown';

interface StackListItem {
  name: string;
  info: { state: StackState };
}

const UP: readonly StackState[] = ['running', 'restarting'];

export class Komodo {
  private readonly dispatcher: Agent | undefined;

  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly secret: string,
    /** Pour un Core derrière un certificat auto-signé. Porté par ce
     *  dispatcher seul, pas par NODE_TLS_REJECT_UNAUTHORIZED. */
    insecureTls = false,
  ) {
    this.dispatcher = insecureTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  }

  private async call<T>(path: '/read' | '/execute', type: string, params: unknown): Promise<T> {
    const response = await request(`${this.url}${path}/${type}`, {
      method: 'POST',
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key,
        'x-api-secret': this.secret,
      },
      body: JSON.stringify(params),
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
    });
    const body = await response.body.text();
    if (response.statusCode !== 200) {
      // Sans le corps, un refus de permission ressemble à une panne réseau.
      throw new Error(`Komodo ${type} : HTTP ${response.statusCode} — ${body.slice(0, 300)}`);
    }
    return JSON.parse(body) as T;
  }

  async checkAccess(stacks: readonly string[]): Promise<void> {
    const known = new Set((await this.list()).map((stack) => stack.name));
    const missing = stacks.filter((stack) => !known.has(stack));
    if (missing.length > 0) {
      throw new Error(
        `Stacks inaccessibles depuis cette clé Komodo : ${missing.join(', ')}. ` +
          'Vérifier les permissions du Service User (Read + Execute sur ces stacks).',
      );
    }
  }

  private list(): Promise<StackListItem[]> {
    // limit: 0 = pas de pagination.
    return this.call<StackListItem[]>('/read', 'ListStacks', { limit: 0 });
  }

  async state(stack: string): Promise<StackState> {
    const found = (await this.list()).find((item) => item.name === stack);
    if (!found) throw new Error(`Stack ${stack} introuvable`);
    return found.info.state;
  }

  static isUp(state: StackState): boolean {
    return UP.includes(state);
  }

  /** `StartStack` (compose start) ne sait rien faire d'un projet absent :
   *  après un `down`, il faut `DeployStack` (compose up). */
  async start(stack: string): Promise<void> {
    if ((await this.state(stack)) === 'down') {
      log.info(`${stack} est down → DeployStack`);
      await this.call('/execute', 'DeployStack', { stack });
      return;
    }
    await this.call('/execute', 'StartStack', { stack });
  }

  async stop(stack: string): Promise<void> {
    await this.call('/execute', 'StopStack', { stack });
  }

  async restart(stack: string): Promise<void> {
    // Même détour que start : un projet absent ne se redémarre pas.
    if ((await this.state(stack)) === 'down') {
      await this.call('/execute', 'DeployStack', { stack });
      return;
    }
    await this.call('/execute', 'RestartStack', { stack });
  }
}
