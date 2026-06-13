#!/usr/bin/env bash
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/frida/smart-gigalife/frida-smart.sh"
exec bash "$PROJECT" "$@"
