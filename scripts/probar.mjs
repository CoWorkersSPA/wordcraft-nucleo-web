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

// Corrector en español: el texto sin idioma se corrige en español (idioma por omisión) con el diccionario que pide la página;
// con él cargado, la palabra mal escrita se subraya (la página cambia) y la bien escrita no.
core.set_default_language("es-CL");
const pagina = (texto, locale = "es-CL") => {
  const ed = new core.Editor(locale);
  ed.run("text.insert", JSON.stringify({ text: texto }));
  ed.rev();
  return { ed, px: Buffer.from(ed.render_page(0, 2)) };
};
const mal = pagina("La cassa es grande");
const bien = pagina("La casa es grande");
const pedidos = core.wanted_files();
assert.ok(pedidos.includes("dic/es-CL.aff") && pedidos.includes("dic/es-CL.dic"), `pide el diccionario: ${pedidos}`);
for (const n of ["dic/es-CL.aff", "dic/es-CL.dic"]) core.add_data_file(n, readFileSync(join(dir, "datos", n)));
mal.ed.rev();
bien.ed.rev();
const malCon = Buffer.from(mal.ed.render_page(0, 2));
const bienCon = Buffer.from(bien.ed.render_page(0, 2));
assert.ok(!malCon.equals(mal.px), "«cassa» se subraya cuando llega el diccionario");
assert.ok(bienCon.equals(bien.px), "«casa» no se subraya");
console.log("corrector en español: pide el diccionario, subraya «cassa» y deja «casa»: bien");

// Un documento en en-US (el idioma que traía todo documento nuevo, y el de Word por omisión) se corrige como español:
// con el mismo texto con error se ve igual que uno en es-CL. Uno en en-GB, que alguien eligió, sigue en inglés: el inglés
// no conoce «casa» y la subraya, el español no.
const igual = (a, b) => a.equals(b);
assert.ok(igual(pagina("La cassa es grande", "en-US").px, pagina("La cassa es grande", "es-CL").px), "en-US se corrige como español");
assert.ok(!igual(pagina("La casa es grande", "en-GB").px, pagina("La casa es grande", "en-US").px), "en-GB sigue en inglés");
console.log("en-US se corrige como español y en-GB sigue en inglés: bien");

// Fuentes de Word (propietarias): el motor las sustituye por una abierta con las mismas métricas y la pide a la página al usarla;
// cuando llega, el texto se dibuja con ella. Calibri → Carlito, Arial → Liberation Sans, Times New Roman (negrita) → Liberation Serif.
core.wanted_files(); // lo anterior ya se atendió
const conFuente = (nombre, negrita = false) => {
  const ed = new core.Editor("es-CL");
  ed.run("text.insert", JSON.stringify({ text: "Hamburgefonstiv" }));
  ed.run("select.all", "{}");
  ed.run("format.font", JSON.stringify({ name: nombre }));
  if (negrita) ed.run("format.bold", "{}");
  ed.rev();
  return { ed, px: Buffer.from(ed.render_page(0, 2)) };
};
for (const [nombre, negrita, archivos] of [
  ["Calibri", false, ["Carlito-Regular"]],
  ["Arial", false, ["LiberationSans-Regular"]],
  ["Times New Roman", true, ["LiberationSerif-Regular", "LiberationSerif-Bold"]],
  ["Courier New", false, ["LiberationMono-Regular"]],
  ["Cambria", false, ["Caladea-Regular"]],
]) {
  const { ed, px } = conFuente(nombre, negrita);
  const pedidos = core.wanted_files();
  for (const a of archivos) assert.ok(pedidos.includes(`fonts/${a}.ttf`), `${nombre} pide ${a}: ${pedidos}`);
  for (const a of archivos) core.add_lazy_font(readFileSync(join(dir, "datos", "fonts", `${a}.ttf`)));
  ed.rev();
  assert.ok(!Buffer.from(ed.render_page(0, 2)).equals(px), `${nombre} se dibuja con la fuente abierta cuando llega`);
}
// Un documento en blanco usa la fuente por omisión de Word (Calibri/Aptos), que pide Carlito; uno en Source Sans (la que ya viene) no pide nada.
core.wanted_files();
const base = new core.Editor("es-CL");
base.run("text.insert", JSON.stringify({ text: "Hamburgefonstiv" }));
base.rev();
base.render_page(0, 2);
assert.ok(core.wanted_files().includes("fonts/Carlito-Regular.ttf"), "la fuente por omisión pide Carlito");
conFuente("Source Sans 3").ed.rev();
assert.deepEqual(core.wanted_files(), [], "Source Sans 3 no pide sustitutas");
console.log("fuentes de Word: piden su sustituta abierta y se dibujan con ella al llegar: bien");
