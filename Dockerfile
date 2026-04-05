# Deploy from repository root. Static files, scripts/, lib/, fonts/, and node_modules resolve from /app (server.js directory).
# Full image: sharp and other native deps are less likely to fail than on -slim.
FROM node:20-bookworm
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
