#!/bin/bash
# =============================================================================
# Tyme - Hosts File Setup Script
# =============================================================================
# This script adds the required local domain entries to your hosts file.
# Run with sudo/administrator privileges.
#
# Usage:
#   Linux/macOS: sudo ./scripts/setup-hosts.sh
#   Windows (WSL): sudo ./scripts/setup-hosts.sh
#   Windows (PowerShell as Admin): Run setup-hosts.ps1 instead
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Required host entries
HOSTS=(
    "127.0.0.1 auth.localhost"
    "127.0.0.1 traefik.localhost"
    "127.0.0.1 mail.localhost"
    "127.0.0.1 minio.localhost"
    "127.0.0.1 s3.localhost"
    "127.0.0.1 mcp.localhost"
)

# Detect OS and set hosts file path
detect_hosts_file() {
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WSL_DISTRO_NAME" ]]; then
        # Windows (Git Bash, Cygwin, or WSL)
        if [[ -n "$WSL_DISTRO_NAME" ]]; then
            # WSL - need to modify Windows hosts file
            HOSTS_FILE="/mnt/c/Windows/System32/drivers/etc/hosts"
        else
            HOSTS_FILE="/c/Windows/System32/drivers/etc/hosts"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        HOSTS_FILE="/etc/hosts"
    else
        # Linux
        HOSTS_FILE="/etc/hosts"
    fi
}

# Check if running as root/admin
check_privileges() {
    if [[ "$EUID" -ne 0 ]] && [[ -z "$WSL_DISTRO_NAME" || ! -w "$HOSTS_FILE" ]]; then
        echo -e "${RED}Error: This script requires administrator privileges.${NC}"
        echo ""
        echo "Please run with sudo:"
        echo "  sudo $0"
        echo ""
        exit 1
    fi
}

# Add host entry if not exists
add_host_entry() {
    local entry="$1"
    local domain=$(echo "$entry" | awk '{print $2}')
    
    if grep -q "$domain" "$HOSTS_FILE" 2>/dev/null; then
        echo -e "${YELLOW}[SKIP]${NC} $domain already exists"
    else
        echo "$entry" >> "$HOSTS_FILE"
        echo -e "${GREEN}[ADDED]${NC} $entry"
    fi
}

# Main function
main() {
    echo ""
    echo "==========================================="
    echo "  Tyme - Local Domain Setup"
    echo "==========================================="
    echo ""
    
    detect_hosts_file
    echo "Hosts file: $HOSTS_FILE"
    echo ""
    
    check_privileges
    
    echo "Adding host entries..."
    echo ""
    
    # Add a blank line before our entries if file doesn't end with newline
    if [[ -s "$HOSTS_FILE" ]] && [[ $(tail -c1 "$HOSTS_FILE" | wc -l) -eq 0 ]]; then
        echo "" >> "$HOSTS_FILE"
    fi
    
    # Check if our comment marker exists
    if ! grep -q "# Tyme Development" "$HOSTS_FILE" 2>/dev/null; then
        echo "" >> "$HOSTS_FILE"
        echo "# Tyme Development - Local Domains" >> "$HOSTS_FILE"
    fi
    
    for entry in "${HOSTS[@]}"; do
        add_host_entry "$entry"
    done
    
    echo ""
    echo -e "${GREEN}✓ Hosts file updated successfully!${NC}"
    echo ""
    echo "You can now access:"
    echo "  - http://localhost          (Tyme App)"
    echo "  - http://auth.localhost     (Keycloak)"
    echo "  - http://traefik.localhost  (Traefik Dashboard)"
    echo "  - http://mail.localhost     (MailHog)"
    echo "  - http://minio.localhost    (MinIO Console)"
    echo "  - http://mcp.localhost      (MCP Server)"
    echo ""
}

main "$@"
