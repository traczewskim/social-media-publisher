import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  TextChannel,
} from "discord.js";
import { logger } from "../logger.js";

export const ENGAGE_THREAD_PREFIX = "[engage] ";

export const data = new SlashCommandBuilder()
  .setName("engage")
  .setDescription("Craft a natural reply to a social media post or statement")
  .addStringOption((option) =>
    option
      .setName("statement")
      .setDescription("The post or statement you want to respond to")
      .setRequired(true)
      .setMaxLength(1000),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const statement = interaction.options.getString("statement", true);

  try {
    await interaction.deferReply();
  } catch (err) {
    logger.error({ err, statement: statement.slice(0, 80) }, "Failed to defer reply (interaction expired)");
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
    const threadName = `${ENGAGE_THREAD_PREFIX}${statement.slice(0, 100 - ENGAGE_THREAD_PREFIX.length)}`;
    const thread = await textChannel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440,
      reason: `Engage response for: ${statement}`,
    });

    await thread.send(`**Statement to respond to:**\n${statement}`);
    await thread.send(
      `What's your take on this? Tell me your angle and I'll draft a reply.`,
    );

    await interaction.editReply(
      `Thread created! Share your take here: ${thread.toString()}`,
    );

    logger.info({ statement: statement.slice(0, 80), threadId: thread.id }, "Engage thread created");
  } catch (err) {
    logger.error({ err, statement: statement.slice(0, 80) }, "Failed to create engage thread");
    try {
      await interaction.editReply(
        "Failed to set up the engage thread. Please try again later.",
      );
    } catch {
      // Interaction may have expired
    }
  }
}
