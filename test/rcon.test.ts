import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { rconExec } from '../src/games/protocol-source.js';

const AUTH = 3;
const EXEC = 2;
const RESPONSE = 0;
const AUTH_RESPONSE = 2;

function packet(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8');
  const out = Buffer.alloc(14 + payload.length);
  out.writeInt32LE(out.length - 4, 0);
  out.writeInt32LE(id, 4);
  out.writeInt32LE(type, 8);
  payload.copy(out, 12);
  return out;
}

/** Authentifie sur `password`, répond ce que `answer` dit. */
function fakeServer(
  password: string,
  answer: (command: string) => string | string[],
): Promise<{ port: number; server: Server }> {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) break;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.toString('utf8', 12, size + 2).replace(/\0+$/, '');
        buffer = buffer.subarray(size + 4);

        if (type === AUTH) {
          socket.write(packet(body === password ? id : -1, AUTH_RESPONSE, ''));
        } else if (type === EXEC) {
          const parts = answer(body);
          for (const part of Array.isArray(parts) ? parts : [parts]) {
            socket.write(packet(id, RESPONSE, part));
          }
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ port: typeof address === 'object' && address ? address.port : 0, server });
    });
  });
}

let running: Server | undefined;
afterEach(() => running?.close());

describe('rconExec', () => {
  it('authentifie puis exécute les commandes dans l\'ordre', async () => {
    const { port, server } = await fakeServer('secret', (cmd) => `echo:${cmd}`);
    running = server;
    const responses = await rconExec({ host: '127.0.0.1', port, password: 'secret' }, ['un', 'deux']);
    expect(responses).toEqual(['echo:un', 'echo:deux']);
  });

  it('recolle une réponse découpée en plusieurs paquets', async () => {
    const { port, server } = await fakeServer('secret', () => ['dé', 'coupé']);
    running = server;
    const [response] = await rconExec({ host: '127.0.0.1', port, password: 'secret' }, ['x']);
    expect(response).toBe('découpé');
  });

  it('rejette un mot de passe refusé', async () => {
    const { port, server } = await fakeServer('secret', () => '');
    running = server;
    await expect(
      rconExec({ host: '127.0.0.1', port, password: 'faux' }, ['x']),
    ).rejects.toThrow(/password rejected/);
  });

  it('abandonne sur un serveur muet plutôt que de rester pendu', async () => {
    const server = createServer(() => {
      /* accepte la connexion et ne répond jamais */
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    running = server;
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await expect(
      rconExec({ host: '127.0.0.1', port, password: 'secret', timeoutMs: 200 }, ['x']),
    ).rejects.toThrow(/no answer/);
  });
});
