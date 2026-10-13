FROM node:24-slim

# git for the company repo; the agents' tools and hooks run under sh and node.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build && npm prune --omit=dev

ENV NODE_ENV=production \
	PORT=8080 \
	EMPLOYEE_REPO=/data/acme-employee \
	WORKBENCH_DATA=/data/workbench

EXPOSE 8080
CMD ["node", "server/main.ts"]
