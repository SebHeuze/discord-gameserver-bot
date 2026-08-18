// Protocole figé depuis 2006, écrit ici plutôt que tiré d'un paquet de plus
// dont on ne maîtriserait pas les timeouts.
import { Socket } from 'node:net';

const AUTH = 3;
const EXEC = 2;
const RESPONSE = 0;
const AUTH_RESPONSE = 2;

/** Silence au bout duquel une réponse est réputée complète. Le protocole ne
 *  borne pas le multi-paquets, et la parade canonique — un paquet sonde
 *  derrière chaque commande — fait trébucher Palworld. */
const QUIET_MS = 150;

function encode(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8');
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  // Deux terminateurs : corps, puis paquet.
  packet.writeInt8(0, 12 + payload.length);
  packet.writeInt8(0, 13 + payload.length);
  return packet;
}

interface Packet {
  id: number;
  type: number;
  body: string;
}

function decode(buffer: Buffer<ArrayBufferLike>): { packets: Packet[]; rest: Buffer<ArrayBufferLike> } {
  const packets: Packet[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);
    if (buffer.length - offset < size + 4) break;
    packets.push({
      id: buffer.readInt32LE(offset + 4),
      type: buffer.readInt32LE(offset + 8),
      body: buffer.toString('utf8', offset + 12, offset + size + 2).replace(/\0+$/, ''),
    });
    offset += size + 4;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

export function rconExec(options: RconOptions, commands: readonly string[]): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? 5000;

  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const responses: string[] = [];
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let pending: Packet[] = [];
    let quiet: NodeJS.Timeout | undefined;
    let index = -1; // -1 = phase d'authentification
    let settled = false;

    const done = (err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(quiet);
      clearTimeout(guard);
      socket.destroy();
      if (err) reject(err);
      else resolve(responses);
    };

    // Après `done`, qui le référence : rien ne l'appelle avant la connexion.
    const guard = setTimeout(
      () => done(new Error(`RCON ${options.host}:${options.port}: no answer within ${timeoutMs} ms`)),
      timeoutMs,
    );

    const next = (): void => {
      index += 1;
      const command = commands[index];
      if (command === undefined) {
        done();
        return;
      }
      socket.write(encode(index, EXEC, command));
    };

    const flush = (): void => {
      const body = pending.map((p) => p.body).join('');
      pending = [];
      responses.push(body);
      next();
    };

    socket.setNoDelay(true);
    socket.on('error', (err) => done(err));
    socket.on('close', () => done(settled ? undefined : new Error('RCON connection closed by the server')));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decode(buffer);
      buffer = decoded.rest;

      for (const packet of decoded.packets) {
        if (index === -1) {
          if (packet.type !== AUTH_RESPONSE) continue;
          // Mot de passe refusé : id à -1.
          if (packet.id === -1) {
            done(new Error('RCON: password rejected'));
            return;
          }
          next();
          continue;
        }
        if (packet.type === RESPONSE) pending.push(packet);
      }

      if (index >= 0 && pending.length > 0) {
        clearTimeout(quiet);
        quiet = setTimeout(flush, QUIET_MS);
      }
    });

    socket.connect(options.port, options.host, () => {
      socket.write(encode(0, AUTH, options.password));
    });
  });
}
