// Rust ne parle pas le RCON Source : du JSON sur une WebSocket, mot de passe
// dans le chemin. Demande `+rcon.web 1` côté serveur.
import WebSocket from 'ws';

interface RustResponse {
  Message: string;
  Identifier: number;
}

export function webrconExec(
  options: { host: string; port: number; password: string; timeoutMs?: number },
  commands: readonly string[],
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? 5000;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://${options.host}:${options.port}/${encodeURIComponent(options.password)}`,
    );
    const responses = new Map<number, string>();
    let settled = false;

    const done = (err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      socket.close();
      if (err) reject(err);
      else resolve(commands.map((_, index) => responses.get(index) ?? ''));
    };

    const guard = setTimeout(
      () => done(new Error(`WebRCON ${options.host}:${options.port}: no answer within ${timeoutMs} ms`)),
      timeoutMs,
    );

    socket.on('error', (err) => done(err));
    socket.on('open', () => {
      commands.forEach((command, index) => {
        socket.send(JSON.stringify({ Identifier: index, Message: command, Name: 'gamebot' }));
      });
    });
    socket.on('message', (data) => {
      let payload: RustResponse;
      try {
        payload = JSON.parse(data.toString()) as RustResponse;
      } catch {
        // Lignes de console non sollicitées.
        return;
      }
      if (payload.Identifier < 0 || payload.Identifier >= commands.length) return;
      responses.set(payload.Identifier, payload.Message);
      if (responses.size === commands.length) done();
    });
  });
}
