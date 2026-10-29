// Los archivos de una carpeta y sus subcarpetas, en orden alfabético (así los scripts del paquete son deterministas).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function archivos(carpeta) {
  return readdirSync(carpeta)
    .sort()
    .flatMap((n) => {
      const ruta = join(carpeta, n);
      return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
    });
}
