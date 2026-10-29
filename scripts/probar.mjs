// Prueba de humo del paquete construido: la vista pinta sin el trozo del editor, el editor lo pide una sola vez, y lo que la
// interfaz lee de `Editor.state()` y lo que hacen los comandos que la mueven.
//   node scripts/probar.mjs <carpeta del paquete>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { archivos } from "./archivos.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("uso: probar.mjs <carpeta del paquete>");
// Lo comprimido que trae el paquete (.br y .gz junto a cada wasm y dato) descomprime a los mismos bytes que el original.
{
  const { gunzipSync, brotliDecompressSync } = await import("node:zlib");
  const comprimidos = archivos(dir).filter((r) => r.endsWith(".br") || r.endsWith(".gz"));
  for (const ruta of comprimidos) {
    const original = readFileSync(ruta.slice(0, -3));
    const dec = ruta.endsWith(".br") ? brotliDecompressSync(readFileSync(ruta)) : gunzipSync(readFileSync(ruta));
    assert.ok(dec.equals(original), `${ruta} no descomprime al original`);
  }
  assert.ok(comprimidos.length > 0, "el paquete no trae archivos comprimidos (.br/.gz)");
}
// El cargador de trozos los pide con fetch(new URL(…, import.meta.url)): en Node, un file:// se lee del disco.
const trozos = [];
const fetchRed = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const url = String(u);
  if (!url.startsWith("file:")) return fetchRed(u, o);
  trozos.push(url.split("/").pop());
  return new Response(readFileSync(new URL(url)), { headers: { "content-type": "application/wasm" } });
};
const core = await import(pathToFileURL(join(dir, "wordcraft_web_core.js")));
core.initSync({ module: readFileSync(join(dir, "wordcraft_web_core_bg.wasm")) });
for (const n of core.core_files()) core.provide_file(n, readFileSync(join(dir, "datos", n)));

// La vista va en el módulo principal: pinta sin pedir el trozo del editor.
{
  const v = new core.Vista("es-CL");
  assert.ok(v.page_count() >= 1);
  assert.ok(v.render_page(0, 1).length > 0);
  assert.deepEqual(trozos, [], "la vista no pide el trozo del editor");
}
const e = await core.Editor.sample();
assert.deepEqual(trozos, ["split_editor.wasm"], "el editor pide su trozo");
console.log("la vista pinta sin el trozo; el editor lo pide al crearse: bien");
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
const pagina = async (texto, locale = "es-CL") => {
  const ed = await core.Editor.create(locale);
  ed.run("text.insert", JSON.stringify({ text: texto }));
  ed.rev();
  return { ed, px: Buffer.from(ed.render_page(0, 2)) };
};
const mal = await pagina("La cassa es grande");
const bien = await pagina("La casa es grande");
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
assert.ok(igual((await pagina("La cassa es grande", "en-US")).px, (await pagina("La cassa es grande", "es-CL")).px), "en-US se corrige como español");
assert.ok(!igual((await pagina("La casa es grande", "en-GB")).px, (await pagina("La casa es grande", "en-US")).px), "en-GB sigue en inglés");
console.log("en-US se corrige como español y en-GB sigue en inglés: bien");

// Fuentes de Word (propietarias): el motor las sustituye por una abierta con las mismas métricas y la pide a la página al usarla;
// cuando llega, el texto se dibuja con ella. Calibri → Carlito, Arial → Liberation Sans, Times New Roman (negrita) → Liberation Serif.
core.wanted_files(); // lo anterior ya se atendió
const conFuente = async (nombre, negrita = false) => {
  const ed = await core.Editor.create("es-CL");
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
  const { ed, px } = await conFuente(nombre, negrita);
  const pedidos = core.wanted_files();
  for (const a of archivos) assert.ok(pedidos.includes(`fonts/${a}.ttf`), `${nombre} pide ${a}: ${pedidos}`);
  for (const a of archivos) core.add_lazy_font(readFileSync(join(dir, "datos", "fonts", `${a}.ttf`)));
  ed.rev();
  assert.ok(!Buffer.from(ed.render_page(0, 2)).equals(px), `${nombre} se dibuja con la fuente abierta cuando llega`);
}
// Un documento en blanco usa la fuente por omisión de Word (Calibri/Aptos), que pide Carlito; uno en Source Sans (la que ya viene) no pide nada.
core.wanted_files();
const base = await core.Editor.create("es-CL");
base.run("text.insert", JSON.stringify({ text: "Hamburgefonstiv" }));
base.rev();
base.render_page(0, 2);
assert.ok(core.wanted_files().includes("fonts/Carlito-Regular.ttf"), "la fuente por omisión pide Carlito");
(await conFuente("Source Sans 3")).ed.rev();
assert.deepEqual(core.wanted_files(), [], "Source Sans 3 no pide sustitutas");
console.log("fuentes de Word: piden su sustituta abierta y se dibujan con ella al llegar: bien");

// La sección del cursor (para las reglas y «Primera página diferente»): tamaño y márgenes en puntos, y si la primera página es distinta.
{
  const ed = await core.Editor.create("es-CL");
  const sec = () => JSON.parse(ed.state()).section;
  const s0 = sec();
  assert.ok(s0.pageW > 100 && s0.pageH > 100, `tamaño de página ${s0.pageW}×${s0.pageH}`);
  for (const k of ["top", "bottom", "left", "right"]) assert.ok(s0[k] > 0, `margen ${k}: ${s0[k]}`);
  assert.equal(s0.diffFirst, false);
  ed.run("layout.differentFirstPage", JSON.stringify({ value: true }));
  assert.equal(sec().diffFirst, true, "primera página diferente se lee de vuelta");
  ed.run("layout.margins", JSON.stringify({ left: 100 }));
  assert.equal(sec().left, 100, "el margen izquierdo cambia");
  console.log("estado().section: página, márgenes y primera página diferente: bien");
}

// Guardar en Word y abrir con la vista; abrir otro formato (Markdown) y exportar a PDF, que viven en el trozo.
{
  const ed = await core.Editor.create("es-CL");
  ed.run("text.insert", JSON.stringify({ text: "Hola desde el editor" }));
  const docx = ed.save("prueba.docx");
  const v = new core.Vista("es-CL");
  v.open("prueba.docx", docx);
  assert.equal(v.page_count(), 1);
  const md = await core.Editor.create("es-CL");
  md.open("nota.md", new TextEncoder().encode("# Título\n\nUn párrafo con **negrita**.\n"));
  assert.ok(JSON.parse(md.state()).words >= 5, "Markdown abierto");
  assert.equal(new TextDecoder().decode(ed.save("prueba.pdf").slice(0, 5)), "%PDF-");
  console.log("docx del editor a la vista, Markdown y PDF: bien");
}
assert.deepEqual(trozos, ["split_editor.wasm"], "el trozo se pidió una sola vez");
