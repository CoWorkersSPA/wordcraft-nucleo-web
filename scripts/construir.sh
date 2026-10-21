#!/usr/bin/env bash
# Construye el núcleo web de WordCraft: clona wordcraft en el commit de UPSTREAM, le aplica parche/, compila el crate
# `wordcraft-web-core` a wasm y deja en salida/ un .tar.gz con el núcleo (wasm + JS + tipos) y los datos que pide por nombre
# (fuentes, guionado), más su suma SHA-256.
#
#   scripts/construir.sh <versión>        p. ej. scripts/construir.sh 0.9.0-1
#
# Necesita: git, node, rustup con el target wasm32-unknown-unknown, y (se instalan solos con `cargo install` si faltan)
# wasm-bindgen-cli, de la misma versión que fija el Cargo.lock de wordcraft, y wasm-opt.
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../UPSTREAM
source "$raiz/UPSTREAM"
version="${1:?uso: scripts/construir.sh <versión>   (p. ej. 0.9.0-1)}"
trabajo="${TRABAJO:-$raiz/trabajo}"
salida="${SALIDA:-$raiz/salida}"
codigo="$trabajo/wordcraft"
nombre="wordcraft-nucleo-web-${version}"
paquete="$trabajo/$nombre"

suma() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

echo "→ wordcraft $COMMIT"
rm -rf "$codigo" "$paquete"
mkdir -p "$codigo" "$salida"
git -C "$codigo" init -q
git -C "$codigo" remote add origin "$REPO"
git -C "$codigo" fetch -q --depth 1 origin "$COMMIT"
git -C "$codigo" checkout -q FETCH_HEAD

echo "→ parche"
for p in "$raiz"/parche/*.patch; do
  git -C "$codigo" apply --check "$p"
  git -C "$codigo" apply "$p"
done

# La versión de wasm-bindgen que fija wordcraft: el CLI y el crate deben coincidir.
wbg="$(awk '/^name = "wasm-bindgen"$/ { getline; gsub(/"/, "", $3); print $3; exit }' "$codigo/Cargo.lock")"
[ -n "$wbg" ] || { echo "no encuentro wasm-bindgen en Cargo.lock" >&2; exit 1; }
if ! command -v wasm-bindgen >/dev/null || [ "$(wasm-bindgen --version | awk '{print $2}')" != "$wbg" ]; then
  echo "→ cargo install wasm-bindgen-cli@$wbg"
  cargo install --locked "wasm-bindgen-cli@$wbg"
fi
command -v wasm-opt >/dev/null || { echo "→ cargo install wasm-opt"; cargo install --locked wasm-opt; }

echo "→ cargo build (tamaño: opt-level z, LTO completo, panic abort)"
(
  cd "$codigo"
  export CARGO_PROFILE_RELEASE_OPT_LEVEL=z CARGO_PROFILE_RELEASE_LTO=fat \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 CARGO_PROFILE_RELEASE_PANIC=abort
  cargo build --release --locked --target wasm32-unknown-unknown -p wordcraft-web-core
)

echo "→ wasm-bindgen y wasm-opt"
mkdir -p "$paquete/datos/fonts" "$paquete/datos/hyphenation"
wasm-bindgen --target web --typescript --out-dir "$paquete" \
  "$codigo/target/wasm32-unknown-unknown/release/wordcraft_web_core.wasm"
wasm-opt -Oz --all-features -o "$paquete/o.wasm" "$paquete/wordcraft_web_core_bg.wasm"
mv "$paquete/o.wasm" "$paquete/wordcraft_web_core_bg.wasm"

echo "→ datos y licencias"
# Las fuentes que el núcleo pide por nombre (FALLBACK y las de negrita, cursiva y serif) y el guionado en inglés.
cp "$codigo"/assets/fonts/SourceSans3-*.ttf "$codigo"/assets/fonts/SourceSerif4-*.ttf "$paquete/datos/fonts/"
cp "$codigo"/assets/fonts/OFL-SourceSans3.txt "$codigo"/assets/fonts/OFL-SourceSerif4.txt "$paquete/datos/fonts/"
cp "$codigo"/assets/hyphenation/en-us.dic "$codigo"/assets/hyphenation/en-us.pat "$paquete/datos/hyphenation/"
cp "$raiz/LICENCIA.md" "$paquete/LICENCIA.md"

node "$raiz/scripts/manifiesto.mjs" "$paquete" "$version" "$REPO" "$COMMIT" "$wbg"

echo "→ empaquetando"
tar -czf "$salida/$nombre.tar.gz" -C "$trabajo" "$nombre"
(cd "$salida" && suma "$nombre.tar.gz" > "$nombre.tar.gz.sha256")
cat "$salida/$nombre.tar.gz.sha256"
ls -l "$salida/$nombre.tar.gz" | awk '{print $5, "bytes"}'
