# Deploy updates on Unraid

Run in your server's terminal, replacing `/path/to/calendar` with your checkout directory:

```bash
cd /path/to/calendar
git -c safe.directory="$PWD" pull --ff-only

docker compose -p edoncloud-calendar \
  -f deployment/compose.yaml \
  -f deployment/compose.local.yaml \
  build app && \
docker compose -p edoncloud-calendar \
  -f deployment/compose.yaml \
  -f deployment/compose.local.yaml \
  up -d --no-build app
```

If you already pulled the latest changes, skip the `git pull` command.

No need to delete the image or stop the container first. The current app stays
running during the build, then Compose replaces it. Your existing configuration
and mounted data stay in place.

Open Calendar at your configured address after deployment. To check server health,
replace `YOUR_HOST` and `YOUR_PORT` with your deployment's address and port:

```bash
curl -f "http://YOUR_HOST:YOUR_PORT/healthz"
```
