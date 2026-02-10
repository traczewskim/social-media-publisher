import { Message, ChannelType } from "discord.js";
import type { ClaudeRunner } from "../services/claude-runner.js";
import { buildEmbeds } from "../commands/hint.js";
import { ENGAGE_THREAD_PREFIX } from "../commands/engage.js";
import { TALK_THREAD_PREFIX } from "../commands/talk.js";
import { logger } from "../logger.js";

export async function handleThreadReply(
  message: Message,
  runner: ClaudeRunner,
  botUserId: string,
): Promise<void> {
  // Only handle messages in threads
  if (
    message.channel.type !== ChannelType.PublicThread &&
    message.channel.type !== ChannelType.PrivateThread
  ) {
    return;
  }

  // Ignore bot's own messages
  if (message.author.id === botUserId) return;

  // Ignore other bots
  if (message.author.bot) return;

  const thread = message.channel;

  // Check if this thread was created by our bot
  // by looking for a bot message with content embeds
  const starterMessage = await thread.fetchStarterMessage().catch(() => null);
  if (!starterMessage) return;

  // Collect conversation history from the thread
  const messages = await thread.messages.fetch({ limit: 50 });
  const history = buildConversationHistory(messages, botUserId);

  if (history.length === 0) return;

  logger.info(
    { threadId: thread.id, messageCount: history.length },
    "Processing thread reply",
  );

  const isEngage = thread.name.startsWith(ENGAGE_THREAD_PREFIX);
  const isTalk = thread.name.startsWith(TALK_THREAD_PREFIX);

  try {
    await message.channel.sendTyping();

    if (isEngage) {
      // Extract original statement from the first bot message
      const sortedMessages = Array.from(messages.values()).sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp,
      );
      const statementMsg = sortedMessages.find(
        (m) => m.author.id === botUserId && m.content.startsWith("**Statement to respond to:**"),
      );
      const statement = statementMsg
        ? statementMsg.content.replace("**Statement to respond to:**\n", "")
        : "";

      // Check if this is the first user reply or a refinement:
      // If any bot message is a drafted reply (not the setup messages), it's a refinement
      const hasDraft = sortedMessages.some(
        (m) =>
          m.author.id === botUserId &&
          !m.content.startsWith("**Statement to respond to:**") &&
          !m.content.startsWith("What's your take"),
      );

      let reply: string;
      if (!hasDraft) {
        reply = await runner.engage(statement, message.content);
      } else {
        reply = await runner.refineEngage(history);
      }

      await thread.send(reply);
      logger.info({ threadId: thread.id }, "Engage reply posted");
    } else if (isTalk) {
      const reply = await runner.continueTalk(history);
      await thread.send(reply);
      logger.info({ threadId: thread.id }, "Talk reply posted");
    } else {
      const variants = await runner.refine(history);

      await thread.send({
        content: `**Updated content:**`,
        embeds: buildEmbeds(variants[0]),
      });

      logger.info({ threadId: thread.id }, "Refined content posted");
    }
  } catch (err) {
    logger.error({ err, threadId: thread.id }, "Failed to process thread reply");
    await thread.send(
      "Sorry, I couldn't process that. Try rephrasing your feedback.",
    );
  }
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

function buildConversationHistory(
  messages: Map<string, Message>,
  botUserId: string,
): ConversationMessage[] {
  return Array.from(messages.values())
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => {
      // Extract embed content for bot messages
      let content = msg.content;
      if (msg.author.id === botUserId && msg.embeds.length > 0) {
        const embedText = msg.embeds
          .map((e) => `[${e.title}]: ${e.description}`)
          .join("\n\n");
        content = content ? `${content}\n\n${embedText}` : embedText;
      }

      return {
        role: (msg.author.id === botUserId ? "assistant" : "user") as
          | "user"
          | "assistant",
        content,
      };
    })
    .filter((msg) => msg.content.length > 0);
}
