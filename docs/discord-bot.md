# Discord Bot

## Purpose

The Discord bot provides the interface for the Social Media Publisher system. Users submit content hints directly from Discord via slash commands, and the bot generates platform-specific posts using Claude API.

This enables a quick workflow where you can submit ideas and receive generated content without leaving Discord.

## Architecture

### Deployment Model

The bot runs as a **long-running container** behind NAT:
- Connects outbound to Discord Gateway via WebSocket
- No public IP or inbound ports required
- Fully NAT-friendly (works in private subnets, behind firewalls)
- Can be deployed to: AWS ECS/Fargate, Docker on VPS, or locally

### How It Works Behind NAT

Discord's Gateway architecture enables this:
1. Bot initiates outbound WebSocket connection to Discord Gateway
2. Discord pushes all events (commands, messages) over this established connection
3. Bot sends webhook calls outbound via HTTPS
4. Zero inbound traffic needed - fully compatible with NAT/firewalls

### Components

```
Discord Bot Container
├── Discord Gateway (WebSocket)
│   └── Receives slash commands (/hint)
├── ClaudeRunner Service
│   └── Spawns Docker container with Claude Code CLI
│   └── Parses JSON output {linkedin, x}
└── WebhookClient Service
    └── Posts content to Discord webhook
    └── Creates rich embeds for each platform
```

### Event Flow

```
User types /hint "topic" in Discord
  → Discord Gateway pushes event to bot (WebSocket)
  → Bot defers reply ("Researching... This may take a few minutes.")
  → Bot spawns claude-runner Docker container
  → Claude Code CLI researches topic and generates content
  → Container outputs JSON {linkedin: "...", x: "..."}
  → Bot posts content to Discord via webhook
  → Bot edits reply ("Done! Content has been posted below.")
```

## Prerequisites

### Discord Application Setup

1. Create a Discord application at https://discord.com/developers/applications
2. Go to "Bot" section:
   - Click "Add Bot"
   - Enable "Message Content Intent" (if needed)
   - Copy the bot token
3. Go to "OAuth2" section:
   - Copy the "Client ID"
4. Create a webhook in your Discord server:
   - Server Settings → Integrations → Webhooks → New Webhook
   - Select target channel
   - Copy webhook URL
5. Invite bot to your server:
   - OAuth2 → URL Generator
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`
   - Use generated URL to invite bot

### Required Environment Variables

Create `.env` file (see `.env.example`):

```bash
# Discord Configuration
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-client-id
DISCORD_GUILD_ID=your-discord-server-id
DISCORD_CHANNEL_ID=channel-id-for-content-posts
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key

# Docker
CLAUDE_RUNNER_IMAGE=claude-runner:1.0

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

### Getting Discord IDs

Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode), then:
- **Guild ID**: Right-click server name → Copy Server ID
- **Channel ID**: Right-click channel name → Copy Channel ID

## Setup

### Local Development

```bash
cd discord-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Build Claude Runner image (from project root)
cd ../claude-runner
docker build -t claude-runner:1.0 .
cd ../discord-bot

# Register slash commands (run once, or when commands change)
npm run register-commands

# Run in development mode (with hot-reload)
npm run dev
```

### Production Build

```bash
# Build TypeScript
npm run build

# Run production build
npm start
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | - | Application client ID |
| `DISCORD_GUILD_ID` | Yes | - | Discord server ID for slash commands |
| `DISCORD_CHANNEL_ID` | Yes | - | Channel where content is posted |
| `DISCORD_WEBHOOK_URL` | Yes | - | Discord webhook URL for posting content |
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key for Claude |
| `CLAUDE_RUNNER_IMAGE` | No | `claude-runner:1.0` | Docker image name for Claude Runner |
| `LOG_LEVEL` | No | `info` | Pino log level: `debug`, `info`, `warn`, `error` |

### Zod Validation

All environment variables are validated at startup using Zod. The bot will fail fast with clear error messages if required variables are missing or invalid.

## Commands

### /hint

Submits a content hint for AI research and generation.

**Usage**:
```
/hint topic:"Stack Overflow traffic drops because of AI"
```

**Parameters**:
- `topic` (required, string): The topic or thesis to research and create content for

**Response Flow**:
1. Bot immediately defers reply: `"Researching "Stack Overflow traffic drops because of AI"... This may take a few minutes."`
2. Bot spawns Claude Runner container with research prompt
3. Claude Code researches topic and generates LinkedIn + X posts
4. Bot posts content to Discord webhook with rich embeds
5. Bot edits reply: `"Done! Content has been posted below."`

**Content Example**:
```
**Content generated for:** Stack Overflow traffic drops because of AI

[LinkedIn Embed - Blue #0a66c2]
Title: LinkedIn Post
Body: [Generated professional thought leadership content]

[X Embed - Black #000000]
Title: X (Twitter) Post
Body: [Generated punchy tweet]
```

## Services

### ClaudeRunner

Spawns a Docker container running Claude Code CLI to research topics and generate content.

**Usage**:
```typescript
import { ClaudeRunner } from "./services/claude-runner.js";

const runner = new ClaudeRunner(config);
const content = await runner.run("Stack Overflow traffic drops");
// Returns: { linkedin: "...", x: "..." }
```

**Implementation**:
- Executes `docker run --rm -e ANTHROPIC_API_KEY=xxx claude-runner -p "prompt"`
- Builds research prompt with topic and platform requirements
- Parses JSON output from Claude Code CLI
- Timeout: 5 minutes
- Max buffer: 1MB

**Error Handling**:
- Logs errors with context
- Throws descriptive errors on failure
- Validates JSON output has required fields

### WebhookClient

Posts generated content to Discord via webhook with platform-specific embeds.

**Usage**:
```typescript
import { WebhookClient } from "./services/webhook.js";

const webhook = new WebhookClient(config.DISCORD_WEBHOOK_URL);
await webhook.postContent("Stack Overflow traffic drops", content);
```

**Implementation**:
- Creates rich embeds for each platform (LinkedIn, X)
- Uses platform-specific colors (LinkedIn: #0a66c2, X: #000000)
- Posts as single webhook message with multiple embeds
- Validates response status

**Error Handling**:
- Logs errors with response status and body
- Throws descriptive errors on failure

## Docker Deployment

### Dockerfile

Multi-stage build using Node.js 22 Alpine:

**Stage 1 (Builder)**:
- Installs all dependencies (including devDependencies)
- Compiles TypeScript to JavaScript

**Stage 2 (Runtime)**:
- Minimal image with production dependencies only
- Non-root user (`bot`) for security
- Runs compiled JavaScript from `dist/`

### docker-compose.yml

Production-ready compose configuration:

**Features**:
- `restart: unless-stopped` - Auto-restart on crashes
- `.env` file loading
- Basic healthcheck
- Log rotation (10MB max, 3 files)
- Access to Docker socket (for spawning claude-runner containers)

**Usage**:
```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f discord-bot

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

### Deployment Options

#### Option 1: VPS/EC2

```bash
# On your server
git clone <repository>
cd social-media-publisher

# Build Claude Runner image
cd claude-runner
docker build -t claude-runner:1.0 .

# Configure and run bot
cd ../discord-bot
cp .env.example .env
# Edit .env
docker compose up -d
```

#### Option 2: AWS ECS Fargate

1. Push images to ECR:
   ```bash
   # Claude Runner
   docker build -t claude-runner:1.0 ./claude-runner
   docker tag claude-runner:1.0 <account>.dkr.ecr.<region>.amazonaws.com/claude-runner:1.0
   docker push <account>.dkr.ecr.<region>.amazonaws.com/claude-runner:1.0

   # Discord Bot
   docker build -t discord-bot ./discord-bot
   docker tag discord-bot:latest <account>.dkr.ecr.<region>.amazonaws.com/discord-bot:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/discord-bot:latest
   ```

2. Create ECS task definition with environment variables
3. Deploy as Fargate service in private subnet (NAT Gateway for outbound)
4. Note: Container needs access to Docker socket or ECS task execution role to spawn claude-runner containers

#### Option 3: Local Development

```bash
docker compose up --build
```

## Development Workflow

### Adding a New Command

1. Create command file in `src/commands/`:
   ```typescript
   import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

   export const data = new SlashCommandBuilder()
     .setName("commandname")
     .setDescription("Description");

   export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
     // Implementation
   }
   ```

2. Import and register in `src/register-commands.ts`:
   ```typescript
   import { data as commandName } from "./commands/commandname.js";
   const commands = [hintCommand.toJSON(), commandName.toJSON()];
   ```

3. Handle in `src/index.ts`:
   ```typescript
   if (command.commandName === "commandname") {
     await executeCommandName(command);
   }
   ```

4. Register commands:
   ```bash
   npm run register-commands
   ```

### Logging

Uses Pino for structured logging:

```typescript
import { logger } from "./logger.js";

logger.info({ topic: "example" }, "Processing hint");
logger.error({ err }, "Failed to process");
logger.debug({ data }, "Debug details");
```

**Development**: Pretty-printed colorized logs
**Production**: JSON logs for aggregation (CloudWatch, ELK, etc.)

## Troubleshooting

### Bot doesn't respond to /hint command

**Check**:
1. Slash commands registered: `npm run register-commands`
2. Bot has correct permissions in server
3. `DISCORD_GUILD_ID` matches server ID
4. Bot is online (check Discord member list)

**Logs**:
```bash
docker compose logs discord-bot | grep -i error
```

### Content not posted to Discord

**Check**:
1. Webhook URL is correct and active
2. Bot has access to webhook channel
3. Claude Runner container can be spawned
4. Claude API key is valid

**Test webhook manually**:
```bash
curl -X POST "https://discord.com/api/webhooks/xxx/yyy" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message"}'
```

### Claude Runner fails

**Check**:
1. `claude-runner:1.0` image is built and available
2. Docker socket is accessible from bot container
3. `ANTHROPIC_API_KEY` is valid
4. Network connectivity to Anthropic API

**Test manually**:
```bash
docker run --rm -e ANTHROPIC_API_KEY=xxx claude-runner:1.0 -p "Test prompt"
```

### Docker container crashes on startup

**Check**:
1. All required env vars in `.env` file
2. Env var format is correct (no quotes around values in `.env`)
3. Check logs: `docker compose logs discord-bot`

**Common issues**:
- Missing `DISCORD_TOKEN`
- Invalid URL formats
- Network connectivity to Discord/Anthropic

## Architecture Rationale

### Why Long-Running Container vs Lambda?

| | Lambda + REST-only | Container + discord.js |
|---|---|---|
| Slash commands | Requires public Interactions Endpoint URL | Works via Gateway (no public URL) |
| Always on | No (event-driven) | Yes (WebSocket connection) |
| NAT-friendly | N/A | Yes (outbound only) |
| Cost | Pay per invocation | Container hosting cost |
| Complexity | Lower | Slightly higher |

**Chosen**: Container + discord.js for full integration without public endpoints.

### Why Docker-spawned Claude Runner vs Direct SDK?

- **Isolation**: Each content generation runs in isolated container
- **Resource control**: Container limits prevent runaway processes
- **Flexibility**: Easy to swap Claude Code CLI for other implementations
- **Debugging**: Can test Claude Runner independently

## Related Documentation

- [Requirements](../requirements.md) - Full system architecture
- [Architecture Decisions](./architecture.md) - Original design decisions
- [README](../README.md) - Project overview and quick start
