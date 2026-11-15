function minutosDelDia(fecha, zona) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(fecha);
  const h = Number(partes.find((p) => p.type === 'hour').value);
  const m = Number(partes.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Soporta ventanas que cruzan la medianoche (22:00 -> 06:00). desde === hasta = 24 h.
function enVentana({ activa = true, desde, hasta, zona }, ahora = new Date()) {
  if (!activa) return true;
  const t = minutosDelDia(ahora, zona);
  const d = aMinutos(desde);
  const h = aMinutos(hasta);
  if (d === h) return true;
  return d < h ? t >= d && t < h : t >= d || t < h;
}

// Minutos que faltan para que cierre la ventana (para dejar de entrar unos minutos antes)
function minutosHastaCierre({ desde, hasta, zona }, ahora = new Date()) {
  const t = minutosDelDia(ahora, zona);
  const h = aMinutos(hasta);
  return (h - t + 1440) % 1440;
}

module.exports = { enVentana, minutosHastaCierre };