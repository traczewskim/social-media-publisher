import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from "discord.js";
import type { ClaudeRunner, GeneratedContent } from "../services/claude-runner.js";
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
): Promise<void> {
  const topic = interaction.options.getString("topic", true);

  try {
    await interaction.deferReply();
  } catch (err) {
    logger.error({ err, topic }, "Failed to defer reply (interaction expired)");
    return;
  }

  try {
    await interaction.editReply(
      `Researching **"${topic}"**... This may take a few minutes.`,
    );

    const content = await runner.run(topic);

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: `**Content generated for:** ${topic}`,
        embeds: buildEmbeds(content),
      });
      return;
    }

    const textChannel = channel as TextChannel;
    const thread = await textChannel.threads.create({
      name: topic.slice(0, 100),
      autoArchiveDuration: 1440,
      reason: `Content generation for: ${topic}`,
    });

    await thread.send({
      content: `**Content generated for:** ${topic}`,
      embeds: buildEmbeds(content),
    });

    await thread.send(
      `Reply in this thread to refine the content. I'll adjust based on your feedback.`,
    );

    await interaction.editReply(
      `Done! Content for **"${topic}"** posted in thread: ${thread.toString()}`,
    );

    logger.info({ topic, threadId: thread.id }, "Hint thread created");
  } catch (err) {
    logger.error({ err, topic }, "Failed to generate content");
    try {
      await interaction.editReply(
        `Failed to generate content for "${topic}". Please try again later.`,
      );
    } catch {
      // Interaction may have expired, nothing we can do
    }
  }
}

export function buildEmbeds(content: GeneratedContent): EmbedBuilder[] {
  return [
    new EmbedBuilder()
      .setTitle("LinkedIn Post")
      .setDescription(content.linkedin)
      .setColor(0x0a66c2),
    new EmbedBuilder()
      .setTitle("X (Twitter) Post")
      .setDescription(content.x)
      .setColor(0x000000),
  ];
}
