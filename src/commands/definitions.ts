import { SlashCommandBuilder, type SlashCommandStringOption } from 'discord.js';

const serverOption = (option: SlashCommandStringOption): SlashCommandStringOption =>
  option
    .setName('serveur')
    .setDescription('Le serveur de jeu')
    .setRequired(true)
    .setAutocomplete(true);

export const definitions = [
  new SlashCommandBuilder()
    .setName('serveurs')
    .setDescription('Liste les serveurs auxquels tu as accès'),
  new SlashCommandBuilder()
    .setName('etat')
    .setDescription("État d'un serveur")
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('joueurs')
    .setDescription('Qui est connecté sur un serveur')
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('demarrer')
    .setDescription('Démarre un serveur')
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('arreter')
    .setDescription('Arrête un serveur')
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('redemarrer')
    .setDescription('Redémarre un serveur')
    .addStringOption(serverOption),
].map((command) => command.toJSON());
