// Deux de ces mots de passe ne peuvent pas être écrits dans le config.yaml :
// Factorio génère son rconpw au premier démarrage, et l'AdminPassword de
// Palworld vit dans le .ini que le serveur relit à chaque lancement.
import { readFileSync } from 'node:fs';
import type { SecretRef } from '../config.js';

export function resolveSecret(ref: SecretRef, env: NodeJS.ProcessEnv = process.env): string {
  if ('from_env' in ref) {
    const value = env[ref.from_env];
    if (!value) throw new Error(`Variable d'environnement ${ref.from_env} vide ou absente`);
    return value;
  }

  if ('from_file' in ref) {
    const value = readFileSync(ref.from_file, 'utf8').trim();
    if (!value) throw new Error(`Fichier ${ref.from_file} vide`);
    return value;
  }

  // .ini d'Unreal : tout tient sur une ligne, OptionSettings=(…,Clé="…",…).
  // Un parseur ini générique s'y casse les dents.
  const contents = readFileSync(ref.from_ini, 'utf8');
  const match = new RegExp(`${ref.key}\\s*=\\s*"([^"]*)"`).exec(contents);
  if (!match?.[1]) {
    throw new Error(
      `${ref.key} absent ou vide dans ${ref.from_ini} — le RCON du serveur est-il configuré ?`,
    );
  }
  return match[1];
}
