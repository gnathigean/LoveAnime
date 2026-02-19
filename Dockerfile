# Dockerfile para LoveAnime (Frontend + Proxy)
# Multi-stage build para otimização

# Stage 1: Build Frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Frontend é estático, mas se usasse build step (React/Vue) seria aqui.
# Como é Vanilla JS + `serve`, vamos apenas copiar os arquivos.

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app

# Instalar dependências de produção para o Proxy e Serve
COPY package*.json ./
RUN npm install --production
RUN npm install -g serve

# Copiar arquivos do projeto
COPY . .

# Expor portas
EXPOSE 3000 4001

# Script de inicialização para rodar Proxy e Serve simultaneamente
RUN echo '#!/bin/sh' > /start.sh
RUN echo 'node hls-proxy.js & serve . -l 3000' >> /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
