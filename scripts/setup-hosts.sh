#!/bin/bash
# =============================================================================
# OpenTYME - Hosts File Setup Script
# =============================================================================
# This script adds the required local domain entries to your hosts file.
# Run with sudo/administrator privileges.
#
# IMPORTANT: Uses your local network IP (not 127.0.0.1) so Docker containers
# can properly communicate with services on the host.
#
# Usage:
#   Linux/macOS: sudo ./scripts/setup-hosts.sh
#   With manual IP: sudo ./scripts/setup-hosts.sh 192.168.1.100
#   Windows (WSL): sudo ./scripts/setup-hosts.sh
#   Windows (PowerShell as Admin): Run setup-hosts.ps1 instead
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to detect local IP address
detect_local_ip() {
    local ip=""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Get IP from en0 (usually the primary interface)
        ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
    elif [[ -n "$WSL_DISTRO_NAME" ]]; then
        # WSL: Get the Windows host IP
        ip=$(cat /etc/resolv.conf 2>/dev/null | grep nameserver | awk '{print $2}' | head -n1)
        if [[ -z "$ip" ]]; then
            # Fallback: get IP from Windows side
            ip=$(powershell.exe -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -like '192.168.*' -or \$_.IPAddress -like '10.*' } | Select-Object -First 1).IPAddress" 2>/dev/null | tr -d '\r')
        fi
    else
        # Linux: Get the first non-loopback IPv4 address
        ip=$(ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n1)
        if [[ -z "$ip" ]]; then
            # Fallback for systems without 'ip' command
            ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        fi
    fi
    
    echo "$ip"
}

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
    local ip="$1"
    local domain="$2"
    local entry="$ip $domain"
    
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
    echo "  OpenTYME - Local Domain Setup"
    echo "==========================================="
    echo ""
    
    detect_hosts_file
    
    # Get local IP - either from argument or auto-detect
    if [[ -n "$1" ]]; then
        LOCAL_IP="$1"
        echo -e "${YELLOW}Using provided IP address: $LOCAL_IP${NC}"
    else
        LOCAL_IP=$(detect_local_ip)
        if [[ -z "$LOCAL_IP" ]]; then
            echo -e "${RED}ERROR: Could not detect local IP address${NC}"
            echo ""
            echo "Please specify your IP manually:"
            echo "  sudo $0 192.168.1.100"
            echo ""
            echo "Run 'ip addr' or 'ifconfig' to find your IP address."
            exit 1
        fi
        echo -e "${GREEN}Detected local IP address: $LOCAL_IP${NC}"
    fi
    
    echo ""
    echo "Hosts file: $HOSTS_FILE"
    echo "Local IP:   $LOCAL_IP"
    echo ""
    
    check_privileges
    
    # Domains to add
    DOMAINS=(
        "auth.localhost"
        "traefik.localhost"
        "mail.localhost"
        "minio.localhost"
        "s3.localhost"
        "mcp.localhost"
    )
    
    echo "Adding host entries..."
    echo ""
    
    # Add a blank line before our entries if file doesn't end with newline
    if [[ -s "$HOSTS_FILE" ]] && [[ $(tail -c1 "$HOSTS_FILE" | wc -l) -eq 0 ]]; then
        echo "" >> "$HOSTS_FILE"
    fi
    
    # Check if our comment marker exists
    if ! grep -q "# OpenTYME Development" "$HOSTS_FILE" 2>/dev/null; then
        echo "" >> "$HOSTS_FILE"
        echo "# OpenTYME Development - Local Domains (IP: $LOCAL_IP)" >> "$HOSTS_FILE"
    fi
    
    for domain in "${DOMAINS[@]}"; do
        add_host_entry "$LOCAL_IP" "$domain"
    done
    
    echo ""
    echo -e "${GREEN}✓ Hosts file updated successfully!${NC}"
    echo ""
    echo -e "${CYAN}You can now access:${NC}"
    echo "  - http://localhost          (OpenTYME App)"
    echo "  - http://auth.localhost     (Keycloak)"
    echo "  - http://traefik.localhost  (Traefik Dashboard)"
    echo "  - http://mail.localhost     (MailHog)"
    echo "  - http://minio.localhost    (MinIO Console)"
    echo "  - http://mcp.localhost      (MCP Server)"
    echo ""
    echo -e "${YELLOW}NOTE: All domains resolve to $LOCAL_IP${NC}"
    echo ""
}

main "$@"
