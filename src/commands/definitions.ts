import { SlashCommandBuilder, type SlashCommandStringOption } from 'discord.js';

const serverOption = (option: SlashCommandStringOption): SlashCommandStringOption =>
  option
    .setName('server')
    .setDescription('The game server')
    .setRequired(true)
    .setAutocomplete(true);

export const definitions = [
  new SlashCommandBuilder()
    .setName('servers')
    .setDescription('List the servers you have access to'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Status of a server')
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('players')
    .setDescription("Who's online on a server")
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Start a server')
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop a server')
    .addStringOption(serverOption),
  new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart a server')
    .addStringOption(serverOption),
].map((command) => command.toJSON());
