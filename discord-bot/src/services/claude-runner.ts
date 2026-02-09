import { spawn } from "node:child_process";
import type { Config } from "../config.js";
import { logger } from "../logger.js";

export interface GeneratedContent {
  linkedin: string;
  x: string;
}

export class ClaudeRunner {
  constructor(_config: Config) {}


  async run(topic: string): Promise<GeneratedContent> {
    const prompt = buildPrompt(topic);

    logger.info({ topic }, "Starting claude-runner");

    const output = await this.exec(prompt);

    const parsed = parseOutput(output);
    logger.info({ topic, platforms: Object.keys(parsed) }, "Content generated");
    return parsed;
  }

  async refine(
    history: { role: "user" | "assistant"; content: string }[],
  ): Promise<GeneratedContent> {
    const prompt = buildRefinePrompt(history);

    logger.info("Refining content based on thread conversation");

    const output = await this.exec(prompt);

    const parsed = parseOutput(output);
    logger.info({ platforms: Object.keys(parsed) }, "Refined content generated");
    return parsed;
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
        env: process.env,
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
          logger.error({ code, stderr }, "claude-runner failed");
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

function buildPrompt(topic: string): string {
  return `You are a social media content creator for a personal brand focused on AI and agentic coding.

Research the following topic and generate two social media posts:

Topic: "${topic}"

Generate:
1. A LinkedIn post (professional tone, 1-3 paragraphs, thought leadership style)
2. An X/Twitter post (concise, punchy, max 280 characters)

Return ONLY valid JSON in this exact format, no other text:
{"linkedin": "your linkedin post here", "x": "your tweet here"}`;
}

function parseOutput(output: string): GeneratedContent {
  try {
    // Claude Code --output-format json wraps output in a result envelope
    // The "result" field contains the text response with embedded JSON
    let text = output;
    try {
      const envelope = JSON.parse(output);
      if (envelope.result) {
        text = envelope.result;
      }
    } catch {
      // Not a JSON envelope, use raw output
    }

    // Extract JSON from markdown code block (```json ... ```) or raw text
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      // After envelope JSON.parse, \n becomes literal newlines inside strings
      // Re-escape them so JSON.parse can handle the inner JSON
      const jsonStr = codeBlockMatch[1].trim().replace(/\n/g, '\\n');
      const parsed = JSON.parse(jsonStr);
      if (parsed.linkedin && parsed.x) {
        return { linkedin: parsed.linkedin, x: parsed.x };
      }
    }

    // Fallback: find raw JSON object with linkedin/x fields
    const jsonMatch = text.match(/\{[\s\S]*?"linkedin"[\s\S]*?"x"[\s\S]*?\}(?=[^}]*$)/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.linkedin && parsed.x) {
        return { linkedin: parsed.linkedin, x: parsed.x };
      }
    }

    throw new Error("No JSON with linkedin/x fields found in output");
  } catch (err) {
    logger.error({ output: output.slice(0, 500), err }, "Failed to parse claude-runner output");
    throw new Error(`Failed to parse content: ${(err as Error).message}`);
  }
}
