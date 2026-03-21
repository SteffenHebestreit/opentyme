#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${ROOT_DIR}/letsencrypt/local"
DOMAIN="${1:-opentyme.local}"
CA_NAME="OpenTYME Local Dev CA"
CA_KEY="${CERT_DIR}/rootCA.key"
CA_CERT="${CERT_DIR}/rootCA.crt"
DOMAIN_KEY="${CERT_DIR}/${DOMAIN}.key"
DOMAIN_CSR="${CERT_DIR}/${DOMAIN}.csr"
DOMAIN_CERT="${CERT_DIR}/${DOMAIN}.crt"
DOMAIN_EXT="${CERT_DIR}/${DOMAIN}.ext"
DEFAULT_KEY="${CERT_DIR}/local-dev.key"
DEFAULT_CERT="${CERT_DIR}/local-dev.crt"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

require_command openssl
mkdir -p "$CERT_DIR"

if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CERT" ]; then
  log "Generating local CA certificate"
  openssl genrsa -out "$CA_KEY" 4096 >/dev/null 2>&1
  openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 \
    -out "$CA_CERT" \
    -subj "/CN=${CA_NAME}" >/dev/null 2>&1
fi

cat > "$DOMAIN_EXT" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = *.${DOMAIN}
EOF

log "Generating wildcard certificate for ${DOMAIN} and *.${DOMAIN}"
openssl genrsa -out "$DOMAIN_KEY" 2048 >/dev/null 2>&1
openssl req -new -key "$DOMAIN_KEY" -out "$DOMAIN_CSR" -subj "/CN=${DOMAIN}" >/dev/null 2>&1
openssl x509 -req -in "$DOMAIN_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$DOMAIN_CERT" -days 825 -sha256 -extfile "$DOMAIN_EXT" >/dev/null 2>&1

cp "$DOMAIN_KEY" "$DEFAULT_KEY"
cp "$DOMAIN_CERT" "$DEFAULT_CERT"

rm -f "$DOMAIN_CSR" "$DOMAIN_EXT"

log "Created CA certificate: ${CA_CERT}"
log "Created wildcard certificate: ${DOMAIN_CERT}"
log "Created wildcard key: ${DOMAIN_KEY}"
log "Updated Traefik default certificate: ${DEFAULT_CERT}"
log "Updated Traefik default key: ${DEFAULT_KEY}"
log "Trust ${CA_CERT} on client machines to avoid browser warnings"