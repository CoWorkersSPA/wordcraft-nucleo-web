# wordcraft-nucleo-web

El núcleo de [WordCraft](https://github.com/storytold/wordcraft) para el navegador, **sin interfaz de Rust**: un solo wasm
partido con [wasm-split](https://docs.rs/wasm_split_helpers). El módulo principal trae la vista (`Vista`: abrir un .docx,
maquetar y pintar sus páginas) para el primer pintado; el motor de edición (`Editor`: `run`, `render_page`, `click`, `caret`,
`state`, `open`, `save`…) llega como trozo aparte (`split_editor.wasm`) la primera vez que se crea un editor con
`await Editor.create(locale)`, sin repetir lo que ya trajo la vista. La interfaz es HTML (`bff/apps/wordcraft`, Astro + Svelte); aquí solo está lo que hace falta para
construir y publicar el wasm.

Con brotli, el módulo principal pesa ~1,15 MB y el trozo del editor ~1,76 MB: 2,9 MB en total, frente a los 4,15 MB de cuando
vista y editor eran dos wasm independientes (el editor repetía casi toda la vista), y los 59 MB del wasm con la interfaz de
egui. Se compila con SIMD128.

## Qué hay

- `UPSTREAM`: el commit exacto de wordcraft sobre el que se trabaja.
- `parche/*.patch`, en orden. `0001-nucleo-web.patch`: lo que se le agrega a ese commit. Crates nuevos `wordcraft-extdata`, `wordcraft-web-core` y
  `wordcraft-web-vista`;
  las fuentes, el guionado y las traducciones dejan de ir dentro del wasm y se piden por nombre; fuentes de negrita, cursiva y
  serif, el guionado y el diccionario inglés bajo demanda (`add_data_file`): no bloquean el arranque.
- `parche/0005-nucleo-partido.patch`: `wordcraft-web-core` pasa a ser el wasm único: reexporta la vista y deja el motor de
  edición (`src/motor.rs`) detrás del punto de corte `#[wasm_split(editor)]`.
- `parche/0006-estado-imagen.patch`: `state()` trae `picture` (página y marco, tamaño, recorte, giro, volteo, ajuste, posición y texto alternativo de la imagen
  seleccionada; `null` si no hay), para la pestaña contextual «Formato de imagen». También: `Editor.object_at(página, x, y)` (¿hay una imagen ahí?) y un clic
  sobre una imagen la selecciona.
- `scripts/construir.sh <versión>`: clona, aplica el parche, compila, parte con wasm-split y empaqueta en `salida/`.
- `scripts/probar.mjs <carpeta del paquete>`: prueba de humo en Node (lo que lee la interfaz de `Editor.state()` y los comandos que lo mueven); el CI la corre sobre cada paquete.
- `.github/workflows/ci.yml`: lo mismo en CI; con una etiqueta `v<versión>-<n>` publica una release.

## Construir en local

```bash
rustup target add wasm32-unknown-unknown   # y tener git y node
scripts/construir.sh 0.9.0-1               # salida/wordcraft-nucleo-web-0.9.0-1.tar.gz y su .sha256
```

La primera vez instala `wasm-bindgen-cli` (de la versión que fija el `Cargo.lock` de wordcraft), `wasm-opt` y `wasm-split-cli`
(`wasm_split_cli_support`). Tarda unos minutos. La cadena es: `cargo build` con `--emit-relocs` → `wasm-split-cli` →
`wasm-bindgen --keep-lld-exports` sobre el principal (el trozo importa su tabla de funciones) → `wasm-opt` a cada wasm →
`scripts/comprimir.mjs`, que deja junto a cada wasm y dato su `.br` (brotli 11) y su `.gz`: bff los entrega tal cual y no comprime en cada build.

## Publicar una versión

1. Etiquetar: `git tag v0.9.0-1 && git push origin v0.9.0-1` (`<versión de wordcraft>-<n>`; `n` sube con cada cambio del parche).
2. El CI construye y crea la release con el `.tar.gz` y su `.sha256`.
3. En `bff`, poner esa versión y esa suma en `apps/wordcraft/nucleo.json`. El CI de bff y la imagen de la nube la descargan y
   comprueban la suma antes de usarla.

## Subir de versión de wordcraft

Cambiar `COMMIT` y `VERSION` en `UPSTREAM`, correr `scripts/construir.sh` (falla si el parche ya no aplica y hay que
rehacerlo), y publicar una etiqueta nueva. Idealmente el parche se ofrece a wordcraft para dejar de mantenerlo aparte.

## Contenido del paquete

`wordcraft_web_core.js`, `.d.ts` y `_bg.wasm` (el módulo principal: vista y cáscara del editor); `split_editor.wasm` (el
motor de edición) y `__wasm_split.js` (su cargador, que el principal importa; los dos deben servirse junto a él); `datos/fonts` (Source Sans 3 y Source Serif 4, con su licencia OFL),
`datos/hyphenation` (inglés), `datos/dic` (diccionario ortográfico en español de Chile, con su licencia); `MANIFEST.json` con la suma SHA-256 de cada archivo, el commit de wordcraft y la versión de
wasm-bindgen; y `LICENCIA.md`.

## Licencia

Ver `LICENCIA.md`.
