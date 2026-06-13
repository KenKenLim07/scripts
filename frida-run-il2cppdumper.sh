#!/usr/bin/env bash
# Run Il2CppDumper on Trident dump files (handles metadata v39 via c01ns fork)
set -euo pipefail

DUMP_DIR="${HOME}/dev/scripts/frida/trident/dump"
OUT_DIR="${DUMP_DIR}/output"
BIN_DIR="${DUMP_DIR}/Il2CppDumper-bin"
V39_SRC="${DUMP_DIR}/Il2CppDumper-v39"
DOTNET_DIR="${HOME}/.dotnet"
OFFICIAL_ZIP="Il2CppDumper-net6-v6.7.46.zip"
OFFICIAL_URL="https://github.com/Perfare/Il2CppDumper/releases/download/v6.7.46/${OFFICIAL_ZIP}"

FW="${DUMP_DIR}/UnityFramework"
META="${DUMP_DIR}/global-metadata.dat"

mkdir -p "$OUT_DIR" "$BIN_DIR"

if [[ ! -f "$FW" ]]; then
  echo "ERROR: missing $FW — run frida-pull-metadata.sh first" >&2
  exit 1
fi

if [[ ! -f "$META" ]]; then
  echo "[!] missing $META — trying UnityFramework-only (may fail)"
  META="$FW"
fi

ensure_dotnet_path() {
  export PATH="${DOTNET_DIR}:${PATH}"
  export DOTNET_ROLL_FORWARD="${DOTNET_ROLL_FORWARD:-LatestMajor}"
}

metadata_version() {
  python3 - "$1" <<'PY'
import struct, sys
path = sys.argv[1]
with open(path, "rb") as f:
    magic, version = struct.unpack("<II", f.read(8))
if magic != 0xFAB11BAF:
    print(-1)
else:
    print(version)
PY
}

install_dotnet_runtime() {
  ensure_dotnet_path

  if [[ -x "${DOTNET_DIR}/dotnet" ]]; then
    echo "[*] dotnet: $("${DOTNET_DIR}/dotnet" --version 2>/dev/null || echo '?')"
  elif command -v dotnet &>/dev/null; then
    echo "[*] dotnet: $(dotnet --version)"
  fi

  if compgen -G "${DOTNET_DIR}/shared/Microsoft.NETCore.App/6.*" >/dev/null; then
    echo "[*] .NET 6 runtime already installed"
    return 0
  fi

  echo "[*] Installing .NET 6 runtime to ${DOTNET_DIR}..."
  local installer="/tmp/dotnet-install.sh"
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$installer"
  bash "$installer" --channel 6.0 --runtime dotnet --install-dir "$DOTNET_DIR"
}

install_dotnet_sdk() {
  ensure_dotnet_path

  if dotnet --list-sdks 2>/dev/null | grep -qE '^8\.'; then
    echo "[*] .NET 8 SDK already installed"
    return 0
  fi

  echo "[*] Installing .NET 8 SDK to ${DOTNET_DIR} (build v39 fork)..."
  local installer="/tmp/dotnet-install.sh"
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$installer"
  bash "$installer" --channel 8.0 --install-dir "$DOTNET_DIR"
  echo "[*] SDKs:"
  dotnet --list-sdks
}

fetch_official_bin() {
  if [[ -f "${BIN_DIR}/Il2CppDumper.dll" ]]; then
    echo "[*] Official Il2CppDumper binary already in ${BIN_DIR}"
    return 0
  fi
  echo "[*] Downloading ${OFFICIAL_URL} ..."
  local tmp="/tmp/${OFFICIAL_ZIP}"
  curl -fsSL "$OFFICIAL_URL" -o "$tmp"
  rm -rf "${BIN_DIR:?}"/*
  unzip -q -o "$tmp" -d "$BIN_DIR"
  rm -f "$tmp"
  echo "[*] Extracted to ${BIN_DIR}"
}

fetch_v39_src() {
  if [[ -f "${V39_SRC}/Il2CppDumper/Il2CppDumper.csproj" ]]; then
    echo "[*] v39 Il2CppDumper source already in ${V39_SRC}"
    return 0
  fi
  echo "[*] Cloning c01ns/Il2CppDumper (metadata v39 support)..."
  rm -rf "$V39_SRC"
  git clone --depth 1 https://github.com/c01ns/Il2CppDumper.git "$V39_SRC"
}

disable_require_any_key() {
  local cfg="$1"
  [[ -f "$cfg" ]] || return 0
  sed -i 's/"RequireAnyKey": true/"RequireAnyKey": false/' "$cfg" 2>/dev/null || \
    sed -i '' 's/"RequireAnyKey": true/"RequireAnyKey": false/' "$cfg" 2>/dev/null || true
}

run_dumper() {
  local workdir="$1"
  shift
  cd "$workdir"
  disable_require_any_key "config.json"
  set +e
  dotnet "$@" 2>&1 | tee "${DUMP_DIR}/il2cppdumper.log"
  local rc=${PIPESTATUS[0]}
  set -e
  return "$rc"
}

META_VER="$(metadata_version "$META")"
echo "[*] metadata version: ${META_VER}"

if [[ "$META_VER" -lt 0 ]]; then
  echo "ERROR: ${META} is not a valid global-metadata.dat (bad magic)" >&2
  exit 1
fi

ensure_dotnet_path
install_dotnet_runtime

rc=0
if [[ "$META_VER" -gt 31 ]]; then
  echo "[*] Metadata v${META_VER} needs c01ns fork (official Il2CppDumper stops at v31)"
  install_dotnet_sdk
  fetch_v39_src
  disable_require_any_key "${V39_SRC}/Il2CppDumper/config.json"
  echo "[*] Running Il2CppDumper (v39 fork)..."
  echo "    il2cpp:   $FW"
  echo "    metadata: $META"
  echo "    output:   $OUT_DIR"
  set +e
  dotnet run --project "${V39_SRC}/Il2CppDumper/Il2CppDumper.csproj" \
    -c Release --framework net8.0 -- \
    "$FW" "$META" "$OUT_DIR" 2>&1 | tee "${DUMP_DIR}/il2cppdumper.log"
  rc=${PIPESTATUS[0]}
  set -e
else
  fetch_official_bin
  echo "[*] Running Il2CppDumper (official v6.7.46)..."
  echo "    il2cpp:   $FW"
  echo "    metadata: $META"
  echo "    output:   $OUT_DIR"
  run_dumper "$BIN_DIR" Il2CppDumper.dll "$FW" "$META" "$OUT_DIR" || rc=$?
fi

if [[ $rc -ne 0 ]]; then
  echo ""
  echo "ERROR: Il2CppDumper failed (exit $rc). See ${DUMP_DIR}/il2cppdumper.log"
  if [[ "$META_VER" -gt 31 ]]; then
    echo "Retry interactively (Mach-O platform prompt):"
    echo "  cd ${V39_SRC}/Il2CppDumper && dotnet run -c Release --framework net8.0 -- ${FW} ${META} ${OUT_DIR}"
  else
    echo "Retry interactively:"
    echo "  cd ${BIN_DIR} && dotnet Il2CppDumper.dll ${FW} ${META} ${OUT_DIR}"
  fi
  exit "$rc"
fi

echo ""
echo "[*] Done. Search dump:"
echo "  grep -i 'LootBag\\|PremiumChest\\|Dropped\\|ChestTier' ${OUT_DIR}/dump.cs | head -60"

if [[ -f "${OUT_DIR}/dump.cs" ]]; then
  echo ""
  echo "--- LootBag / chest hits ---"
  grep -in 'LootBag\|PremiumChest\|Dropped\|ChestTier\|ChestRarity\|MobChest' "${OUT_DIR}/dump.cs" | head -40 || true
fi
