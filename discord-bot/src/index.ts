import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction } from "discord.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { ClaudeRunner } from "./services/claude-runner.js";
import { execute as executeHint } from "./commands/hint.js";
import { handleThreadReply } from "./handlers/thread-reply.js";

const config = loadConfig();
const runner = new ClaudeRunner(config);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ user: readyClient.user.tag }, "Discord bot ready");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction as ChatInputCommandInteraction;

  if (command.commandName === "hint") {
    await executeHint(command, runner);
  } else {
    logger.warn({ command: command.commandName }, "Unknown command");
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!client.user) return;
  await handleThreadReply(message, runner, client.user.id);
});

async function shutdown(): Promise<void> {
  logger.info("Shutting down...");
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled rejection");
});

client.login(config.DISCORD_TOKEN);
