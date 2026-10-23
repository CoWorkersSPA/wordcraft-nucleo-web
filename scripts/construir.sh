#!/usr/bin/env bash
# Construye el núcleo web de WordCraft: clona wordcraft en el commit de UPSTREAM, le aplica parche/, compila a wasm el crate
# `wordcraft-web-core` y lo parte con wasm-split: el módulo principal trae la vista (abrir y pintar un .docx, para el primer
# pintado) y el trozo `split_editor.wasm`, el motor de edición, que se pide al crear el primer `Editor` sin repetir lo que ya
# trajo la vista. Deja en salida/ un .tar.gz con eso (wasm + JS + tipos) y los datos que se piden por nombre (fuentes,
# guionado, diccionario) y la versión comprimida (.br y .gz) de cada wasm y dato, más su suma SHA-256.
#
#   scripts/construir.sh <versión>        p. ej. scripts/construir.sh 0.9.0-1
#
# Necesita: git, node, rustup con el target wasm32-unknown-unknown, y (se instalan solos con `cargo install` si faltan)
# wasm-bindgen-cli, de la misma versión que fija el Cargo.lock de wordcraft, wasm-opt y wasm-split-cli.
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
# El de Leptos (wasm_split_cli_support), de la misma versión que la macro que fija el parche (wasm_split_helpers 0.2.3).
wsplit=0.2.4
if ! command -v wasm-split-cli >/dev/null || ! cargo install --list | grep -q "^wasm_split_cli_support v$wsplit:"; then
  echo "→ cargo install wasm_split_cli_support@$wsplit"
  cargo install --locked "wasm_split_cli_support@$wsplit" --features build-binary
fi

echo "→ cargo build (tamaño: opt-level z, LTO completo, panic abort; SIMD128; con relocalizaciones para wasm-split)"
(
  cd "$codigo"
  export CARGO_PROFILE_RELEASE_OPT_LEVEL=z CARGO_PROFILE_RELEASE_LTO=fat \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 CARGO_PROFILE_RELEASE_PANIC=abort
  # SIMD128 (todos los navegadores actuales): el rasterizador usa instrucciones vectoriales y el wasm sale ~12 % más chico.
  # --emit-relocs: wasm-split arma el grafo de llamadas con las relocalizaciones del enlazador.
  export RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+simd128 -C link-arg=--emit-relocs"
  cargo build --release --locked --target wasm32-unknown-unknown -p wordcraft-web-core
)

echo "→ wasm-split, wasm-bindgen y wasm-opt"
partido="$trabajo/partido"
rm -rf "$partido"
# El principal sale como wordcraft_web_core.wasm; __wasm_split.js (el cargador de los trozos) lo importa como ./wordcraft_web_core.js.
wasm-split-cli "${CARGO_TARGET_DIR:-$codigo/target}/wasm32-unknown-unknown/release/wordcraft_web_core.wasm" "$partido" \
  --target web --out-name wordcraft_web_core
mkdir -p "$paquete/datos/fonts" "$paquete/datos/hyphenation"
# --keep-lld-exports: el trozo importa la tabla de funciones del principal, que wasm-bindgen quitaría.
wasm-bindgen --keep-lld-exports --target web --typescript --out-dir "$paquete" "$partido/wordcraft_web_core.wasm"
cp "$partido/__wasm_split.js" "$partido/split_editor.wasm" "$paquete/"
for w in wordcraft_web_core_bg.wasm split_editor.wasm; do
  wasm-opt -Oz --all-features -o "$paquete/o.wasm" "$paquete/$w"
  mv "$paquete/o.wasm" "$paquete/$w"
done

echo "→ datos y licencias"
# Las fuentes que el núcleo pide por nombre (FALLBACK y las de negrita, cursiva y serif) y el guionado en inglés.
cp "$codigo"/assets/fonts/SourceSans3-*.ttf "$codigo"/assets/fonts/SourceSerif4-*.ttf "$paquete/datos/fonts/"
cp "$codigo"/assets/fonts/OFL-SourceSans3.txt "$codigo"/assets/fonts/OFL-SourceSerif4.txt "$paquete/datos/fonts/"
# Las fuentes abiertas que sustituyen a las de Word (Calibri, Arial, Times…): el núcleo las pide al usarlas (datos/fonts/ORIGEN.md).
cp "$raiz"/datos/fonts/* "$paquete/datos/fonts/"
cp "$codigo"/assets/hyphenation/en-us.dic "$codigo"/assets/hyphenation/en-us.pat "$paquete/datos/hyphenation/"
# El diccionario ortográfico en español (RLA-ES, es-CL) con su licencia: el editor lo pide por nombre cuando hay texto en español.
mkdir -p "$paquete/datos/dic"
cp "$raiz"/datos/dic/es-CL.aff "$raiz"/datos/dic/es-CL.dic "$raiz"/datos/dic/LICENCIA-es-CL.txt "$raiz"/datos/dic/ORIGEN.md "$paquete/datos/dic/"
cp "$raiz/LICENCIA.md" "$paquete/LICENCIA.md"

echo "→ comprimiendo (brotli y gzip junto a cada wasm y dato, para que bff no lo haga en cada build)"
node "$raiz/scripts/comprimir.mjs" "$paquete"

node "$raiz/scripts/manifiesto.mjs" "$paquete" "$version" "$REPO" "$COMMIT" "$wbg"

echo "→ empaquetando"
tar -czf "$salida/$nombre.tar.gz" -C "$trabajo" "$nombre"
(cd "$salida" && suma "$nombre.tar.gz" > "$nombre.tar.gz.sha256")
cat "$salida/$nombre.tar.gz.sha256"
ls -l "$salida/$nombre.tar.gz" | awk '{print $5, "bytes"}'
