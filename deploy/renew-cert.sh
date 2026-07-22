#!/bin/sh
# Renew the Let's Encrypt cert. certbot only acts when the cert is within 30 days of expiry,
# so this is safe to run weekly. Standalone needs port 80, hence the brief nginx stop.
# Intended to run as root from cron (see deploy notes). ~30s downtime, at most monthly.
set -e
cd /home/ekorber/clairemed-demo
docker compose stop nginx
docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot renew --quiet
docker compose up -d nginx
