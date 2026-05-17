#!/bin/bash
# SRT LADS - Update script
# Pulls latest from git, applies OS updates, restarts services if needed
set -euo pipefail

cd "$(dirname "$0")"
git pull --ff-only origin master
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get -o Dpkg::Options::='--force-confold' -y upgrade
# Restart services if updated config files exist (TODO: detect changes)
echo "Update done. Restart services manually if needed:"
echo "  sudo systemctl restart sls"
echo "  sudo systemctl restart mumble-server"
echo "  sudo systemctl restart nginx"
