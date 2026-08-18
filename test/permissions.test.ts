import { describe, expect, it } from 'vitest';
import type { Config, ServerConfig } from '../src/config.js';
import { can, resolve, visibleServers } from '../src/permissions.js';

const JOUEURS = '111111111111111111';
const ADMINS = '222222222222222222';
const MOI = '333333333333333333';
const AUTRE = '444444444444444444';

const palworld: ServerConfig = {
  key: 'palworld',
  label: 'Palworld',
  stack: 'game-palworld',
  query: { type: 'none' },
  roles: {
    [JOUEURS]: ['status', 'players', 'start', 'restart'],
    [ADMINS]: ['status', 'players', 'start', 'stop', 'restart'],
  },
  users: { [MOI]: ['stop'] },
};

const rust: ServerConfig = {
  key: 'rust',
  label: 'Rust',
  stack: 'game-rust',
  query: { type: 'none' },
  roles: { [ADMINS]: ['status', 'start'] },
  users: {},
};

const config: Config = {
  cooldownSeconds: 60,
  startupTimeoutSeconds: 600,
  servers: new Map([
    ['palworld', palworld],
    ['rust', rust],
  ]),
};

describe('resolve', () => {
  it("n'accorde rien par défaut", () => {
    expect(resolve({ id: AUTRE, roleIds: [] }, palworld).size).toBe(0);
  });

  it('accorde exactement les actions du rôle porté', () => {
    const granted = resolve({ id: AUTRE, roleIds: [JOUEURS] }, palworld);
    expect([...granted].sort()).toEqual(['players', 'restart', 'start', 'status']);
    expect(granted.has('stop')).toBe(false);
  });

  it('cumule les rôles multiples', () => {
    const granted = resolve({ id: AUTRE, roleIds: [JOUEURS, ADMINS] }, palworld);
    expect(granted.has('stop')).toBe(true);
  });

  it('cumule une exception nominative avec les rôles', () => {
    const granted = resolve({ id: MOI, roleIds: [JOUEURS] }, palworld);
    expect(granted.has('stop')).toBe(true);
    expect(granted.has('start')).toBe(true);
  });

  it("n'accorde une exception nominative que sur le serveur concerné", () => {
    expect(can({ id: MOI, roleIds: [] }, rust, 'stop')).toBe(false);
  });

  it('ignore un rôle inconnu du serveur', () => {
    expect(resolve({ id: AUTRE, roleIds: ['999999999999999999'] }, rust).size).toBe(0);
  });
});

describe('visibleServers', () => {
  it('ne montre que les serveurs où au moins une action est accordée', () => {
    const visible = visibleServers({ id: AUTRE, roleIds: [JOUEURS] }, config);
    expect(visible.map((s) => s.key)).toEqual(['palworld']);
  });

  it('ne montre rien à un membre sans rôle', () => {
    expect(visibleServers({ id: AUTRE, roleIds: [] }, config)).toEqual([]);
  });

  it('montre les deux serveurs à un admin', () => {
    const visible = visibleServers({ id: AUTRE, roleIds: [ADMINS] }, config);
    expect(visible.map((s) => s.key)).toEqual(['palworld', 'rust']);
  });
});
