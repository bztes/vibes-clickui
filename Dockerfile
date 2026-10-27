# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN npm install -g pnpm@12.14.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# Public URL of the app, baked into the build for CSRF checks (adapter-node assumes https otherwise)
ARG ORIGIN=http://localhost:3000
ENV ORIGIN=$ORIGIN
RUN pnpm build

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	MIGRATIONS_DIR=/app/drizzle \
	DATA_DIR=/data
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "build"]
