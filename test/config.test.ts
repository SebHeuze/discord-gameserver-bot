import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

function write(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'gamebot-')), 'config.yaml');
  writeFileSync(path, contents, 'utf8');
  return path;
}

const minimal = `
servers:
  palworld:
    label: Palworld
    stack: game-palworld
    roles:
      "111111111111111111": [status, start]
`;

describe('loadConfig', () => {
  it('applique les valeurs par défaut', () => {
    const config = loadConfig(write(minimal));
    expect(config.cooldownSeconds).toBe(60);
    expect(config.startupTimeoutSeconds).toBe(1800);
    expect(config.servers.get('palworld')?.startup_timeout_seconds).toBeUndefined();
    const server = config.servers.get('palworld');
    expect(server?.query.type).toBe('none');
    expect(server?.users).toEqual({});
    expect(server?.key).toBe('palworld');
  });

  it('conserve un ID Discord non quoté sans perte de précision', () => {
    // Lu en number, 111111111111111111 dépasse MAX_SAFE_INTEGER et devient
    // 111111111111111100 : un rôle qui ne correspond à personne, en silence.
    const config = loadConfig(
      write(`
servers:
  palworld:
    label: Palworld
    stack: game-palworld
    roles:
      111111111111111111: [status]
`),
    );
    expect(Object.keys(config.servers.get('palworld')!.roles)).toEqual(['111111111111111111']);
  });

  it('refuse une action inventée', () => {
    expect(() =>
      loadConfig(
        write(`
servers:
  palworld:
    label: Palworld
    stack: game-palworld
    roles:
      "111111111111111111": [supprimer]
`),
      ),
    ).toThrow(/config\.yaml invalide/);
  });

  it('refuse un fichier sans serveur', () => {
    expect(() => loadConfig(write('servers: {}\n'))).toThrow(/aucun serveur/);
  });
});

describe('cohérence query / rcon', () => {
  const base = (extra: string) => `
servers:
  jeu:
    label: Jeu
    stack: game-jeu
${extra}
`;

  it('refuse une interrogation par RCON sans bloc rcon', () => {
    expect(() =>
      loadConfig(
        write(
          base(`    query:
      type: rcon`),
        ),
      ),
    ).toThrow(/demande un bloc/);
  });

  it('refuse une interrogation par RCON avec un dialecte muet', () => {
    expect(() =>
      loadConfig(
        write(
          base(`    query:
      type: rcon
    rcon:
      host: jeu
      port: 25575
      password:
        from_env: JEU_RCON`),
        ),
      ),
    ).toThrow(/generic/);
  });

  it('accepte GameDig seul, sans rcon', () => {
    const config = loadConfig(
      write(
        base(`    query:
      type: gamedig
      game: minecraft
      host: minecraft`),
      ),
    );
    const query = config.servers.get('jeu')!.query;
    expect(query.type).toBe('gamedig');
    // Port omis : GameDig connaît celui de chaque jeu.
    expect(query.type === 'gamedig' && query.port).toBeUndefined();
    expect(config.servers.get('jeu')!.rcon).toBeUndefined();
  });

  it('accepte un rcon seul, pour annoncer et sauvegarder sans savoir lire', () => {
    const config = loadConfig(
      write(
        base(`    rcon:
      protocol: webrcon
      dialect: rust
      host: RUST
      port: 28017
      password:
        from_env: RUST_RCON_PASSWORD`),
      ),
    );
    const server = config.servers.get('jeu')!;
    expect(server.query.type).toBe('none');
    expect(server.rcon?.protocol).toBe('webrcon');
    expect(server.rcon?.timeout_ms).toBe(5000);
  });
});

describe('délai de démarrage', () => {
  it('laisse un serveur surcharger le plafond global', () => {
    const config = loadConfig(
      write(`
startup_timeout_seconds: 900
servers:
  rust:
    label: Rust
    stack: game-rust
    startup_timeout_seconds: 3600
  factorio:
    label: Factorio
    stack: game-factorio
`),
    );
    expect(config.startupTimeoutSeconds).toBe(900);
    expect(config.servers.get('rust')?.startup_timeout_seconds).toBe(3600);
    // Sans surcharge, c'est le plafond global qui s'applique à l'exécution.
    expect(config.servers.get('factorio')?.startup_timeout_seconds).toBeUndefined();
  });
});
