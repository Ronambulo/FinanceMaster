<div align="center">

<img src="icon.svg" alt="FinanceMaster" width="80" />

# FinanceMaster

**Tu gestor de finanzas personales, autoalojado y sin suscripciones.**

Importa tus movimientos de Trade Republic, analiza tus gastos, controla tu portfolio de inversiones y mantén el control total de tu dinero — todo en una sola app.

[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?logo=docker\&logoColor=white)](https://ghcr.io/ronambulo/financemaster)
[![License](https://img.shields.io/badge/Licencia-MIT-green)](LICENSE)
[![Platforms](https://img.shields.io/badge/Plataformas-amd64%20%7C%20arm64-lightgrey)](https://ghcr.io/ronambulo/financemaster)

</div>

---

## 📸 Vista previa

![Dashboard](screenshots/dashboard.png)

---

## ✨ Características

| Módulo | Descripción |
|---|---|
| 📊 **Dashboard** | Resumen mensual de ingresos, gastos y ahorro. Tendencia de los últimos meses, próximos pagos recurrentes y widget de logros. |
| 📅 **Mensual** | Análisis por tramos de nómina. Desglose de categorías, tabla de transacciones y gráfica de tendencia personalizable. |
| 💳 **Transacciones** | Listado completo con filtros, búsqueda, edición de categorías y marcado de transacciones a excluir de estadísticas. Importación CSV y entrada manual. |
| 📈 **Portfolio** | Seguimiento de inversiones con datos de mercado en tiempo real (yfinance). Gráfica comparativa y acumulada, historial de dividendos y operaciones cerradas. Posiciones manuales. |
| 🔁 **Recurrentes** | Detección automática de pagos periódicos (suscripciones, recibos) y previsión del próximo cargo. |
| 🎯 **Objetivos** | Metas de ahorro con seguimiento de progreso y allocaciones. |
| 💸 **Deudas** | Gestión de préstamos, cuotas y amortizaciones con historial de pagos. |
| 🔥 **FIRE Calculator** | Calcula cuándo podrás retirarte. KPIs de capital necesario, años hasta FIRE, edad estimada y progreso actual. Gráfica de trayectoria. |
| 🏆 **Logros** | Sistema de gamificación con retos financieros. Progreso circular, categorías y últimos logros desbloqueados. |
| 👶 **Baby Steps** | Plan de finanzas personales de Dave Ramsey. Seguimiento de los 7 pasos con guía detallada. |
| 🤖 **Asistente IA** | Chat integrado con IA para consultas sobre tus finanzas. Historial de conversaciones persistente. |
| ⌨️ **Command Palette** | Navegación rápida con `Ctrl+K`. Acceso a cualquier sección, acciones frecuentes y más. |
| ⚙️ **Ajustes** | Temas visuales, colores de acento, categorías personalizadas, gestión de funciones activas, integraciones y zona de cuenta. |

---

## 🔗 Trade Republic — Integración en tiempo real

Además de importar CSVs, FinanceMaster puede conectarse directamente a la API de Trade Republic para sincronizar tu portfolio en tiempo real.

1. En **Ajustes → Integraciones**, introduce tu número de teléfono de TR.
2. Introduce el código de verificación SMS.
3. El portfolio se sincronizará automáticamente con precios en vivo, dividendos y operaciones.

La conexión se mantiene entre sesiones y se reconecta automáticamente al iniciar la app.

---

## 📥 Importar datos de Trade Republic (CSV)

1. En la app de Trade Republic ve a **Perfil → Documentos → Exportar historial**.
2. Descarga el CSV de movimientos.
3. En FinanceMaster abre **Transacciones → Importar CSV**.
4. Arrastra el archivo al área de carga.
5. La aplicación detectará y categorizará automáticamente los movimientos.

---

## 📈 Portfolio de inversiones

* Seguimiento de acciones, ETFs y fondos (automático vía TR o manual).
* Evolución histórica de la cartera.
* Beneficio/pérdida total y por posición.
* Dividendos recibidos.
* Operaciones abiertas y cerradas.
* Comparativa frente a índices de referencia.

---

## 🔥 FIRE Calculator

Calcula tu independencia financiera:

* **Capital necesario** — basado en el 4% SWR.
* **Años hasta FIRE** — con tasa de ahorro e interés compuesto.
* **Edad estimada** — cuándo alcanzas la libertad financiera.
* **Progreso actual** — qué porcentaje del objetivo tienes acumulado.
* Gráfica de crecimiento del patrimonio hasta el retiro.

---

## 🏆 Logros

Sistema de gamificación para mantener buenos hábitos financieros:

* Logros por categorías: ahorro, inversión, control de gastos, constancia y más.
* Progreso circular global con desglose por categoría.
* Widget compacto en el Dashboard.
* Últimos logros desbloqueados en tiempo real.

---

## 🎨 Personalización

### Temas incluidos

* Trade Republic (predeterminado)
* Azul oscuro
* Bosque
* Púrpura
* Ámbar
* Claro

### Opciones adicionales

* 8 colores de acento.
* Modo compacto.
* Categorías personalizadas con icono y color.
* **Funciones activables/desactivables** desde Ajustes → Funciones:
  * Calculadora FIRE
  * Logros
  * 7 Baby Steps
  * Deudas
  * Objetivos
  * Recurrentes

---

## 🧙 Asistente de configuración (Onboarding)

Al crear tu cuenta, un asistente guiado te permite:

1. Elegir el tema y color de acento.
2. Activar o desactivar funciones.
3. Añadir categorías personalizadas.
4. Conocer las formas de importar tus datos.

Puedes volver a configurar todo esto en **Ajustes** en cualquier momento.

---

## 🚀 Instalación

### Docker (recomendado)

```yaml
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
      # Opcional — para el asistente IA (Groq o Google Gemini)
      - AI_API_KEY=tu-api-key
      - AI_PROVIDER=groq   # groq | gemini
```

```bash
docker compose up -d
```

Abre **http://localhost:8000** en tu navegador, crea tu cuenta y sigue el asistente de configuración.

---

### Desarrollo local

**Requisitos**

* Python 3.11+
* Node.js 18+

```bash
git clone https://github.com/Ronambulo/FinanceMaster.git
cd FinanceMaster
```

#### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

| Servicio | URL |
|---|---|
| API + Frontend (producción) | http://localhost:8000 |
| Frontend (desarrollo) | http://localhost:5173 |

---

## 🛠️ Stack tecnológico

### Backend

* FastAPI
* SQLAlchemy + SQLite
* yfinance (datos de mercado)
* Trade Republic API (streaming en tiempo real)
* JWT Authentication
* Groq / Google Gemini (asistente IA, formato OpenAI compatible)

### Frontend

* React 18 + TypeScript
* Vite
* Tailwind CSS + Radix UI
* Recharts (gráficas)
* TanStack Query (caché y sincronización)
* Zustand (estado global)

### Despliegue

* Docker multi-arquitectura (amd64 / arm64)
* Compatible con CasaOS y ZimaOS
* CI/CD con GitHub Actions

---

## 🔒 Privacidad

Tus datos son tuyos.

* Sin suscripciones.
* Sin servicios externos obligatorios.
* Sin compartir información financiera con terceros.
* Base de datos SQLite local.
* Despliegue completamente autoalojado.

---

## 🤝 Contribuir

Las contribuciones son bienvenidas.

1. Abre un Issue para reportar errores o sugerir mejoras.
2. Haz un Fork del proyecto.
3. Crea una rama para tu funcionalidad.
4. Envía un Pull Request.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT.
