FROM node:22-alpine

# Network proxy
ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY
RUN echo "http_proxy: ${HTTP_PROXY}"
RUN echo "https_proxy: ${HTTPS_PROXY}"

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.cjs"]
