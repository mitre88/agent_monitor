#!/usr/bin/env node

const [name, task, status = 'working', project = '', engine = 'custom', relationsCsv = ''] = process.argv.slice(2);

if (!name || !task) {
  // eslint-disable-next-line no-console
  console.error(
    'Uso: node scripts/emit-agent-event.mjs "Nombre Agente" "Tarea" [status] [project] [engine] [id1,id2]'
  );
  process.exit(1);
}

const apiUrl = process.env.AGENT_MONITOR_URL ?? 'http://localhost:4321';
const relations = relationsCsv
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const payload = {
  name,
  task,
  status,
  project,
  engine,
  relations,
  progress: Math.floor(Math.random() * 100)
};

const response = await fetch(`${apiUrl}/api/agent/event`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

if (!response.ok) {
  // eslint-disable-next-line no-console
  console.error(`Error HTTP ${response.status}:`, await response.text());
  process.exit(1);
}

const data = await response.json();
// eslint-disable-next-line no-console
console.log(JSON.stringify(data, null, 2));
