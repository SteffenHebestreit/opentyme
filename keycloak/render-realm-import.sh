#!/bin/sh
set -eu

template="/opt/keycloak/data/import/realm-import.tpl"
output="/opt/keycloak/data/import/realm-import.json"

app_host="${APP_HOST:-localhost}"
auth_host="${AUTH_HOST:-auth.localhost}"

sed \
  -e "s#__APP_HOST__#${app_host}#g" \
  -e "s#__AUTH_HOST__#${auth_host}#g" \
  "$template" > "$output"