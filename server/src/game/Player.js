const MapData = require("./MapData");

class Player {
  constructor(id, heroData, username, customColor) {
    this.id = id;
    this.hero = heroData; // { id, name, stats: { hp, speed, cooldown } }
    this.username = username || "Unknown"; // Store username
    this.x = 400; // Center
    this.y = 300;
    this.hp = heroData.stats.hp;
    this.maxHp = heroData.stats.hp;
    this.baseSpeed = heroData.stats.speed;
    this.speed = this.baseSpeed;
    this.kills = 0; // Track match kills

    // Unique Neon Color or Custom Skin
    if (customColor) {
      this.color = customColor;
    } else {
      const hues = [0, 60, 120, 180, 240, 300];
      const randomHue =
        hues[Math.floor(Math.random() * hues.length)] +
        Math.floor(Math.random() * 40 - 20);
      this.color = `hsl(${randomHue}, 100%, 50%)`;
    }

    this.keys = { w: false, a: false, s: false, d: false, space: false };
    this.mouseAngle = 0;
    this.cooldowns = { skill: 0, shoot: 0 };

    // STATES
    this.shieldActive = false;
    this.isPhasing = false; // Walk through walls
    this.isInvisible = false;
    this.isRooted = false; // Cannot move
    this.isRooted = false; // Cannot move
    this.isRooted = false; // Cannot move
    this.rapidFire = false; // Fast shooting
    this.isSkillActive = false; // Visual Aura Flag
    this.freezeShotsActive = false; // Frost skill duration flag
  }

  update(dt) {
    // Cooldown tick
    if (this.cooldowns.skill > 0) this.cooldowns.skill -= dt * 1000;
    if (this.cooldowns.shoot > 0) this.cooldowns.shoot -= dt * 1000;

    if (this.isRooted) return; // Skip movement

    // Basic movement logic
    // Basic movement logic
    const moveStep = this.speed * dt;

    // --- X AXIS MOVEMENT ---
    let dx = 0;
    if (this.keys.a) dx -= moveStep;
    if (this.keys.d) dx += moveStep;

    if (dx !== 0) {
      const nextX = this.x + dx;
      let colX = false;
      if (!this.isPhasing) {
        const pRect = { x: nextX - 20, y: this.y - 20, w: 40, h: 40 };
        for (const obs of MapData.obstacles) {
          if (
            pRect.x < obs.x + obs.w &&
            pRect.x + pRect.w > obs.x &&
            pRect.y < obs.y + obs.h &&
            pRect.y + pRect.h > obs.y
          ) {
            colX = true;
            break;
          }
        }
      }
      if (!colX) this.x = nextX;
    }

    // --- Y AXIS MOVEMENT ---
    let dy = 0;
    if (this.keys.w) dy -= moveStep;
    if (this.keys.s) dy += moveStep;

    if (dy !== 0) {
      const nextY = this.y + dy;
      let colY = false;
      if (!this.isPhasing) {
        const pRect = { x: this.x - 20, y: nextY - 20, w: 40, h: 40 };
        for (const obs of MapData.obstacles) {
          if (
            pRect.x < obs.x + obs.w &&
            pRect.x + pRect.w > obs.x &&
            pRect.y < obs.y + obs.h &&
            pRect.y + pRect.h > obs.y
          ) {
            colY = true;
            break;
          }
        }
      }
      if (!colY) this.y = nextY;
    }

    // Clamp to map
    this.x = Math.max(0, Math.min(MapData.width, this.x));
    this.y = Math.max(0, Math.min(MapData.height, this.y));
  }

  shoot() {
    if (this.cooldowns.shoot > 0 || this.isFrozen) return null;

    // Fire rate: 0.3s normally
    // Blaze: 0.05s (Super Fast)
    // Brawler/Others: 0.15s (Moderate)
    let rapidDelay = this.hero.name === "Blaze" ? 50 : 150;
    this.cooldowns.shoot = this.rapidFire ? rapidDelay : 300;

    const spawnX = this.x + Math.cos(this.mouseAngle) * 30;
    const spawnY = this.y + Math.sin(this.mouseAngle) * 30;

    // KAMIKAZE: Sticky Grenade Attack
    if (this.hero.name === "Kamikaze") {
      // Sticky Grenade
      // Stats Tuned: Slower (400), Lower Damage (75), Bigger (radius handled in server/client)
      const speed = 400;
      return {
        type: "STICKY_GRENADE",
        id: Math.random().toString(36).substr(2, 9),
        x: spawnX,
        y: spawnY,
        vx: Math.cos(this.mouseAngle) * speed,
        vy: Math.sin(this.mouseAngle) * speed,
        ownerId: this.id,
        life: 2000,
        damage: 50, // Reduced from 75 (User Feedback)
        attachedTo: null,
        radius: 100, // Explosion Radius
        hitbox: 20, // Collision Hitbox
        color: "#ff0000", // Red (User Request)
      };
    }

    const speed = 600;
    const vx = Math.cos(this.mouseAngle) * speed;
    const vy = Math.sin(this.mouseAngle) * speed;

    return {
      id: Math.random().toString(36).substr(2, 9),
      x: spawnX,
      y: spawnY,
      vx,
      vy,
      ownerId: this.id,
      color: this.freezeShotsActive ? "#00ffff" : this.color,
      effect: this.freezeShotsActive ? "FREEZE" : null,
      damage: this.damageBuff ? 30 : this.minesActive ? 60 : 15, // Mines high damage
      type: this.minesActive ? "MINE_PROJ" : "PROJECTILE",
      friction: this.minesActive ? true : false, // Logic flag for friction
      life: this.minesActive ? 12000 : 2000,
    };
  }

  useSkill() {
    if (this.cooldowns.skill > 0) return;
    this.cooldowns.skill = this.hero.stats.cooldown;
    const name = this.hero.name;

    // Generic: Set Active Flag
    this.isSkillActive = true;
    let duration = 0;

    let result = null;

    // === TANK ===
    if (name === "Vanguard") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      this.shieldActive = true;
      setTimeout(() => (this.shieldActive = false), 3000);
    } else if (name === "Titan") {
      this.cooldowns.skill += 5000;
      duration = 5000;
      this.hp = Math.min(this.hp + 200, this.maxHp + 200);
      this.speed = this.baseSpeed * 0.5;
      setTimeout(() => {
        this.speed = this.baseSpeed;
      }, 5000);
    } else if (name === "Brawler") {
      this.cooldowns.skill += 3000;
      duration = 2000; // Nerfed Duration
      this.rapidFire = true;
      this.speed = this.baseSpeed * 1.3;
      setTimeout(() => {
        this.rapidFire = false;
        this.speed = this.baseSpeed;
      }, 2000);
    } else if (name === "Goliath") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      this.shieldActive = true;
      this.hp = Math.min(this.maxHp, this.hp + 100);
      setTimeout(() => {
        // this.isRooted = false; // Removed Root
        this.shieldActive = false;
      }, 3000);
    }

    // === SPEED ===
    else if (name === "Spectre") {
      duration = 750;
      this.cooldowns.skill += 4000;
      // Phantom Dash: High Speed + Wall Phasing
      this.speed = this.baseSpeed * 3.5;
      this.isPhasing = true; // Pass through walls
      setTimeout(() => {
        this.speed = this.baseSpeed;
        this.isPhasing = false;
        this.checkUnstuck(); // Ensure not stuck in wall
      }, 750);
    } else if (name === "Volt") {
      this.cooldowns.skill += 2500;
      duration = 2500;
      // Overload
      this.speed = this.baseSpeed * 2.5;
      setTimeout(() => (this.speed = this.baseSpeed), 2500);
    } else if (name === "Ghost") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      // Phase
      this.isPhasing = true;
      setTimeout(() => {
        this.isPhasing = false;
        this.checkUnstuck();
      }, 3000);
    }

    // === DAMAGE ===
    else if (name === "Blaze") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      // Rapid Fire
      this.rapidFire = true;
      setTimeout(() => (this.rapidFire = false), 3000);
    } else if (name === "Frost") {
      this.cooldowns.skill += 5000;
      duration = 5000;
      // Freeze Shot: All shots freeze for 5s
      this.freezeShotsActive = true;
      setTimeout(() => {
        this.freezeShotsActive = false;
      }, 5000);
    } else if (name === "Sniper") {
      duration = 500;
      // Railgun Shot (Instant)

      const speed = 2000;
      result = {
        type: "PROJECTILE",
        id: Math.random().toString(36).substr(2, 9),
        x: this.x,
        y: this.y,
        vx: Math.cos(this.mouseAngle) * speed,
        vy: Math.sin(this.mouseAngle) * speed,
        ownerId: this.id,
        color: "#fff",
        life: 3000,
        damage: 1000, // One Shot
        penetrateWalls: true, // Wall Hack
      };
    } else if (name === "Shadow") {
      this.cooldowns.skill += 5000;
      // Stealth
      this.isInvisible = true;
      setTimeout(() => (this.isInvisible = false), 5000);
    } else if (name === "Nova") {
      duration = 500;
      // Black Hole Shot
      // Fires a projectile that travels, stops, and becomes a Black Hole
      result = {
        type: "BLACK_HOLE_SHOT",
        id: Math.random().toString(36).substr(2, 9),
        x: this.x,
        y: this.y,
        vx: Math.cos(this.mouseAngle) * 600,
        vy: Math.sin(this.mouseAngle) * 600,
        ownerId: this.id,
        life: 1000, // Travels for 1s
        targetX: this.x + Math.cos(this.mouseAngle) * 600, // Optional help?
        targetY: this.y + Math.sin(this.mouseAngle) * 600,
      };
    }

    // --- NEW HEROES (EXPANSION) ---
    else if (name === "Citadel") {
      duration = 3000;
      // Fortress Mode: Invincible but Immobile
      this.isInvincible = true;
      this.speed = 0;
      this.shieldActive = true;
      setTimeout(() => {
        this.isInvincible = false;
        // this.speed = this.baseSpeed; // REMOVED Immobility
        this.shieldActive = false;
      }, 3000);
    } else if (name === "Magma") {
      duration = 500;
      // Lava Wave: 3 Projectiles Fan
      const projs = [];
      const fanAngle = 0.3; // Spread
      for (let i = -1; i <= 1; i++) {
        const angle = this.mouseAngle + i * fanAngle;
        projs.push({
          type: "LAVA_WAVE",
          id: Math.random().toString(36).substr(2, 9),
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * 700,
          vy: Math.sin(angle) * 700,
          ownerId: this.id,
          damage: 80,
          life: 1500, // Short range wave
          maxLife: 1500, // For Scaling
          penetrateEnemies: true,
        });
      }
      result = projs;
    } else if (name === "Storm") {
      duration = 500;
      // Overload: 16 Lightning Bolts (Buffed)
      const projs = [];
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        projs.push({
          type: "PROJECTILE",
          id: Math.random().toString(36).substr(2, 9),
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * 800, // Faster
          vy: Math.sin(angle) * 800,
          ownerId: this.id,
          color: "#ffff00",
          life: 1000,
        });
      }
      result = projs;
    } else if (name === "Viper") {
      duration = 5000;
      // Venom: Poisonous shots
      this.isPoisonous = true;
      setTimeout(() => (this.isPoisonous = false), 5000);
    } else if (name === "Mirage") {
      duration = 4000;
      // Decoy: Spawn a fake player and go invisible
      this.isInvisible = true;
      this.speed = this.baseSpeed * 1.5;
      setTimeout(() => {
        this.isInvisible = false;
        this.speed = this.baseSpeed;
      }, 4000);

      result = {
        type: "DECOY",
        x: this.x,
        y: this.y,
        ownerId: this.id,
        heroName: this.hero.name,
        heroClass: this.hero.class,
        username: this.username || "Unknown", // FAKE NAME
        hp: this.hp, // FAKE HP (Visual)
        maxHp: this.maxHp,
        color: this.color,
        vx: Math.cos(this.mouseAngle) * this.baseSpeed,
        vy: Math.sin(this.mouseAngle) * this.baseSpeed,
        life: 3000,
      };
    } else if (name === "Jumper") {
      duration = 500;
      // Blink (Same as Spectre)
      const maxDist = 350; // Further than Spectre
      let targetX = this.x + Math.cos(this.mouseAngle) * maxDist;
      let targetY = this.y + Math.sin(this.mouseAngle) * maxDist;

      // Simple Wall Check (Reuse Spectre logic logic if possible, but copying for safety)
      // ... (Simplified check: Clamp to map)
      this.x = Math.max(0, Math.min(MapData.width, targetX));
      this.y = Math.max(0, Math.min(MapData.height, targetY));
    } else if (name === "Kamikaze") {
      // Suicide Skill
      // result = { type: "SUICIDE" }; // Handled by GameServer
      return { type: "SUICIDE" };
    }

    // === SUPPORT ===
    else if (name === "Techno") {
      duration = 3000;
      this.cooldowns.skill += 3000;
      // Buff: Speed + Shoot Mines
      this.minesActive = true; // Flag for shoot()
      this.speed = this.baseSpeed * 1.5;
      setTimeout(() => {
        this.minesActive = false;
        this.speed = this.baseSpeed;
      }, 3000);
      // result = ... REMOVED Drop Mine
      result = null; // No immediate effect, just buff
    } else if (name === "Engineer") {
      this.cooldowns.skill += 5000;
      duration = 5000;
      // Force Field Wall
      const wx = this.x + Math.cos(this.mouseAngle) * 50;
      const wy = this.y + Math.sin(this.mouseAngle) * 50;

      // Fix: Ensure object is returned correctly
      result = {
        type: "WALL_TEMP",
        ownerId: this.id,
        x: wx - 40,
        y: wy - 10,
        w: 80,
        h: 20,
        life: 5000,
        angle: this.mouseAngle, // Just store, server uses AABB so angle visual only
      };
    } else if (name === "Medic") {
      duration = 500;
      // Self Heal (Instant)
      this.hp = Math.min(this.maxHp, this.hp + 100);
    }

    // === COMMON AURA LOGIC ===
    if (duration > 0 && name !== "Shadow") {
      setTimeout(() => {
        this.isSkillActive = false;
      }, duration);
    } else if (name !== "Shadow") {
      this.isSkillActive = false;
    } else {
      // Shadow: ensure false
      this.isSkillActive = false;
    }

    return result;
  }
  checkUnstuck() {
    // 1. Check if currently inside wall
    let collided = false;
    const pRect = { x: this.x - 20, y: this.y - 20, w: 40, h: 40 };

    for (const obs of MapData.obstacles) {
      if (
        pRect.x < obs.x + obs.w &&
        pRect.x + pRect.w > obs.x &&
        pRect.y < obs.y + obs.h &&
        pRect.y + pRect.h > obs.y
      ) {
        collided = true;
        break;
      }
    }

    if (!collided) return; // All good

    // 2. Try to find a safe spot nearby (Spiral Search)
    const offsets = [
      { x: 0, y: -50 },
      { x: 0, y: 50 },
      { x: -50, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: -50, y: 50 },
      { x: 0, y: -100 },
      { x: 0, y: 100 },
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ];

    for (const off of offsets) {
      const testX = this.x + off.x;
      const testY = this.y + off.y;
      const testRect = { x: testX - 20, y: testY - 20, w: 40, h: 40 };
      let safe = true;

      for (const obs of MapData.obstacles) {
        if (
          testRect.x < obs.x + obs.w &&
          testRect.x + testRect.w > obs.x &&
          testRect.y < obs.y + obs.h &&
          testRect.y + testRect.h > obs.y
        ) {
          safe = false;
          break;
        }
      }

      if (safe) {
        // Teleport to safe spot
        this.x = testX;
        this.y = testY;
        return;
      }
    }

    // 3. Fallback: Safety Spawn (Don't Kill)
    // If deep stuck, warp to map center or default spawn
    this.x = 400;
    this.y = 300;
  }
}

module.exports = Player;
