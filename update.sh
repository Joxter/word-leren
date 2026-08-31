#!/bin/bash
# Deploy on the droplet, from /sites/word-leren. Same shape as the neighbouring
# projects' update.sh: nothing is built here, images come from ghcr.io.
set -euo pipefail

# Everything below runs inside braces on purpose. `git reset --hard` rewrites
# this very file while bash is executing it, and bash reads scripts
# incrementally — after a rewrite it resumes at a byte offset that no longer
# lines up, silently skipping or garbling whatever comes next. Wrapping the body
# in a compound command forces bash to parse all of it before running any of it.
{

  cd "$(dirname "$0")"

  COMPOSE="docker compose -f docker-compose.prod.yml"

  env -i git fetch
  env -i git reset --hard remotes/origin/master

  SHA=$(env -i git rev-parse HEAD)
  export IMAGE_TAG="$SHA"
  echo "Выкатываем $SHA"

  # Pull by commit sha rather than `latest`: a push to master only starts the CI
  # build, and for the next few minutes `latest` still means the previous
  # commit. Pinning makes a deploy either ship exactly what was just checked out
  # or refuse outright, instead of silently redeploying yesterday.
  if ! $COMPOSE pull mcp; then
    echo
    echo "Образ для $SHA не найден в ghcr.io."
    echo "Обычно это значит, что CI ещё не собрал этот коммит (или упал):"
    echo "  https://github.com/Joxter/word-leren/actions"
    echo "Дождись зелёной сборки и запусти ./update.sh снова."
    exit 1
  fi

  $COMPOSE up -d mcp

  # There is no database here and no migration step — the data lives in
  # InstantDB, and this server only reads it. A deploy is just a new image.

  # Our images are tagged by sha, so the previous one keeps its tag and is never
  # "dangling" — `image prune` would walk right past it and every deploy would
  # leave its predecessor on disk for good.
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep '^ghcr\.io/joxter/word-leren/' \
    | grep -v ":$SHA\$" \
    | xargs -r docker rmi -f > /dev/null 2>&1 || true

  docker image prune -f

  echo
  echo "Проверка:"
  curl -fsS --max-time 5 http://127.0.0.1:8787/health && echo " ← health ok"

}
