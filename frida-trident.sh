#!/usr/bin/env bash
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/frida/trident/frida-trident.sh"
exec bash "$PROJECT" "$@"
