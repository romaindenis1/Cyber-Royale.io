<script setup>
import { onMounted, onUnmounted, ref, nextTick } from "vue";
import { useRouter } from "vue-router";
import { io } from "socket.io-client";
import nipplejs from "nipplejs";
import { useGameStore } from "../stores/game";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const gameStore = useGameStore();
const auth = useAuthStore();

const canvasRef = ref(null);
const socket = ref(null);
const isMobile = ref(false);

// Joysticks
let joyManager = null;

const skillCD = ref(0);
const maxSkillCD = ref(1);
const isDead = ref(false);
const killedBy = ref("");
const killedByHero = ref("");
const respawnTimer = ref(0);
const killMessages = ref([]); // { id, text }

// Game State
let players = [];
let projectiles = [];
let entities = []; // Mines
let mapData = null;
let animationId;
let cameraX = 0;
let cameraY = 0;
let myId = null;

// VFX State
let shakeIntensity = 0;
let shakeDuration = 0;
let shakeX = 0;
let shakeY = 0;
let flashAlpha = 0;

const addScreenShake = (intensity, duration) => {
  shakeIntensity = intensity;
  shakeDuration = duration;
};

const triggerFlash = (alpha) => {
  flashAlpha = alpha;
};

// Assets
const iceImg = new Image();
iceImg.src = "/assets/ice_cube.png";

// Inputs
const keys = { w: false, a: false, s: false, d: false, space: false };
let mouseAngle = 0;

// Config
const VIEWPORT_W = window.innerWidth;
const VIEWPORT_H = window.innerHeight;

onMounted(async () => {
  if (!gameStore.selectedHeroId) {
    router.push("/dashboard");
    return;
  }

  // Ensure Auth Profile is loaded (Fix for "Unknown" on refresh)
  if (auth.token && !auth.user) {
    await auth.fetchProfile();
  }
  // Ensure Heroes are loaded (Fix for "HERO: UNKNOWN" & Skin Color on refresh)
  if (gameStore.allHeroes.length === 0 && auth.token) {
    await gameStore.fetchHeroes();
  }

  // Auto-detect URL for production (same origin), localhost for dev
  const socketUrl = import.meta.env.PROD
    ? window.location.origin
    : "http://localhost:3005";

  socket.value = io(socketUrl);

  socket.value.on("connect", () => {
    // Get Skin Color
    const heroId = gameStore.selectedHeroId;
    const skinIdx = gameStore.getSelectedSkin(heroId);
    const hero = gameStore.allHeroes.find((h) => h.id === heroId);
    const skinColor = hero?.skins[skinIdx]?.value || "#ffffff";

    // console.log("Joining with token:", auth.token ? "PRESENT" : "MISSING");
    socket.value.emit("join_game", {
      heroId: heroId,
      username: auth.user?.username,
      skinColor: skinColor,
      token: auth.token, // Send Token for verification
    });
  });

  socket.value.on("game_init", (data) => {
    mapData = data.map;
    myId = data.playerId;
  });

  socket.value.on("player_died", (data) => {
    spawnExplosion(data.x, data.y, data.color);
  });

  socket.value.on("visual_effect", (data) => {
    if (data.type === "shockwave") {
      createShockwave(data.x, data.y, data.color || "#ffffff");
      spawnExplosion(data.x, data.y, data.color || "#ffffff");
    } else if (data.type === "poison_hit") {
      spawnExplosion(data.x, data.y, "#32cd32");
    } else if (data.type === "hit") {
      spawnHitSparks(data.x, data.y, data.color);
      // Sprite Flash Logic
      if (data.targetId) {
        const victim = players.find((p) => p.id === data.targetId);
        if (victim) victim.flashTime = 5; // Flash for 5 frames
      }
    } else if (data.type === "black_hole_explode") {
      spawnExplosion(data.x, data.y, "#d000ff");
      createShockwave(data.x, data.y, "#bf00ff");
      addScreenShake(15, 20);
      triggerFlash(0.5);
    }
  });

  socket.value.on("kill_confirmed", (data) => {
    const id = Date.now();
    killMessages.value.push({ id, text: `YOU ELIMINATED ${data.victim}` });
    setTimeout(() => {
      const idx = killMessages.value.findIndex((m) => m.id === id);
      if (idx !== -1) killMessages.value.splice(idx, 1);
    }, 3000);
  });

  socket.value.on("server_update", (state) => {
    players = state.players;
    projectiles = state.projectiles; // Bullets
    entities = state.entities; // Mines

    // Update My HUD Stats
    const me = players.find((p) => p.id === myId);
    if (me) {
      skillCD.value = me.skillCD || 0; // Default to 0 if undefined
      maxSkillCD.value = me.maxSkillCD || 5000;
      isDead.value = !!me.isDead;
      if (isDead.value) {
        killedBy.value = me.killedBy || "Unknown";
        killedByHero.value = me.killedByHero || "?";
      }
      if (isDead.value && me.respawnTime) {
        respawnTimer.value = Math.ceil(
          Math.max(0, me.respawnTime - Date.now()) / 1000
        );
      }
    } else {
      // Fallback if player dead or not found (and not in list yet)
      skillCD.value = 0;
    }
  });

  window.addEventListener("keydown", handleKey);
  window.addEventListener("keyup", handleKey);
  window.addEventListener("mousemove", handleMouse);
  window.addEventListener("keypress", handleSkill);
  window.addEventListener("resize", handleResize);

  const ctx = canvasRef.value.getContext("2d");

  // Strict Mobile Check: Width < 768 AND Touch Capability
  const isTouch =
    navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  isMobile.value = window.innerWidth <= 768 && isTouch;

  canvasRef.value.width = window.innerWidth;
  canvasRef.value.height = window.innerHeight;

  if (isMobile.value) {
    await nextTick();
    try {
      initMobileControls();
    } catch (err) {
      console.error("Mobile init failed:", err);
    }
  }

  loop(ctx);

  setInterval(() => {
    if (socket.value) {
      socket.value.emit("client_input", { keys, mouseAngle });
    }
  }, 30);
});

onUnmounted(() => {
  if (socket.value) socket.value.disconnect();
  window.removeEventListener("keydown", handleKey);
  window.removeEventListener("keyup", handleKey);
  window.removeEventListener("mousemove", handleMouse);
  window.removeEventListener("keypress", handleSkill);
  cancelAnimationFrame(animationId);
});

const handleKey = (e) => {
  if (["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
    keys[e.key.toLowerCase()] = e.type === "keydown";
  }
  if (e.code === "Space") {
    keys.space = e.type === "keydown";
  }
};

const handleMouse = (e) => {
  // Calculate angle relative to center of screen (since camera follows player)
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  mouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
};

const handleSkill = (e) => {
  if (e.key.toLowerCase() === "e") socket.value.emit("skill_trigger");
};

// --- MOBILE CONTROLS ---
const initMobileControls = () => {
  // 1. Movement Joystick (Left)
  const leftZone = document.getElementById("zone-joystick-left");
  const joyLeft = nipplejs.create({
    zone: leftZone,
    mode: "static",
    position: { left: "80px", bottom: "80px" },
    color: "#00f3ff",
    size: 100,
  });

  joyLeft.on("move", (evt, data) => {
    if (data.angle) {
      // Reset all movement keys first
      keys.w = false;
      keys.a = false;
      keys.s = false;
      keys.d = false;

      // Map Angle to WASD (Basic 8-direction approximation or just threshold)
      const deg = data.angle.degree;

      // Up (45-135)
      if (deg > 45 && deg < 135) keys.w = true;
      // Down (225-315)
      if (deg > 225 && deg < 315) keys.s = true;
      // Left (135-225)
      if (deg > 135 && deg < 225) keys.a = true;
      // Right (315-360 or 0-45)
      if (deg > 315 || deg < 45) keys.d = true;
    }
  });

  joyLeft.on("end", () => {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
  });

  // 2. Aim Joystick (Right)
  const rightZone = document.getElementById("zone-joystick-right");
  const joyRight = nipplejs.create({
    zone: rightZone,
    mode: "static",
    position: { right: "80px", bottom: "80px" },
    color: "#ff00ff",
    size: 100,
  });

  joyRight.on("move", (evt, data) => {
    if (data.angle) {
      // NippleJS gives angle in radians (data.angle.radian) relative to X axis properly?
      // NOTE: nipplejs radian is mathematical (counter-clockwise from Right).
      // Canvas Math.atan2(y, x) is similar.
      // We just need to invert Y if needed?
      // NippleJS: Up is 90deg (PI/2). Down is 270deg.
      // Screen Coords: Up is -Y.
      // So if Nipple says UP, vector is (0, 1) in its world?
      // Actually, we can just use the vector directly.
      // BUT `mouseAngle` is expected to be `Math.atan2(y, x)` relative to player center.
      // Nipple radian should match directly EXCEPT Y-axis flip might be needed if "Up" means positive Y for Nipple but negative Y for Screen.
      // Joystick "Up" => angle 90 deg => -Y in screen.
      // Let's rely on data.angle.radian but verify direction.
      // If we drag UP, angle is PI/2.
      // In game loop, we just use this angle for rotation.
      // Standard canvas rotation: +Y is Down.
      // If I want to face UP, I need -Y. atan2(-1, 0) = -PI/2.
      // Nipple UP is +PI/2. So we negate the angle?
      mouseAngle = -data.angle.radian;
    }
  });
};

const triggerSkill = () => {
  socket.value.emit("skill_trigger");
};

const startShooting = () => {
  keys.space = true;
};

const stopShooting = () => {
  keys.space = false;
};

const handleResize = () => {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth;
    canvasRef.value.height = window.innerHeight;
  }
};

// === RENDERING ===
const drawMap = (ctx) => {
  if (!mapData) return;

  // Draw Grid
  ctx.strokeStyle = "#222233";
  ctx.lineWidth = 2;
  const gridSize = 100;

  const startX = Math.floor(cameraX / gridSize) * gridSize;
  const startY = Math.floor(cameraY / gridSize) * gridSize;

  for (
    let x = startX;
    x < startX + window.innerWidth + gridSize;
    x += gridSize
  ) {
    ctx.beginPath();
    ctx.moveTo(x - cameraX, 0);
    ctx.lineTo(x - cameraX, window.innerHeight);
    ctx.stroke();
  }
  for (
    let y = startY;
    y < startY + window.innerHeight + gridSize;
    y += gridSize
  ) {
    ctx.beginPath();
    ctx.moveTo(0, y - cameraY);
    ctx.lineTo(window.innerWidth, y - cameraY);
    ctx.stroke();
  }

  // Draw Arena Boundary with Pulse
  const pulse = Math.abs(Math.sin(Date.now() / 1000)) * 20 + 10;
  ctx.strokeStyle = "#00f3ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#00f3ff";
  ctx.shadowBlur = pulse;
  ctx.strokeRect(0 - cameraX, 0 - cameraY, 1600, 1200);
  ctx.shadowBlur = 0; // Reset

  // Draw Obstacles
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  mapData.obstacles.forEach((obs) => {
    const screenX = obs.x - cameraX;
    const screenY = obs.y - cameraY;

    // OPTIMIZATION: Viewport Culling (Don't draw off-screen)
    if (
      screenX + obs.w < -50 ||
      screenX > screenW + 50 ||
      screenY + obs.h < -50 ||
      screenY > screenH + 50
    ) {
      return;
    }

    ctx.fillStyle = "#11111a";
    if (obs.type === "CORE") ctx.fillStyle = "#1a1a2e";

    ctx.fillRect(screenX, screenY, obs.w, obs.h);

    // Neon Glow Border (Expensive, only draw if visible)
    ctx.shadowBlur = 15;
    if (obs.type === "WALL") {
      ctx.strokeStyle = "#00f3ff";
      ctx.shadowColor = "#00f3ff";
    } else if (obs.type === "CORE") {
      ctx.strokeStyle = "#ff00ff";
      ctx.shadowColor = "#ff00ff";
    } else {
      ctx.strokeStyle = "#ffee00";
      ctx.shadowColor = "#ffee00";
    }
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX, screenY, obs.w, obs.h);
    ctx.shadowBlur = 0; // Reset
  });
};

// === SHOCKWAVES ===
let shockwaves = [];

const createShockwave = (x, y, color) => {
  shockwaves.push({
    x,
    y,
    color,
    radius: 10,
    maxRadius: 300,
    alpha: 1.0,
    speed: 15,
  });
};

const updateShockwaves = () => {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.radius += s.speed;
    s.alpha -= 0.05; // Fade out
    if (s.alpha <= 0) shockwaves.splice(i, 1);
  }
};

const drawShockwaves = (ctx) => {
  ctx.save();
  shockwaves.forEach((s) => {
    const sx = s.x - cameraX;
    const sy = s.y - cameraY;
    ctx.beginPath();
    ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 5;
    ctx.globalAlpha = s.alpha;
    ctx.stroke();
    // Inner fill for extra "pop"
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.alpha * 0.2;
    ctx.fill();
  });
  ctx.restore();
};

// === PARTICLES ===
let particles = [];

const createParticle = (x, y, color, speed, life, type = "circle") => {
  const angle = Math.random() * Math.PI * 2;
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    maxLife: life,
    color,
    type,
    angle: Math.random() * Math.PI, // Rotation for debris
    rotSpeed: (Math.random() - 0.5) * 0.2, // Spin
  });
};

const spawnExplosion = (x, y, color) => {
  // 1. Dust / Smoke (Small)
  for (let i = 0; i < 20; i++) {
    createParticle(
      x,
      y,
      color,
      5 + Math.random() * 10,
      30 + Math.random() * 20
    );
  }
  // 2. Debris (Chunks - Larger, slower)
  for (let i = 0; i < 10; i++) {
    createParticle(
      x,
      y,
      color,
      2 + Math.random() * 8,
      40 + Math.random() * 20,
      "debris"
    );
  }
};

const spawnHitSparks = (x, y, color) => {
  for (let i = 0; i < 15; i++) {
    createParticle(x, y, color, 3 + Math.random() * 6, 15 + Math.random() * 10);
  }
};

const updateParticles = () => {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.type === "debris") p.angle += p.rotSpeed;
    if (p.life <= 0) particles.splice(i, 1);
  }
};

const drawParticles = (ctx) => {
  particles.forEach((p) => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;

    if (p.type === "debris") {
      ctx.save();
      ctx.translate(p.x - cameraX, p.y - cameraY);
      ctx.rotate(p.angle);
      ctx.fillRect(-3, -3, 6, 6); // Larger
      ctx.restore();
    } else {
      // Standard Spark
      ctx.fillRect(p.x - cameraX, p.y - cameraY, 4, 4);
    }

    ctx.globalAlpha = 1.0;
  });
};

const drawProjectiles = (ctx) => {
  projectiles.forEach((p) => {
    // Skip mines here if they are in 'entities' array, usually projectiles are bullets
    if (p.type === "MINE") return;

    // BLACK HOLE SHOT (Nova)
    if (p.type === "BLACK_HOLE_SHOT") {
      const sx = p.x - cameraX;
      const sy = p.y - cameraY;
      ctx.save();
      ctx.translate(sx, sy);

      // Dark Orb (Much Larger)
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "#800080"; // Purple
      ctx.lineWidth = 3;
      ctx.stroke();

      // Aura
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#800080";
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(128, 0, 128, 0.5)";
      ctx.stroke();

      ctx.restore();
      return;
    }

    // MINE PROJECTILE (Techno)
    if (p.type === "MINE_PROJ") {
      const sx = p.x - cameraX;
      const sy = p.y - cameraY;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffaa00";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      // Pulsing effect for sticky mine
      if (Math.abs(p.vx) < 1 && Math.abs(p.vy) < 1) {
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + Math.sin(Date.now() / 200) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 170, 0, 0.5)";
        ctx.stroke();
      }
      return;
    }

    // LAVA WAVE (Magma)
    if (p.type === "LAVA_WAVE") {
      const sx = p.x - cameraX;
      const sy = p.y - cameraY;
      const radius = 25; // Slightly larger

      ctx.save();
      ctx.translate(sx, sy);
      const angle = Math.atan2(p.vy, p.vx);
      ctx.rotate(angle);

      // Layer 1: Core (Yellow/White)
      ctx.fillStyle = "#fff700";
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.6, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Layer 2: Magma (Orange)
      ctx.fillStyle = "rgba(255, 69, 0, 0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Layer 3: Glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#ff0000";
      ctx.strokeStyle = "#ff4500";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      // Particles (Dripping Lava)
      if (Math.random() > 0.7) {
        createParticle(p.x, p.y, "#ff4500", 2, 10);
      }

      ctx.restore();
      return;
    }

    const sx = p.x - cameraX;
    const sy = p.y - cameraY;

    ctx.fillStyle = p.color || "#fff";
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();

    // VISIBILITY FIX: Outline for dark bullets
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Glow
    ctx.shadowColor = p.color === "#000000" ? "#ffffff" : p.color || "#fff";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
};

const drawPlayer = (ctx, p) => {
  // Hide Dead Players (Ghosts) from others
  if (p.isDead && p.id !== myId) return;

  const screenX = p.x - cameraX;
  const screenY = p.y - cameraY;
  const isMe = p.id === myId;
  const primaryColor = p.color || (isMe ? "#00ccff" : "#ff3333");

  // Emit Particles based on Hero
  if (Math.random() > 0.5) {
    if (p.hero === "Spectre") createParticle(p.x, p.y, "#aa00ff", 2, 20); // Purple Trail
    if (p.hero === "Vanguard" && p.shield)
      createParticle(p.x, p.y, "#00ffff", 3, 30); // Shield Sparks
  }

  ctx.save();

  // --- FLASH EFFECT ON HIT (Highest Priority) ---
  if (p.flashTime > 0) {
    ctx.translate(screenX, screenY);
    ctx.rotate(p.angle + Math.PI / 2);

    // Draw WHITE silhouette
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -30); // Tip
    ctx.lineTo(20, 20);
    ctx.lineTo(-20, 20);
    ctx.fill();

    ctx.restore();
    return; // Skip standard drawing
  }

  // Stealth Handler
  if (p.invisible) {
    if (p.id === myId) {
      ctx.globalAlpha = 0.4; // Visible to self
    } else {
      ctx.globalAlpha = 0; // Invisible to others
    }
  }

  ctx.translate(screenX, screenY);
  ctx.rotate(p.angle + Math.PI / 2);
  // --- DRAW PLAYER SHIP ---
  // Layer 1: Base Hull
  ctx.fillStyle = primaryColor;
  ctx.shadowBlur = 15;
  ctx.shadowColor = primaryColor;

  ctx.beginPath();
  ctx.moveTo(0, -25); // Nose
  ctx.lineTo(20, 20); // Right Rear
  ctx.lineTo(0, 10); // Rear Indent
  ctx.lineTo(-20, 20); // Left Rear
  ctx.closePath();
  ctx.fill();

  // Reset Shadow
  ctx.shadowBlur = 0;

  // Layer 2: Cockpit
  ctx.fillStyle = "#ffffff"; // Glass
  ctx.beginPath();
  ctx.arc(0, 5, 6, 0, Math.PI * 2);
  ctx.fill();

  // Layer 3: Engine Glow (Rear)
  ctx.fillStyle = "#00ffff";
  ctx.beginPath();
  ctx.arc(0, 15, 4 + Math.random() * 2, 0, Math.PI * 2);
  ctx.fill();

  // Continue to Stealth/Laser/Reticle (still in transformed state)

  // --- STEALTH RING INDICATOR (User Request) ---
  if (p.invisible && isMe) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.setLineDash([5, 5]); // Dashed
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; // Visible White Ring
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // DRAW LASER SIGHT (Sniper) - INSIDE drawPlayer or loop
  if (isMe && (p.hero === "Sniper" || p.heroClass === "Sniper")) {
    // Check Cooldown
    if (p.skillCD <= 0) {
      const cx = 0; // Local coordinates (translated)
      const cy = 0;
      const range = 2000;

      // We are already rotated by angle + PI/2
      // So "Forward" is -Y (Up in screen space) relative to rotation?
      // Actually, we are drawing in Player Local Space.
      // drawPlayer translates to X,Y and Rotates.
      // Mouse Angle is absolute.
      // If we draw a line here, it will rotate with player.
      // Line should go "Up" (-Y) relative to player sprite if sprite faces up.

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0); // Center of player
      ctx.lineTo(0, -range); // Draw line "Forward"
      ctx.strokeStyle = "rgba(255, 0, 0, 0.5)"; // Red Laser
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 10]); // Dashed
      ctx.stroke();
      ctx.restore();
    }
  }

  if (isMe) {
    // --- AIM RETICLE ---
    // Draw a direction indicator (Laser Sight / Arrow)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -40); // Much shorter (was -100)
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Aim Dot
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, -40, 3, 0, Math.PI * 2);
    ctx.fill();
    // Arrow Head
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.lineTo(5, -40);
    ctx.lineTo(-5, -40);
    ctx.closePath();
    ctx.fill();
  }

  // Use Class to determine shape if specific hero not defined
  const heroClass = p.heroClass || "Damage";

  // --- POISON AURA (VIPER EFFECT) ---
  if (p.isPoisoned) {
    ctx.save();
    const time = Date.now() / 200;
    ctx.strokeStyle = "#00FF00"; // Bright Green
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;

    // Bubbling Ring
    ctx.beginPath();
    // Radius pulses
    const r = 35 + Math.sin(time) * 3;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Bubbles
    ctx.fillStyle = "#32cd32";
    for (let i = 0; i < 3; i++) {
      const angle = (time + i * 2) % (Math.PI * 2);
      const br = 25;
      const bx = Math.cos(angle) * br;
      const by = Math.sin(angle) * br;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- ACTIVE SKILL AURA (Energy Pulse) ---
  if (p.isSkillActive || p.shield) {
    const time = Date.now() / 1000; // Seconds

    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#FFD700"; // Gold Glow

    // Draw 3 expanding waves
    for (let i = 0; i < 3; i++) {
      // Stagger the waves
      const progress = (time + i * 0.33) % 1; // 0.0 to 1.0

      // Radius expands from 25 to 60
      const radius = 30 + progress * 40;

      // Alpha fades from 0.8 to 0
      const alpha = 0.8 * (1 - progress);

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);

      // Gradient Color: Gold to Cyan
      if (i % 2 === 0) {
        ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`; // Gold
      } else {
        ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`; // Cyan
      }

      ctx.lineWidth = 3 - progress * 2; // Thins out
      ctx.stroke();
    }

    // Core Energy
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
    ctx.fill();

    ctx.restore();
  }

  // --- HERO VISUALS ---
  // Use Class to determine shape if specific hero not defined
  // heroClass already defined above for Aura logic

  if (heroClass === "Tank") {
    // TANK (Hexagon)
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    // Start at Top (-25, 0) logic
    for (let i = 0; i < 6; i++) {
      // Offset angle by -PI/2 to start at Top
      const angle = (i * Math.PI) / 3 - Math.PI / 2;
      ctx.lineTo(25 * Math.cos(angle), 25 * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Shield
    // Shield
    if (p.shield) {
      // CITADEL: 360 Shield if Invincible/Citadel
      if (p.hero === "Citadel") {
        ctx.beginPath();
        ctx.arc(0, 0, 45, 0, Math.PI * 2); // Full Circle
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 5;
        ctx.stroke();
        // Force Field Effect
        ctx.fillStyle = "rgba(0, 255, 255, 0.2)";
        ctx.fill();
      } else {
        // Standard Tank Shield (Frontal)
        ctx.beginPath();
        // Arc centered at Top (-PI/2)
        ctx.arc(0, 0, 45, -Math.PI / 2 - 1, -Math.PI / 2 + 1);
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
  } else if (p.isFrozen) {
    // IMPROVED FREEZE VISUAL (Ice Crystal Overlay)
    // Procedural jagged shape
    ctx.save();
    ctx.beginPath();
    const spikes = 8;
    const outerRadius = 45;
    const innerRadius = 25;

    // Shivering effect
    const shiverX = (Math.random() - 0.5) * 3;
    const shiverY = (Math.random() - 0.5) * 3;
    ctx.translate(shiverX, shiverY);

    for (let i = 0; i < spikes; i++) {
      const step = Math.PI / spikes;
      const rot = (Math.PI / 2) * 3;
      let x = 0;
      let y = 0;

      let ang = i * step * 2 + rot;
      x = Math.cos(ang) * outerRadius;
      y = Math.sin(ang) * outerRadius;
      ctx.lineTo(x, y);

      ang = i * step * 2 + step + rot;
      x = Math.cos(ang) * innerRadius;
      y = Math.sin(ang) * innerRadius;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = "rgba(0, 243, 255, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else if (heroClass === "Speed") {
    // SPEED (Arrow/Dart) - Point UP
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -30); // Tip Top
    ctx.lineTo(20, 20); // Bottom Right
    ctx.lineTo(0, 10); // Center indent
    ctx.lineTo(-20, 20); // Bottom Left
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (heroClass === "Support") {
    // SUPPORT (Box/Medical) - Point UP
    ctx.fillStyle = primaryColor;
    ctx.fillRect(-20, -20, 40, 40); // Base Box
    ctx.fillStyle = "#fff";

    // Cross / Gun pointing UP
    // Vertical bar sticking out top
    ctx.fillRect(-5, -30, 10, 30);
    // Horizontal Cross bar
    ctx.fillRect(-15, -20, 30, 10);

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(-15, -15, 30, 30); // Inner Detail
  } else {
    // DAMAGE / DEFAULT (Triangle) - Point UP
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -30); // Tip Top
    ctx.lineTo(20, 20);
    ctx.lineTo(-20, 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();

  // === UI ELEMENTS ABOVE PLAYER ===
  if (p.invisible && p.id !== myId) return; // Don't show HUD for hidden enemies

  // 1. HP Bar
  ctx.fillStyle = "#333";
  ctx.fillRect(screenX - 30, screenY - 55, 60, 6);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(screenX - 30, screenY - 55, 60 * (p.hp / p.maxHp), 6);

  // 3. Username Tag
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 14px "Segoe UI"';
  ctx.textAlign = "center";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 4;
  ctx.fillText(p.username || p.hero, screenX, screenY - 65);
  ctx.shadowBlur = 0;
  ctx.shadowBlur = 0;
};

const drawLeaderboard = (ctx) => {
  if (!players || players.length === 0) return;

  const sorted = [...players].sort((a, b) => (b.kills || 0) - (a.kills || 0));
  const top5 = sorted.slice(0, 5);

  const boxW = 200;
  const boxH = 30 + top5.length * 25;
  const startX = window.innerWidth - boxW - 20;
  const startY = 100; // Moved down to avoid "EXIT" button overlap

  // Bg
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(startX, startY, boxW, boxH);
  ctx.strokeStyle = "#00f3ff";
  ctx.strokeRect(startX, startY, boxW, boxH);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 16px "Segoe UI"';
  ctx.textAlign = "left";
  ctx.fillText("LEADERBOARD", startX + 10, startY + 20);

  // Rows
  ctx.font = '14px "Segoe UI"';
  top5.forEach((p, i) => {
    const y = startY + 45 + i * 25;
    const name = p.username || p.hero;
    const kills = p.kills || 0;

    // Highlight self
    if (p.id === myId) {
      ctx.fillStyle = "#00ff00";
    } else {
      ctx.fillStyle = "#ccc";
    }

    ctx.fillText(`${i + 1}. ${name}`, startX + 10, y);
    ctx.textAlign = "right";
    ctx.fillText(kills, startX + boxW - 10, y);
    ctx.textAlign = "left";
  });
};

const loop = (ctx) => {
  // Update Camera
  const me = players.find((p) => p.id === myId);
  if (me) {
    const targetX = me.x - window.innerWidth / 2;
    const targetY = me.y - window.innerHeight / 2;
    cameraX += (targetX - cameraX) * 0.1;
    cameraY += (targetY - cameraY) * 0.1;
  }

  // UPDATE & CLEAR
  updateParticles();
  updateShockwaves();

  // Update Shake
  if (shakeDuration > 0) {
    shakeDuration--;
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.9; // Decay
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  // FLASH OVERLAY (Decay)
  if (flashAlpha > 0) {
    flashAlpha -= 0.02;
    if (flashAlpha < 0) flashAlpha = 0;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY); // Apply Shake

  // Draw World
  drawMap(ctx);

  drawShockwaves(ctx);

  // Draw Entities (Mines, Decoys, Black Holes) - BACKGROUND LAYER
  entities.forEach((ent) => {
    // BLACK HOLE (Nova)
    if (ent.type === "BLACK_HOLE") {
      const sx = ent.x - cameraX;
      const sy = ent.y - cameraY;
      ctx.save();
      ctx.translate(sx, sy);

      // BLINKING LOGIC (Using synced life)
      // Removed Opacity Blinking as per user request ("Animation Disappearing")
      // Instead, maybe just pulse the ring color or speed up rotation?
      // For now, keep it solid and stable.

      const time = Date.now() / 1000;
      const radius = 60;

      // 1. PHOTON RING (Glowing White/Blue Halo)
      ctx.shadowBlur = 30;
      ctx.shadowColor = "#e0ffff";
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff"; // Solid White
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset

      // 2. EVENT HORIZON (Pitch Black)
      ctx.beginPath();
      ctx.globalAlpha = 1.0; // Always Solid
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();

      // 3. INNER ACCRETION DISK (Fast, Bright Violet)
      ctx.rotate(time * 2); // Fast Rotation
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        // Inner radius 50
        ctx.arc(
          0,
          0,
          50,
          i * ((Math.PI * 2) / 3),
          i * ((Math.PI * 2) / 3) + 1.5
        );
        ctx.strokeStyle = "#da70d6"; // Orchid/Violet
        ctx.stroke();
      }

      // 4. OUTER ACCRETION DISK (Slow, Darker Purple, Reverse Spin)
      ctx.rotate(-time * 3); // Reverse rotation relative to inner (net effect)
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        // Outer radius 70
        ctx.arc(
          0,
          0,
          70,
          i * ((Math.PI * 2) / 4),
          i * ((Math.PI * 2) / 4) + 1.0
        );
        ctx.strokeStyle = "#9400d3"; // Dark Violet
        ctx.stroke();
      }

      // 5. SUCTION LINES (Cyan/White - Moving Inward)
      // Reset rotation for particles
      ctx.rotate(time); // Just to keep them moving
      if (Math.random() > 0.3) {
        // Draw random line pointing to center
        const angle = Math.random() * Math.PI * 2;
        const outerDist = 120;
        const innerDist = 50;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * outerDist, Math.sin(angle) * outerDist);
        ctx.lineTo(Math.cos(angle) * innerDist, Math.sin(angle) * innerDist);
        ctx.strokeStyle =
          Math.random() > 0.5
            ? "rgba(0, 255, 255, 0.3)"
            : "rgba(255, 0, 255, 0.3)";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1.0;
        ctx.stroke();
      }

      ctx.restore();
    } else if (ent.type === "MINE") {
      const sx = ent.x - cameraX;
      const sy = ent.y - cameraY;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#ff3300";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 12 + Math.sin(Date.now() / 200) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff3300";
      ctx.stroke();
    } else if (ent.type === "WALL_TEMP") {
      const sx = ent.x - cameraX;
      const sy = ent.y - cameraY;
      ctx.fillStyle = "rgba(0, 243, 255, 0.3)";
      ctx.fillRect(sx, sy, ent.w, ent.h);
      ctx.strokeStyle = "#00f3ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, ent.w, ent.h);
    } else if (ent.type === "DECOY") {
      // Draw Decoy (REALISTIC: Identical to real player)
      ctx.save();
      // ctx.globalAlpha = 1.0; // Default opacity for realism
      // Reuse drawPlayer logic
      const fakePlayer = {
        ...ent,
        angle: Math.atan2(ent.vy, ent.vx), // Face movement direction
        hero: ent.heroName,
        heroClass: ent.heroClass,
        shield: false,
        dead: false,
      };
      drawPlayer(ctx, fakePlayer);
      ctx.restore();
    }
  });

  // Draw Projectiles (Bullets) - FOREGROUND LAYER (On top of Black Hole)
  drawProjectiles(ctx);

  // Draw Players
  players.forEach((p) => {
    drawPlayer(ctx, p);
    if (p.flashTime > 0) p.flashTime--; // Decay flash
  });

  // Draw Particles (ON TOP)
  drawParticles(ctx);

  ctx.restore(); // End Shake Translation

  // DRAW FLASH OVERLAY (Post-Shake)
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  }

  // Draw UI Layers
  drawLeaderboard(ctx);

  animationId = requestAnimationFrame(() => loop(ctx));
};
</script>

<template>
  <div class="game-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>

    <!-- Kill Feed -->
    <div class="kill-feed">
      <div v-for="msg in killMessages" :key="msg.id" class="kill-msg">
        {{ msg.text }}
      </div>
    </div>

    <!-- Respawn Overlay -->

    <div class="respawn-overlay" v-if="isDead">
      <h1>YOU DIED</h1>
      <h2 style="color: #ff3333; margin-bottom: 5px">
        ELIMINATED BY {{ killedBy }}
      </h2>
      <h3 style="color: #00f3ff; margin-bottom: 20px">
        HERO: {{ killedByHero }}
      </h3>
      <div class="respawn-timer">{{ respawnTimer }}</div>
      <p>RESPAWNING...</p>
    </div>

    <div class="hud" v-if="!isDead">
      <div class="hud-panel left">
        <h3>HERO: {{ gameStore.selectedHero?.name || "UNKNOWN" }}</h3>
      </div>
      <div class="hud-panel center">
        <h2>NEON ARENA</h2>
      </div>

      <!-- Skill HUD (Clickable on Mobile) -->
      <div
        class="hud-skill"
        v-if="!isMobile"
        @click="triggerSkill"
        @touchstart.prevent="triggerSkill"
      >
        <div
          class="skill-box"
          :class="{
            'active-box': skillCD > maxSkillCD,
            disabled: skillCD > 0 && skillCD <= maxSkillCD,
            'mobile-skill': isMobile,
          }"
        >
          <span class="key-hint">E</span>
          <div class="skill-icon" v-if="skillCD <= 0">SKILL</div>
          <div
            class="cooldown-overlay"
            :class="{ active: skillCD > maxSkillCD }"
            :style="{
              height: Math.min((skillCD / maxSkillCD) * 100, 100) + '%',
            }"
          ></div>
          <div class="cooldown-text active-text" v-if="skillCD > maxSkillCD">
            {{ ((skillCD - maxSkillCD) / 1000).toFixed(1) }}s
          </div>
          <div class="cooldown-text" v-else-if="skillCD > 0">
            {{ (skillCD / 1000).toFixed(1) }}
          </div>
        </div>
      </div>

      <div class="hud-panel right">
        <button @click="router.push('/dashboard')" class="btn-quit">
          ABORT MISSION
        </button>
      </div>
    </div>

    <div class="controls-hint" v-if="!isMobile">
      WASD: Move | MOUSE: Aim | Space: Shoot
    </div>

    <!-- Mobile Controls Containers -->
    <div v-if="isMobile" id="zone-joystick-left" class="joy-zone"></div>
    <div v-if="isMobile" id="zone-joystick-right" class="joy-zone"></div>

    <!-- Mobile Action Buttons -->
    <div v-if="isMobile" class="mobile-actions">
      <div class="skill-btn-wrapper">
        <button
          class="btn-skill-mobile"
          :class="{ ready: skillCD <= 0, cooldown: skillCD > 0 }"
          @touchstart.prevent="triggerSkill"
          @mousedown.prevent="triggerSkill"
        >
          <span v-if="skillCD > 0">{{ (skillCD / 1000).toFixed(0) }}</span>
          <span v-else style="font-size: 1.5rem">⚡</span>
        </button>
      </div>

      <!-- Shoot Button (Large, near right stick) -->
      <button
        class="btn-fire"
        @touchstart.prevent="startShooting"
        @touchend.prevent="stopShooting"
        @mousedown.prevent="startShooting"
        @mouseup.prevent="stopShooting"
      >
        FIRE
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
  overflow: hidden;
}

.kill-feed {
  position: absolute;
  bottom: 180px; /* Above Skill Button (which is ~80px-150px) */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse; /* Stack upwards from bottom */
  align-items: center;
  pointer-events: none;
  z-index: 500;
}

.kill-msg {
  color: #ff0033;
  font-family: "Segoe UI", sans-serif;
  font-size: 14px; /* Much smaller */
  font-weight: 800;
  text-transform: uppercase;
  text-shadow: 0 0 5px rgba(255, 0, 0, 0.8);
  margin-bottom: 2px;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.game-canvas {
  display: block;
}

.hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 80px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  pointer-events: none; /* Let clicks pass through to canvas */
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent);
}

.hud-panel {
  pointer-events: auto;
}

.hud-panel h2 {
  color: var(--primary);
  text-shadow: 0 0 10px var(--primary);
  font-size: 2rem;
  letter-spacing: 5px;
}

.hud-panel h3 {
  color: #fff;
  font-size: 1.2rem;
}

.btn-quit {
  background: rgba(255, 0, 50, 0.2);
  border: 1px solid #ff3333;
  color: #ff3333;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-quit:hover {
  background: #ff3333;
  color: white;
}

.controls-hint {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  letter-spacing: 2px;
  pointer-events: none;
}

.hud-skill {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.respawn-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(20, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 999;
  animation: fadeIn 0.5s;
}

.respawn-overlay h1 {
  color: #ff0033;
  font-size: 5rem;
  letter-spacing: 10px;
  text-shadow: 0 0 20px #ff0033;
  margin-bottom: 2rem;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}

.respawn-timer {
  font-size: 6rem;
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 10px #fff;
}

.respawn-overlay p {
  color: #aaa;
  font-size: 1.5rem;
  letter-spacing: 5px;
  margin-top: 1rem;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.skill-box {
  width: 70px;
  height: 70px;
  background: rgba(10, 10, 20, 0.85); /* Darker, more solid background */
  border: 2px solid #00f3ff;
  border-radius: 12px; /* Smoother corners */
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.4),
    inset 0 0 10px rgba(0, 243, 255, 0.1);
  transition: all 0.2s ease;
}

.skill-box.disabled {
  border-color: #ff3333; /* Red when on cooldown */
  box-shadow: 0 0 10px rgba(255, 51, 51, 0.3);
  background: rgba(20, 0, 0, 0.8);
}

.skill-box.active-box {
  border-color: #ffea00; /* Yellow when Active */
  box-shadow: 0 0 15px rgba(255, 230, 0, 0.6);
  background: rgba(40, 40, 0, 0.8);
}

.key-hint {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 800;
  text-shadow: 0 0 2px #000;
  z-index: 102;
}

.skill-icon {
  font-size: 12px;
  color: #00f3ff;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 0 5px #00f3ff;
  z-index: 102;
}

.skill-box.disabled .skill-icon {
  color: #ff5555;
  text-shadow: 0 0 5px #ff0000;
}

.cooldown-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: rgba(255, 50, 50, 0.3); /* Reddish tint overlay */
  transition: height 0.05s linear;
  z-index: 100;
}

.cooldown-overlay.active {
  background: rgba(255, 230, 0, 0.5); /* Yellow/Gold for Active */
  box-shadow: 0 0 10px rgba(255, 230, 0, 0.5);
}

.cooldown-text {
  position: absolute;
  font-size: 20px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 4px #000;
  z-index: 103;
}

.active-text {
  color: #ffea00;
  text-shadow: 0 0 5px #ffea00;
  font-size: 22px; /* Slightly bigger */
}

/* Mobile Controls CSS */
.joy-zone {
  position: absolute;
  bottom: 0px;
  width: 50%;
  height: 200px;
  height: 200px;
  z-index: 200;
  /* border: 1px solid green; Debug */
}
#zone-joystick-left {
  left: 0;
}
#zone-joystick-right {
  right: 0;
}

.mobile-actions {
  position: absolute;
  bottom: 140px;
  right: 30px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 50px;
}

.btn-fire {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 0, 0, 0.5);
  border: 3px solid #ff3333;
  color: #fff;
  font-weight: bold;
  font-size: 1.2rem;
  box-shadow: 0 0 15px #ff3333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-fire:active {
  background: #ff3333;
  transform: scale(0.95);
}

.btn-skill-mobile {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid #00f3ff;
  color: #00f3ff;
  font-weight: bold;
  font-size: 1.2rem;
  box-shadow: 0 0 10px rgba(0, 243, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-skill-mobile.ready {
  background: rgba(0, 243, 255, 0.2);
  box-shadow: 0 0 15px #00f3ff;
}

.btn-skill-mobile.cooldown {
  border-color: #555;
  color: #aaa;
  box-shadow: none;
}

.btn-skill-mobile:active {
  transform: scale(0.95);
  background: #00f3ff;
  color: #000;
}

.mobile-skill {
  /* Make the skill button pop more on mobile */
  transform: scale(1.2);
  border-color: #00f3ff;
  box-shadow: 0 0 25px rgba(0, 243, 255, 0.6);
}

@media (max-width: 768px) {
  .hud {
    padding: 0 1rem;
    height: 60px;
    background: rgba(0, 0, 0, 0.6);
  }

  .hud-panel h2 {
    font-size: 1.2rem;
    letter-spacing: 2px;
  }

  .hud-panel h3 {
    font-size: 0.8rem;
  }

  .btn-quit {
    padding: 0.3rem 0.6rem;
    font-size: 0.7rem;
  }

  .skill-box {
    width: 60px;
    height: 60px;
    bottom: 20px; /* Move up a bit */
  }

  .controls-hint {
    display: none; /* Hide keyboard hints on mobile */
  }
}
</style>
