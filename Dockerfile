# Runs the Cloudflare Worker locally via workerd (wrangler dev) so it can live on Railway
# without a Cloudflare account. Durable Object state persists in /data for the container's life.
FROM node:24-slim
# workerd validates TLS against the system store; the slim image ships without it.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt SSL_CERT_DIR=/etc/ssl/certs
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-audit --no-fund
COPY server ./server
COPY context ./context
WORKDIR /app/server
ENV NODE_ENV=production WRANGLER_SEND_METRICS=false CI=true
EXPOSE 8787
# Secrets arrive as Railway env vars; wrangler dev only reads .dev.vars, so write it at boot.
CMD sh -c 'env | grep -E "^(STRIPE_SECRET_KEY|OPENAI_API_KEY|OPENAI_MODEL|LLM_MODE|VERIFY_MODE|PLATFORM_FEE_PCT|STRIPE_WEBHOOK_SECRET|HOLD_DEADLINE_SECONDS|BRAINBASE_API_KEY|BRAINBASE_AGENT_ID|MCP_TOKEN)=" > .dev.vars; exec npx wrangler dev --ip 0.0.0.0 --port ${PORT:-8787} --persist-to /data/state --log-level info'
