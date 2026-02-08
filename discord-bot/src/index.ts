import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction } from "discord.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { ClaudeRunner } from "./services/claude-runner.js";
import { WebhookClient } from "./services/webhook.js";
import { execute as executeHint } from "./commands/hint.js";

const config = loadConfig();
const runner = new ClaudeRunner(config);
const webhook = new WebhookClient(config.DISCORD_WEBHOOK_URL);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ user: readyClient.user.tag }, "Discord bot ready");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction as ChatInputCommandInteraction;

  if (command.commandName === "hint") {
    await executeHint(command, runner, webhook);
  } else {
    logger.warn({ command: command.commandName }, "Unknown command");
  }
});

async function shutdown(): Promise<void> {
  logger.info("Shutting down...");
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.login(config.DISCORD_TOKEN);
