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
    this.rapidFire = false; // Fast shooting
  }

  update(dt) {
    // Cooldown tick
    if (this.cooldowns.skill > 0) this.cooldowns.skill -= dt * 1000;
    if (this.cooldowns.shoot > 0) this.cooldowns.shoot -= dt * 1000;

    if (this.isRooted) return; // Skip movement

    // Basic movement logic
    const moveStep = this.speed * dt;
    let newX = this.x;
    let newY = this.y;

    if (this.keys.w) newY -= moveStep;
    if (this.keys.s) newY += moveStep;
    if (this.keys.a) newX -= moveStep;
    if (this.keys.d) newX += moveStep;

    // Check Wall Collisions (Skip if Phasing)
    let collided = false;
    if (!this.isPhasing) {
      const pRect = { x: newX - 20, y: newY - 20, w: 40, h: 40 };
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
    }

    if (!collided) {
      this.x = newX;
      this.y = newY;
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
      color: this.nextShotFreeze ? "#00ffff" : this.color,
      life: 2000,
      effect: this.nextShotFreeze ? "FREEZE" : null,
    };

    // Consume Freeze Shot
    if (this.nextShotFreeze) {
      this.nextShotFreeze = false;
      // Reset cooldown early? No, keep the duration duration.
      // Actually, user wants timer to show duration. If shot is consumed, duration effectively ends?
      // Let's stick to the 5s window. If shot, it's used.
      // If I want the "Active" bar to disappear when shot is fired, I should reduce the CD.
      // But for now, let's keep it simple.
    }
  }

  useSkill() {
    if (this.cooldowns.skill > 0) return;
    this.cooldowns.skill = this.hero.stats.cooldown;
    const name = this.hero.name;

    // === TANK ===
    if (name === "Vanguard") {
      this.cooldowns.skill += 3000; // Duration added
      this.shieldActive = true;
      setTimeout(() => (this.shieldActive = false), 3000);
    } else if (name === "Titan") {
      this.cooldowns.skill += 5000;
      // Juggernaut: Heal + Temp HP + Slow
      this.hp = Math.min(this.hp + 200, this.maxHp + 200);
      this.speed = this.baseSpeed * 0.5;
      setTimeout(() => {
        this.speed = this.baseSpeed;
      }, 5000);
    } else if (name === "Brawler") {
      this.cooldowns.skill += 3000;
      // Berserker: Rapid Fire + Speed
      this.rapidFire = true;
      this.speed = this.baseSpeed * 1.5;
      setTimeout(() => {
        this.rapidFire = false;
        this.speed = this.baseSpeed;
      }, 3000);
    } else if (name === "Goliath") {
      this.cooldowns.skill += 3000;
      // Fortress: Root + Invuln + Heal
      this.isRooted = true;
      this.shieldActive = true;

      // HoT (Heal over Time) simulated by big chunk
      this.hp = Math.min(this.maxHp, this.hp + 100);

      setTimeout(() => {
        this.isRooted = false;
        this.shieldActive = false;
      }, 3000);
    }

    // === SPEED ===
    else if (name === "Spectre") {
      // Blink (Instant)
      const dist = 300;
      this.x += Math.cos(this.mouseAngle) * dist;
      this.y += Math.sin(this.mouseAngle) * dist;
      // Clamp
      this.x = Math.max(0, Math.min(MapData.width, this.x));
      this.y = Math.max(0, Math.min(MapData.height, this.y));
    } else if (name === "Volt") {
      this.cooldowns.skill += 2500;
      // Overload
      this.speed = this.baseSpeed * 2.5;
      setTimeout(() => (this.speed = this.baseSpeed), 2500);
    } else if (name === "Ghost") {
      this.cooldowns.skill += 3000;
      // Phase
      this.isPhasing = true;
      setTimeout(() => (this.isPhasing = false), 3000);
    }

    // === DAMAGE ===
    else if (name === "Blaze") {
      this.cooldowns.skill += 3000;
      // Rapid Fire
      this.rapidFire = true;
      setTimeout(() => (this.rapidFire = false), 3000);
    } else if (name === "Frost") {
      this.cooldowns.skill += 5000;
      // Freeze Shot: Next shot freezes enemy
      this.nextShotFreeze = true;
      setTimeout(() => {
        this.nextShotFreeze = false;
      }, 5000); // 5 seconds to take the shot
    } else if (name === "Sniper") {
      // Railgun Shot (Instant)
      const speed = 2000;
      return {
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
      return projs;
    }

    // === SUPPORT ===
    else if (name === "Techno") {
      return { type: "MINE", x: this.x, y: this.y, ownerId: this.id };
    } else if (name === "Engineer") {
      this.cooldowns.skill += 5000;
      // Force Field Wall
      const wx = this.x + Math.cos(this.mouseAngle) * 50;
      const wy = this.y + Math.sin(this.mouseAngle) * 50;
      return {
        type: "WALL_TEMP",
        x: wx - 40,
        y: wy - 10,
        w: 80,
        h: 20,
        life: 5000,
        angle: this.mouseAngle,
      };
    } else if (name === "Medic") {
      // Self Heal (Instant)
      this.hp = Math.min(this.maxHp, this.hp + 100);
    }
  }
}

module.exports = Player;
