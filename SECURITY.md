# Security

This is pre-release software with no supported release line yet. Security fixes will initially target the current development branch. Do not assume formal support or an SLA.

Do not disclose credentials, internal addresses, private exports, or exploit details in public issues. Once a repository is published, inspect its Security tab: use private vulnerability reporting **only if the owner has enabled it**. Otherwise, ask for a private reporting channel in a public issue without sensitive details, or use an existing verified private channel to the maintainer. No private contact address or enabled GitHub reporting service is asserted here.

Titles and the explicitly documented event fields are public by design. Treat publication filtering as a private exporter decision. Do not expose Sonarr/Radarr through the web container or Tunnel. Keep configuration and secret files outside public storage; mount only public JSON and public branding into Nginx. Do not mount the Docker socket or media libraries.

The exporter bounds response size and duration, rejects redirects, validates schemas, and avoids raw logging. The browser treats all metadata as text and uses a same-origin content policy. These controls and Gitleaks reduce risk but cannot guarantee confidentiality. Review actual deployment permissions and firewall rules. If a credential reaches history, an image, logs, or another shared artifact, revoke/rotate it and follow the relevant service's incident process; deleting the current file is insufficient.
