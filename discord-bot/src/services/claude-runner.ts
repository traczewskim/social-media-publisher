import { execFile } from "node:child_process";
import type { Config } from "../config.js";
import { logger } from "../logger.js";

export interface GeneratedContent {
  linkedin: string;
  x: string;
}

export class ClaudeRunner {
  private image: string;
  private apiKey: string;

  constructor(config: Config) {
    this.image = config.CLAUDE_RUNNER_IMAGE;
    this.apiKey = config.ANTHROPIC_API_KEY;
  }

  async run(topic: string): Promise<GeneratedContent> {
    const prompt = buildPrompt(topic);

    logger.info({ topic, image: this.image }, "Starting claude-runner container");

    const output = await this.exec(prompt);

    const parsed = parseOutput(output);
    logger.info({ topic, platforms: Object.keys(parsed) }, "Content generated");
    return parsed;
  }

  private exec(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "run", "--rm",
        "-e", `ANTHROPIC_API_KEY=${this.apiKey}`,
        this.image,
        "-p",
        "--output-format", "json",
        prompt,
      ];

      const child = execFile("docker", args, {
        maxBuffer: 1024 * 1024,
        timeout: 5 * 60 * 1000,
      }, (error, stdout, stderr) => {
        if (error) {
          logger.error({ error, stderr }, "claude-runner failed");
          reject(new Error(`claude-runner failed: ${error.message}`));
          return;
        }
        resolve(stdout);
      });

      child.on("error", reject);
    });
  }
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
    const jsonMatch = output.match(/\{[\s\S]*"linkedin"[\s\S]*"x"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in output");
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.linkedin || !parsed.x) {
      throw new Error("Missing linkedin or x fields");
    }
    return { linkedin: parsed.linkedin, x: parsed.x };
  } catch (err) {
    logger.error({ output, err }, "Failed to parse claude-runner output");
    throw new Error(`Failed to parse content: ${(err as Error).message}`);
  }
}
