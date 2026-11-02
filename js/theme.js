// Aplica el tema guardado antes de pintar la página, para evitar parpadeos.
// Por defecto GeoReyno es oscuro; el botón del menú permite pasar a claro.
// Script clásico (no módulo) que se carga en el <head> de todas las páginas.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("georeyno:theme") || "null");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {
    /* sin almacenamiento: tema oscuro */
  }
})();
