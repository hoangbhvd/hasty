# Custom server (Next + Socket.io) chạy bằng tsx nên KHÔNG dùng output "standalone".
# Debian (glibc) để sharp có binary dựng sẵn.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Các biến NEXT_PUBLIC_* được "đóng cứng" vào bundle lúc build → phải truyền qua build args
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1536 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
# prisma generate / next build không kết nối DB (DATABASE_URL ở trên chỉ để đọc cấu hình)
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 TZ=Asia/Ho_Chi_Minh
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Migration được chạy ở lệnh khởi động của service `web` (xem docker-compose.prod.yml)
CMD ["node_modules/.bin/tsx", "server.ts"]
