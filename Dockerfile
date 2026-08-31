# The MCP server, and nothing else from this repo. There is no build step: Node
# 24 strips the types out of `.ts` as it loads them, so the image is the runtime
# deps plus two source directories. See docs/deploy.md.
FROM node:24-slim

WORKDIR /app

# Copied before the sources so a change to the server doesn't reinstall
# node_modules on every build.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
# `server/mcp.ts` imports `src/lib` directly — same trick, no bundler. Only the
# pure modules are reachable from it; anything touching the DOM is not here.
COPY src/lib ./src/lib

# Loopback would make the published port unreachable from outside the container.
# Compose is what keeps this off the public interface, by publishing to the
# droplet's 127.0.0.1 only.
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

USER node
CMD ["node", "server/mcp.ts"]
