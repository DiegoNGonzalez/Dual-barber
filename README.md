# Dual Barber — Sitio Web Oficial, Turnos Online y Panel de Autogestión

Plataforma web propia diseñada a medida para **Dual Barber** (*Av. Olazábal 4235, entre Mariano Acha y Donado, Villa Urquiza, CABA*), creada para **reemplazar AgendaPro** sin abonos mensuales ni competencia visible en la misma página.

## Qué incluye

### 1. Sitio Web Público y Motor de Turnos (`public/index.html`)
- **Identidad visual fiel a Dual Barber**: paleta monocroma inspirada en su logo oficial (`#2B2B2B`), piedra cálida y madera natural, junto con la tipografía contrastada **DUAL** (sans geométrica) + **BARBER** (serif editorial).
- **Servicios y precios reales**: Corte de Cabello (`$18.000`), Corte y Barba (`$21.000`) y Barba (`$14.000`), mostrando automáticamente el **10% de descuento en efectivo**.
- **Agenda online en 4 pasos sin registro**:
  1. Elegir servicio (15 o 30 min).
  2. Elegir barbero (**Agustín Placente**, **Luciano Bersaggi** o primer disponible con balanceo automático).
  3. Elegir día y horario disponible en tiempo real (Martes a Sábado de 11:00 a 20:00 hs, huso horario Buenos Aires, respetando la regla de **1 hora de anticipación mínima** y evitando reservas duplicadas).
  4. Confirmación instantánea con código (`DUAL-XXXX`), comprobante listo para enviar por **WhatsApp**, enlace a **Google Calendar** y descarga `.ics`.
- **Autogestión del cliente ("Mis turnos")**: permite buscar por código o WhatsApp y **reprogramar** (hasta 4 veces, hasta 1 hora antes) o **cancelar** sin drama, liberando el horario al instante.
- **Integración Google Maps & Reseñas**: muestra la calificación oficial (**5.0 ★ · 81 reseñas en Google Maps**), reseñas verificadas de clientes reales, mapa interactivo embebido de Av. Olazábal 4235 y accesos directos para ver todas o dejar una nueva reseña.

### 2. Panel de Autogestión para Barberos (`public/admin.html`)
Acceso con PIN (demo inicial: **`2026`**, modificable desde Configuración):
- **Agenda y turnos**: vista Hoy / Mañana / Próximos / Historial / fecha puntual, filtro por barbero, carga de turnos manuales (walk-in o WhatsApp), recordatorio por WhatsApp en 1 clic, y cobro rápido en **Efectivo (10% OFF)** o **Transferencia/Tarjeta**.
- **Caja y métricas**: facturación cobrada, desglose efectivo vs digital, rendimiento por barbero (Agustín vs Luciano) y ranking de servicios.
- **Servicios y precios**: edición instantánea de precios, duración, descripciones y visibilidad en la web pública.
- **Equipo y bloqueos**: gestión de días/horarios por barbero, foto de perfil y bloqueo de franjas (almuerzos, feriados, francos) que se reflejan en vivo en la agenda.
- **Base de clientes (CRM)**: historial propio de clientes, cantidad de visitas, total abonado y contacto directo por WhatsApp.
- **Negocio y Google Maps**: horarios semanales, reglas de turnos, gestión de reseñas destacadas, sincronización opcional con **Google Places API (New)**, exportación/importación de respaldo JSON y reinicio de datos demo.

## Cómo ejecutarlo localmente

No requiere instalar dependencias externas (funciona directamente con **Node.js 20+**):

```bash
npm start
```

- Sitio público: `http://localhost:3000`
- Panel de gestión: `http://localhost:3000/admin.html` (PIN inicial: `2026`)

> **Modo híbrido automático**: si los archivos de `public/` se suben a un hosting estático (por ejemplo, GitHub Pages o Netlify para mostrar una demo rápida al cliente), el frontend detecta que no hay servidor Node y utiliza `localStorage` automáticamente para que todo siga siendo 100% interactivo.

## Sincronización automática con Google Places API (Opcional)

1. Copiá `.env.example` a `.env`.
2. Agregá `GOOGLE_PLACES_API_KEY` (habilitando **Places API (New)** en Google Cloud Console) y `GOOGLE_PLACE_ID` de Dual Barber.
3. Desde el Panel de Gestión → **Negocio & Google Maps**, tocá **Sincronizar Google Places API** para actualizar la calificación, cantidad de reseñas y comentarios automáticamente.
