#!/bin/sh
set -eu

IMPORT_DIR="/opt/keycloak/data/import"
APP_HOST="${APP_HOST:-localhost}"
AUTH_HOST="${AUTH_HOST:-auth.localhost}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

sync_frontend_client() {
  frontend_client_id="$1"
  frontend_redirects='["http://localhost:3000/*","http://localhost:5173/*","http://127.0.0.1:3000/*","http://127.0.0.1:5173/*","http://localhost/*","http://10.10.0.2:3000/*","http://auth.localhost/*","http://'"${APP_HOST}"'/*","http://'"${APP_HOST}"':3000/*","http://'"${AUTH_HOST}"'/*","https://'"${APP_HOST}"'/*","https://'"${AUTH_HOST}"'/*"]'
  frontend_origins='["http://localhost:3000","http://localhost:5173","http://127.0.0.1:3000","http://127.0.0.1:5173","http://localhost","http://10.10.0.2:3000","http://auth.localhost","http://'"${APP_HOST}"'","http://'"${APP_HOST}"':3000","http://'"${AUTH_HOST}"'","https://'"${APP_HOST}"'","https://'"${AUTH_HOST}"'"]'
  frontend_logout_redirects="http://localhost:3000/*##http://localhost:5173/*##http://localhost/*##http://auth.localhost/*##http://${APP_HOST}/*##http://${APP_HOST}:3000/*##http://${AUTH_HOST}/*##https://${APP_HOST}/*##https://${AUTH_HOST}/*"

  /opt/keycloak/bin/kcadm.sh update "clients/${frontend_client_id}" -r opentyme \
    -s "redirectUris=${frontend_redirects}" \
    -s "webOrigins=${frontend_origins}" \
    -s "attributes.\"post.logout.redirect.uris\"=${frontend_logout_redirects}" \
    -s 'attributes."pkce.code.challenge.method"=S256' >/dev/null
}

sync_backend_client() {
  backend_client_id="$1"
  backend_redirects='["http://localhost:8000/*","http://localhost/*","http://'"${APP_HOST}"'/*","https://'"${APP_HOST}"'/*"]'
  backend_origins='["http://localhost:8000","http://localhost","http://'"${APP_HOST}"'","https://'"${APP_HOST}"'"]'

  /opt/keycloak/bin/kcadm.sh update "clients/${backend_client_id}" -r opentyme \
    -s "redirectUris=${backend_redirects}" \
    -s "webOrigins=${backend_origins}" >/dev/null
}

get_client_id() {
  client_name="$1"
  /opt/keycloak/bin/kcadm.sh get clients -r opentyme -q "clientId=${client_name}" \
    | grep -m1 '"id" :' \
    | sed -n 's/.*"id" : "\([^"]*\)".*/\1/p'
}

wait_for_client_id() {
  client_name="$1"

  for _ in $(seq 1 30); do
    client_id="$(get_client_id "${client_name}" || true)"
    if [ -n "${client_id}" ]; then
      printf '%s\n' "${client_id}"
      return 0
    fi
    sleep 2
  done

  return 1
}

sh "${IMPORT_DIR}/render-realm-import.sh"

/opt/keycloak/bin/kc.sh start-dev --import-realm &
KC_PID=$!

trap 'kill "${KC_PID}" 2>/dev/null || true' INT TERM

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/realms/master/.well-known/openid-configuration >/dev/null 2>&1; then
    break
  fi

  if ! kill -0 "${KC_PID}" 2>/dev/null; then
    wait "${KC_PID}"
    exit $?
  fi

  sleep 2
done

for _ in $(seq 1 20); do
  if /opt/keycloak/bin/kcadm.sh config credentials --server http://127.0.0.1:8080 --realm master --user "${ADMIN_USER}" --password "${ADMIN_PASSWORD}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

frontend_client_id="$(wait_for_client_id opentyme-frontend || true)"
backend_client_id="$(wait_for_client_id opentyme-app || true)"

if [ -n "${frontend_client_id}" ]; then
  sync_frontend_client "${frontend_client_id}"
fi

if [ -n "${backend_client_id}" ]; then
  sync_backend_client "${backend_client_id}"
fi

wait "${KC_PID}"