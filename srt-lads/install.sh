#!/bin/bash
# ============================================================
# SRT LADS - Installation script
# Reproducible idempotent installation for Ubuntu 24.04 LTS
# Run with: sudo bash install.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_FILE="/var/log/srt-lads-install.log"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root (or with sudo)"
  exit 1
fi

# ============================================================
# PHASE 1.1 - System hardening
# ============================================================
phase_1_1_hardening() {
  log '=== Phase 1.1: System hardening ==='
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get -o Dpkg::Options::='--force-confold' -y upgrade
  apt-get install -y git curl wget htop vim build-essential cmake tcl-dev libssl-dev pkg-config fail2ban ufw unattended-upgrades ca-certificates gnupg
  timedatectl set-timezone Europe/Paris
  # SSH hardening (drop-in)
  cat > /etc/ssh/sshd_config.d/99-srtlads.conf <<'SSHEOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers srtadmin ubuntu
SSHEOF
  sshd -t && systemctl reload ssh
  # Fail2ban
  cat > /etc/fail2ban/jail.d/sshd.local <<'F2BEOF'
[sshd]
enabled = true
port    = 22
backend = systemd
maxretry = 5
findtime = 600
bantime = 3600
F2BEOF
  systemctl enable --now fail2ban
  # UFW
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP redirect'
  ufw allow 443/tcp comment 'HTTPS web'
  ufw allow 443/udp comment 'SRT backup'
  ufw allow 10000/udp comment 'SRT main'
  ufw allow 64738/tcp comment 'Mumble TCP'
  ufw allow 64738/udp comment 'Mumble UDP'
  ufw --force enable
  # unattended-upgrades
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'UAEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
UAEOF
  systemctl enable --now unattended-upgrades
  log 'Phase 1.1 done'
}

# ============================================================
# PHASE 1.3 - SLS (SRT Live Server) build & install
# ============================================================
phase_1_3_sls() {
  log '=== Phase 1.3: SLS build & install ==='
  # TODO: implement (libsrt + sls compile, /etc/sls/sls.conf, systemd unit)
  log 'Phase 1.3 not yet implemented in this script'
}

# ============================================================
# PHASE 1.4 - Mumble Server
# ============================================================
phase_1_4_mumble() {
  log '=== Phase 1.4: Mumble Server ==='
  # TODO: apt install mumble-server, configure /etc/mumble-server.ini
  log 'Phase 1.4 not yet implemented in this script'
}

# ============================================================
# PHASE 1.5 - Nginx + Let's Encrypt
# ============================================================
phase_1_5_nginx() {
  log '=== Phase 1.5: Nginx + HTTPS ==='
  # TODO: nginx config + certbot
  log 'Phase 1.5 not yet implemented in this script'
}

# ============================================================
# PHASE 1.6 - Netdata
# ============================================================
phase_1_6_netdata() {
  log '=== Phase 1.6: Netdata ==='
  # TODO: netdata install + nginx location + htpasswd
  log 'Phase 1.6 not yet implemented in this script'
}

main() {
  log 'Starting SRT LADS installation'
  phase_1_1_hardening
  phase_1_3_sls
  phase_1_4_mumble
  phase_1_5_nginx
  phase_1_6_netdata
  log 'Installation complete'
}

main "$@"
