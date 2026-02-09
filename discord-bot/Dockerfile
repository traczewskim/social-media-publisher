FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN npm install -g @anthropic-ai/claude-code \
 && mkdir -p /root/.claude \
 && printf '{"hasTrustDialogAccepted":true,"hasTrustDialogHooksAccepted":true,"hasCompletedOnboarding":true,"projects":{"/app":{"allowedTools":[],"hasTrustDialogAccepted":true,"hasClaudeMdExternalIncludesApproved":false}}}\n' > /root/.claude.json \
 && echo '{"theme":"dark"}' > /root/.claude/settings.json

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

CMD sh -c 'claude -p "hello" > /dev/null 2>&1; node dist/index.js'
