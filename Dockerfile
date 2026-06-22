FROM node:24.14.1-alpine AS build

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build \
    && npm prune --omit=dev


FROM node:24.14.1-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apk add --no-cache \
        ca-certificates \
        chromium \
        dumb-init \
        font-noto-emoji

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3069

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
