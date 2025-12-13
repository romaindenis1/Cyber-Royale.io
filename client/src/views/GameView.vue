<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { io } from "socket.io-client";
import { useGameStore } from "../stores/game";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const gameStore = useGameStore();
const auth = useAuthStore();

const canvasRef = ref(null);
const socket = ref(null);

const skillCD = ref(0);
const maxSkillCD = ref(1);

// Game State
let players = [];
let projectiles = [];
let entities = []; // Mines
let mapData = null;
let animationId;
let cameraX = 0;
let cameraY = 0;
let myId = null;

// Inputs
const keys = { w: false, a: false, s: false, d: false };
let mouseAngle = 0;

// Config
const VIEWPORT_W = window.innerWidth;
const VIEWPORT_H = window.innerHeight;

onMounted(() => {
  if (!gameStore.selectedHeroId) {
    router.push("/dashboard");
    return;
  }

  socket.value = io("http://localhost:3005");

  socket.value.on("connect", () => {
    // Get Skin Color
    const heroId = gameStore.selectedHeroId;
    const skinIdx = gameStore.getSelectedSkin(heroId);
    const hero = gameStore.allHeroes.find((h) => h.id === heroId);
    const skinColor = hero?.skins[skinIdx]?.value || "#ffffff";

    socket.value.emit("join_game", {
      heroId: heroId,
      username: auth.user?.username,
      skinColor: skinColor,
    });
  });

  socket.value.on("game_init", (data) => {
    mapData = data.map;
    myId = data.playerId;
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
    } else {
      // Fallback if player dead or not found
      skillCD.value = 0;
    }
  });

  window.addEventListener("keydown", handleKey);
  window.addEventListener("keyup", handleKey);
  window.addEventListener("mousemove", handleMouse);
  window.addEventListener("keypress", handleSkill);
  window.addEventListener("resize", handleResize);

  const ctx = canvasRef.value.getContext("2d");
  canvasRef.value.width = window.innerWidth;
  canvasRef.value.height = window.innerHeight;

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
  mapData.obstacles.forEach((obs) => {
    const screenX = obs.x - cameraX;
    const screenY = obs.y - cameraY;

    ctx.fillStyle = "#11111a";
    if (obs.type === "CORE") ctx.fillStyle = "#1a1a2e";

    ctx.fillRect(screenX, screenY, obs.w, obs.h);

    // Neon Glow Border
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

// === PARTICLES ===
let particles = [];

const createParticle = (x, y, color, speed, life) => {
  const angle = Math.random() * Math.PI * 2;
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    maxLife: life,
    color,
  });
};

const updateParticles = () => {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
};

const drawParticles = (ctx) => {
  particles.forEach((p) => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y - cameraY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  });
};

const drawProjectiles = (ctx) => {
  projectiles.forEach((p) => {
    // Skip mines here if they are in 'entities' array, usually projectiles are bullets
    if (p.type === "MINE") return;

    const sx = p.x - cameraX;
    const sy = p.y - cameraY;

    ctx.fillStyle = p.color || "#fff";
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Glow
    ctx.shadowColor = p.color || "#fff";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
};

const drawPlayer = (ctx, p) => {
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
  // Stealth Handler
  if (p.invisible) {
    if (p.id === myId) {
      ctx.globalAlpha = 0.4; // Visible to self as ghost
    } else {
      ctx.globalAlpha = 0; // Invisible to others
    }
  }

  ctx.translate(screenX, screenY);
  ctx.rotate(p.angle + Math.PI / 2); // Rotate 90deg so 0rad (Right) becomes Down? No.
  // Facing UP rotated Down = Facing Right. CORRECT.

  // --- HERO VISUALS ---
  // Use Class to determine shape if specific hero not defined
  const heroClass = p.heroClass || "Damage";

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
    if (p.shield) {
      ctx.beginPath();
      // Arc centered at Top (-PI/2)
      ctx.arc(0, 0, 45, -Math.PI / 2 - 1, -Math.PI / 2 + 1);
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  } else if (p.isFrozen) {
    // FROZEN STATUS (Square Block)
    ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
    ctx.fillRect(-25, -25, 50, 50);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.strokeRect(-25, -25, 50, 50);
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
  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  // Draw World
  drawMap(ctx);

  // Draw Particles
  drawParticles(ctx);

  // Draw Projectiles (Bullets)
  drawProjectiles(ctx);

  // Draw Entities (Mines)
  entities.forEach((ent) => {
    // This array contains only mines now
    if (ent.type === "MINE") {
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
    }
  });

  // Draw Players
  players.forEach((p) => drawPlayer(ctx, p));

  animationId = requestAnimationFrame(() => loop(ctx));
};
</script>

<template>
  <div class="game-view">
    <div class="hud">
      <div class="hud-panel left">
        <h3>HERO: {{ gameStore.selectedHero?.name || "UNKNOWN" }}</h3>
      </div>
      <div class="hud-panel center">
        <h2>NEON ARENA</h2>
      </div>

      <!-- Skill HUD -->
      <div class="hud-skill">
        <div
          class="skill-box"
          :class="{
            'active-box': skillCD > maxSkillCD,
            disabled: skillCD > 0 && skillCD <= maxSkillCD,
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

    <canvas ref="canvasRef" class="game-canvas"></canvas>

    <div class="controls-hint">WASD: Move | MOUSE: Aim | Space: Shoot</div>
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
</style>
