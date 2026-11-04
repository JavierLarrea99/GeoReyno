// Buscador de municipios con autocompletado (sin tildes ni mayúsculas, en castellano o euskera).
// Lo usan «Escudos» y otros modos donde se escribe el nombre de un municipio.

import { esc, toast, normalize } from "./engine.js";
import { searchMunicipios, findMunicipio } from "./geo.js";

// Pinta el buscador dentro de `box` y llama a onChoose(municipio) al elegir uno.
// `exclude` es un Set de códigos INE que no deben salir (p. ej. los ya probados).
export function municipioSearch(box, data, onChoose, { placeholder = "Escribe un municipio…", button = "Probar", exclude = new Set() } = {}) {
  box.innerHTML = `
    <form class="guess-form" autocomplete="off">
      <label class="sr" for="busca-muni">Nombre del municipio</label>
      <div class="ac">
        <input id="busca-muni" type="text" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="busca-lista">
        <ul class="ac-list" id="busca-lista" role="listbox"></ul>
      </div>
      <button class="btn" type="submit">${esc(button)}</button>
    </form>`;
  const form = box.querySelector("form");
  const input = box.querySelector("input");
  const list = box.querySelector(".ac-list");
  let options = [];
  let active = -1;

  const paint = () => list.querySelectorAll("li").forEach((li, i) => {
    li.classList.toggle("active", i === active);
    li.setAttribute("aria-selected", String(i === active));
  });
  const close = () => {
    list.innerHTML = "";
    options = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
  };
  const choose = (m) => {
    close();
    input.value = m.nombre;
    onChoose(m);
  };

  input.addEventListener("input", () => {
    options = searchMunicipios(data, input.value).filter((m) => !exclude.has(m.ine));
    active = options.length ? 0 : -1;
    list.innerHTML = options.map((m, i) => `<li role="option" data-i="${i}">${esc(m.nombre)}</li>`).join("");
    input.setAttribute("aria-expanded", String(options.length > 0));
    paint();
  });
  input.addEventListener("keydown", (e) => {
    if (!options.length) return;
    if (e.key === "ArrowDown") { active = (active + 1) % options.length; paint(); e.preventDefault(); }
    if (e.key === "ArrowUp") { active = (active - 1 + options.length) % options.length; paint(); e.preventDefault(); }
    if (e.key === "Escape") close();
  });
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) choose(options[Number(li.dataset.i)]);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let m = findMunicipio(data, input.value);
    if (!m && options.length && active >= 0) m = options[active];
    if (!m) return toast(normalize(input.value) ? "No conozco ese municipio. Elige uno de la lista." : "Escribe el nombre de un municipio");
    if (exclude.has(m.ine)) return toast("Ya lo has probado");
    choose(m);
  });
  return {
    focus: () => input.focus({ preventScroll: true }),
    disable: () => { input.disabled = true; box.querySelector("button").disabled = true; close(); },
  };
}
