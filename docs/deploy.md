# Деплой MCP-сервера

Приложение (фронт) живёт на GitHub Pages и деплоится отдельно — здесь только
`server/mcp.ts`, read-only MCP поверх колоды.

| | |
|---|---|
| Дроплет | `134.209.227.168`, Ubuntu 22.04, 1 vCPU / 1 ГБ, рядом чужие сервисы |
| Каталог | `/sites/word-leren` |
| Домен | `word.joxter.me` → nginx → `127.0.0.1:8787` |
| Образ | `ghcr.io/joxter/word-leren/mcp`, тег = sha коммита |
| Логи | `ops-dozzle` (веб) или `docker compose -f docker-compose.prod.yml logs -f mcp` |

Ничего не собирается на боксе: CI (`.github/workflows/publish.yml`) прогоняет
тесты, собирает образ и кладёт в ghcr.io, дроплет только тянет. Сборки как
таковой нет и в CI — Node 24 стрипает типы при загрузке, образ это зависимости
плюс `server/` и `src/lib/`.

## Первая установка

Порядок обязателен: `update.sh` тянет образ по sha текущего коммита, поэтому до
зелёного CI он откажется работать — это защита, а не помеха.

1. A-запись `word.joxter.me` → `134.209.227.168`.
2. Дождаться зелёной сборки в Actions.
3. На дроплете:

```bash
git clone https://github.com/Joxter/word-leren.git /sites/word-leren
cd /sites/word-leren

# Токен обходит все правила доступа приложения — только сюда, не в репозиторий.
cat > .env <<'ENV'
VITE_INSTANT_APP_ID=...
INSTANT_APP_ADMIN_TOKEN=...
OWNER_EMAIL=...
MCP_SECRET=...
ENV
chmod 600 .env

./update.sh
```

4. nginx (по образцу соседнего `sfw.joxter.me`):

```nginx
# /etc/nginx/sites-available/word.joxter.me
server {
    server_name word.joxter.me;
    location / {
        # Секрет — часть пути, а путь попадает в access.log открытым текстом,
        # который ротируется и уезжает в бэкапы. Логировать тут нечего:
        # пользователь один, а что происходит, видно в логах контейнера.
        access_log off;
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        # MCP отвечает потоком SSE: буферизация склеила бы ответы в один кусок,
        # а короткий таймаут рвал бы долгие вызовы.
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/word.joxter.me /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d word.joxter.me
```

5. В claude.ai → Settings → Connectors добавить
   `https://word.joxter.me/mcp/<MCP_SECRET>`.

## Обновление

```bash
cd /sites/word-leren && ./update.sh
```

Пуш в master запускает CI; `update.sh` до появления образа отказывается
деплоить, вместо того чтобы молча выкатить вчерашний.

## Смена секрета

Секрет в URL — это вся авторизация. Кто узнал ссылку, тот читает колоду.

```bash
openssl rand -base64 24 | tr '+/' '-_' | tr -d '='
```

Вписать в `.env`, `docker compose -f docker-compose.prod.yml up -d mcp`,
обновить URL коннектора.

## Что сервер умеет

Только читать: `search_cards`, `get_card`, `review_history`. Записи нет
сознательно — план на пишущую половину лежит в `PLAN-inbox.md`.
