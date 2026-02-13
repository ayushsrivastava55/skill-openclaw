FROM node:22-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl jq ripgrep chromium fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

RUN npm i -g openclaw@latest

COPY runtime/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV OPENCLAW_PORT=3001
EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
