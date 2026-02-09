import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from "discord.js";
import type { ClaudeRunner, GeneratedContent, HintOptions } from "../services/claude-runner.js";
import { logger } from "../logger.js";

export const data = new SlashCommandBuilder()
  .setName("hint")
  .setDescription("Submit a content hint for AI research and generation")
  .addStringOption((option) =>
    option
      .setName("topic")
      .setDescription("The topic or thesis to research and create content for")
      .setRequired(true)
      .setMaxLength(1000),
  )
  .addStringOption((option) =>
    option
      .setName("tone")
      .setDescription("Tone of the generated content")
      .setRequired(false)
      .addChoices(
        { name: "Professional", value: "professional" },
        { name: "Casual", value: "casual" },
        { name: "Provocative", value: "provocative" },
        { name: "Educational", value: "educational" },
        { name: "Humorous", value: "humorous" },
      ),
  )
  .addStringOption((option) =>
    option
      .setName("length")
      .setDescription("Length of the LinkedIn post")
      .setRequired(false)
      .addChoices(
        { name: "Short", value: "short" },
        { name: "Medium", value: "medium" },
        { name: "Long", value: "long" },
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName("examples")
      .setDescription("Number of variants to generate (1-3)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(3),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  runner: ClaudeRunner,
): Promise<void> {
  const topic = interaction.options.getString("topic", true);
  const options: HintOptions = {
    tone: (interaction.options.getString("tone") ?? "professional") as HintOptions["tone"],
    length: (interaction.options.getString("length") ?? "medium") as HintOptions["length"],
    examples: interaction.options.getInteger("examples") ?? 1,
  };

  try {
    await interaction.deferReply();
  } catch (err) {
    logger.error({ err, topic }, "Failed to defer reply (interaction expired)");
    return;
  }

  try {
    await interaction.editReply(
      `Researching **"${topic}"**... (${options.tone}, ${options.length}, ${options.examples} variant${options.examples > 1 ? "s" : ""})`,
    );

    const variants = await runner.run(topic, options);

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: `**Content generated for:** ${topic}`,
        embeds: buildEmbeds(variants[0]),
      });
      return;
    }

    const textChannel = channel as TextChannel;
    const thread = await textChannel.threads.create({
      name: topic.slice(0, 100),
      autoArchiveDuration: 1440,
      reason: `Content generation for: ${topic}`,
    });

    for (let i = 0; i < variants.length; i++) {
      const label = variants.length > 1 ? ` (Variant ${i + 1})` : "";
      await thread.send({
        content: `**Content generated for:** ${topic}${label}`,
        embeds: buildEmbeds(variants[i]),
      });
    }

    await thread.send(
      `Reply in this thread to refine the content. I'll adjust based on your feedback.`,
    );

    await interaction.editReply(
      `Done! Content for **"${topic}"** posted in thread: ${thread.toString()}`,
    );

    logger.info({ topic, threadId: thread.id, variants: variants.length }, "Hint thread created");
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
