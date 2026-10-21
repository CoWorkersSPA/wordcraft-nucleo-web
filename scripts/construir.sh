#!/usr/bin/env bash
# Construye el núcleo web de WordCraft: clona wordcraft en el commit de UPSTREAM, le aplica parche/, compila a wasm los crates
# `wordcraft-web-core` (el editor) y `wordcraft-web-vista` (solo abrir y pintar un .docx, para el primer pintado) y deja en
# salida/ un .tar.gz con los dos módulos (wasm + JS + tipos) y los datos que piden por nombre (fuentes, guionado), más su suma
# SHA-256.
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

echo "→ cargo build (tamaño: opt-level z, LTO completo, panic abort; SIMD128)"
(
  cd "$codigo"
  export CARGO_PROFILE_RELEASE_OPT_LEVEL=z CARGO_PROFILE_RELEASE_LTO=fat \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 CARGO_PROFILE_RELEASE_PANIC=abort
  # SIMD128 (todos los navegadores actuales): el rasterizador usa instrucciones vectoriales y el wasm sale ~12 % más chico.
  export RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+simd128"
  cargo build --release --locked --target wasm32-unknown-unknown -p wordcraft-web-core -p wordcraft-web-vista
)

echo "→ wasm-bindgen y wasm-opt"
mkdir -p "$paquete/datos/fonts" "$paquete/datos/hyphenation"
for modulo in wordcraft_web_core wordcraft_web_vista; do
  wasm-bindgen --target web --typescript --out-dir "$paquete" \
    "${CARGO_TARGET_DIR:-$codigo/target}/wasm32-unknown-unknown/release/$modulo.wasm"
  wasm-opt -Oz --all-features -o "$paquete/o.wasm" "$paquete/${modulo}_bg.wasm"
  mv "$paquete/o.wasm" "$paquete/${modulo}_bg.wasm"
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

node "$raiz/scripts/manifiesto.mjs" "$paquete" "$version" "$REPO" "$COMMIT" "$wbg"

echo "→ empaquetando"
tar -czf "$salida/$nombre.tar.gz" -C "$trabajo" "$nombre"
(cd "$salida" && suma "$nombre.tar.gz" > "$nombre.tar.gz.sha256")
cat "$salida/$nombre.tar.gz.sha256"
ls -l "$salida/$nombre.tar.gz" | awk '{print $5, "bytes"}'
