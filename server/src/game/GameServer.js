const Player = require("./Player");
const { Hero, User } = require("../models");
const MapData = require("./MapData");

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.projectiles = [];
    this.entities = []; // Mines, etc.

    this.io.on("connection", (socket) => {
      console.log("Player connected:", socket.id);

      socket.on("join_game", async ({ heroId, username, skinColor }) => {
        // Fetch hero stats from DB
        try {
          const hero = await Hero.findByPk(heroId);
          if (hero) {
            this.players.set(
              socket.id,
              new Player(socket.id, hero.toJSON(), username, skinColor)
            );
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
        this.players.delete(socket.id);
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
          skillCD: player.cooldowns.skill,
          username: player.username, // Send Username
          maxSkillCD: player.hero.stats.cooldown,
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
            let damage = 15;

            // FREEZE EFFECT
            if (p.effect === "FREEZE") {
              player.isFrozen = true;
              player.speed = 0;
              // Clear existing freeze timeout if any (not tracking ID for now, just overwrite)
              setTimeout(() => {
                player.isFrozen = false;
                player.speed = player.baseSpeed;
              }, 2000); // Freeze for 2 seconds
            }

            player.hp -= damage;
            this.projectiles.splice(i, 1);

            // Handle Death
            if (player.hp <= 0) {
              const killer = this.players.get(p.ownerId);
              if (killer) {
                killer.hp = Math.min(killer.maxHp, killer.hp + 50);
                this.awardCoins(killer.username, 50);
              }
              player.hp = player.maxHp;
              player.x = 100 + Math.random() * 1400;
              player.y = 100 + Math.random() * 1000;
              player.cooldowns.skill = 0;
              player.cooldowns.shoot = 0;
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
          if (ent.ownerId === id) continue;

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
              }
              player.hp = player.maxHp;
              player.x = 100 + Math.random() * 1400;
              player.y = 100 + Math.random() * 1000;
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
        await user.save();
      }
    } catch (e) {
      console.error("Coin reward failed", e);
    }
  }
}

module.exports = GameServer;
