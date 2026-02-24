import http from 'node:http';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const PORT = Number(process.env.PORT ?? 4321);
const SCAN_INTERVAL_MS = 2500;
const ACTIVITY_INTERVAL_MS = 2200;
const OFFLINE_RETENTION_MS = 45000;
const MAX_EVENTS = 250;

const AGENT_SIGNATURES = [
  {
    engine: 'claude',
    displayName: 'Claude Code',
    pattern: /(^|\s)(claude|claude-code)(\s|$)/i,
    color: '#FF8C42'
  },
  {
    engine: 'codex',
    displayName: 'Codex',
    pattern: /(^|\s)codex(\s|$)/i,
    color: '#17B890'
  },
  {
    engine: 'kimi',
    displayName: 'Kimi Code',
    pattern: /(^|\s)kimi(\s|$)/i,
    color: '#2F80ED'
  },
  {
    engine: 'cursor',
    displayName: 'Cursor Agent',
    pattern: /(^|\s)cursor(\s|$)/i,
    color: '#F0B429'
  }
];

const TASK_LIBRARY = {
  claude: [
    'Refinando prompts y estructura de salida',
    'Analizando flujo de herramientas del proyecto',
    'Revisando riesgos de regresion en cambios',
    'Generando propuesta de implementacion'
  ],
  codex: [
    'Inspeccionando codigo fuente y dependencias',
    'Escribiendo parche de una funcionalidad',
    'Ejecutando pruebas locales del modulo',
    'Ajustando tipado y validaciones'
  ],
  kimi: [
    'Sintetizando contexto de multiples archivos',
    'Evaluando alternativas de arquitectura',
    'Resumiendo eventos y decisiones tecnicas',
    'Correlacionando logs de ejecucion'
  ],
  cursor: [
    'Editando componente UI del dashboard',
    'Sincronizando cambios del workspace',
    'Aplicando refactor de rendimiento',
    'Preparando branch para review'
  ],
  default: [
    'Analizando requerimientos del usuario',
    'Preparando siguiente iteracion',
    'Actualizando estado de la tarea',
    'Esperando nueva instruccion'
  ]
};

const signatureByEngine = new Map(AGENT_SIGNATURES.map((signature) => [signature.engine, signature]));

const agents = new Map();
const agentHashes = new Map();
const events = [];
const sseClients = new Set();

function isoNow() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sample(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return '';
  }

  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const cloned = [...list];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[randomIndex]] = [cloned[randomIndex], cloned[index]];
  }

  return cloned;
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'agent';
}

function getEngineColor(engine) {
  return signatureByEngine.get(engine)?.color ?? '#5E8EA3';
}

function normalizeRelations(relations, selfId) {
  if (!Array.isArray(relations)) {
    return [];
  }

  return [...new Set(relations.filter((relation) => relation && relation !== selfId))];
}

function createAgentHash(agent) {
  return [
    agent.name,
    agent.engine,
    agent.status,
    agent.currentTask,
    agent.project,
    String(agent.progress),
    agent.relations.join('|'),
    String(agent.pid ?? ''),
    String(Boolean(agent.autoDetected))
  ].join('::');
}

function broadcast(type, payload) {
  const packet = `data: ${JSON.stringify({ type, payload })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(packet);
    } catch {
      sseClients.delete(client);
    }
  }
}

function pushEvent({ type = 'info', message, agentId = null, meta = {} }) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    agentId,
    meta,
    timestamp: isoNow()
  };

  events.unshift(record);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }

  broadcast('event', record);
}

function sortedAgents() {
  return [...agents.values()].sort(
    (left, right) => new Date(right.lastUpdate).getTime() - new Date(left.lastUpdate).getTime()
  );
}

function upsertAgent(partialAgent, options = {}) {
  const { forceBroadcast = false, eventMessage = '', eventType = 'activity', meta = {} } = options;
  const now = isoNow();
  const existing = partialAgent.id ? agents.get(partialAgent.id) : null;

  const nextAgent = {
    ...existing,
    ...partialAgent,
    id: partialAgent.id ?? existing?.id,
    name: partialAgent.name ?? existing?.name ?? 'Agente',
    engine: partialAgent.engine ?? existing?.engine ?? 'custom',
    color:
      partialAgent.color ??
      existing?.color ??
      getEngineColor(partialAgent.engine ?? existing?.engine ?? 'custom'),
    status: partialAgent.status ?? existing?.status ?? 'idle',
    currentTask: partialAgent.currentTask ?? existing?.currentTask ?? 'Sin actividad reportada',
    project: partialAgent.project ?? existing?.project ?? '',
    progress: clamp(Number(partialAgent.progress ?? existing?.progress ?? 0), 0, 100),
    relations: normalizeRelations(
      partialAgent.relations ?? existing?.relations ?? [],
      partialAgent.id ?? existing?.id
    ),
    autoDetected: Boolean(partialAgent.autoDetected ?? existing?.autoDetected),
    source: partialAgent.source ?? existing?.source ?? 'api',
    pid: partialAgent.pid ?? existing?.pid ?? null,
    createdAt: existing?.createdAt ?? now,
    lastSeen: partialAgent.lastSeen ?? existing?.lastSeen ?? now,
    lastUpdate: now,
    offlineSince:
      partialAgent.offlineSince ??
      (partialAgent.status === 'offline' ? now : existing?.offlineSince ?? null)
  };

  if (!nextAgent.id) {
    return null;
  }

  if (nextAgent.status !== 'offline') {
    nextAgent.offlineSince = null;
  }

  agents.set(nextAgent.id, nextAgent);

  const nextHash = createAgentHash(nextAgent);
  const previousHash = agentHashes.get(nextAgent.id);
  if (forceBroadcast || previousHash !== nextHash) {
    agentHashes.set(nextAgent.id, nextHash);
    broadcast('agent_upsert', nextAgent);
  }

  if (eventMessage) {
    pushEvent({
      type: eventType,
      message: eventMessage,
      agentId: nextAgent.id,
      meta
    });
  }

  return nextAgent;
}

function removeAgent(agentId, message = '') {
  const existing = agents.get(agentId);
  if (!existing) {
    return;
  }

  agents.delete(agentId);
  agentHashes.delete(agentId);
  broadcast('agent_remove', { id: agentId });

  if (message) {
    pushEvent({
      type: 'leave',
      message,
      agentId
    });
  }
}

function parseProcessLine(line) {
  const match = line.trim().match(/^(\d+)\s+(\S+)\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    pid: Number(match[1]),
    command: match[2] ?? '',
    args: match[3] ?? ''
  };
}

function extractProject(args) {
  if (!args) {
    return '';
  }

  const cwdFlagMatch = args.match(/--cwd(?:=|\s+)([^\s]+)/);
  if (cwdFlagMatch?.[1]) {
    return path.basename(cwdFlagMatch[1]);
  }

  const allPaths = args.match(/\/(Users|home|workspace)[^\s]+/g);
  if (allPaths && allPaths.length > 0) {
    return path.basename(allPaths[allPaths.length - 1]);
  }

  return '';
}

function detectSignature(command, args) {
  const haystack = `${command} ${args}`;
  return AGENT_SIGNATURES.find((signature) => signature.pattern.test(haystack));
}

function pickRelations(agentId) {
  const candidates = [...agents.values()].filter(
    (candidate) => candidate.id !== agentId && candidate.status !== 'offline'
  );

  if (candidates.length === 0) {
    return [];
  }

  const maxRelations = Math.min(2, candidates.length);
  const selectedCount = Math.floor(Math.random() * (maxRelations + 1));
  return shuffle(candidates)
    .slice(0, selectedCount)
    .map((candidate) => candidate.id);
}

function scanProcesses() {
  exec('ps -axo pid=,comm=,args=', { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
    if (error) {
      pushEvent({
        type: 'warning',
        message: `No se pudo leer procesos del sistema: ${error.message}`,
        meta: { source: 'process-scan' }
      });
      return;
    }

    const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const detectedIds = new Set();

    for (const line of lines) {
      const processInfo = parseProcessLine(line);
      if (!processInfo) {
        continue;
      }

      const signature = detectSignature(processInfo.command, processInfo.args);
      if (!signature) {
        continue;
      }

      const agentId = `${signature.engine}-${processInfo.pid}`;
      const existing = agents.get(agentId);
      const project = extractProject(processInfo.args);

      detectedIds.add(agentId);

      upsertAgent(
        {
          id: agentId,
          name: `${signature.displayName} #${processInfo.pid}`,
          engine: signature.engine,
          color: signature.color,
          pid: processInfo.pid,
          autoDetected: true,
          source: 'process-scan',
          status: 'working',
          currentTask:
            existing?.currentTask ?? sample(TASK_LIBRARY[signature.engine] ?? TASK_LIBRARY.default),
          project: project || existing?.project || '',
          progress:
            existing?.status === 'offline'
              ? 5
              : Number.isFinite(existing?.progress)
                ? existing.progress
                : Math.floor(Math.random() * 35) + 10,
          relations: existing?.relations ?? [],
          lastSeen: isoNow()
        },
        {
          eventMessage: existing
            ? ''
            : `${signature.displayName} #${processInfo.pid} entro a la oficina virtual.`,
          eventType: 'join',
          meta: { source: 'process-scan' }
        }
      );
    }

    for (const [agentId, agent] of agents) {
      if (!agent.autoDetected) {
        continue;
      }

      if (detectedIds.has(agentId)) {
        continue;
      }

      if (agent.status !== 'offline') {
        upsertAgent(
          {
            ...agent,
            status: 'offline',
            currentTask: 'Proceso finalizado',
            relations: [],
            lastSeen: isoNow(),
            offlineSince: isoNow()
          },
          {
            eventMessage: `${agent.name} se desconecto.`,
            eventType: 'leave',
            meta: { source: 'process-scan' }
          }
        );
        continue;
      }

      if (!agent.offlineSince) {
        continue;
      }

      const staleMs = Date.now() - new Date(agent.offlineSince).getTime();
      if (staleMs > OFFLINE_RETENTION_MS) {
        removeAgent(agentId, `${agent.name} salio de la escena.`);
      }
    }
  });
}

function simulateActivityPulse() {
  const activeAgents = [...agents.values()].filter((agent) => agent.status !== 'offline');
  if (activeAgents.length === 0) {
    return;
  }

  const target = sample(activeAgents);
  if (!target) {
    return;
  }

  const taskBank = TASK_LIBRARY[target.engine] ?? TASK_LIBRARY.default;
  const nextTask = Math.random() > 0.35 ? sample(taskBank) : target.currentTask;
  const nextProgress =
    target.progress >= 95
      ? 8
      : clamp(target.progress + Math.floor(Math.random() * 16) + 4, 0, 100);
  const nextRelations = pickRelations(target.id);

  upsertAgent(
    {
      id: target.id,
      currentTask: nextTask,
      status: target.status === 'idle' ? 'working' : target.status,
      progress: nextProgress,
      relations: nextRelations,
      lastSeen: isoNow()
    },
    {
      eventMessage: Math.random() > 0.55 ? `${target.name}: ${nextTask}` : '',
      eventType: 'activity',
      meta: { source: 'activity-pulse' }
    }
  );
}

function sendJson(response, statusCode, data) {
  const body = JSON.stringify(data);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 512 * 1024) {
        reject(new Error('Payload demasiado grande'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalido'));
      }
    });
    request.on('error', reject);
  });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function serveStatic(requestPath, response) {
  const normalized = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, normalized));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      response.writeHead(500);
      response.end('Error interno');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Cache-Control': 'no-store'
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      uptime: process.uptime(),
      agents: agents.size,
      timestamp: isoNow()
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/state') {
    sendJson(response, 200, {
      agents: sortedAgents(),
      events
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    response.write(`data: ${JSON.stringify({
      type: 'initial',
      payload: { agents: sortedAgents(), events }
    })}\n\n`);

    sseClients.add(response);
    request.on('close', () => {
      sseClients.delete(response);
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/agent/event') {
    try {
      const payload = await readJsonBody(request);
      const {
        id,
        name,
        engine,
        status,
        task,
        currentTask,
        project,
        progress,
        relations,
        color,
        pid,
        meta
      } = payload ?? {};

      if (!id && !name) {
        sendJson(response, 400, {
          ok: false,
          error: 'Debes enviar al menos id o name.'
        });
        return;
      }

      const safeName = String(name ?? id ?? 'Agent').trim();
      const safeEngine = String(engine ?? 'custom').trim().toLowerCase();
      const safeId = String(id ?? `${slugify(safeName)}-${Date.now().toString(36).slice(-6)}`);
      const safeStatus = String(status ?? 'working').toLowerCase();

      const nextAgent = upsertAgent(
        {
          id: safeId,
          name: safeName,
          engine: safeEngine,
          status: safeStatus,
          currentTask: String(currentTask ?? task ?? 'Evento externo recibido'),
          project: String(project ?? ''),
          progress: Number(progress ?? 0),
          relations: Array.isArray(relations) ? relations : [],
          color: color ? String(color) : undefined,
          pid: Number.isFinite(Number(pid)) ? Number(pid) : null,
          autoDetected: false,
          source: 'api',
          lastSeen: isoNow(),
          offlineSince: safeStatus === 'offline' ? isoNow() : null
        },
        {
          eventMessage: `${safeName}: ${String(currentTask ?? task ?? 'actualizo su estado')}`,
          eventType: 'activity',
          meta: { source: 'api', ...(meta || {}) }
        }
      );

      sendJson(response, 200, {
        ok: true,
        agent: nextAgent
      });
      return;
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error.message
      });
      return;
    }
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return;
  }

  serveStatic(url.pathname, response);
});

server.listen(PORT, () => {
  console.log(`Agent Monitor listo en http://localhost:${PORT}`);

  scanProcesses();
  setInterval(scanProcesses, SCAN_INTERVAL_MS);
  setInterval(simulateActivityPulse, ACTIVITY_INTERVAL_MS);
});
