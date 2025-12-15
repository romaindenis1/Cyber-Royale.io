const Player = require("./Player");
const { Hero, User } = require("../models");
const MapData = require("./MapData");

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.projectiles = [];
    this.projectiles = [];
    this.entities = []; // Mines, etc.
    this.disconnectedPlayers = new Map(); // Store { username, player, timeout }

    this.io.on("connection", (socket) => {
      console.log("Player connected:", socket.id);

      socket.on("join_game", async ({ heroId, username, skinColor }) => {
        // Fetch hero stats from DB
        try {
          const hero = await Hero.findByPk(heroId);
          if (hero) {
            // Check Reconnection
            let restored = false;
            if (username && username !== "Unknown") {
               const saved = this.disconnectedPlayers.get(username);
               // Check if same Hero
               if (saved && saved.player.hero.id == heroId) {
                 // Restore State
                 clearTimeout(saved.timeout);
                 this.disconnectedPlayers.delete(username);
                 
                 const p = saved.player;
                 const oldId = p.id; // Capture old ID
                 p.id = socket.id; // Update Socket ID
                 p.keys = { w: false, a: false, s: false, d: false, space: false }; // Reset inputs
                 
                 // Transfer ownership of Mines/Projectiles
                 this.entities.forEach(ent => {
                    if (ent.ownerId === oldId) ent.ownerId = socket.id;
                 });
                 this.projectiles.forEach(proj => {
                    if (proj.ownerId === oldId) proj.ownerId = socket.id;
                 });

                 this.players.set(socket.id, p);
                 restored = true;
                 console.log(`Restored session for ${username}`);
               }
            }

            if (!restored) {
               this.players.set(
                socket.id,
                new Player(socket.id, hero.toJSON(), username, skinColor)
               );
               const player = this.players.get(socket.id);
               const spawn = this.getSafeSpawn();
               player.x = spawn.x;
               player.y = spawn.y;
            }
            
            socket.join("game_room");
            // Send initial Game State AND Map Data
            socket.emit("game_init", {
              map: MapData,
              playerId: socket.id,
            });
          }
        } catch (e) {
          console.error(e);
        }
      });

      socket.on("client_input", (inputData) => {
        const player = this.players.get(socket.id);
        if (player) {
          player.keys = inputData.keys;
          player.mouseAngle = inputData.mouseAngle;
        }
      });

      socket.on("skill_trigger", () => {
        const player = this.players.get(socket.id);
        if (player) {
          const result = player.useSkill();
          if (result) {
            const items = Array.isArray(result) ? result : [result];
            items.forEach((item) => {
              if (item.type === "MINE") {
                this.entities.push(item);
                // Mine Lifetime
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
              } else if (item.type === "WALL_TEMP") {
                // Temporary Wall
                this.entities.push(item);
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
              } else if (item.type === "PROJECTILE") {
                this.projectiles.push(item);
              }
            });
          }
        }
      });

      socket.on("disconnect", () => {
        const p = this.players.get(socket.id);
        if (p) {
           this.players.delete(socket.id);
           
           // Save State if User is known
           if (p.username && p.username !== "Unknown") {
              // 15 Seconds Grace Period
              const timeout = setTimeout(() => {
                 this.disconnectedPlayers.delete(p.username);
                 // Cleanup Entities (Mines/Walls) for permanently disconnected player
                 // Remove items owned by the old socket ID
                 for (let i = this.entities.length - 1; i >= 0; i--) {
                    if (this.entities[i].ownerId === socket.id) {
                        this.entities.splice(i, 1);
                    }
                 }
              }, 15000);
              
              this.disconnectedPlayers.set(p.username, {
                 player: p,
                 timeout
              });
           }
        }
      });
    });

    this.startGameLoop();
  }

  startGameLoop() {
    setInterval(() => {
      const dt = 0.03; // 30ms

      const state = {
        players: [],
        entities: this.entities,
        projectiles: this.projectiles,
      };

      // 1. Update Players & Handle Shooting
      this.players.forEach((player) => {
        // Respawn Logic
        if (player.isDead) {
          if (Date.now() > player.respawnTime) {
             // Respawn Now - Restore Stats
             player.isDead = false;
             player.hp = player.maxHp;
             // Coordinates already set at death time
             player.cooldowns.skill = 0;
             player.cooldowns.shoot = 0;
             player.freezeEndTime = 0;
             player.isFrozen = false;
             player.killedBy = null;
             player.killedByHero = null;
          } else {
             // Still dead, send state but skip update

             state.players.push({
                id: player.id,
                x: player.x,
                y: player.y,
                hp: 0, 
                maxHp: player.maxHp,
                hero: player.hero.name,
                heroClass: player.hero.class,
                color: player.color,
                angle: player.mouseAngle,
                shield: false,
                invisible: false,
                isFrozen: false,
                isDead: true,
                killedBy: player.killedBy,
                killedByHero: player.killedByHero,
                respawnTime: player.respawnTime,

                skillCD: 0,
                username: player.username,
                maxSkillCD: player.hero.stats.cooldown,
                kills: player.kills,
             });
             return; 
          }
        }

        player.update(dt);

        // Shoot check
        if (player.keys.space) {
          const proj = player.shoot();
          if (proj) {
            this.projectiles.push(proj);
          }
        }

        state.players.push({
          id: player.id,
          x: player.x,
          y: player.y,
          hp: player.hp,
          maxHp: player.maxHp,
          hero: player.hero.name,
          heroClass: player.hero.class, // Send Class for rendering
          color: player.color, // Send unique color
          angle: player.mouseAngle,
          shield: player.shieldActive,
          invisible: player.isInvisible, // Send stealth state
          isFrozen: player.isFrozen, // Send frozen state
          isPhasing: player.isPhasing,
          rapidFire: player.rapidFire,
          isRooted: player.isRooted,
          isSkillActive: player.isSkillActive,
          freezeEndTime: player.freezeEndTime || 0, // Send freeze end time
          skillCD: player.cooldowns.skill,
          username: player.username, // Send Username
          maxSkillCD: player.hero.stats.cooldown,
          kills: player.kills, // Send Kill Count
        });
      });

      // 2. Update Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1000;

        // Basic Bounds/Lifespan check
        if (p.life <= 0 || p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1200) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Collision with Map Obstacles (Walls)
        let hitWall = false;
        const pRect = { x: p.x - 5, y: p.y - 5, w: 10, h: 10 }; // Approx projectile size
        for (const obs of MapData.obstacles) {
          // Check if bullet overlaps with obstacle
          if (
            pRect.x < obs.x + obs.w &&
            pRect.x + pRect.w > obs.x &&
            pRect.y < obs.y + obs.h &&
            pRect.y + pRect.h > obs.y
          ) {
            hitWall = true;
            break;
          }
        }

        if (hitWall) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Collision check with players
        for (const [id, player] of this.players) {
          if (p.ownerId === id) continue; // Don't hit self
          if (player.isDead) continue; // Ghost Mode: Bullets pass through dead players


          // Simple Circle Collision
          const dx = p.x - player.x;
          const dy = p.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 25) {
            // Collision
            // Check Shield
            if (player.shieldActive) {
              this.projectiles.splice(i, 1);
              hitWall = true;
              break; // Blocked
            }

            // Apply Damage
            let damage = p.damage || 15;

            // FREEZE EFFECT
            if (p.effect === "FREEZE") {
              player.isFrozen = true;
              player.speed = 0;
              player.freezeEndTime = Date.now() + 2000; // Track end time for client animation

              // Clear existing freeze timeout if any (not tracking ID for now, just overwrite)
              setTimeout(() => {
                player.isFrozen = false;
                player.speed = player.baseSpeed;
                player.freezeEndTime = 0;
              }, 2000); // Freeze for 2 seconds
            }

            player.hp -= damage;
            this.projectiles.splice(i, 1);

            // Handle Death
            if (player.hp <= 0) {
              const killer = this.players.get(p.ownerId);
              if (killer) {
                killer.kills++;
                killer.hp = Math.min(killer.maxHp, killer.hp + 50);
                this.awardCoins(killer.username, 50);
                // NOTIFY KILLER
                this.io.to(p.ownerId).emit("kill_confirmed", { victim: player.username || player.hero.name });
              }
              // TRIGGER DEATH
              const deathX = player.x;
              const deathY = player.y;
              player.hp = 0;
              player.isDead = true;
              const kName = killer ? (killer.username || "Unknown") : "Unknown";
              const hName = (killer && killer.hero) ? (killer.hero.name || killer.hero) : "?";
              player.killedBy = kName;
              player.killedByHero = typeof hName === 'string' ? hName : "?";
              player.isFrozen = false; // Clear Frost
              player.freezeEndTime = 0;
              player.respawnTime = Date.now() + 5000; // 5 Seconds
              // Teleport to safe zone immediately (Invisible)
              const spawn = this.getSafeSpawn();
              player.x = spawn.x;
              player.y = spawn.y;
              
              // Explosion Event
              this.io.to("game_room").emit("player_died", { x: deathX, y: deathY, color: player.color });
            }
            break; // Projectile destroyed
          }
        }
      }

      // 3. Update Entities (Mines)
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const ent = this.entities[i];

        // Simple collision with any player (even owner? maybe delay arming? for MVP instant arm)
        for (const [id, player] of this.players) {
          // Optional: Don't hit owner immediately? Let's say mines are dangerous to everyone OR just enemies
          // Optional: Don't hit owner immediately? Let's say mines are dangerous to everyone OR just enemies
          if (ent.ownerId === id) continue;
          if (player.isDead) continue; // Ghost Mode


          const dx = ent.x - player.x;
          const dy = ent.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 30) {
            // Mine radius approx 12 + player 20
            // EXPLODE
            player.hp -= 40; // Big damage
            this.entities.splice(i, 1);

            if (player.hp <= 0) {
              const killer = this.players.get(ent.ownerId);
              if (killer) {
                this.awardCoins(killer.username, 50);
                // NOTIFY KILLER (Mine)
                this.io.to(ent.ownerId).emit("kill_confirmed", { victim: player.username || player.hero.name });
              }
              // TRIGGER DEATH
              const deathX = player.x;
              const deathY = player.y;
              player.hp = 0;
              player.isDead = true;
              const kName = killer ? (killer.username || "Unknown") : "Unknown";
              const hName = (killer && killer.hero) ? (killer.hero.name || killer.hero) : "?";
              player.killedBy = kName;
              player.killedByHero = typeof hName === 'string' ? hName : "?";
              player.isFrozen = false; // Clear Frost
              player.freezeEndTime = 0;
              player.respawnTime = Date.now() + 5000;
              // Teleport to safe zone immediately (Invisible)
              const spawn = this.getSafeSpawn();
              player.x = spawn.x;
              player.y = spawn.y;
              
              // Explosion Event
              this.io.to("game_room").emit("player_died", { x: deathX, y: deathY, color: player.color });
            }
            break;
          }
        }
      }

      // Emit to room
      this.io.to("game_room").emit("server_update", state);
    }, 30);
  }
  async awardCoins(username, amount) {
    try {
      const user = await User.findOne({ where: { username } });
      if (user) {
        user.coins += amount;
        user.kills += 1; // Increment global kill count
        await user.save();
      }
    } catch (e) {
      console.error("Coin reward failed", e);
    }
  }

  getSafeSpawn() {
    let safe = false;
    let x, y;
    let attempts = 0;
    while (!safe && attempts < 100) {
      // Increase edge padding to 100 to avoid border walls
      x = 100 + Math.random() * (MapData.width - 200);
      y = 100 + Math.random() * (MapData.height - 200);

      let collision = false;
      // Increase hitbox check to 80x80 (radius 40 effective) to be very safe
      const pRect = { x: x - 40, y: y - 40, w: 80, h: 80 };

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
      if (!collision) safe = true;
      attempts++;
    }

    // Fallback if 100 attempts failed (should process safe logic or return defaults)
    if (!safe) {
      return { x: 100, y: 100 }; // Default safe corner
    }
    return { x, y };
  }
}

module.exports = GameServer;
