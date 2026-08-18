// Refus par défaut. Un droit ne peut qu'être ajouté : pas de retrait, qui
// rendrait le résultat dépendant de l'ordre d'évaluation. Le salon d'où vient
// la commande n'entre jamais dans la décision.
import type { Action, Config, ServerConfig } from './config.js';

/** De quoi tester sans instancier discord.js. */
export interface MemberLike {
  id: string;
  roleIds: readonly string[];
}

/** Ensemble vide = le serveur n'existe pas, de son point de vue. */
export function resolve(member: MemberLike, server: ServerConfig): Set<Action> {
  const granted = new Set<Action>();
  for (const roleId of member.roleIds) {
    for (const action of server.roles[roleId] ?? []) granted.add(action);
  }
  for (const action of server.users[member.id] ?? []) granted.add(action);
  return granted;
}

export function can(member: MemberLike, server: ServerConfig, action: Action): boolean {
  return resolve(member, server).has(action);
}

/** Personne ne doit apprendre l'existence d'un serveur auquel il n'a
 *  aucun droit : filtre aussi bien /serveurs que l'autocomplétion. */
export function visibleServers(member: MemberLike, config: Config): ServerConfig[] {
  return [...config.servers.values()].filter((server) => resolve(member, server).size > 0);
}
