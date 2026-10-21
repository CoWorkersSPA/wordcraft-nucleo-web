// Prueba de humo del paquete construido: lo que la interfaz lee de `Editor.state()` y lo que hacen los comandos que la mueven.
//   node scripts/probar.mjs <carpeta del paquete>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) throw new Error("uso: probar.mjs <carpeta del paquete>");
const core = await import(pathToFileURL(join(dir, "wordcraft_web_core.js")));
core.initSync({ module: readFileSync(join(dir, "wordcraft_web_core_bg.wasm")) });
for (const n of core.core_files()) core.provide_file(n, readFileSync(join(dir, "datos", n)));

const e = core.Editor.sample();
const estado = () => JSON.parse(e.state());
const run = (id, params = {}) => JSON.parse(e.run(id, JSON.stringify(params)));

// Un texto de título del documento de muestra: tamaño y fuente salen de su estilo, no del formato directo.
run("select.all");
let s = estado();
assert.equal(typeof s.story, "string");
assert.equal(s.story, "body");
assert.ok(["left", "center", "right", "justify"].includes(s.align), `alineación ${s.align}`);

run("caret.docStart");
s = estado();
assert.ok(typeof s.size === "number" && s.size > 0, `tamaño efectivo ${s.size}`);
assert.ok(typeof s.font === "string" && s.font.length > 0, `fuente efectiva ${s.font}`);
assert.ok(s.color === "auto" || /^[0-9A-Fa-f]{6}$/.test(s.color), `color ${s.color}`);

// Tamaño, fuente, color y alineación: lo que se pide es lo que se lee de vuelta.
run("select.all");
run("format.size", { size: 18 });
run("format.font", { name: "Source Serif 4" });
run("format.color", { color: "C0392B" });
run("para.align", { value: "center" });
s = estado();
assert.equal(s.size, 18);
assert.equal(s.font, "Source Serif 4");
assert.equal(s.color.toUpperCase(), "C0392B");
assert.equal(s.align, "center");
// La alineación es la del primer párrafo de la selección: un triple clic termina al inicio del párrafo siguiente.
run("caret.docStart");
run("para.align", { value: "left" });
run("select.paragraph");
run("para.align", { value: "right" });
assert.equal(estado().align, "right", "alineación del párrafo seleccionado, no del siguiente");
run("caret.docStart");
run("select.paragraph");
run("para.align", { value: "center" });
assert.equal(estado().align, "center");
run("format.growFont");
assert.ok(estado().size > 18, "A↑ agranda");
run("format.shrinkFont");
run("format.shrinkFont");
assert.ok(estado().size < 18, "A↓ achica");

// Encabezado y pie: se entra, se escribe y se sale; el estado dice dónde está el cursor.
run("caret.docStart");
run("insert.editHeader", { page: 0 });
assert.equal(estado().story, "header");
run("text.insert", { text: "Encabezado de prueba" });
run("insert.closeHeader");
assert.equal(estado().story, "body");
run("insert.editFooter", { page: 0 });
assert.equal(estado().story, "footer");
run("insert.closeHeader");
console.log("estado(): fuente, tamaño, color, alineación y relato: bien");
