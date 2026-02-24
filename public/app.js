import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/controls/OrbitControls.js';

// ============================================
// CONFIGURACIÓN Y ESTADO
// ============================================
const CONFIG = {
  pixelScale: 4,
  officeSize: { width: 40, depth: 30 },
  deskSpacing: 8,
  colors: {
    floor: 0x8B7355,
    floorDark: 0x6B5344,
    wall: 0xE8DCC8,
    desk: 0x5C4033,
    deskTop: 0x8B6914,
    chair: 0x4A4A4A,
    window: 0x87CEEB,
    plant: 0x228B22,
    plantPot: 0xD2691E,
    computer: 0x2F4F4F,
    monitor: 0x1a1a1a,
    lamp: 0xFFD700
  }
};

const AGENT_STYLES = {
  claude: {
    name: 'Claude',
    color: 0xFF8C42,
    accent: 0xCC5500,
    hatColor: 0xFF6B35,
    bodyType: 'scholar',
    glow: 0xFFAA44
  },
  codex: {
    name: 'Codex', 
    color: 0x17B890,
    accent: 0x0D8B6F,
    hatColor: 0x00A86B,
    bodyType: 'hacker',
    glow: 0x44D4AA
  },
  kimi: {
    name: 'Kimi',
    color: 0x2F80ED,
    accent: 0x1A5FBD,
    hatColor: 0x4169E1,
    bodyType: 'scientist',
    glow: 0x44AADD
  },
  cursor: {
    name: 'Cursor',
    color: 0xF0B429,
    accent: 0xD49B1F,
    hatColor: 0xFFD700,
    bodyType: 'artist',
    glow: 0xFFCC44
  },
  custom: {
    name: 'Agent',
    color: 0x9B59B6,
    accent: 0x7D3C98,
    hatColor: 0x8E44AD,
    bodyType: 'worker',
    glow: 0xBB88DD
  }
};

// ============================================
// UTILIDADES
// ============================================
function createVoxelMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true
  });
}

// ============================================
// CLASE: VOXEL AGENT
// ============================================
class VoxelAgent {
  constructor(id, engine, name) {
    this.id = id;
    this.engine = engine || 'custom';
    this.name = name || 'Agent';
    this.style = AGENT_STYLES[this.engine] || AGENT_STYLES.custom;
    this.mesh = null;
    this.deskPosition = null;
    this.currentTask = 'Idle';
    this.status = 'idle';
    this.progress = 0;
    this.relations = [];
    this.isSelected = false;
    this.animations = { bounce: 0, typing: 0 };
    this.particles = [];
    
    this.createMesh();
  }

  createMesh() {
    const group = new THREE.Group();
    const pixel = CONFIG.pixelScale * 0.15;
    
    const skinMat = createVoxelMaterial(0xFFCC99);
    const mainMat = createVoxelMaterial(this.style.color);
    const accentMat = createVoxelMaterial(this.style.accent);
    const hatMat = createVoxelMaterial(this.style.hatColor);
    const darkMat = createVoxelMaterial(0x333333);
    const screenMat = createVoxelMaterial(0x00FF00);
    screenMat.emissive = new THREE.Color(0x003300);
    
    // Torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 4, pixel * 5, pixel * 2),
      mainMat
    );
    torso.position.y = pixel * 4;
    torso.castShadow = true;
    group.add(torso);
    
    // Logo
    const logo = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 2, pixel * 1.5, pixel * 0.1),
      accentMat
    );
    logo.position.set(0, pixel * 4.5, pixel * 1.05);
    group.add(logo);
    
    // Cabeza
    const headGroup = new THREE.Group();
    headGroup.position.y = pixel * 7;
    
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 4, pixel * 4, pixel * 4),
      skinMat
    );
    head.castShadow = true;
    headGroup.add(head);
    
    // Ojos
    const leftEye = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 0.8, pixel * 0.8, pixel * 0.2),
      darkMat
    );
    leftEye.position.set(-pixel * 0.8, pixel * 0.3, pixel * 2.05);
    headGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 0.8, pixel * 0.8, pixel * 0.2),
      darkMat
    );
    rightEye.position.set(pixel * 0.8, pixel * 0.3, pixel * 2.05);
    headGroup.add(rightEye);
    
    // Accesorios según tipo
    if (this.style.bodyType === 'scholar') {
      const glasses = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 3.2, pixel * 0.3, pixel * 0.3),
        darkMat
      );
      glasses.position.set(0, pixel * 0.3, pixel * 2.2);
      headGroup.add(glasses);
      
      const hat = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 4.2, pixel * 0.8, pixel * 4.2),
        hatMat
      );
      hat.position.y = pixel * 2.2;
      headGroup.add(hat);
    } else if (this.style.bodyType === 'hacker') {
      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 4.5, pixel * 2, pixel * 4.5),
        hatMat
      );
      hood.position.y = pixel * 1.5;
      headGroup.add(hood);
    } else if (this.style.bodyType === 'scientist') {
      const goggles = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 3.5, pixel * 1.2, pixel * 0.5),
        accentMat
      );
      goggles.position.set(0, pixel * 0.2, pixel * 2.1);
      headGroup.add(goggles);
      
      const hair = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 4.3, pixel * 1.5, pixel * 4.3),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF })
      );
      hair.position.y = pixel * 1.8;
      headGroup.add(hair);
    } else if (this.style.bodyType === 'artist') {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 4.3, pixel * 1, pixel * 4.3),
        hatMat
      );
      cap.position.y = pixel * 1.8;
      headGroup.add(cap);
    }
    
    group.add(headGroup);
    this.headGroup = headGroup;
    
    // Brazos
    this.leftArm = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 1.2, pixel * 4, pixel * 1.2),
      skinMat
    );
    this.leftArm.position.set(-pixel * 2.8, pixel * 4, 0);
    this.leftArm.castShadow = true;
    group.add(this.leftArm);
    
    const leftSleeve = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 1.4, pixel * 1.5, pixel * 1.4),
      mainMat
    );
    leftSleeve.position.set(-pixel * 2.8, pixel * 5.5, 0);
    group.add(leftSleeve);
    
    this.rightArm = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 1.2, pixel * 4, pixel * 1.2),
      skinMat
    );
    this.rightArm.position.set(pixel * 2.8, pixel * 4, 0);
    this.rightArm.castShadow = true;
    group.add(this.rightArm);
    
    const rightSleeve = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 1.4, pixel * 1.5, pixel * 1.4),
      mainMat
    );
    rightSleeve.position.set(pixel * 2.8, pixel * 5.5, 0);
    group.add(rightSleeve);
    
    // Piernas
    this.leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 1.3, pixel * 3, pixel * 1.3),
      darkMat
    );
    this.leftLeg.position.set(-pixel * 1, pixel * 1.5, 0);
    this.leftLeg.castShadow = true;
    group.add(this.leftLeg);
    
    this.rightLeg = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 1.3, pixel * 3, pixel * 1.3),
      darkMat
    );
    this.rightLeg.position.set(pixel * 1, pixel * 1.5, 0);
    this.rightLeg.castShadow = true;
    group.add(this.rightLeg);
    
    // Laptop
    const laptopBase = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 3, pixel * 0.2, pixel * 2),
      darkMat
    );
    laptopBase.position.set(pixel * 2.5, pixel * 2.5, pixel * 2);
    laptopBase.rotation.x = -0.3;
    group.add(laptopBase);
    
    const laptopScreen = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 3, pixel * 2, pixel * 0.1),
      screenMat
    );
    laptopScreen.position.set(pixel * 2.5, pixel * 3.5, pixel * 1);
    laptopScreen.rotation.x = -0.3;
    group.add(laptopScreen);
    
    // Brillo
    const glowLight = new THREE.PointLight(this.style.glow, 0.5, 8);
    glowLight.position.set(0, pixel * 6, pixel * 2);
    group.add(glowLight);
    
    // Sombra
    const shadowGeo = new THREE.CircleGeometry(pixel * 2.5, 8);
    const shadowMat = new THREE.MeshBasicMaterial({ 
      color: 0x000000, 
      transparent: true, 
      opacity: 0.3 
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    group.add(shadow);
    
    this.mesh = group;
    this.mesh.userData = { agentId: this.id, agent: this };
    
    // Animación spawn
    this.mesh.scale.set(0, 0, 0);
    this.animateSpawn();
  }

  animateSpawn() {
    let scale = 0;
    const animate = () => {
      scale += 0.1;
      if (scale > 1) scale = 1;
      this.mesh.scale.set(scale, scale, scale);
      if (scale < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  setPosition(x, z, lookAt = null) {
    if (this.mesh) {
      this.mesh.position.set(x, 0, z);
      if (lookAt) {
        this.mesh.lookAt(lookAt.x, 0, lookAt.z);
      }
      this.deskPosition = { x, z };
    }
  }

  setStatus(status, task) {
    this.status = status;
    this.currentTask = task;
  }

  update(delta, time) {
    if (!this.mesh) return;
    
    // Respiración
    const breathe = Math.sin(time * 2 + this.id.charCodeAt(0)) * 0.05 + 1;
    this.mesh.scale.y = breathe;
    
    // Animación tipeo
    if (this.status === 'working') {
      this.animations.typing += delta * 10;
      const armOffset = Math.sin(this.animations.typing) * 0.3;
      this.rightArm.rotation.x = -0.5 + armOffset;
    } else {
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 5);
    }
    
    // Selección
    if (this.isSelected) {
      this.animations.bounce += delta * 5;
      const bounceY = Math.sin(this.animations.bounce) * 0.3;
      this.mesh.position.y = bounceY;
      this.mesh.rotation.y += delta * 0.5;
    } else {
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, 0, delta * 10);
    }
  }

  setSelected(selected) {
    this.isSelected = selected;
  }

  lookAt(target) {
    if (this.headGroup) {
      const direction = new THREE.Vector3()
        .subVectors(target, this.mesh.position)
        .normalize();
      const angle = Math.atan2(direction.x, direction.z);
      this.headGroup.rotation.y = angle - this.mesh.rotation.y;
    }
  }
}

// ============================================
// CLASE: OFICINA VOXEL
// ============================================
class VoxelOffice {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.deskPositions = [];
    this.createOffice();
  }

  createOffice() {
    const pixel = CONFIG.pixelScale * 0.15;
    this.createFloor(pixel);
    this.createWalls(pixel);
    this.createDesks(pixel);
    this.createPlants(pixel);
    this.createLamps(pixel);
    this.setupLighting();
  }

  createFloor(pixel) {
    const { width, depth } = CONFIG.officeSize;
    const tileSize = pixel * 3;
    const cols = Math.ceil(width / tileSize);
    const rows = Math.ceil(depth / tileSize);
    
    for (let x = 0; x < cols; x++) {
      for (let z = 0; z < rows; z++) {
        const isDark = (x + z) % 2 === 0;
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(tileSize * 0.98, pixel * 0.5, tileSize * 0.98),
          createVoxelMaterial(isDark ? CONFIG.colors.floor : CONFIG.colors.floorDark)
        );
        tile.position.set(
          (x - cols/2) * tileSize + tileSize/2,
          -pixel * 0.25,
          (z - rows/2) * tileSize + tileSize/2
        );
        tile.receiveShadow = true;
        this.scene.add(tile);
        this.meshes.push(tile);
      }
    }
  }

  createWalls(pixel) {
    const { width, depth } = CONFIG.officeSize;
    const wallHeight = pixel * 12;
    const wallMat = createVoxelMaterial(CONFIG.colors.wall);
    
    // Pared trasera
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(width, wallHeight, pixel),
      wallMat
    );
    backWall.position.set(0, wallHeight/2, -depth/2 - pixel/2);
    backWall.castShadow = true;
    this.scene.add(backWall);
    this.meshes.push(backWall);
    
    // Pared derecha
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(pixel, wallHeight, depth),
      wallMat
    );
    rightWall.position.set(width/2 + pixel/2, wallHeight/2, 0);
    rightWall.castShadow = true;
    this.scene.add(rightWall);
    this.meshes.push(rightWall);
    
    // Tablero
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.6, pixel * 5, pixel * 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2C3E50, roughness: 0.9 })
    );
    board.position.set(0, wallHeight * 0.6, -depth/2 + pixel * 0.3);
    this.scene.add(board);
    this.meshes.push(board);
  }

  createDesks(pixel) {
    const positions = [
      { x: -8, z: -6 }, { x: 0, z: -6 }, { x: 8, z: -6 },
      { x: -8, z: 2 }, { x: 0, z: 2 }, { x: 8, z: 2 },
      { x: -4, z: 10 }, { x: 4, z: 10 }
    ];
    
    positions.forEach((pos, index) => {
      this.createDesk(pixel, pos.x, pos.z);
      this.deskPositions.push({ x: pos.x, z: pos.z, id: `desk-${index}` });
    });
  }

  createDesk(pixel, x, z) {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(x, 0, z);
    
    // Superficie
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 10, pixel * 0.8, pixel * 6),
      createVoxelMaterial(CONFIG.colors.deskTop)
    );
    top.position.y = pixel * 4;
    top.castShadow = true;
    top.receiveShadow = true;
    deskGroup.add(top);
    
    // Patas
    const legMat = createVoxelMaterial(CONFIG.colors.desk);
    const legPositions = [
      [-pixel * 4, pixel * 2, -pixel * 2.5],
      [pixel * 4, pixel * 2, -pixel * 2.5],
      [-pixel * 4, pixel * 2, pixel * 2.5],
      [pixel * 4, pixel * 2, pixel * 2.5]
    ];
    
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 1, pixel * 4, pixel * 1),
        legMat
      );
      leg.position.set(...pos);
      leg.castShadow = true;
      deskGroup.add(leg);
    });
    
    // Monitor
    const monitorBase = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 2, pixel * 0.5, pixel * 2),
      createVoxelMaterial(CONFIG.colors.computer)
    );
    monitorBase.position.set(0, pixel * 4.5, -pixel * 1);
    deskGroup.add(monitorBase);
    
    const monitorScreen = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 4, pixel * 3, pixel * 0.3),
      createVoxelMaterial(CONFIG.colors.monitor)
    );
    monitorScreen.position.set(0, pixel * 6, -pixel * 1);
    deskGroup.add(monitorScreen);
    
    // Brillo pantalla
    const screenGlow = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 3.5, pixel * 2.5, pixel * 0.1),
      new THREE.MeshBasicMaterial({ 
        color: 0x44FF44,
        transparent: true,
        opacity: 0.3
      })
    );
    screenGlow.position.set(0, pixel * 6, -pixel * 0.8);
    deskGroup.add(screenGlow);
    
    // Silla
    const chair = new THREE.Group();
    chair.position.set(0, 0, pixel * 4);
    
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 3, pixel * 0.5, pixel * 3),
      createVoxelMaterial(CONFIG.colors.chair)
    );
    seat.position.y = pixel * 2.5;
    chair.add(seat);
    
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 3, pixel * 3.5, pixel * 0.5),
      createVoxelMaterial(CONFIG.colors.chair)
    );
    back.position.set(0, pixel * 4.5, pixel * 1.25);
    chair.add(back);
    
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 2.5, pixel * 2.5, pixel * 2.5),
      createVoxelMaterial(0x333333)
    );
    base.position.y = pixel * 1.25;
    chair.add(base);
    
    deskGroup.add(chair);
    
    // Alfombra
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(pixel * 11, pixel * 0.1, pixel * 8),
      new THREE.MeshStandardMaterial({ color: 0x6B8E6B, roughness: 1 })
    );
    rug.position.y = pixel * 0.05;
    rug.receiveShadow = true;
    deskGroup.add(rug);
    
    this.scene.add(deskGroup);
    this.meshes.push(deskGroup);
  }

  createPlants(pixel) {
    const positions = [
      { x: -12, z: -8 }, { x: 12, z: -8 },
      { x: -12, z: 8 }, { x: 12, z: 8 }
    ];
    
    positions.forEach(pos => {
      const plantGroup = new THREE.Group();
      plantGroup.position.set(pos.x, 0, pos.z);
      
      const pot = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 2, pixel * 2, pixel * 2),
        createVoxelMaterial(CONFIG.colors.plantPot)
      );
      pot.position.y = pixel;
      plantGroup.add(pot);
      
      const leafPositions = [
        [0, pixel * 3, 0, pixel * 1.5],
        [0, pixel * 4, 0, pixel * 1.2],
        [-pixel, pixel * 3.5, pixel, pixel * 1],
        [pixel, pixel * 3.5, pixel, pixel * 1],
      ];
      
      leafPositions.forEach((leaf, i) => {
        const leafMesh = new THREE.Mesh(
          new THREE.BoxGeometry(leaf[3], leaf[3], leaf[3]),
          createVoxelMaterial(i === 1 ? 0x32CD32 : CONFIG.colors.plant)
        );
        leafMesh.position.set(leaf[0], leaf[1], leaf[2]);
        plantGroup.add(leafMesh);
      });
      
      this.scene.add(plantGroup);
      this.meshes.push(plantGroup);
    });
  }

  createLamps(pixel) {
    const positions = [
      { x: -10, z: -10 }, { x: 10, z: -10 },
      { x: -10, z: 10 }, { x: 10, z: 10 }
    ];
    
    positions.forEach(pos => {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(pixel * 1.5, pixel * 8, pixel * 1.5),
        createVoxelMaterial(CONFIG.colors.lamp)
      );
      lamp.position.set(pos.x, pixel * 4, pos.z);
      lamp.castShadow = true;
      this.scene.add(lamp);
      this.meshes.push(lamp);
      
      const light = new THREE.PointLight(0xFFD700, 0.3, 15);
      light.position.set(pos.x, pixel * 7, pos.z);
      this.scene.add(light);
    });
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(-20, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.camera.left = -25;
    sunLight.shadow.camera.right = 25;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    this.scene.add(sunLight);
    
    const fillLight = new THREE.DirectionalLight(0x87CEEB, 0.3);
    fillLight.position.set(20, 10, 20);
    this.scene.add(fillLight);
  }

  getDeskPosition(index) {
    if (index < this.deskPositions.length) {
      return this.deskPositions[index];
    }
    const angle = (index - this.deskPositions.length) * 0.5;
    const radius = 8;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius + 2
    };
  }
}

// ============================================
// CLASE: RELATION LINES
// ============================================
class RelationConnector {
  constructor(scene) {
    this.scene = scene;
    this.lines = new Map();
    this.particles = [];
  }

  update(agents) {
    this.clearLines();
    const activeAgents = [...agents.values()].filter(a => a.status !== 'offline');
    
    for (const agent of activeAgents) {
      if (agent.relations?.length > 0 && agent.mesh) {
        for (const relatedId of agent.relations) {
          const related = agents.get(relatedId);
          if (related?.mesh && related.status !== 'offline') {
            this.createConnection(agent, related);
          }
        }
      }
    }
  }

  createConnection(agent1, agent2) {
    const key = [agent1.id, agent2.id].sort().join('-');
    if (this.lines.has(key)) return;
    
    const start = agent1.mesh.position.clone();
    const end = agent2.mesh.position.clone();
    start.y += 3;
    end.y += 3;
    
    const curve = new THREE.QuadraticBezierCurve3(
      start,
      new THREE.Vector3((start.x + end.x) / 2, Math.max(start.y, end.y) + 3, (start.z + end.z) / 2),
      end
    );
    
    const points = curve.getPoints(20);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: agent1.style.glow,
      transparent: true,
      opacity: 0.4
    });
    
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.lines.set(key, line);
  }

  clearLines() {
    for (const line of this.lines.values()) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
    this.lines.clear();
  }
}

// ============================================
// CLASE PRINCIPAL
// ============================================
class AgentMonitorApp {
  constructor() {
    this.canvas = document.getElementById('office-canvas');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.office = null;
    this.agents = new Map();
    this.connectors = null;
    this.eventSource = null;
    this.selectedAgent = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Elementos UI
    this.ui = {
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
    
    this.init();
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.createOffice();
    this.setupEventSource();
    this.setupInteractions();
    this.animate();
    window.officeScene = this.scene;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xD0E0F0);
    this.scene.fog = new THREE.Fog(0xD0E0F0, 30, 100);
  }

  setupCamera() {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(25, 20, 25);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.target.set(0, 2, 0);
  }

  createOffice() {
    this.office = new VoxelOffice(this.scene);
    this.connectors = new RelationConnector(this.scene);
  }

  setupEventSource() {
    const url = `${window.location.origin}/events`;
    this.eventSource = new EventSource(url);
    
    this.eventSource.onopen = () => this.updateConnectionStatus(true);
    this.eventSource.onerror = () => this.updateConnectionStatus(false);
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerEvent(data);
      } catch (e) {
        console.error('Error parsing event:', e);
      }
    };
  }

  handleServerEvent(data) {
    switch (data.type) {
      case 'initial':
        this.initializeAgents(data.payload.agents);
        break;
      case 'agent_upsert':
        this.upsertAgent(data.payload);
        break;
      case 'agent_remove':
        this.removeAgent(data.payload.id);
        break;
      case 'event':
        this.addEventToTimeline(data.payload);
        break;
    }
    this.updateUI();
  }

  initializeAgents(agentDataList) {
    for (const data of agentDataList) {
      this.upsertAgent(data);
    }
  }

  upsertAgent(data) {
    let agent = this.agents.get(data.id);
    
    if (!agent) {
      agent = new VoxelAgent(data.id, data.engine, data.name);
      const deskPos = this.office.getDeskPosition(this.agents.size);
      agent.setPosition(deskPos.x, deskPos.z);
      this.scene.add(agent.mesh);
      this.agents.set(data.id, agent);
    }
    
    agent.setStatus(data.status, data.currentTask || data.task);
    agent.progress = data.progress || 0;
    agent.relations = data.relations || [];
    
    this.connectors.update(this.agents);
  }

  removeAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      this.scene.remove(agent.mesh);
      this.agents.delete(id);
      if (this.selectedAgent === id) {
        this.selectedAgent = null;
      }
      this.connectors.update(this.agents);
    }
  }

  addEventToTimeline(event) {
    if (!this.ui.eventList) return;
    
    const eventEl = document.createElement('div');
    eventEl.className = 'event-item';
    eventEl.innerHTML = `
      <div class="event-row">
        <span class="event-tag type-${event.type}">${event.type}</span>
        <time>${new Date(event.timestamp).toLocaleTimeString()}</time>
      </div>
      <p>${event.message}</p>
    `;
    
    this.ui.eventList.insertBefore(eventEl, this.ui.eventList.firstChild);
    
    while (this.ui.eventList.children.length > 20) {
      this.ui.eventList.removeChild(this.ui.eventList.lastChild);
    }
  }

  setupInteractions() {
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    window.addEventListener('resize', () => this.onResize());
    
    // Hacer selectAgentById disponible globalmente
    window.selectAgentById = (id) => {
      const agent = this.agents.get(id);
      if (agent) this.selectAgent(agent);
    };
  }

  onCanvasClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const agentMeshes = [...this.agents.values()].map(a => a.mesh);
    const intersects = this.raycaster.intersectObjects(agentMeshes, true);
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.agent) {
        obj = obj.parent;
      }
      
      if (obj.userData.agent) {
        this.selectAgent(obj.userData.agent);
      }
    } else {
      this.deselectAgent();
    }
  }

  selectAgent(agent) {
    if (this.selectedAgent) {
      const prev = this.agents.get(this.selectedAgent);
      if (prev) prev.setSelected(false);
    }
    
    this.selectedAgent = agent.id;
    agent.setSelected(true);
    
    if (this.ui.selectedId) {
      this.ui.selectedId.textContent = agent.name;
    }
    
    if (this.ui.selectedContent) {
      this.ui.selectedContent.innerHTML = `
        <div class="selected-grid">
          <article><label>Estado</label><strong class="status-${agent.status}">${agent.status}</strong></article>
          <article><label>Progreso</label><strong>${agent.progress}%</strong></article>
          <article><label>Engine</label><strong>${agent.engine}</strong></article>
          <article><label>Relaciones</label><strong>${agent.relations.length}</strong></article>
          <article><label>Tipo</label><strong>${agent.style.bodyType}</strong></article>
          <article><label>Tarea</label><strong>${agent.currentTask}</strong></article>
        </div>
      `;
    }
    
    // Enfocar cámara
    if (agent.mesh) {
      const targetPos = agent.mesh.position.clone();
      const offset = new THREE.Vector3(8, 8, 8);
      const newPos = targetPos.clone().add(offset);
      
      const startPos = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      let progress = 0;
      
      const animate = () => {
        progress += 0.05;
        if (progress > 1) progress = 1;
        
        this.camera.position.lerpVectors(startPos, newPos, progress);
        this.controls.target.lerpVectors(startTarget, targetPos, progress);
        this.controls.update();
        
        if (progress < 1) requestAnimationFrame(animate);
      };
      animate();
    }
  }

  deselectAgent() {
    if (this.selectedAgent) {
      const prev = this.agents.get(this.selectedAgent);
      if (prev) prev.setSelected(false);
    }
    this.selectedAgent = null;
    if (this.ui.selectedId) this.ui.selectedId.textContent = 'sin selección';
    if (this.ui.selectedContent) this.ui.selectedContent.innerHTML = '';
  }

  updateUI() {
    const active = [...this.agents.values()].filter(a => a.status !== 'offline');
    const working = active.filter(a => a.status === 'working');
    const collab = active.filter(a => a.relations.length > 0);
    
    if (this.ui.metricOnline) this.ui.metricOnline.textContent = active.length;
    if (this.ui.metricWorking) this.ui.metricWorking.textContent = working.length;
    if (this.ui.metricCollab) this.ui.metricCollab.textContent = collab.length;
    if (this.ui.metricTotal) this.ui.metricTotal.textContent = this.agents.size;
    if (this.ui.agentsCount) this.ui.agentsCount.textContent = `${active.length} detectados`;
    
    // Actualizar lista de agentes
    if (this.ui.agentList) {
      this.ui.agentList.innerHTML = [...this.agents.values()]
        .map(agent => `
          <button class="agent-card ${agent.id === this.selectedAgent ? 'selected' : ''}" 
                  onclick="selectAgentById('${agent.id}')">
            <div class="agent-row">
              <strong>${agent.name}</strong>
              <span class="badge ${agent.status}">${agent.status}</span>
            </div>
            <div class="agent-row muted">
              <span>${agent.engine}</span>
              <span>${agent.project || 'Sin proyecto'}</span>
            </div>
            <p class="agent-task">${agent.currentTask}</p>
            <div class="progress-track">
              <span style="width: ${agent.progress}%"></span>
            </div>
          </button>
        `).join('');
    }
  }

  updateConnectionStatus(connected) {
    if (!this.ui.connectionPill || !this.ui.connectionText) return;
    
    if (connected) {
      this.ui.connectionPill.classList.remove('offline');
      this.ui.connectionPill.classList.add('online');
      this.ui.connectionText.textContent = 'Conectado';
    } else {
      this.ui.connectionPill.classList.remove('online');
      this.ui.connectionPill.classList.add('offline');
      this.ui.connectionText.textContent = 'Desconectado';
    }
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();
    
    this.controls.update();
    
    for (const agent of this.agents.values()) {
      agent.update(delta, time);
    }
    
    // Interacciones entre agentes
    this.updateAgentInteractions();
    
    this.renderer.render(this.scene, this.camera);
  }

  updateAgentInteractions() {
    const activeAgents = [...this.agents.values()].filter(a => a.status !== 'offline');
    
    for (const agent1 of activeAgents) {
      if (agent1.isSelected) continue;
      
      let nearest = null;
      let minDist = Infinity;
      
      for (const agent2 of activeAgents) {
        if (agent1 === agent2) continue;
        const hasRelation = agent1.relations.includes(agent2.id);
        const dist = agent1.mesh.position.distanceTo(agent2.mesh.position);
        
        if ((hasRelation && dist < 15) || (!nearest && dist < 10)) {
          if (dist < minDist) {
            minDist = dist;
            nearest = agent2;
          }
        }
      }
      
      if (nearest) {
        agent1.lookAt(nearest.mesh.position);
      }
    }
  }
}

// Inicializar
new AgentMonitorApp();
