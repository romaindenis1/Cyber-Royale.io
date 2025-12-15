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

    // Fire rate: 0.3s normally, 0.05s if Rapid Fire
    this.cooldowns.shoot = this.rapidFire ? 60 : 300;

    const speed = 600;
    const vx = Math.cos(this.mouseAngle) * speed;
    const vy = Math.sin(this.mouseAngle) * speed;
    const spawnX = this.x + Math.cos(this.mouseAngle) * 30;
    const spawnY = this.y + Math.sin(this.mouseAngle) * 30;

    return {
      id: Math.random().toString(36).substr(2, 9),
      x: spawnX,
      y: spawnY,
      vx,
      vy,
      ownerId: this.id,
      color: this.freezeShotsActive ? "#00ffff" : this.color,
      life: 2000,
      effect: this.freezeShotsActive ? "FREEZE" : null,
      // damage: 15 (Default handled by server if omitted)
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
      duration = 3000;
      this.rapidFire = true;
      this.speed = this.baseSpeed * 1.5;
      setTimeout(() => {
        this.rapidFire = false;
        this.speed = this.baseSpeed;
      }, 3000);
    } else if (name === "Goliath") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      this.isRooted = true;
      this.shieldActive = true;
      this.hp = Math.min(this.maxHp, this.hp + 100);
      setTimeout(() => {
        this.isRooted = false;
        this.shieldActive = false;
      }, 3000);
    }

    // === SPEED ===
    else if (name === "Spectre") {
      duration = 500;

      // Blink (Instant) - Safe Logic
      const maxDist = 300;
      let targetX = this.x + Math.cos(this.mouseAngle) * maxDist;
      let targetY = this.y + Math.sin(this.mouseAngle) * maxDist;
      
      // Raycast back if hitting wall
      let steps = 10;
      let safe = false;
      
      for(let i=0; i<=steps; i++) {
        // Linear interpolation from Target back to Origin
        const factor = 1 - (i / steps); // 1.0, 0.9, ... 0.0
        const mx = this.x + (targetX - this.x) * factor;
        const my = this.y + (targetY - this.y) * factor;
        
        let collision = false;
        const pRect = { x: mx - 20, y: my - 20, w: 40, h: 40 };
        for (const obs of MapData.obstacles) {
             if (
               pRect.x < obs.x + obs.w &&
               pRect.x + pRect.w > obs.x &&
               pRect.y < obs.y + obs.h &&
               pRect.y + pRect.h > obs.y
             ) {
               collision = true;
               break;
             }
        }
        
        if (!collision) {
             this.x = mx;
             this.y = my;
             safe = true;
             break;
        }
      }
      // If never safe (shouldn't happen since origin is safe), stay put
      
      // Clamp
      this.x = Math.max(0, Math.min(MapData.width, this.x));
      this.y = Math.max(0, Math.min(MapData.height, this.y));
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
        damage: 60,
      };
    } else if (name === "Shadow") {
      this.cooldowns.skill += 5000;
      // Stealth
      this.isInvisible = true;
      setTimeout(() => (this.isInvisible = false), 5000);
    } else if (name === "Nova") {
      duration = 500;
      // Nova Blast (Instant)
      const projs = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        projs.push({
          type: "PROJECTILE",
          id: Math.random().toString(36).substr(2, 9),
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * 500,
          vy: Math.sin(angle) * 500,
          ownerId: this.id,
          color: this.color,
          life: 1000,
        });
      }
      result = projs;
    }

    // === SUPPORT ===
    else if (name === "Techno") {
      duration = 500;
      result = { type: "MINE", x: this.x, y: this.y, ownerId: this.id, life: 6000 };
    } else if (name === "Engineer") {
      this.cooldowns.skill += 5000;
      duration = 5000;
      // Force Field Wall
      const wx = this.x + Math.cos(this.mouseAngle) * 50;
         /// ... existing ...
      const wy = this.y + Math.sin(this.mouseAngle) * 50;
      result = {
        type: "WALL_TEMP",
    //...
        x: wx - 40,
        y: wy - 10,
        w: 80,
        h: 20,
        life: 5000,
        angle: this.mouseAngle,
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
      { x: 0, y: -50 }, { x: 0, y: 50 }, { x: -50, y: 0 }, { x: 50, y: 0 },
      { x: 50, y: 50 }, { x: -50, y: -50 }, { x: 50, y: -50 }, { x: -50, y: 50 },
      { x: 0, y: -100 }, { x: 0, y: 100 }, { x: -100, y: 0 }, { x: 100, y: 0 }
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
