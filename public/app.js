import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/controls/OrbitControls.js';

const STATUS_LABELS = {
  working: 'Trabajando',
  idle: 'En espera',
  blocked: 'Bloqueado',
  offline: 'Offline'
};

const STATUS_CLASS = {
  working: 'working',
  idle: 'idle',
  blocked: 'blocked',
  offline: 'offline'
};

const STATUS_COLORS = {
  working: '#17B890',
  idle: '#2F80ED',
  blocked: '#F2994A',
  offline: '#9AAFC2'
};

const ENGINE_COLORS = {
  claude: '#FF8C42',
  codex: '#17B890',
  kimi: '#2F80ED',
  cursor: '#F0B429',
  custom: '#5E8EA3'
};

const EVENT_TYPE_LABELS = {
  join: 'Entrada',
  leave: 'Salida',
  activity: 'Actividad',
  warning: 'Alerta',
  info: 'Info'
};

const EVENT_TYPE_CLASS = {
  join: 'type-join',
  leave: 'type-leave',
  activity: 'type-activity',
  warning: 'type-warning',
  info: 'type-info'
};

const MAX_EVENTS = 120;

const appState = {
  agentsById: {},
  events: [],
  selectedAgentId: null,
  connected: false
};

const elements = {
  canvas: document.getElementById('office-canvas'),
  connectionPill: document.getElementById('connection-pill'),
  connectionText: document.getElementById('connection-text'),
  metricOnline: document.getElementById('metric-online'),
  metricWorking: document.getElementById('metric-working'),
  metricCollab: document.getElementById('metric-collab'),
  metricTotal: document.getElementById('metric-total'),
  agentsCount: document.getElementById('agents-count'),
  agentList: document.getElementById('agent-list'),
  eventList: document.getElementById('event-list'),
  selectedId: document.getElementById('selected-id'),
  selectedContent: document.getElementById('selected-content')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'sin registro';
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (deltaSeconds < 60) {
    return `hace ${deltaSeconds}s`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `hace ${deltaMinutes}m`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  return `hace ${deltaHours}h`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeProgress(progress) {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return clamp(Math.round(progress), 0, 100);
}

function getAgentsSorted() {
  return Object.values(appState.agentsById).sort(
    (left, right) => new Date(right.lastUpdate).getTime() - new Date(left.lastUpdate).getTime()
  );
}

function ensureSelectedAgent() {
  const agents = getAgentsSorted();
  if (agents.length === 0) {
    appState.selectedAgentId = null;
    return;
  }

  if (!appState.selectedAgentId || !appState.agentsById[appState.selectedAgentId]) {
    appState.selectedAgentId = agents[0].id;
  }
}

function setConnection(connected) {
  appState.connected = connected;
  elements.connectionPill.classList.toggle('online', connected);
  elements.connectionPill.classList.toggle('offline', !connected);
  elements.connectionText.textContent = connected ? 'Conectado en vivo' : 'Reconectando...';
}

function renderMetrics() {
  const agents = getAgentsSorted();
  const total = agents.length;
  const online = agents.filter((agent) => agent.status !== 'offline').length;
  const working = agents.filter((agent) => agent.status === 'working').length;
  const collaborating = agents.filter((agent) => Array.isArray(agent.relations) && agent.relations.length > 0).length;

  elements.metricOnline.textContent = String(online);
  elements.metricWorking.textContent = String(working);
  elements.metricCollab.textContent = String(collaborating);
  elements.metricTotal.textContent = String(total);
  elements.agentsCount.textContent = `${total} detectados`;
}

function renderAgentList() {
  const agents = getAgentsSorted();
  elements.agentList.innerHTML = '';

  if (agents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      'No hay agentes visibles todavia. Arranca un agente CLI (codex/claude/kimi) para verlo aparecer automaticamente.';
    elements.agentList.appendChild(empty);
    return;
  }

  for (const agent of agents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `agent-card ${appState.selectedAgentId === agent.id ? 'selected' : ''}`;
    button.addEventListener('click', () => {
      appState.selectedAgentId = agent.id;
      renderAll();
      sceneController.setSelectedAgent(agent.id);
    });

    const statusClass = STATUS_CLASS[agent.status] ?? 'idle';
    const statusLabel = STATUS_LABELS[agent.status] ?? agent.status;
    const progress = normalizeProgress(agent.progress);

    button.innerHTML = `
      <div class="agent-row">
        <strong>${escapeHtml(agent.name)}</strong>
        <span class="badge ${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span>
      </div>
      <p class="agent-task">${escapeHtml(agent.currentTask || '')}</p>
      <div class="agent-row muted">
        <span>${escapeHtml(agent.engine)}</span>
        <span>${escapeHtml(formatRelativeTime(agent.lastUpdate))}</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <span style="width:${progress}%"></span>
      </div>
    `;

    elements.agentList.appendChild(button);
  }
}

function renderEvents() {
  elements.eventList.innerHTML = '';

  if (appState.events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'La linea de tiempo aparecera cuando lleguen eventos.';
    elements.eventList.appendChild(empty);
    return;
  }

  for (const event of appState.events.slice(0, 80)) {
    const entry = document.createElement('article');
    entry.className = 'event-item';
    const eventTypeClass = EVENT_TYPE_CLASS[event.type] ?? 'type-info';
    const eventTypeLabel = EVENT_TYPE_LABELS[event.type] ?? 'Evento';

    entry.innerHTML = `
      <div class="event-row">
        <span class="event-tag ${escapeHtml(eventTypeClass)}">${escapeHtml(eventTypeLabel)}</span>
        <time>${escapeHtml(formatRelativeTime(event.timestamp))}</time>
      </div>
      <p>${escapeHtml(event.message || '')}</p>
    `;

    elements.eventList.appendChild(entry);
  }
}

function renderSelectedAgent() {
  const selectedAgent = appState.selectedAgentId ? appState.agentsById[appState.selectedAgentId] : null;

  if (!selectedAgent) {
    elements.selectedId.textContent = 'sin seleccion';
    elements.selectedContent.innerHTML = '<div class="empty-state">Selecciona un agente para ver su detalle.</div>';
    return;
  }

  elements.selectedId.textContent = selectedAgent.id;

  const relationText =
    Array.isArray(selectedAgent.relations) && selectedAgent.relations.length > 0
      ? `${selectedAgent.relations.length} agente(s)`
      : 'Sin relaciones activas';

  elements.selectedContent.innerHTML = `
    <div class="selected-grid">
      <article>
        <label>Agente</label>
        <strong>${escapeHtml(selectedAgent.name)}</strong>
      </article>
      <article>
        <label>Estado</label>
        <strong>${escapeHtml(STATUS_LABELS[selectedAgent.status] ?? selectedAgent.status)}</strong>
      </article>
      <article>
        <label>Motor</label>
        <strong>${escapeHtml(selectedAgent.engine)}</strong>
      </article>
      <article>
        <label>Proyecto</label>
        <strong>${escapeHtml(selectedAgent.project || 'No detectado')}</strong>
      </article>
      <article>
        <label>Colabora con</label>
        <strong>${escapeHtml(relationText)}</strong>
      </article>
      <article>
        <label>Ultima actualizacion</label>
        <strong>${escapeHtml(formatRelativeTime(selectedAgent.lastUpdate))}</strong>
      </article>
    </div>
    <p class="selected-task">${escapeHtml(selectedAgent.currentTask || '')}</p>
  `;
}

function renderAll() {
  renderMetrics();
  renderAgentList();
  renderEvents();
  renderSelectedAgent();
}

function computeLayout(agents) {
  const perRow = 4;
  const xSpacing = 4.25;
  const zSpacing = 4.9;

  const rows = Math.max(1, Math.ceil(agents.length / perRow));
  const columns = Math.min(perRow, Math.max(1, agents.length));

  const xOffset = ((columns - 1) * xSpacing) / 2;
  const zOffset = ((rows - 1) * zSpacing) / 2;

  const positionsById = {};

  for (let index = 0; index < agents.length; index += 1) {
    const row = Math.floor(index / perRow);
    const column = index % perRow;

    positionsById[agents[index].id] = [
      column * xSpacing - xOffset,
      0,
      row * zSpacing - zOffset
    ];
  }

  return { positionsById };
}

function colorForStatus(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.idle;
}

function colorForEngine(engine) {
  return ENGINE_COLORS[engine] ?? ENGINE_COLORS.custom;
}

function hashSeed(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function attachAgentId(group, agentId) {
  group.traverse((node) => {
    node.userData.agentId = agentId;
  });
}

function createSceneController() {
  const renderer = new THREE.WebGLRenderer({
    canvas: elements.canvas,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#DCE8F6');
  scene.fog = new THREE.Fog('#DCE8F6', 17, 44);

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 10.5, 19);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minPolarAngle = 0.62;
  controls.maxPolarAngle = 1.33;
  controls.minDistance = 9;
  controls.maxDistance = 31;
  controls.target.set(0, 1.1, 0);

  const hemiLight = new THREE.HemisphereLight('#FFF3DA', '#86A1BC', 0.58);
  scene.add(hemiLight);
  scene.add(new THREE.AmbientLight('#ffffff', 0.55));

  const directional = new THREE.DirectionalLight('#ffffff', 1.28);
  directional.position.set(7, 13, 6);
  directional.castShadow = true;
  directional.shadow.mapSize.set(2048, 2048);
  directional.shadow.camera.left = -16;
  directional.shadow.camera.right = 16;
  directional.shadow.camera.top = 16;
  directional.shadow.camera.bottom = -16;
  directional.shadow.camera.far = 40;
  scene.add(directional);

  const spotA = new THREE.SpotLight('#C7E7FF', 46, 39, 0.39, 0.55, 2);
  spotA.position.set(-8, 10, 6);
  scene.add(spotA);

  const spotB = new THREE.SpotLight('#FFE5C7', 34, 39, 0.4, 0.55, 2);
  spotB.position.set(8, 10, -4);
  scene.add(spotB);

  const room = new THREE.Group();
  scene.add(room);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 24),
    new THREE.MeshStandardMaterial({ color: '#E7EEF6', roughness: 0.86, metalness: 0.08 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(26, 6.8, 0.26),
    new THREE.MeshStandardMaterial({ color: '#D4DFEC', roughness: 0.72, metalness: 0.1 })
  );
  backWall.position.set(0, 3.4, -12);
  backWall.receiveShadow = true;
  room.add(backWall);

  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 6.8, 24),
    new THREE.MeshStandardMaterial({ color: '#DCE7F4', roughness: 0.72, metalness: 0.08 })
  );
  leftWall.position.set(-13, 3.4, 0);
  leftWall.receiveShadow = true;
  room.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.set(13, 3.4, 0);
  room.add(rightWall);

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.24, 24),
    new THREE.MeshStandardMaterial({ color: '#C8D8E9', roughness: 0.65, metalness: 0.1 })
  );
  ceiling.position.set(0, 6.8, 0);
  ceiling.receiveShadow = true;
  room.add(ceiling);

  const centerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.8, 0.25, 36),
    new THREE.MeshStandardMaterial({ color: '#97AEC2', roughness: 0.4, metalness: 0.48 })
  );
  centerBase.position.set(0, 0.14, 0);
  centerBase.receiveShadow = true;
  room.add(centerBase);

  const centerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.05, 12, 70),
    new THREE.MeshStandardMaterial({ color: '#58A9D5', emissive: '#58A9D5', emissiveIntensity: 0.8 })
  );
  centerRing.position.set(0, 0.32, 0);
  centerRing.rotation.x = Math.PI / 2;
  room.add(centerRing);

  const relationGroup = new THREE.Group();
  scene.add(relationGroup);

  const desksById = new Map();
  let selectedAgentId = null;

  function createDesk(agent) {
    const desk = new THREE.Group();

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.24, 1.7),
      new THREE.MeshStandardMaterial({ color: '#7A8998', roughness: 0.52, metalness: 0.2 })
    );
    deskTop.position.set(0, 0.85, 0);
    deskTop.castShadow = true;
    desk.add(deskTop);

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.08, 0.42),
      new THREE.MeshStandardMaterial({ color: '#A9BBD0', roughness: 0.32, metalness: 0.6 })
    );
    keyboard.position.set(0, 1.17, -0.33);
    keyboard.castShadow = true;
    desk.add(keyboard);

    const monitorMaterial = new THREE.MeshStandardMaterial({
      color: colorForEngine(agent.engine),
      emissive: colorForEngine(agent.engine),
      emissiveIntensity: 0.33,
      roughness: 0.23,
      metalness: 0.44
    });

    const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.72, 0.08), monitorMaterial);
    monitor.position.set(0, 1.44, -0.43);
    monitor.castShadow = true;
    desk.add(monitor);

    const chair = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.53, 0.66, 24),
      new THREE.MeshStandardMaterial({ color: '#6B7787', roughness: 0.65, metalness: 0.18 })
    );
    chair.position.set(-0.03, 0.37, 0.51);
    chair.castShadow = true;
    desk.add(chair);

    const orbMaterial = new THREE.MeshStandardMaterial({
      color: colorForStatus(agent.status),
      emissive: colorForStatus(agent.status),
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.18
    });

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 32), orbMaterial);
    orb.position.set(0.89, 1.82, 0.4);
    orb.castShadow = true;
    desk.add(orb);

    const holo = new THREE.Group();
    holo.position.set(-0.89, 1.33, 0.2);
    desk.add(holo);

    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.025, 8, 36),
      new THREE.MeshStandardMaterial({ color: '#4FA6CF', emissive: '#4FA6CF', emissiveIntensity: 0.72 })
    );
    holo.add(ringA);

    const ringB = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.025, 8, 36),
      new THREE.MeshStandardMaterial({ color: '#83D7FF', emissive: '#83D7FF', emissiveIntensity: 0.42 })
    );
    ringB.rotation.x = Math.PI / 2;
    holo.add(ringB);

    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: colorForEngine(agent.engine),
      transparent: true,
      opacity: 0.82
    });

    const pulse = new THREE.Mesh(new THREE.RingGeometry(1.47, 1.62, 64), pulseMaterial);
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.set(0, 0.96, 0);
    pulse.visible = false;
    desk.add(pulse);

    desk.userData.seed = hashSeed(agent.id);
    attachAgentId(desk, agent.id);

    scene.add(desk);

    return {
      group: desk,
      orb,
      orbMaterial,
      holo,
      monitorMaterial,
      pulse,
      pulseMaterial
    };
  }

  function clearRelationLines() {
    while (relationGroup.children.length > 0) {
      const child = relationGroup.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  function rebuildRelations(agents, positionsById) {
    clearRelationLines();

    const visited = new Set();
    for (const agent of agents) {
      if (!Array.isArray(agent.relations)) {
        continue;
      }

      const sourcePosition = positionsById[agent.id];
      if (!sourcePosition) {
        continue;
      }

      for (const targetId of agent.relations) {
        const targetPosition = positionsById[targetId];
        if (!targetPosition) {
          continue;
        }

        const key = [agent.id, targetId].sort().join('::');
        if (visited.has(key)) {
          continue;
        }

        visited.add(key);

        const points = [
          new THREE.Vector3(sourcePosition[0], 1.82, sourcePosition[2]),
          new THREE.Vector3(targetPosition[0], 1.82, targetPosition[2])
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: '#5BB5E1',
          transparent: true,
          opacity: 0.6
        });

        const line = new THREE.Line(geometry, material);
        relationGroup.add(line);
      }
    }
  }

  function syncAgents(agents) {
    const ids = new Set(agents.map((agent) => agent.id));

    for (const [agentId, desk] of desksById) {
      if (!ids.has(agentId)) {
        scene.remove(desk.group);
        desksById.delete(agentId);
      }
    }

    const layout = computeLayout(agents);

    for (const agent of agents) {
      let desk = desksById.get(agent.id);
      if (!desk) {
        desk = createDesk(agent);
        desksById.set(agent.id, desk);
      }

      const position = layout.positionsById[agent.id] ?? [0, 0, 0];
      desk.group.position.set(position[0], position[1], position[2]);

      const statusColor = new THREE.Color(colorForStatus(agent.status));
      const engineColor = new THREE.Color(colorForEngine(agent.engine));

      desk.orbMaterial.color.copy(statusColor);
      desk.orbMaterial.emissive.copy(statusColor);
      desk.monitorMaterial.color.copy(engineColor);
      desk.monitorMaterial.emissive.copy(engineColor);
      desk.pulseMaterial.color.copy(engineColor);

      desk.pulse.visible = selectedAgentId === agent.id;
      attachAgentId(desk.group, agent.id);
    }

    rebuildRelations(agents, layout.positionsById);
  }

  function setSelectedAgent(agentId) {
    selectedAgentId = agentId;
    for (const [id, desk] of desksById) {
      desk.pulse.visible = id === selectedAgentId;
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onCanvasPointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersections) {
      let node = hit.object;
      while (node) {
        if (node.userData?.agentId) {
          appState.selectedAgentId = node.userData.agentId;
          renderAll();
          setSelectedAgent(node.userData.agentId);
          return;
        }
        node = node.parent;
      }
    }
  }

  renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', handleResize);

  const clock = new THREE.Clock();

  function animate() {
    const elapsed = clock.getElapsedTime();

    for (const desk of desksById.values()) {
      const seed = desk.group.userData.seed ?? 0;
      desk.orb.position.y = 1.82 + Math.sin(elapsed * 1.7 + seed) * 0.08;
      desk.holo.rotation.y = elapsed * 0.45 + seed;

      if (desk.pulse.visible) {
        const scale = 1 + Math.sin(elapsed * 3.5 + seed) * 0.06;
        desk.pulse.scale.set(scale, scale, scale);
      } else {
        desk.pulse.scale.set(1, 1, 1);
      }
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();

  return {
    syncAgents,
    setSelectedAgent
  };
}

const sceneController = createSceneController();

async function loadInitialState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) {
      return;
    }

    const state = await response.json();
    appState.agentsById = Object.fromEntries((state.agents || []).map((agent) => [agent.id, agent]));
    appState.events = Array.isArray(state.events) ? state.events.slice(0, MAX_EVENTS) : [];

    ensureSelectedAgent();
    renderAll();
    sceneController.syncAgents(getAgentsSorted());
    sceneController.setSelectedAgent(appState.selectedAgentId);
  } catch {
    // Ignorar error inicial; SSE intentara reconectar.
  }
}

function connectSSE() {
  const stream = new EventSource('/events');

  stream.addEventListener('open', () => {
    setConnection(true);
  });

  stream.addEventListener('error', () => {
    setConnection(false);
  });

  stream.addEventListener('message', (event) => {
    try {
      const packet = JSON.parse(event.data);
      const { type, payload } = packet;

      if (type === 'initial') {
        appState.agentsById = Object.fromEntries((payload.agents || []).map((agent) => [agent.id, agent]));
        appState.events = Array.isArray(payload.events) ? payload.events.slice(0, MAX_EVENTS) : [];
      } else if (type === 'agent_upsert' && payload?.id) {
        appState.agentsById[payload.id] = payload;
      } else if (type === 'agent_remove' && payload?.id) {
        delete appState.agentsById[payload.id];
      } else if (type === 'event' && payload?.id) {
        appState.events = [payload, ...appState.events].slice(0, MAX_EVENTS);
      }

      ensureSelectedAgent();
      renderAll();
      sceneController.syncAgents(getAgentsSorted());
      sceneController.setSelectedAgent(appState.selectedAgentId);
    } catch {
      // Ignorar paquetes corruptos.
    }
  });
}

loadInitialState();
connectSSE();
setInterval(renderAll, 1000);
