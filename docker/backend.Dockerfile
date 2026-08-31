# backend：CWMS 组合根 API（apps/web 的 server，ADR-0013）
# 基础镜像走 daocloud 镜像源（本机 Docker Hub 直连不可达，见 ADR-0013 附注）
FROM docker.m.daocloud.io/library/node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
EXPOSE 8787
CMD ["pnpm", "web"]
