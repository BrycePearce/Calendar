#!/usr/bin/env bash
# Add icon metadata for existing Compose containers; do not deploy through these templates.
set -euo pipefail
icon_url=${1:-}
project=${COMPOSE_PROJECT_NAME:-edoncloud-calendar}
template_dir=/boot/config/plugins/dockerMan/templates-user
if [[ $EUID -ne 0 || ! -d /boot/config/plugins/dockerMan ]]; then
  echo 'Run as root on Unraid.' >&2; exit 1
fi
if [[ ! $icon_url =~ ^https://[a-zA-Z0-9./_%-]+\.png$ ]]; then
  echo 'Pass a public HTTPS URL ending in .png (no credentials or query string).' >&2; exit 1
fi
mkdir -p "$template_dir"
# Prepare both files before installing either. Existing templates are never overwritten.
staging=$(mktemp -d)
trap 'rm -f "$staging"/*.xml; rmdir "$staging"' EXIT
for service in web exporter; do
  mapfile -t ids < <(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service")
  if [[ ${#ids[@]} -ne 1 ]]; then
    echo "Expected exactly one $service container for project $project." >&2; exit 1
  fi
  name=$(docker inspect --format '{{.Name}}' "${ids[0]}")
  name=${name#/}
  image=$(docker inspect --format '{{.Config.Image}}' "${ids[0]}")
  if [[ ! $name =~ ^[a-zA-Z0-9_.-]+$ || ! $image =~ ^[a-zA-Z0-9./_:@-]+$ ]]; then
    echo 'Unexpected container name or image reference.' >&2; exit 1
  fi
  file="my-$name.xml"
  cat > "$staging/$file" <<XML
<?xml version="1.0"?>
<Container version="2">
  <Name>$name</Name>
  <Repository>$image</Repository>
  <Registry />
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support />
  <Overview>Calendar icon metadata only. Manage this container through Docker Compose, not this template.</Overview>
  <WebUI />
  <Icon>$icon_url</Icon>
  <ExtraParams />
  <PostArgs />
  <CPUset />
</Container>
XML
  if [[ -e "$template_dir/$file" ]] && ! cmp -s "$staging/$file" "$template_dir/$file"; then
    echo "Existing template left unchanged: $template_dir/$file. Update its Icon field manually." >&2; exit 1
  fi
done
for source in "$staging"/*.xml; do
  destination="$template_dir/$(basename "$source")"
  if [[ ! -e $destination ]]; then
    install -m 644 "$source" "$destination"
  fi
done
echo 'Icon templates ready. Refresh the Unraid Docker page. Continue using Compose for updates.'
