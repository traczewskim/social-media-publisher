import { spawn } from "node:child_process";
import type { Config } from "../config.js";
import { logger } from "../logger.js";

export interface GeneratedContent {
  linkedin: string;
  x: string;
}

export interface HintOptions {
  tone: "professional" | "casual" | "provocative" | "educational" | "humorous";
  length: "short" | "medium" | "long";
  examples: number;
}

export class ClaudeRunner {
  constructor(_config: Config) {}


  async run(topic: string, options: HintOptions): Promise<GeneratedContent[]> {
    const prompt = buildPrompt(topic, options);

    logger.info({ topic, ...options }, "Starting claude-runner");

    const output = await this.exec(prompt);

    const parsed = parseOutput(output, options.examples);
    logger.info({ topic, platforms: Object.keys(parsed[0]), variants: parsed.length }, "Content generated");
    return parsed;
  }

  async refine(
    history: { role: "user" | "assistant"; content: string }[],
  ): Promise<GeneratedContent[]> {
    const prompt = buildRefinePrompt(history);

    logger.info("Refining content based on thread conversation");

    const output = await this.exec(prompt);

    const parsed = parseOutput(output, 1);
    logger.info({ platforms: Object.keys(parsed[0]) }, "Refined content generated");
    return parsed;
  }

  async engage(statement: string, userAngle: string): Promise<string> {
    const prompt = buildEngagePrompt(statement, userAngle);

    logger.info({ statement: statement.slice(0, 80) }, "Generating engage reply");

    const output = await this.exec(prompt);
    return unwrapEnvelope(output);
  }

  async refineEngage(
    history: { role: "user" | "assistant"; content: string }[],
  ): Promise<string> {
    const prompt = buildRefineEngagePrompt(history);

    logger.info("Refining engage reply based on feedback");

    const output = await this.exec(prompt);
    return unwrapEnvelope(output);
  }

  async talk(message: string): Promise<string> {
    const prompt = buildTalkPrompt(message);

    logger.info({ message: message.slice(0, 80) }, "Starting talk conversation");

    const output = await this.exec(prompt);
    return unwrapEnvelope(output);
  }

  async continueTalk(
    history: { role: "user" | "assistant"; content: string }[],
  ): Promise<string> {
    const prompt = buildContinueTalkPrompt(history);

    logger.info("Continuing talk conversation");

    const output = await this.exec(prompt);
    return unwrapEnvelope(output);
  }

  private exec(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "-p",
        "--output-format", "json",
        prompt,
      ];

      const child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("claude-runner timed out after 5 minutes"));
      }, 5 * 60 * 1000);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          logger.error({ code, stderr: stderr.slice(0, 300) }, "claude-runner failed");
          reject(new Error(`claude-runner exited with code ${code}`));
          return;
        }
        resolve(stdout);
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

function buildRefinePrompt(
  history: { role: "user" | "assistant"; content: string }[],
): string {
  const conversation = history
    .map((msg) => `${msg.role === "user" ? "USER" : "ASSISTANT"}: ${msg.content}`)
    .join("\n\n");

  return `You are a social media content creator refining previously generated posts based on user feedback.

Here is the conversation so far:

${conversation}

Based on the user's latest feedback, generate updated versions of both posts.

Return ONLY valid JSON in this exact format, no other text:
{"linkedin": "your updated linkedin post here", "x": "your updated tweet here"}`;
}

const LENGTH_GUIDE = {
  short: { linkedin: "1 short paragraph", x: "max 140 characters" },
  medium: { linkedin: "1-3 paragraphs", x: "max 280 characters" },
  long: { linkedin: "3-5 paragraphs with bullet points or examples", x: "max 280 characters" },
} as const;

function buildPrompt(topic: string, options: HintOptions): string {
  const { tone, length, examples } = options;
  const guide = LENGTH_GUIDE[length];
  const variantCount = Math.max(1, Math.min(3, examples));

  const jsonFormat = variantCount === 1
    ? `{"linkedin": "your linkedin post here", "x": "your tweet here"}`
    : `[${Array.from({ length: variantCount }, () => `{"linkedin": "...", "x": "..."}`).join(", ")}]`;

  return `You are a social media content creator for a personal brand focused on AI and agentic coding.

Research the following topic and generate social media posts:

Topic: "${topic}"

Tone: ${tone}
Generate ${variantCount} variant${variantCount > 1 ? "s" : ""}, each containing:
1. A LinkedIn post (${tone} tone, ${guide.linkedin}, thought leadership style)
2. An X/Twitter post (${tone}, punchy, ${guide.x})

Return ONLY valid JSON in this exact format, no other text:
${jsonFormat}`;
}

function unwrapEnvelope(output: string): string {
  try {
    const envelope = JSON.parse(output);
    if (envelope.result) {
      return envelope.result;
    }
  } catch {
    // Not a JSON envelope, use raw output
  }
  return output;
}

function buildEngagePrompt(statement: string, userAngle: string): string {
  return `You are helping someone write a natural reply to a social media post.

The original post/statement:
"${statement}"

The user's take:
"${userAngle}"

Write a reply that:
- Sounds like a real person, not a bot or a PR team
- Matches the register and energy of the original post
- Clearly expresses the user's angle
- Is concise — one short paragraph max, no filler
- No corporate jargon, no buzzwords, no "Great point!" openers
- No hashtags, no emojis unless the original post uses them

Return ONLY the reply text, nothing else.`;
}

function buildRefineEngagePrompt(
  history: { role: "user" | "assistant"; content: string }[],
): string {
  const conversation = history
    .map((msg) => `${msg.role === "user" ? "USER" : "ASSISTANT"}: ${msg.content}`)
    .join("\n\n");

  return `You are helping someone refine a reply to a social media post.

Here is the conversation so far:

${conversation}

Based on the user's latest feedback, write an updated reply that:
- Sounds like a real person, not a bot or a PR team
- Matches the register and energy of the original post
- Is concise — one short paragraph max, no filler
- No corporate jargon, no buzzwords, no "Great point!" openers
- No hashtags, no emojis unless the original post uses them

Return ONLY the updated reply text, nothing else.`;
}

function parseOutput(output: string, expectedCount: number): GeneratedContent[] {
  try {
    // Claude Code --output-format json wraps output in a result envelope
    let text = unwrapEnvelope(output);

    // Extract JSON from markdown code block (```json ... ```) or raw text
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    const rawJson = codeBlockMatch
      ? codeBlockMatch[1].trim().replace(/\n/g, '\\n')
      : null;

    // Try parsing from code block first, then fallback to raw text
    const candidates = rawJson ? [rawJson, text] : [text];

    for (const candidate of candidates) {
      const result = tryParseContent(candidate, expectedCount);
      if (result) return result;
    }

    throw new Error("No JSON with linkedin/x fields found in output");
  } catch (err) {
    logger.error({ output: output.slice(0, 500), err }, "Failed to parse claude-runner output");
    throw new Error(`Failed to parse content: ${(err as Error).message}`);
  }
}

function tryParseContent(text: string, expectedCount: number): GeneratedContent[] | null {
  // Try parsing as array first (multiple variants)
  if (expectedCount > 1) {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const arr = JSON.parse(arrayMatch[0]);
        if (Array.isArray(arr) && arr.every((item: unknown) => isGeneratedContent(item))) {
          return arr;
        }
      } catch { /* try next strategy */ }
    }
  }

  // Try parsing as single object
  const objMatch = text.match(/\{[\s\S]*?"linkedin"[\s\S]*?"x"[\s\S]*?\}(?=[^}]*$)/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (isGeneratedContent(parsed)) {
        return [parsed];
      }
    } catch { /* fall through */ }
  }

  return null;
}

function isGeneratedContent(obj: unknown): obj is GeneratedContent {
  return typeof obj === "object" && obj !== null && "linkedin" in obj && "x" in obj;
}

function buildTalkPrompt(message: string): string {
  return `You are a helpful, knowledgeable conversationalist.

The user wants to discuss:
"${message}"

Respond naturally and concisely. Be direct, no filler.`;
}

function buildContinueTalkPrompt(
  history: { role: "user" | "assistant"; content: string }[],
): string {
  const conversation = history
    .map((msg) => `${msg.role === "user" ? "USER" : "ASSISTANT"}: ${msg.content}`)
    .join("\n\n");

  return `You are a helpful, knowledgeable conversationalist. Be direct, no filler.

Here is the conversation so far:

${conversation}

Continue the conversation based on the user's latest message.`;
}
