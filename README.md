<div align="center">

<img src="icon.svg" alt="FinanceMaster" width="80" />

# FinanceMaster

**Tu gestor de finanzas personales, autoalojado y sin suscripciones.**

Importa tus movimientos de Trade Republic o de forma, analiza tus gastos, controla tu portfolio de inversiones y mantén el control total de tu dinero — todo en una sola app.

[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?logo=docker&logoColor=white)](https://ghcr.io/ronambulo/financemaster)
[![License](https://img.shields.io/badge/Licencia-MIT-green)](LICENSE)
[![Platforms](https://img.shields.io/badge/Plataformas-amd64%20%7C%20arm64-lightgrey)](https://ghcr.io/ronambulo/financemaster)

---

<!-- IMAGEN: screenshot del Dashboard principal (modo oscuro, vista desktop) -->
![Dashboard](.github/screenshots/dashboard.png)

</div>

---

## ✨ Características

| Módulo | Descripción |
|---|---|
| 📊 **Dashboard** | Resumen mensual de ingresos, gastos y ahorro. Tendencia de los últimos meses y próximos pagos recurrentes. |
| 📅 **Mensual** | Análisis por tramos de nómina. Desglose de categorías, tabla de transacciones y gráfica de tendencia personalizable. |
| 💳 **Transacciones** | Listado completo con filtros, búsqueda, edición de categorías y marcado de transacciones a excluir de estadísticas. |
| 📈 **Portfolio** | Seguimiento de inversiones en tiempo real con datos de Yahoo Finance. Gráfica comparativa y acumulada, historial de dividendos y operaciones cerradas. |
| 🔁 **Recurrentes** | Detección automática de pagos periódicos (suscripciones, recibos). Muestra el próximo pago esperado. |
| 🎯 **Objetivos** | Crea metas de ahorro con seguimiento de progreso. |
| 💸 **Deudas** | Registra y controla préstamos y deudas con amortización. |
| 📋 **Presupuestos** | Establece límites de gasto por categoría. |
| ⚙️ **Ajustes** | Temas visuales, colores de acento, colores de las gráficas y gestión de categorías personalizadas. |

---

## 📸 Capturas de pantalla

<!-- IMAGEN: pantalla Mensual mostrando tramos de nómina y gráfica de tendencia -->
![Mensual](.github/screenshots/monthly.png)

<!-- IMAGEN: pantalla Portfolio con gráfica a la izquierda y posiciones a la derecha -->
![Portfolio](.github/screenshots/portfolio.png)

<!-- IMAGEN: pantalla de Ajustes mostrando selector de tema y colores -->
![Ajustes](.github/screenshots/settings.png)

---

## 🚀 Instalación

### Docker (recomendado)

```yaml
# docker-compose.yml
services:
  financemaster:
    image: ghcr.io/ronambulo/financemaster:latest
    container_name: financemaster
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - /ruta/a/tus/datos:/data
    environment:
      - SECRET_KEY=cambia-esto-por-una-clave-secreta-larga-y-aleatoria
      - DATABASE_URL=sqlite:////data/finance.db
```

```bash
docker compose up -d
```

Abre **http://localhost:8000** en tu navegador, crea tu cuenta y empieza a importar tus datos.

---

### Desarrollo local

**Requisitos:** Python 3.11+, Node.js 18+

```bash
# Clonar el repositorio
git clone https://github.com/Ronambulo/FinanceMaster.git
cd FinanceMaster

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

La API estará en `http://localhost:8000` y el frontend en `http://localhost:5173`.

---

## 📥 Importar datos de Trade Republic

1. En la app de Trade Republic, ve a **Perfil → Documentos → Exportar historial**.
2. Descarga el CSV de movimientos.
3. En FinanceMaster ve a **Transacciones → Importar CSV**.
4. Arrastra el archivo — la app detecta y categoriza los movimientos automáticamente.

<!-- IMAGEN: pantalla de importación de CSV con el drag-and-drop -->
![Importar CSV](.github/screenshots/import.png)

---

## 🎨 Personalización

- **6 temas** disponibles: Trade Republic (por defecto), Azul oscuro, Bosque, Púrpura, Ámbar y Modo claro.
- **8 colores de acento** para adaptar la interfaz a tu gusto.
- **Colores de las gráficas** configurables para ingresos, gastos y ahorro.

---

## 🛠️ Stack tecnológico

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — API REST async
- [SQLAlchemy](https://www.sqlalchemy.org/) + SQLite — base de datos local
- [yfinance](https://github.com/ranaroussi/yfinance) — precios de mercado en tiempo real
- JWT para autenticación multi-usuario

**Frontend**
- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- [Recharts](https://recharts.org/) — gráficas interactivas
- [TanStack Query](https://tanstack.com/query) — gestión de estado del servidor

**Despliegue**
- Docker multi-arquitectura (amd64 / arm64)
- Compatible con CasaOS / ZimaOS

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Abre un *issue* para reportar bugs o proponer mejoras, o envía directamente un *pull request*.

---

## 📄 Licencia

Distribuido bajo licencia [MIT](LICENSE).

