# Production Deployment

The application runs as five Docker services:

- `frontend`: Nginx serving the Vite build and proxying `/api/`
- `backend`: FastAPI on Uvicorn
- `mysql`: user and graph metadata
- `neo4j`: knowledge graph data
- `clamav-rest`: optional, enabled through the `clamav` Compose profile

## Server Layout

```text
/opt/knowledgegraphqa/app
├── .env                         # Compose and database secrets
├── deploy/runtime/.env          # runtime LLM settings written by the UI
├── deploy/backups/              # migration dumps
├── deploy/neo4j/import/         # Neo4j load input
└── docker-compose.yml
```

Only port `80` is published. MySQL, Neo4j, and ClamAV stay on the internal
Docker network.

## Start And Update

```bash
cd /opt/knowledgegraphqa/app
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

The LLM provider, model, base URL, and API key are configured through the
admin system settings page. Those values persist in `deploy/runtime/.env`.

## Optional ClamAV

ClamAV is intentionally opt-in because it needs substantial memory:

```bash
docker compose --profile clamav up -d clamav-rest
```

Verify the backend can reach it:

```bash
curl -fsS http://127.0.0.1/api/health
```

## Data Backups

```bash
docker compose exec -T mysql \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --databases "$MYSQL_DATABASE"' \
  > deploy/backups/mysql.sql

docker compose stop neo4j
docker compose run --rm --no-deps --entrypoint neo4j-admin \
  neo4j database dump neo4j --to-path=/import --overwrite-destination=true
docker compose start neo4j
```

## Security

- Replace the initial server password and keep `.env` at mode `600`.
- Do not expose MySQL, Neo4j, or ClamAV ports in the cloud firewall.
- Add a domain and TLS certificate before exposing authenticated user data
  beyond a private test group.
