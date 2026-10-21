# Fuentes de sustitución

Word guarda en sus archivos el nombre de la fuente (Calibri, Arial, Times New Roman…), que es propietaria y no se puede redistribuir.
El motor la sustituye por una abierta con las mismas métricas, así el texto ocupa lo mismo y la paginación no cambia:

| Fuente del documento | Se dibuja con | Licencia |
|---|---|---|
| Calibri, Aptos y la mayoría de las sans (Segoe UI, Tahoma, Verdana…) | Carlito | SIL OFL 1.1 (`OFL-Carlito.txt`) |
| Cambria, Georgia, Garamond, Palatino y las serif | Caladea | Apache 2.0 (`LICENCIA-Apache-2.0.txt`) |
| Arial, Helvetica | Liberation Sans | SIL OFL 1.1 (`OFL-Liberation.txt`) |
| Times New Roman | Liberation Serif | SIL OFL 1.1 |
| Courier New, Consolas y las monoespaciadas | Liberation Mono | SIL OFL 1.1 |

Los archivos son los de la distribución de LibreOffice (Carlito 1.103, Caladea, Liberation 2.x), sin modificar. El núcleo los pide
solo cuando un texto los usa (`parche/0002-fuentes-sustitutas.patch`); no se bajan al abrir el editor.
