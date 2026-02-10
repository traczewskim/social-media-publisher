# Discord Bot

## Purpose

The Discord bot provides the interface for the Social Media Publisher system. Users submit content hints directly from Discord via slash commands, and the bot generates platform-specific posts using Claude Code CLI.

This enables a quick workflow where you can submit ideas and receive generated content without leaving Discord. The bot creates dedicated threads for each topic, allowing for iterative refinement through conversation.

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
3. Bot sends responses via the Gateway connection
4. Zero inbound traffic needed - fully compatible with NAT/firewalls

### Components

```
Discord Bot Container
├── Discord Gateway (WebSocket)
│   ├── Receives slash commands (/hint)
│   └── Receives message events (thread replies)
├── Claude Code CLI (embedded in image)
│   ├── Installed globally via npm
│   ├── Pre-configured with trust/onboarding settings
│   └── Authenticated via CLAUDE_CODE_OAUTH_TOKEN env var
├── ClaudeRunner Service
│   ├── run(topic) - Generates initial content
│   ├── refine(history) - Refines content based on conversation
│   └── Spawns `claude -p --output-format json "prompt"` subprocess
├── Command Handlers
│   └── /hint command - Creates threads with initial content
└── Event Handlers
    └── Thread reply handler - Processes user refinements
```

### Event Flow

#### Initial Content Generation

```
User types /hint "topic" in Discord
  → Discord Gateway pushes event to bot (WebSocket)
  → Bot defers reply ("Researching... This may take a few minutes.")
  → Bot spawns claude CLI subprocess with --output-format json
  → Claude Code CLI researches topic and generates content
  → Process outputs JSON {result: '{"linkedin": "...", "x": "..."}'}
  → Bot parses JSON envelope, extracts inner JSON, creates embeds
  → Bot creates a new thread named after the topic (auto-archive: 24h)
  → Bot posts LinkedIn + X embeds IN the thread
  → Bot posts invitation: "Reply in this thread to refine the content."
  → Bot edits original reply with link to thread
```

#### Thread-Based Refinement

```
User replies in thread with refinement request
  → Discord Gateway pushes MessageCreate event to bot
  → Bot detects message is in a bot-created thread
  → Bot shows typing indicator
  → Bot collects conversation history (up to 50 messages)
  → Bot calls runner.refine(history) with conversation context
  → Claude generates updated content based on feedback
  → Bot posts updated embeds in thread
  → User can continue refining with additional replies
```

## Prerequisites

### Discord Application Setup

1. Create a Discord application at https://discord.com/developers/applications
2. Go to "Bot" section:
   - Click "Add Bot"
   - Enable "Message Content Intent" (required for thread replies)
   - Enable "Server Members Intent" (if needed)
   - Copy the bot token
3. Go to "OAuth2" section:
   - Copy the "Client ID"
4. Invite bot to your server:
   - OAuth2 → URL Generator
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`, `Create Public Threads`, `Send Messages in Threads`, `Read Message History`
   - Use generated URL to invite bot

### Claude Code OAuth Setup

1. Get OAuth token from Claude Code CLI:
   ```bash
   # Run Claude Code CLI locally and authenticate
   claude -p "hello"
   # Follow OAuth flow in browser

   # Extract token from ~/.claude.json
   cat ~/.claude.json | jq -r '.oauthTokens[0].access_token'
   ```

2. Add token to `.env` as `CLAUDE_CODE_OAUTH_TOKEN`

### Required Environment Variables

Create `.env` file in `discord-bot/` directory:

```bash
# Discord Configuration
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-client-id
DISCORD_GUILD_ID=your-discord-server-id
DISCORD_CHANNEL_ID=channel-id-for-content-threads

# Claude Code Authentication (OAuth token, NOT API key)
CLAUDE_CODE_OAUTH_TOKEN=your-claude-code-oauth-token

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

**Important**: Use `CLAUDE_CODE_OAUTH_TOKEN`, NOT `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. The Claude Code CLI requires OAuth authentication, not API key auth.

### Getting Discord IDs

Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode), then:
- **Guild ID**: Right-click server name → Copy Server ID
- **Channel ID**: Right-click channel name → Copy Channel ID

## Docker Setup

### Multi-Stage Dockerfile

The Docker image uses a multi-stage build with Claude Code CLI baked in:

**Stage 1 (Builder)**:
- Installs all dependencies (including devDependencies)
- Compiles TypeScript to JavaScript

**Stage 2 (Runtime)**:
- Installs Claude Code CLI globally: `npm install -g @anthropic-ai/claude-code`
- Creates `~/.claude.json` with trust/onboarding pre-accepted
- Creates `~/.claude/settings.json` with theme settings
- Copies production dependencies only
- Copies compiled JavaScript from builder stage
- Runs warmup: `claude -p "hello"` in CMD before starting bot

**Key Docker Configuration**:
```dockerfile
# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code \
 && mkdir -p /root/.claude \
 && printf '{"hasTrustDialogAccepted":true,"hasTrustDialogHooksAccepted":true,"hasCompletedOnboarding":true,"projects":{"/app":{"allowedTools":[],"hasTrustDialogAccepted":true,"hasClaudeMdExternalIncludesApproved":false}}}\n' > /root/.claude.json \
 && echo '{"theme":"dark"}' > /root/.claude/settings.json

# Warmup Claude CLI before starting bot
CMD sh -c 'claude -p "hello" > /dev/null 2>&1; node dist/index.js'
```

This ensures:
- No interactive prompts on first run
- OAuth token is the only required authentication
- CLI is ready to execute immediately

## Setup

### Local Development

```bash
cd discord-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env  # (or create .env manually if .env.example doesn't exist)
# Edit .env with your credentials

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

### Docker Build

```bash
# From project root
cd /home/michal/code/social-media-publisher

# Build image
docker build -t social-media-publisher ./discord-bot

# Run with startup script
./start-discord-bot.sh
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | - | Application client ID |
| `DISCORD_GUILD_ID` | Yes | - | Discord server ID for slash commands |
| `DISCORD_CHANNEL_ID` | Yes | - | Channel where content threads are created |
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | - | OAuth token from Claude Code CLI (NOT API key) |
| `LOG_LEVEL` | No | `info` | Pino log level: `debug`, `info`, `warn`, `error` |

### Gateway Intents

The bot requires the following intents:
- `GatewayIntentBits.Guilds` - Receive guild events
- `GatewayIntentBits.GuildMessages` - Receive message events
- `GatewayIntentBits.MessageContent` - Read message content in threads

### Zod Validation

All environment variables are validated at startup using Zod. The bot will fail fast with clear error messages if required variables are missing or invalid.

## Commands

### /hint

Submits a content hint for AI research and generation. Creates a dedicated thread for the topic with initial content, allowing for iterative refinement.

**Usage**:
```
/hint topic:"Stack Overflow traffic drops because of AI"
```

**Parameters**:
- `topic` (required, string): The topic or thesis to research and create content for

**Response Flow**:
1. Bot immediately defers reply: `"Researching "Stack Overflow traffic drops because of AI"... This may take a few minutes."`
2. Bot spawns Claude CLI subprocess with research prompt
3. Claude Code researches topic and generates LinkedIn + X posts
4. Bot creates a new thread named after the topic (auto-archive: 24 hours)
5. Bot posts embeds for LinkedIn and X posts IN the thread
6. Bot posts invitation: "Reply in this thread to refine the content."
7. Bot edits original reply to link to the thread
8. Users can reply in the thread to refine the content iteratively

**Fallback Behavior**:
If the command is not used in a text channel (e.g., in DMs or thread), the bot falls back to editing the original reply with embeds instead of creating a thread.

**Thread Example**:
```
[Original Reply]
Done! Content for "Stack Overflow traffic drops" posted in thread: #stack-overflow-traffic-drops

[Thread: #stack-overflow-traffic-drops]

**Content generated for:** Stack Overflow traffic drops because of AI

[LinkedIn Embed - Blue #0a66c2]
Title: LinkedIn Post
Body: [Generated professional thought leadership content]

[X Embed - Black #000000]
Title: X (Twitter) Post
Body: [Generated punchy tweet]

Reply in this thread to refine the content. I'll adjust based on your feedback.

[User replies: "Make it more technical"]

[Bot shows typing...]

**Updated content:**

[Updated LinkedIn Embed]
[Updated X Embed]
```

## Services

### ClaudeRunner

Spawns Claude Code CLI as subprocess to research topics and generate content. Supports both initial generation and iterative refinement.

**Usage**:
```typescript
import { ClaudeRunner } from "./services/claude-runner.js";

const runner = new ClaudeRunner(config);

// Initial generation
const content = await runner.run("Stack Overflow traffic drops");
// Returns: { linkedin: "...", x: "..." }

// Refinement with conversation history
const history = [
  { role: "assistant", content: "[LinkedIn Post]: ...\n[X Post]: ..." },
  { role: "user", content: "Make it more technical" }
];
const refined = await runner.refine(history);
// Returns: { linkedin: "...", x: "..." }
```

**Methods**:

#### run(topic: string): Promise<GeneratedContent>
Generates initial content for a topic.
- Builds research prompt with topic and platform requirements
- Spawns `claude -p --output-format json "prompt"` subprocess
- Parses JSON envelope and extracts content
- Returns structured content object

#### refine(history: ConversationMessage[]): Promise<GeneratedContent>
Refines content based on conversation history.
- Takes array of `{role: "user" | "assistant", content: string}` messages
- Builds refinement prompt with conversation context
- Returns updated content maintaining platform requirements

**Implementation Details**:

**Process Spawning**:
```typescript
const child = spawn("claude", args, {
  stdio: ["ignore", "pipe", "pipe"],  // stdin MUST be ignored or Claude hangs
  env: process.env,
});
```

Critical: `stdio: ["ignore", "pipe", "pipe"]` - stdin must be ignored, otherwise Claude CLI waits for interactive input and hangs indefinitely.

**Output Parsing**:
Claude Code `--output-format json` wraps output in an envelope:
```json
{
  "result": "{\"linkedin\": \"...\", \"x\": \"...\"}"
}
```

The parser:
1. Extracts `.result` field from JSON envelope
2. Handles markdown code blocks (```json ... ```)
3. Re-escapes newlines in inner JSON (envelope parsing converts `\n` to literal newlines)
4. Parses raw JSON objects with linkedin/x fields

**Timeout**: 5 minutes per generation/refinement

**Error Handling**:
- Logs errors with context
- Throws descriptive errors on failure
- Validates JSON output has required fields

**ConversationMessage Type**:
```typescript
interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}
```

## Event Handlers

### Thread Reply Handler

Processes user messages in bot-created threads to enable iterative content refinement.

**Location**: `src/handlers/thread-reply.ts`

**Trigger**: `Events.MessageCreate` in Discord threads

**Flow**:
1. Message is posted in a thread
2. Handler validates:
   - Message is in a thread (not regular channel)
   - Message author is not the bot itself
   - Message author is not another bot
3. Handler fetches starter message to verify thread was created by bot
4. Handler shows typing indicator
5. Collects conversation history (up to 50 messages)
6. Converts Discord messages to role-based history:
   - Extracts embed content from bot messages
   - Formats as `[Embed Title]: Embed Description`
7. Calls `runner.refine(history)` with context
8. Posts updated embeds in the thread

**Usage**:
```typescript
import { handleThreadReply } from "./handlers/thread-reply.js";

client.on(Events.MessageCreate, async (message) => {
  if (!client.user) return;
  await handleThreadReply(message, runner, client.user.id);
});
```

**Functions**:

#### handleThreadReply(message, runner, botUserId)
Main handler for thread replies. Processes user refinement requests and posts updated content.

#### buildConversationHistory(messages, botUserId)
Converts Discord message collection to role-based conversation history:
- Bot messages → `role: "assistant"` (includes embed content)
- User messages → `role: "user"`
- Filters out empty messages
- Maintains chronological order

## Project Structure

```
discord-bot/
├── src/
│   ├── commands/
│   │   └── hint.ts              # /hint slash command
│   ├── handlers/
│   │   └── thread-reply.ts      # Thread message handler
│   ├── services/
│   │   └── claude-runner.ts     # Claude CLI integration via spawn()
│   ├── config.ts                # Zod-validated config
│   ├── logger.ts                # Pino logger setup
│   ├── index.ts                 # Main bot entry point
│   └── register-commands.ts     # Slash command registration
├── Dockerfile                   # Multi-stage build with Claude CLI
├── docker-compose.yml           # Production compose config
├── package.json
└── tsconfig.json

start-discord-bot.sh             # Startup script at repo root
```

## Docker Deployment

### Dockerfile

Multi-stage build using Node.js 22 Alpine:

**Stage 1 (Builder)**:
- Installs all dependencies (including devDependencies)
- Compiles TypeScript to JavaScript

**Stage 2 (Runtime)**:
- Installs Claude Code CLI globally: `npm install -g @anthropic-ai/claude-code`
- Pre-populates config files:
  - `~/.claude.json` - Trust dialogs accepted, onboarding completed
  - `~/.claude/settings.json` - Theme preference
- Installs production dependencies only
- Copies compiled JavaScript from builder stage
- Warmup: `claude -p "hello"` runs before bot starts to ensure CLI is ready

### Startup Script

The `start-discord-bot.sh` script at the repository root provides a convenient way to run the bot:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="social-media-publisher"
ENV_FILE="${SCRIPT_DIR}/discord-bot/.env"
docker run --rm --name discord-bot --memory=4g --env-file "${ENV_FILE}" "$IMAGE"
```

**Features**:
- Runs with `--rm` flag (auto-cleanup)
- 4GB memory limit
- Loads environment from `discord-bot/.env`
- Must pass `CLAUDE_CODE_OAUTH_TOKEN` via `--env-file`

**Usage**:
```bash
./start-discord-bot.sh
```

### docker-compose.yml

Production-ready compose configuration:

**Features**:
- `restart: unless-stopped` - Auto-restart on crashes
- `.env` file loading
- Basic healthcheck
- Log rotation (10MB max, 3 files)

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

# Configure environment
cd discord-bot
cp .env.example .env  # Or create .env manually
# Edit .env with your credentials

# Build and run
cd ..
docker build -t social-media-publisher ./discord-bot
./start-discord-bot.sh

# Or using docker-compose
cd discord-bot
docker compose up -d
```

#### Option 2: AWS ECS Fargate

1. Push image to ECR:
   ```bash
   docker build -t social-media-publisher ./discord-bot
   docker tag social-media-publisher:latest <account>.dkr.ecr.<region>.amazonaws.com/social-media-publisher:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/social-media-publisher:latest
   ```

2. Create ECS task definition with environment variables (including `CLAUDE_CODE_OAUTH_TOKEN`)
3. Deploy as Fargate service in private subnet (NAT Gateway for outbound)

#### Option 3: Local Development

```bash
cd discord-bot
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

### Adding a New Event Handler

1. Create handler file in `src/handlers/`:
   ```typescript
   import { Message } from "discord.js";
   import { ClaudeRunner } from "../services/claude-runner.js";

   export async function handleEvent(
     message: Message,
     runner: ClaudeRunner,
     botUserId: string
   ): Promise<void> {
     // Implementation
   }
   ```

2. Register in `src/index.ts`:
   ```typescript
   import { handleEvent } from "./handlers/event-handler.js";

   client.on(Events.SomeEvent, async (data) => {
     await handleEvent(data, runner, client.user.id);
   });
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
2. Bot has correct permissions in server (including thread permissions)
3. `DISCORD_GUILD_ID` matches server ID
4. Bot is online (check Discord member list)
5. Message Content Intent is enabled in Discord Developer Portal

**Logs**:
```bash
docker compose logs discord-bot | grep -i error
```

### Thread refinement doesn't work

**Check**:
1. Message Content Intent is enabled in Discord Developer Portal
2. Bot has "Send Messages in Threads" and "Read Message History" permissions
3. Conversation history is not exceeding 50 messages (current limit)

**Debug**:
```bash
# Enable debug logging in .env
LOG_LEVEL=debug
```

### Content generation fails

**Check**:
1. `CLAUDE_CODE_OAUTH_TOKEN` is valid (NOT `ANTHROPIC_API_KEY`)
2. Token is in environment variables (passed via `--env-file`)
3. Network connectivity to Anthropic services
4. Claude CLI is installed in container
5. Output parsing handles JSON envelope correctly

**Test Claude CLI manually**:
```bash
docker run -it --env-file discord-bot/.env social-media-publisher sh
# Inside container:
echo $CLAUDE_CODE_OAUTH_TOKEN  # Should show token
claude -p --output-format json "Test prompt"
```

### Claude CLI hangs indefinitely

**Cause**: stdin is not set to "ignore" in spawn() call

**Fix**: Ensure `stdio: ["ignore", "pipe", "pipe"]` in claude-runner.ts

### Docker container crashes on startup

**Check**:
1. All required env vars in `.env` file
2. `CLAUDE_CODE_OAUTH_TOKEN` is set (NOT `ANTHROPIC_API_KEY`)
3. Env var format is correct (no quotes around values in `.env`)
4. Check logs: `docker compose logs discord-bot`

**Common issues**:
- Missing `DISCORD_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`
- Using `ANTHROPIC_AUTH_TOKEN` instead of `CLAUDE_CODE_OAUTH_TOKEN` (breaks OAuth)
- Invalid gateway intents configuration
- Network connectivity to Discord/Anthropic

### Getting shell access to container

For debugging:
```bash
# Run interactive shell
docker run -it --env-file discord-bot/.env social-media-publisher sh

# Or attach to running container
docker exec -it discord-bot sh
```

## Architecture Rationale

### Why Long-Running Container vs Lambda?

| | Lambda + REST-only | Container + discord.js |
|---|---|---|
| Slash commands | Requires public Interactions Endpoint URL | Works via Gateway (no public URL) |
| Thread support | Limited via REST | Full support via Gateway |
| Real-time events | Polling required | WebSocket push |
| Always on | No (event-driven) | Yes (WebSocket connection) |
| NAT-friendly | N/A | Yes (outbound only) |
| Cost | Pay per invocation | Container hosting cost |
| Complexity | Lower | Slightly higher |

**Chosen**: Container + discord.js for full integration including threads without public endpoints.

### Why Embedded Claude CLI vs API Client?

| | Anthropic API Client | Claude Code CLI |
|---|---|---|
| Content generation | Direct API calls | Subprocess with full Claude Code capabilities |
| Research ability | Limited to API context | Full web browsing, research, tool use |
| Output quality | Good | Better (uses full Claude Code tooling) |
| Authentication | API key | OAuth token |
| Deployment | Simple | Requires CLI in image |

**Chosen**: Claude Code CLI for superior research capabilities and content quality.

### Why spawn() vs docker exec?

| | docker exec | spawn() |
|---|---|---|
| Complexity | Requires Docker socket mount or DinD | Simple subprocess call |
| Deployment | Two containers to manage | Single container |
| Security | Docker socket access needed | Process-level isolation |
| Debugging | Test runner independently | Test within bot container |

**Chosen**: spawn() for simplicity and single-image deployment.

### Why Threads for Refinement?

| | Single Reply with Edits | Threads |
|---|---|---|
| Conversation history | Requires state management | Native Discord history |
| User experience | Limited to one round | Unlimited refinement rounds |
| Organization | All content in main channel | Dedicated space per topic |
| Discoverability | Reply buried in channel | Thread appears in sidebar |
| Auto-cleanup | Manual | Auto-archive after 24h |

**Chosen**: Threads for better UX, natural conversation flow, and automatic cleanup.

### Why `--output-format json` Flag?

The Claude CLI's `--output-format json` wraps output in a JSON envelope:
```json
{"result": "{\"linkedin\": \"...\", \"x\": \"...\"}"}
```

This provides:
- Structured, machine-readable output
- Clear separation between CLI metadata and actual content
- Easier parsing compared to extracting from markdown
- Consistent format across different prompts

The parser handles the envelope extraction and inner JSON parsing automatically.

## Related Documentation

- [README](../README.md) - Project overview and quick start
- [Requirements](../requirements.md) - Full system requirements
