# =============================================================================
# Tyme - Hosts File Setup Script (Windows PowerShell)
# =============================================================================
# This script adds the required local domain entries to your hosts file.
# Run PowerShell as Administrator to execute this script.
#
# IMPORTANT: Uses your local network IP (not 127.0.0.1) so Docker containers
# can properly communicate with services on the host.
#
# Usage:
#   1. Open PowerShell as Administrator
#   2. Navigate to the project directory
#   3. Run: .\scripts\setup-hosts.ps1
#   4. Or with manual IP: .\scripts\setup-hosts.ps1 -IP 192.168.1.100
# =============================================================================

param(
    [string]$IP = ""
)

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ""
    Write-Host "ERROR: This script requires Administrator privileges." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run PowerShell as Administrator and try again:" -ForegroundColor Yellow
    Write-Host "  1. Right-click on PowerShell"
    Write-Host "  2. Select 'Run as Administrator'"
    Write-Host "  3. Navigate to this directory"
    Write-Host "  4. Run: .\scripts\setup-hosts.ps1"
    Write-Host ""
    exit 1
}

# Function to detect local IP address
function Get-LocalIPAddress {
    # Get the first IPv4 address that is not a loopback and is connected
    $networkAdapters = Get-NetIPAddress -AddressFamily IPv4 | 
        Where-Object { 
            $_.IPAddress -ne "127.0.0.1" -and 
            $_.PrefixOrigin -ne "WellKnown" -and
            ($_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or $_.IPAddress -like "172.*")
        } | 
        Sort-Object -Property InterfaceIndex
    
    if ($networkAdapters) {
        return $networkAdapters[0].IPAddress
    }
    
    # Fallback: try hostname resolution
    $hostName = [System.Net.Dns]::GetHostName()
    $hostEntry = [System.Net.Dns]::GetHostEntry($hostName)
    $ipv4 = $hostEntry.AddressList | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -ne '127.0.0.1' } | Select-Object -First 1
    
    if ($ipv4) {
        return $ipv4.ToString()
    }
    
    return $null
}

# Determine IP address to use
if ($IP -eq "") {
    $localIP = Get-LocalIPAddress
    if (-not $localIP) {
        Write-Host ""
        Write-Host "ERROR: Could not detect local IP address." -ForegroundColor Red
        Write-Host "Please specify your IP manually:" -ForegroundColor Yellow
        Write-Host "  .\scripts\setup-hosts.ps1 -IP 192.168.1.100" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Run 'ipconfig' to find your IPv4 address."
        exit 1
    }
    Write-Host "Detected local IP address: $localIP" -ForegroundColor Green
} else {
    $localIP = $IP
    Write-Host "Using provided IP address: $localIP" -ForegroundColor Yellow
}

# Hosts file path
$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"

# Required host entries (using detected/provided local IP)
$hostEntries = @(
    @{ IP = $localIP; Domain = "auth.localhost" },
    @{ IP = $localIP; Domain = "traefik.localhost" },
    @{ IP = $localIP; Domain = "mail.localhost" },
    @{ IP = $localIP; Domain = "minio.localhost" },
    @{ IP = $localIP; Domain = "s3.localhost" },
    @{ IP = $localIP; Domain = "mcp.localhost" }
)

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Tyme - Local Domain Setup" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Hosts file: $hostsFile"
Write-Host "Local IP:   $localIP"
Write-Host ""

# Read current hosts file content
$hostsContent = Get-Content $hostsFile -Raw -ErrorAction SilentlyContinue
if ($null -eq $hostsContent) {
    $hostsContent = ""
}

$entriesAdded = 0
$entriesSkipped = 0

# Check if our marker exists, if not add it
if ($hostsContent -notmatch "# Tyme Development") {
    Add-Content -Path $hostsFile -Value "`n# Tyme Development - Local Domains"
}

Write-Host "Adding host entries..." -ForegroundColor White
Write-Host ""

foreach ($entry in $hostEntries) {
    $domain = $entry.Domain
    $ip = $entry.IP
    $line = "$ip`t$domain"
    
    if ($hostsContent -match [regex]::Escape($domain)) {
        Write-Host "[SKIP] " -ForegroundColor Yellow -NoNewline
        Write-Host "$domain already exists"
        $entriesSkipped++
    } else {
        Add-Content -Path $hostsFile -Value $line
        Write-Host "[ADDED] " -ForegroundColor Green -NoNewline
        Write-Host "$line"
        $entriesAdded++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Entries added:   $entriesAdded" -ForegroundColor White
Write-Host "  Entries skipped: $entriesSkipped" -ForegroundColor White
Write-Host ""
Write-Host "You can now access:" -ForegroundColor Cyan
Write-Host "  - http://localhost          (Tyme App)"
Write-Host "  - http://auth.localhost     (Keycloak)"
Write-Host "  - http://traefik.localhost  (Traefik Dashboard)"
Write-Host "  - http://mail.localhost     (MailHog)"
Write-Host "  - http://minio.localhost    (MinIO Console)"
Write-Host "  - http://mcp.localhost      (MCP Server)"
Write-Host ""

# Flush DNS cache
Write-Host "Flushing DNS cache..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "DNS cache flushed." -ForegroundColor Green
Write-Host ""
