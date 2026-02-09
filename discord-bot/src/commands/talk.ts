import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  TextChannel,
} from "discord.js";
import type { ClaudeRunner } from "../services/claude-runner.js";
import { logger } from "../logger.js";

export const TALK_THREAD_PREFIX = "[talk] ";

export const data = new SlashCommandBuilder()
  .setName("talk")
  .setDescription("Start a free-form conversation with Claude")
  .addStringOption((option) =>
    option
      .setName("topic")
      .setDescription("What do you want to talk about?")
      .setRequired(true)
      .setMaxLength(1000),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  runner: ClaudeRunner,
): Promise<void> {
  const topic = interaction.options.getString("topic", true);

  try {
    await interaction.deferReply();
  } catch (err) {
    logger.error({ err, topic: topic.slice(0, 80) }, "Failed to defer reply (interaction expired)");
    return;
  }

  try {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply(
        "This command can only be used in a text channel.",
      );
      return;
    }

    const textChannel = channel as TextChannel;
    const threadName = `${TALK_THREAD_PREFIX}${topic.slice(0, 100 - TALK_THREAD_PREFIX.length)}`;
    const thread = await textChannel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440,
      reason: `Talk conversation: ${topic}`,
    });

    await thread.sendTyping();

    const reply = await runner.talk(topic);
    await thread.send(reply);

    await interaction.editReply(
      `Thread created! Continue the conversation here: ${thread.toString()}`,
    );

    logger.info({ topic: topic.slice(0, 80), threadId: thread.id }, "Talk thread created");
  } catch (err) {
    logger.error({ err, topic: topic.slice(0, 80) }, "Failed to create talk thread");
    try {
      await interaction.editReply(
        "Failed to set up the talk thread. Please try again later.",
      );
    } catch {
      // Interaction may have expired
    }
  }
}
