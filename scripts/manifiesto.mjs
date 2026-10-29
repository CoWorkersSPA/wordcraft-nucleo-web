// Escribe MANIFEST.json en el paquete: qué contiene, de dónde sale y la suma SHA-256 de cada archivo.
//   node scripts/manifiesto.mjs <carpeta> <versión> <repo de wordcraft> <commit> <versión de wasm-bindgen>
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { archivos as listar } from "./archivos.mjs";

const [carpeta, version, repo, commit, wasmBindgen] = process.argv.slice(2);
if (!carpeta || !version || !repo || !commit) {
  console.error("uso: manifiesto.mjs <carpeta> <versión> <repo> <commit> [wasm-bindgen]");
  process.exit(1);
}
const archivos = listar(carpeta).filter((r) => !r.endsWith("MANIFEST.json"));
const manifiesto = {
  nombre: "wordcraft-nucleo-web",
  version,
  wordcraft: { repo, commit },
  wasm_bindgen: wasmBindgen ?? null,
  archivos: Object.fromEntries(
    archivos.map((a) => [relative(carpeta, a), { bytes: statSync(a).size, sha256: createHash("sha256").update(readFileSync(a)).digest("hex") }]),
  ),
};
writeFileSync(join(carpeta, "MANIFEST.json"), JSON.stringify(manifiesto, null, 2) + "\n");
console.log(`MANIFEST.json: ${archivos.length} archivos`);
