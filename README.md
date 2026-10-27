# vibes-clickui

> [!WARNING]
> Vibecoded with an AI assistant and only lightly reviewed. Review the code before exposing it to the internet.

A dashboard UI for ClickHouse.

## Production (Docker)

```sh
cp .env.example .env
sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" .env
sed -i 's|^ORIGIN=.*|ORIGIN="https://clickui.example.com"|' .env   # your public URL
docker compose up -d --build
```

Open the app, create the admin account, and add your ClickHouse under **Settings → Data sources**.

## Development

Requires Node 24 and pnpm.

```sh
pnpm install
docker compose -f compose.telemetry.yaml -f compose.demo.yaml up -d
pnpm dev   # http://localhost:5173, data source URL http://localhost:8123
```

Also: `pnpm check`, `pnpm lint`, `pnpm test`.

## License

[AGPL-3.0-or-later](LICENSE)
