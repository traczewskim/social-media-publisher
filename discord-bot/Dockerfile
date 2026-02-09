FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

RUN npm install -g @anthropic-ai/claude-code \
 && mkdir -p /home/app/.claude \
 && printf '{"hasTrustDialogAccepted":true,"hasTrustDialogHooksAccepted":true,"hasCompletedOnboarding":true,"projects":{"/app":{"allowedTools":[],"hasTrustDialogAccepted":true,"hasClaudeMdExternalIncludesApproved":false}}}\n' > /home/app/.claude.json \
 && echo '{"theme":"dark"}' > /home/app/.claude/settings.json \
 && chown -R app:app /home/app/.claude /home/app/.claude.json

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY .env ./

RUN chown -R app:app /app

USER app

ENV NODE_ENV=production

CMD sh -c 'claude -p "hello" > /dev/null 2>&1; node --env-file=.env dist/index.js'
