import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import type { ClaudeRunner } from "../services/claude-runner.js";
import type { WebhookClient } from "../services/webhook.js";
import { logger } from "../logger.js";

export const data = new SlashCommandBuilder()
  .setName("hint")
  .setDescription("Submit a content hint for AI research and generation")
  .addStringOption((option) =>
    option
      .setName("topic")
      .setDescription("The topic or thesis to research and create content for")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  runner: ClaudeRunner,
  webhook: WebhookClient,
): Promise<void> {
  const topic = interaction.options.getString("topic", true);

  await interaction.deferReply();

  try {
    await interaction.editReply(
      `Researching **"${topic}"**... This may take a few minutes.`,
    );

    const content = await runner.run(topic);
    await webhook.postContent(topic, content);

    await interaction.editReply(
      `Done! Content for **"${topic}"** has been posted below.`,
    );
  } catch (err) {
    logger.error({ err, topic }, "Failed to generate content");
    await interaction.editReply(
      `Failed to generate content for "${topic}". Please try again later.`,
    );
  }
}
