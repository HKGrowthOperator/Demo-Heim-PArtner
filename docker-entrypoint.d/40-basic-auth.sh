#!/bin/sh
# Passwortschutz nur, wenn beide Variablen gesetzt sind (in Coolify unter Environment Variables).
set -eu
if [ -n "${BASIC_AUTH_USER:-}" ] && [ -n "${BASIC_AUTH_PASSWORD:-}" ]; then
  htpasswd -bc /etc/nginx/.htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASSWORD" >/dev/null 2>&1
  printf 'auth_basic "Heim & Partner";\nauth_basic_user_file /etc/nginx/.htpasswd;\n' > /etc/nginx/auth.conf
  echo "basic auth: aktiv"
else
  : > /etc/nginx/auth.conf
  echo "basic auth: aus (BASIC_AUTH_USER und BASIC_AUTH_PASSWORD nicht gesetzt)"
fi
