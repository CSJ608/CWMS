# frontend：nginx 服务 /pc /board 两静态页并反代 /api（ADR-0013）
# 基础镜像走 daocloud 镜像源（本机 Docker Hub 直连不可达）
FROM docker.m.daocloud.io/library/nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/src/pc.html apps/web/src/board.html /usr/share/nginx/html/
EXPOSE 80
