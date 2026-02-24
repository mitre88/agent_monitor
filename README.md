# Agent Monitor 3D (Local)

Oficina virtual 3D en tiempo real para visualizar agentes de codigo (Codex, Claude Code, Kimi Code, etc.) desde el navegador local.

## Ventaja clave

No requiere `npm install`. Corre con Node.js nativo y frontend `three.js` cargado desde CDN.

## Requisitos

- Node.js 18+

## Ejecutar local

```bash
cd /Users/dr.alexmitre/Desktop/agent_monitor
node server/index.js
```

Abre: `http://localhost:4321`

## Que incluye

- Oficina 3D renderizada en `three.js`.
- Deteccion automatica de procesos CLI activos (`claude`, `codex`, `kimi`, `cursor`) cada ~2.5s.
- Actualizacion en vivo por SSE (`/events`) para estado, tareas y relaciones entre agentes.
- Paneles UI pulidos con:
  - Lista de agentes
  - Timeline de eventos
  - Detalle del agente seleccionado
- Endpoint para reportar eventos manuales de agentes externos.

## Como aparecen agentes automaticamente

El backend escanea procesos del sistema y detecta comandos que contengan:

- `claude`
- `codex`
- `kimi`
- `cursor`

Al arrancar cualquiera de esos CLIs, aparece un escritorio en la oficina 3D con estado activo.

## Publicar eventos manuales de un agente

```bash
node scripts/emit-agent-event.mjs "Codex Planner" "Dividiendo tareas del sprint" working agent_monitor codex
```

Formato completo:

```bash
node scripts/emit-agent-event.mjs "Nombre" "Tarea" [status] [project] [engine] [id1,id2]
```

Variable opcional:

- `AGENT_MONITOR_URL` (default `http://localhost:4321`)

## API

### `GET /health`

Estado de servidor.

### `GET /api/state`

Snapshot actual de agentes y eventos.

### `GET /events`

Stream SSE de eventos en tiempo real.

### `POST /api/agent/event`

Body ejemplo:

```json
{
  "name": "Kimi Code",
  "task": "Analizando logs",
  "status": "working",
  "project": "agent_monitor",
  "engine": "kimi",
  "relations": ["codex-123"]
}
```

