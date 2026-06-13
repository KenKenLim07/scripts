#!/usr/bin/env bash
# Quick connectivity check — SSH, tunnel, frida-server
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/frida/smart-gigalife/frida-smart.sh" --doctor
