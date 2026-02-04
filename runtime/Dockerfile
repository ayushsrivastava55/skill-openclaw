FROM node:22-slim

WORKDIR /app

RUN npm i -g openclaw@latest
COPY runtime/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV OPENCLAW_PORT=3001
EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
