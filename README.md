# wordcraft-nucleo-web

El núcleo de [WordCraft](https://github.com/storytold/wordcraft) para el navegador, **sin interfaz de Rust**: el motor, la
maquetación y el rasterizado de páginas detrás de una API de wasm-bindgen (`Editor`: `run`, `render_page`, `click`, `caret`,
`state`, `open`, `save`…), y un módulo chico de solo vista (`Vista`: abrir un .docx y pintar sus páginas) para el primer
pintado mientras baja el editor. La interfaz es HTML (`bff/apps/wordcraft`, Astro + Svelte); aquí solo está lo que hace falta para
construir y publicar el wasm.

El editor pesa unos 10,4 MB (3,1 MB con brotli), frente a los 59 MB del wasm con la interfaz de egui; la vista, 4,0 MB (1,3 MB
con brotli). Se compilan con SIMD128.

## Qué hay

- `UPSTREAM`: el commit exacto de wordcraft sobre el que se trabaja.
- `parche/0001-nucleo-web.patch`: lo que se le agrega a ese commit. Crates nuevos `wordcraft-extdata`, `wordcraft-web-core` y
  `wordcraft-web-vista`;
  las fuentes, el guionado y las traducciones dejan de ir dentro del wasm y se piden por nombre; fuentes de negrita, cursiva y
  serif, el guionado y el diccionario inglés bajo demanda (`add_data_file`): no bloquean el arranque.
- `scripts/construir.sh <versión>`: clona, aplica el parche, compila y empaqueta en `salida/`.
- `.github/workflows/ci.yml`: lo mismo en CI; con una etiqueta `v<versión>-<n>` publica una release.

## Construir en local

```bash
rustup target add wasm32-unknown-unknown   # y tener git y node
scripts/construir.sh 0.9.0-1               # salida/wordcraft-nucleo-web-0.9.0-1.tar.gz y su .sha256
```

La primera vez instala `wasm-bindgen-cli` (de la versión que fija el `Cargo.lock` de wordcraft) y `wasm-opt`. Tarda unos minutos.

## Publicar una versión

1. Etiquetar: `git tag v0.9.0-1 && git push origin v0.9.0-1` (`<versión de wordcraft>-<n>`; `n` sube con cada cambio del parche).
2. El CI construye y crea la release con el `.tar.gz` y su `.sha256`.
3. En `bff`, poner esa versión y esa suma en `apps/wordcraft/nucleo.json`. El CI de bff y la imagen de la nube la descargan y
   comprueban la suma antes de usarla.

## Subir de versión de wordcraft

Cambiar `COMMIT` y `VERSION` en `UPSTREAM`, correr `scripts/construir.sh` (falla si el parche ya no aplica y hay que
rehacerlo), y publicar una etiqueta nueva. Idealmente el parche se ofrece a wordcraft para dejar de mantenerlo aparte.

## Contenido del paquete

`wordcraft_web_core.js`, `.d.ts` y `_bg.wasm` (el editor); `wordcraft_web_vista.js`, `.d.ts` y `_bg.wasm` (la vista); `datos/fonts` (Source Sans 3 y Source Serif 4, con su licencia OFL),
`datos/hyphenation` (inglés); `MANIFEST.json` con la suma SHA-256 de cada archivo, el commit de wordcraft y la versión de
wasm-bindgen; y `LICENCIA.md`.

## Licencia

Ver `LICENCIA.md`.
