import { REST, Routes } from "discord.js";
import { data as hintCommand } from "./commands/hint.js";
import { data as engageCommand } from "./commands/engage.js";
import { logger } from "./logger.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error("DISCORD_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID are required");
}

const rest = new REST().setToken(token);
const commands = [hintCommand.toJSON(), engageCommand.toJSON()];

logger.info({ commandCount: commands.length }, "Registering slash commands");

const data = await rest.put(
  Routes.applicationGuildCommands(clientId, guildId),
  { body: commands },
);

logger.info({ data }, "Slash commands registered");
