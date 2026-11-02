// Aplica el tema guardado (claro u oscuro) antes de pintar la página, para evitar parpadeos.
// Script clásico (no módulo) que se carga en el <head> de todas las páginas.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("georeyno:theme") || "null");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    /* sin almacenamiento: se usa el tema del sistema */
  }
})();
