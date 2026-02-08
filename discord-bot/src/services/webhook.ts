import { logger } from "../logger.js";
import type { GeneratedContent } from "./claude-runner.js";

interface WebhookEmbed {
  title: string;
  description: string;
  color: number;
}

export class WebhookClient {
  private url: string;

  constructor(webhookUrl: string) {
    this.url = webhookUrl;
  }

  async postContent(topic: string, content: GeneratedContent): Promise<void> {
    const embeds: WebhookEmbed[] = [
      {
        title: "LinkedIn Post",
        description: content.linkedin,
        color: 0x0a66c2,
      },
      {
        title: "X (Twitter) Post",
        description: content.x,
        color: 0x000000,
      },
    ];

    const body = {
      content: `**Content generated for:** ${topic}`,
      embeds,
    };

    logger.debug({ topic }, "Posting to Discord webhook");

    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Webhook POST failed (${response.status}): ${text}`);
    }

    logger.info({ topic }, "Content posted to Discord webhook");
  }
}
