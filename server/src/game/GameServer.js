const Player = require("./Player");
const { Hero, User } = require("../models");
const MapData = require("./MapData");
const jwt = require("jsonwebtoken");

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.projectiles = [];
    this.projectiles = [];
    this.entities = []; // Mines, etc.
    this.map = MapData; // Initialize Map
    this.disconnectedPlayers = new Map(); // Store { username, player, timeout }

    this.io.on("connection", (socket) => {
      console.log("Player connected:", socket.id);

      socket.on("join_game", async ({ heroId, username, skinColor, token }) => {
        // SECURITY: Verify Token to prevent Username Spoofing via LocalStorage
        if (token) {
          try {
            // DEBUG LOGGING
            // console.log("Verifying token:", token.substring(0, 10) + "...");
            const decoded = jwt.verify(
              token,
              process.env.JWT_SECRET || "default_secret_key"
            );

            if (decoded && decoded.id) {
              // Token contains { id: ... } (See auth.js)
              // We must fetch the User to get the Username
              const dbUser = await User.findByPk(decoded.id);
              if (dbUser) {
                username = dbUser.username;
                console.log(`[AUTH] Verified user via Token ID: ${username}`);
              } else {
                console.warn("[AUTH] Token valid but user ID not found in DB");
                username = "Unknown";
              }
            } else if (decoded && decoded.username) {
              // Fallback for legacy tokens if any
              username = decoded.username;
            }
          } catch (err) {
            console.warn(
              `[AUTH] Invalid Token for ${socket.id}: ${err.message}`
            );
            username = "Unknown"; // Force Guest
          }
        } else {
          username = "Unknown"; // No Token = Guest
        }

        // SECURITY: Prevent Hero Switching while active
        // SECURITY: Prevent Hero Switching while active
        if (this.players.has(socket.id)) {
          return;
        }

        // Fetch hero stats from DB
        try {
          let hero = await Hero.findByPk(heroId);

          // SECURITY: Verify Ownership (Strict)
          let isAllowed = false;
          let user = null; // Declare in wider scope

          if (hero && hero.price === 0) {
            isAllowed = true; // Free heroes are always allowed
          } else if (hero && username && username !== "Unknown") {
            user = await User.findOne({
              where: { username },
              include: [{ model: Hero, as: "unlockedHeroes" }],
            });

            if (user) {
              // Check if user actually owns this paid hero
              if (user.unlockedHeroes.some((h) => h.id === hero.id)) {
                isAllowed = true;
              }
            }
          }

          if (hero && !isAllowed) {
            console.warn(
              `[SECURITY] User ${username} tried to use unauthorized hero ${hero.name}.`
            );

            // Fallback Logic: Try "Previous/Equipped" Hero
            let fallbackHeroId = 1; // Default
            if (user && user.equippedHeroId) {
              // Verify user owns their equipped hero too (sanity check)
              if (!user.unlockedHeroes) {
                // Re-check if needed, but we have it from include above
                // Should be loaded
              }
              // Check if equippedHeroId is valid owned hero
              if (
                user.unlockedHeroes.some((h) => h.id === user.equippedHeroId)
              ) {
                fallbackHeroId = user.equippedHeroId;
                console.log(
                  `[SECURITY] Reverting to Last Equipped Valid Hero (ID: ${fallbackHeroId})`
                );
              }
            }

            hero = await Hero.findByPk(fallbackHeroId);
            if (!hero) hero = await Hero.findOne({ where: { price: 0 } });
          }

          if (hero) {
            // Check Reconnection
            let restored = false;
            if (username && username !== "Unknown") {
              const saved = this.disconnectedPlayers.get(username);
              // Check if same Hero (Use verified hero.id)
              if (saved && saved.player.hero.id == hero.id) {
                // Restore State
                clearTimeout(saved.timeout);
                this.disconnectedPlayers.delete(username);

                const p = saved.player;
                const oldId = p.id; // Capture old ID
                p.id = socket.id; // Update Socket ID
                p.keys = {
                  w: false,
                  a: false,
                  s: false,
                  d: false,
                  space: false,
                }; // Reset inputs

                // Transfer ownership of Mines/Projectiles
                this.entities.forEach((ent) => {
                  if (ent.ownerId === oldId) ent.ownerId = socket.id;
                });
                this.projectiles.forEach((proj) => {
                  if (proj.ownerId === oldId) proj.ownerId = socket.id;
                });

                this.players.set(socket.id, p);
                restored = true;
                console.log(`Restored session for ${username}`);
              }
            }

            if (!restored) {
              // UNIQUE USERNAME CHECK (Security)
              // Iterate existing players to find duplicates
              for (const [pid, p] of this.players) {
                if (p.username === username) {
                  // Found a duplicate! Kick the OLD active player.
                  // This prevents "stuck" names and allows the user to re-login.
                  const oldSocket = this.io.sockets.sockets.get(pid);
                  if (oldSocket) {
                    oldSocket.emit(
                      "error_message",
                      "Logged in from another location."
                    );
                    oldSocket.disconnect(true);
                  }
                  this.players.delete(pid);
                }
              }

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
            // KAMIKAZE SUICIDE
            if (result.type === "SUICIDE") {
              this.handleDeath(player, null);
              return;
            }

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
              } else if (
                item.type === "PROJECTILE" ||
                item.type === "LAVA_WAVE" ||
                item.type === "BLACK_HOLE_SHOT"
              ) {
                this.projectiles.push(item);
              } else if (item.type === "DECOY") {
                this.entities.push(item);
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
              } else if (item.type === "SHOCKWAVE") {
                // Immediate AoE Effect
                for (const [pid, p] of this.players) {
                  if (pid === item.ownerId) continue;
                  if (p.isDead) continue;

                  const dx = p.x - item.x;
                  const dy = p.y - item.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < item.radius) {
                    // Apply Knockback
                    const angle = Math.atan2(dy, dx);
                    const force = item.knockback;

                    // Simple wall collision check for knockback (optional, but good for stability)
                    let nx = p.x + Math.cos(angle) * force;
                    let ny = p.y + Math.sin(angle) * force;

                    // Update Position
                    p.x = Math.max(0, Math.min(1600, nx));
                    p.y = Math.max(0, Math.min(1200, ny));

                    // Apply Damage
                    p.hp -= item.damage;

                    // Check Death (Reuse death logic or let main loop handle it? Main loop handles it safer)
                    // But we want kill credit immediately if possible.
                    // For simplicity, let the main loop cleanup 'hp <= 0'
                    if (p.hp <= 0) {
                      const killer = this.players.get(item.ownerId);
                      if (killer) {
                        killer.kills++;
                        killer.hp = Math.min(killer.maxHp, killer.hp + 50);
                        this.awardCoins(killer.username, 50);
                        this.io.to(item.ownerId).emit("kill_confirmed", {
                          victim: p.username || p.hero.name,
                        });
                        p.killedBy = killer.username;
                        p.killedByHero = killer.hero.name;
                      }
                    }
                  }
                }
                // Emulate Visual Explosion
                this.io.emit("visual_effect", {
                  type: "shockwave",
                  x: item.x,
                  y: item.y,
                  radius: item.radius,
                  color: item.color,
                });
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
              timeout,
            });
          }
        }
      });
    });

    this.startGameLoop();
  }

  handleDeath(player, killer) {
    if (player.isDead) return;

    player.hp = 0;
    player.isDead = true;

    // Notify Killer
    if (killer) {
      killer.kills++;
      killer.hp = Math.min(killer.maxHp, killer.hp + 50);
      this.awardCoins(killer.username, 50);
      this.io.to(killer.id).emit("kill_confirmed", {
        victim: player.username || player.hero.name,
      });
      player.killedBy = killer.username || "Unknown";
      player.killedByHero = killer.hero.name || "Unknown";
    } else {
      player.killedBy = "Yourself";
      player.killedByHero = "?";
    }

    player.isFrozen = false;
    player.freezeEndTime = 0;

    // Kamikaze Respawn Timer: 5s (Default)
    player.respawnTime = Date.now() + 5000;

    // Death Event
    this.io.to("game_room").emit("player_died", {
      x: player.x,
      y: player.y,
      color: player.color,
    });

    // KAMIKAZE DEATH EXPLOSION
    if (player.hero.name === "Kamikaze") {
      this.createShockwave(player.id, player.x, player.y, 200, 200, "#ff0000"); // 200 Dmg, 200 Radius
    }

    // Teleport to safe zone
    const spawn = this.getSafeSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
  }

  createShockwave(ownerId, x, y, damage, radius, color, knockback = true, selfDamage = false) {
    // Immediate AoE Effect (Reusing shockwave logic)
    // We can also just push a SHOCKWAVE entity if we want it to be processed next frame, 
    // but immediate is better for death events.

    this.io.emit("visual_effect", {
      type: "shockwave",
      x: x,
      y: y,
      radius: radius,
      color: color,
    });

    for (const [pid, p] of this.players) {
      if (pid === ownerId && !selfDamage) continue;
      if (p.isDead) continue;

      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        // Apply Damage
        p.hp -= damage;

        // Knockback (Conditioned)
        if (knockback) {
          const angle = Math.atan2(dy, dx);
          const force = 200;
          p.x += Math.cos(angle) * force;
          p.y += Math.sin(angle) * force;
        }

        if (p.hp <= 0) {
          // Chain reaction? Check if killer exists for credit
          const killer = this.players.get(ownerId); // Might be dead Kamikaze
          this.handleDeath(p, killer);
        }
      }
    }
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
        // Shoot check
        if (player.keys.space) {
          const proj = player.shoot();
          if (proj) {
            if (proj.type === "STICKY_GRENADE") {
              this.entities.push(proj);
            } else {
              if (player.isPoisonous) {
                proj.isPoison = true;
                proj.color = "#32cd32"; // FORCE GREEN VISUAL
              }
              this.projectiles.push(proj);
            }
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
          isSkillActive: player.isSkillActive,
          freezeEndTime: player.freezeEndTime || 0,
          isPoisoned: player.isPoisoned, // SEND TO CLIENT
          skillCD: player.cooldowns.skill,
          username: player.username,
          maxSkillCD: player.hero.stats.cooldown,
          kills: player.kills,
        });
      });



      // --- UPDATE ENTITIES (Mines, Decoys, Black Holes) ---
      // Handle Black Hole Gravity
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const ent = this.entities[i];
        if (ent.type === "BLACK_HOLE") {
          ent.life -= dt * 1000;

          // EXPLOSION CHECK
          if (ent.life <= 0) {
            const hx = ent.x;
            const hy = ent.y;
            this.entities.splice(i, 1); // Remove

            this.io.to("game_room").emit("visual_effect", {
              type: "black_hole_explode",
              x: hx,
              y: hy,
            });

            // Knockback Players
            for (const [pid, player] of this.players) {
              if (player.isDead) continue;
              const dx = player.x - hx;
              const dy = player.y - hy;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 300) {
                const angle = Math.atan2(dy, dx);
                // Fixed Wall Collision Knockback
                const knockbackDist = 120;
                let destX = player.x + Math.cos(angle) * knockbackDist;
                let destY = player.y + Math.sin(angle) * knockbackDist;

                let hitWall = false;
                const testRect = { x: destX - 20, y: destY - 20, w: 40, h: 40 };
                for (const obs of MapData.obstacles) {
                  if (
                    testRect.x < obs.x + obs.w &&
                    testRect.x + testRect.w > obs.x &&
                    testRect.y < obs.y + obs.h &&
                    testRect.y + testRect.h > obs.y
                  ) {
                    hitWall = true;
                    break;
                  }
                }

                if (hitWall) {
                  destX = player.x + Math.cos(angle) * (knockbackDist * 0.2);
                  destY = player.y + Math.sin(angle) * (knockbackDist * 0.2);
                }

                destX = Math.max(20, Math.min(MapData.width - 20, destX));
                destY = Math.max(20, Math.min(MapData.height - 20, destY));

                player.x = destX;
                player.y = destY;
                player.hp -= 40;

                if (player.hp <= 0 && !player.isDead) {
                  const killer = this.players.get(ent.ownerId);
                  if (killer) killer.kills++;
                  player.isDead = true;
                  // FIX RESPAWN: Set timer
                  player.respawnTime = Date.now() + 5000;
                  // Reset Status
                  player.freezeEndTime = 0;
                  player.isFrozen = false;
                  player.isPoisoned = false;

                  this.io.emit("player_died", {
                    id: pid,
                    killerId: ent.ownerId,
                  });
                }
              }
            }
            continue; // Start next entity
          }

          // Gravity Pull
          const radius = 250;
          const pullStrength = 300; // Pull speed

          for (const [pid, p] of this.players) {
            if (pid === ent.ownerId) continue;
            if (p.isDead) continue;

            const dx = ent.x - p.x;
            const dy = ent.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < radius) {
              // SAFEGUARD: Avoid division by zero
              if (dist < 1) dist = 1;

              // Normalize vector
              const nx = dx / dist;
              const ny = dy / dist;

              // Pull Strength - Prevent overshooting center
              let strength = (1 - dist / radius) * pullStrength * (1 / 60);
              if (strength > dist) strength = dist; // Don't overshoot

              const nextX = p.x + nx * strength;
              const nextY = p.y + ny * strength;

              // Simple Wall Check for Gravity (prevent pulling THRU walls if corners involved?)
              // Generally gravity pulling IN is safe, but let's be careful.
              // For now, allow pull, map bounds clamp in Player.update handles the rest.
              p.x = nextX;
              p.y = nextY;

              // Damage DOT
              if (Math.random() < 0.2) {
                // More frequent
                p.hp -= 10;
                if (p.hp <= 0 && !p.isDead) {
                  const killer = this.players.get(ent.ownerId);
                  if (killer) killer.kills++;
                  p.isDead = true;
                  // FIX RESPAWN (DOT)
                  p.respawnTime = Date.now() + 5000;
                  p.freezeEndTime = 0;
                  p.isFrozen = false;
                  p.isPoisoned = false;

                  this.io.emit("player_died", {
                    id: pid,
                    killerId: ent.ownerId,
                  });
                }
              }
            }
          }
        }
      }

      // 2. Update Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];

        // BLACK HOLE SHOT LOGIC
        if (p.type === "BLACK_HOLE_SHOT") {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt * 1000;

          // Checks for Collision (Walls & Players)
          let hitSomething = false;
          // 1. Walls
          const pRect = { x: p.x - 10, y: p.y - 10, w: 20, h: 20 };
          for (const obs of this.map.obstacles) {
          for (const obs of MapData.obstacles) {
            if (
              pRect.x < obs.x + obs.w &&
              pRect.x + pRect.w > obs.x &&
              pRect.y < obs.y + obs.h &&
              pRect.y + pRect.h > obs.y
            ) {
              hitSomething = true;
              break;
            }
          }
          // 2. Players (Direct Hit)
          if (!hitSomething) {
            for (const [pid, player] of this.players) {
              if (pid === p.ownerId) continue;
              if (player.isDead) continue;
              const dx = p.x - player.x;
              const dy = p.y - player.y;
              if (Math.sqrt(dx * dx + dy * dy) < 30) {
                hitSomething = true;
                break;
              }
            }
          }

          // Transform on Death OR Collision
          if (p.life <= 0 || hitSomething) {
            // IMPACT DAMAGE
            if (hitSomething) {
            // IMPACT DAMAGE (Fix "No Damage" Bug)
            // If we hit a player, deal initial impact damage
            if (hitSomething) {
              // Find who we hit
              for (const [pid, player] of this.players) {
                if (pid === p.ownerId) continue;
                if (player.isDead) continue;
                const dx = p.x - player.x;
                const dy = p.y - player.y;
                if (Math.sqrt(dx * dx + dy * dy) < 30) {
                  player.hp -= 20;
                  this.io.emit("visual_effect", {
                    type: "hit",
                    targetId: pid,
                  player.hp -= 20; // Impact Damage
                  // Visual Hit
                  this.io.emit("visual_effect", {
                    type: "hit",
                    targetId: pid, // Send Target ID for flashing
                    x: player.x,
                    y: player.y,
                    color: "#d000ff",
                  });
                  if (player.hp <= 0 && !player.isDead) {
                    const killer = this.players.get(p.ownerId);
                    if (killer) killer.kills++;
                    player.killedBy = killer ? killer.username : "BlackHole";
                    this.handleDeath(player, killer);
                  // Kill Check
                  if (player.hp <= 0 && !player.isDead) {
                    const killer = this.players.get(p.ownerId);
                    if (killer) killer.kills++;
                    player.isDead = true;
                    this.io.emit("player_died", {
                      id: pid,
                      killerId: p.ownerId,
                    });
                  }
                }
              }
            }

            this.projectiles.splice(i, 1);

            // Spawn Black Hole
            const blackHole = {
              type: "BLACK_HOLE",
              x: p.x,
              y: p.y,
              ownerId: p.ownerId,
              life: 5000,
            };
            this.entities.push(blackHole);
            continue;
          }
          continue;
              // creationTime removed, using life
            };
            this.entities.push(blackHole);
            // setTimeout removed, handled in Entity Loop
            continue;
          }
          continue; // Skip standard physics
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1000;

        // FRICTION LOGIC (Techno Mines)
        if (p.friction) {
          p.vx *= 0.95; // Slow down
          p.vy *= 0.95;
          // Stop completely if slow enough
          if (Math.abs(p.vx) < 10 && Math.abs(p.vy) < 10) {
            p.vx = 0;
            p.vy = 0;
          }
        }

        // Basic Bounds/Lifespan check
        if (p.life <= 0 || p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1200) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Collision with Map Obstacles (Walls)
        let hitWall = false;
        const pRect = { x: p.x - 5, y: p.y - 5, w: 10, h: 10 }; // Approx projectile size

        // SNIPER: Penetrate Walls
        // LAVA WAVE: Also penetrates walls? Maybe not obstacles, just enemies? "Vague de lave" usually flows.
        // Let's say Lava Wave blocked by walls for now unless requested.

        if (!p.penetrateWalls) {
          // TECHNO MINE: Sticky Walls?
          // If friction is true (Mine), and hits wall -> Stick (Stop)
          if (p.friction) {
            for (const obs of MapData.obstacles) {
              if (
                pRect.x < obs.x + obs.w &&
                pRect.x + pRect.w > obs.x &&
                pRect.y < obs.y + obs.h &&
                pRect.y + pRect.h > obs.y
              ) {
                // STICK TO WALL
                p.vx = 0;
                p.vy = 0;
                hitWall = false; // Don't destroy
                break;
              }
            }
          } else {
            // Normal Bullet / Lava
            for (const obs of MapData.obstacles) {
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
          }
        }

        if (hitWall) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // ENGINEER: Wall Reflection
        // Check dynamic walls (WALL_TEMP)
        for (const ent of this.entities) {
          if (ent.type === "WALL_TEMP") {
            // AABB Check
            if (
              pRect.x < ent.x + ent.w &&
              pRect.x + pRect.w > ent.x &&
              pRect.y < ent.y + ent.h &&
              pRect.y + pRect.h > ent.y
            ) {
              // Collision with Force Field
              if (p.ownerId === ent.ownerId) {
                // Pass through (Owner-only)
              } else {
                // Reflect Bullet
                // Simple Box Bounce: Determine side
                const dx = p.x - (ent.x + ent.w / 2);
                const dy = p.y - (ent.y + ent.h / 2);
                const width = (pRect.w + ent.w) / 2;
                const height = (pRect.h + ent.h) / 2;
                const crossWidth = width * dy;
                const crossHeight = height * dx;

                if (Math.abs(dx) <= width && Math.abs(dy) <= height) {
                  if (crossWidth > crossHeight) {
                    if (crossWidth > -crossHeight) {
                      p.vy = Math.abs(p.vy); // Bottom hit -> Down
                    } else {
                      p.vx = -Math.abs(p.vx); // Left hit -> Left
                    }
                  } else {
                    if (crossWidth > -crossHeight) {
                      p.vx = Math.abs(p.vx); // Right hit -> Right
                    } else {
                      p.vy = -Math.abs(p.vy); // Top hit -> Up
                    }
                  }

                  // Steal Bullet
                  p.ownerId = ent.ownerId;
                  p.color = "#00f3ff"; // Turn into Engineer Bullet Color

                  // Buff Damage on Reflection (User Request)
                  if (p.damage) p.damage *= 2;
                  else p.damage = 30; // Default 15 * 2

                  // Push out slightly
                  p.x += p.vx * 0.05;
                  p.y += p.vy * 0.05;
                }
              }
            }
          }
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
            if (player.isInvincible) {
              this.projectiles.splice(i, 1);
              hitWall = true;
              break; // Blocked by Fortress
            }

            // Apply Damage
            let damage = p.damage || 15;

            // HIT EFFECT
            this.io.emit("visual_effect", {
              type: "hit",
              targetId: id, // Send Target ID
              x: player.x,
              y: player.y,
              color: p.color || "#fff",
            });

            // MAGMA DAMAGE SCALING (Long Range Bonus)
            if (p.type === "LAVA_WAVE" && p.maxLife) {
              // Life starts at 1500.
              // Ratio 1.0 = Just Fired (Close). Ratio 0.0 = Expires (Far).
              const ratio = Math.max(0, p.life / p.maxLife);
              // Inverse Ratio: 0.0 (Close) -> 1.0 (Far)
              const distFactor = 1.0 - ratio;
              // Bonus: Up to +50% Damage at MAX range
              damage = damage * (1 + distFactor * 0.5);
            }

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

            // POISON EFFECT (VIPER)
            if (p.isPoison) {
              damage += 25;
              player.speed = player.baseSpeed * 0.4;
              player.isPoisoned = true; // Flag for Client Visuals

              if (player.poisonTimeout) clearTimeout(player.poisonTimeout);

              player.poisonTimeout = setTimeout(() => {
                player.speed = player.baseSpeed;
                player.isPoisoned = false; // Turn off visual
                player.poisonTimeout = null;
              }, 3000);

              // Initial Hit Effect
              this.io.emit("visual_effect", {
                type: "poison_hit",
                targetId: player.id,
                x: player.x,
                y: player.y,
              });
            }

            player.hp -= damage;
            this.projectiles.splice(i, 1);

            // Handle Death
            if (player.hp <= 0) {
              const killer = this.players.get(p.ownerId);
              this.handleDeath(player, killer);
            }
            break; // Projectile destroyed
          }
        }
      }

      for (let i = this.entities.length - 1; i >= 0; i--) {
        const ent = this.entities[i];

        if (ent.type === "BLACK_HOLE") {
          ent.life -= dt * 1000;

          // EXPLOSION CHECK
          if (ent.life <= 0) {
            const hx = ent.x;
            const hy = ent.y;
            this.entities.splice(i, 1); // Remove

            this.io.to("game_room").emit("visual_effect", {
              type: "black_hole_explode",
              x: hx,
              y: hy,
            });

            // Knockback Players
            for (const [pid, player] of this.players) {
              if (player.isDead) continue;
              const dx = player.x - hx;
              const dy = player.y - hy;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 300) {
                const angle = Math.atan2(dy, dx);
                // Fixed Wall Collision Knockback
                const knockbackDist = 120;
                let destX = player.x + Math.cos(angle) * knockbackDist;
                let destY = player.y + Math.sin(angle) * knockbackDist;

                let hitWall = false;
                const testRect = { x: destX - 20, y: destY - 20, w: 40, h: 40 };
                for (const obs of this.map.obstacles) {
                  if (
                    testRect.x < obs.x + obs.w &&
                    testRect.x + testRect.w > obs.x &&
                    testRect.y < obs.y + obs.h &&
                    testRect.y + testRect.h > obs.y
                  ) {
                    hitWall = true;
                    break;
                  }
                }

                if (hitWall) {
                  destX = player.x + Math.cos(angle) * (knockbackDist * 0.2);
                  destY = player.y + Math.sin(angle) * (knockbackDist * 0.2);
                }

                destX = Math.max(20, Math.min(1600 - 20, destX));
                destY = Math.max(20, Math.min(1200 - 20, destY));

                player.x = destX;
                player.y = destY;
                player.hp -= 40;

                if (player.hp <= 0 && !player.isDead) {
                  const killer = this.players.get(ent.ownerId);
                  if (killer) killer.kills++;
                  player.killedBy = killer ? killer.username : "BlackHole";
                  this.handleDeath(player, killer);
                }
              }
            }
            continue;
          }

          // Gravity Pull
          const radius = 250;
          const pullStrength = 300;

          for (const [pid, p] of this.players) {
            if (pid === ent.ownerId) continue;
            if (p.isDead) continue;

            const dx = ent.x - p.x;
            const dy = ent.y - p.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < radius) {
              if (dist < 1) dist = 1;
              const nx = dx / dist;
              const ny = dy / dist;
              let strength = (1 - dist / radius) * pullStrength * (1 / 60);
              if (strength > dist) strength = dist;

              p.x += nx * strength;
              p.y += ny * strength;

              // Damage DOT
              if (Math.random() < 0.2) {
                p.hp -= 10;
                if (p.hp <= 0 && !p.isDead) {
                  const killer = this.players.get(ent.ownerId);
                  if (killer) killer.kills++;
                  p.killedBy = killer ? killer.username : "BlackHole";
                  this.handleDeath(p, killer);
                }
              }
            }
          }
        }

        // STICKY GRENADE LOGIC
        if (ent.type === "STICKY_GRENADE") {
          ent.life -= dt * 1000;

          // If attached, follow target
          if (ent.attachedTo) {
            const target = this.players.get(ent.attachedTo);

            // If target invalid or dead, drop? or stay?
            if (!target || target.isDead) {
              ent.attachedTo = null; // Drop
            } else {
              ent.x = target.x;
              ent.y = target.y;
            }
          } else {
            // Physics (Fly)
            ent.x += ent.vx * dt;
            ent.y += ent.vy * dt;

            // Wall Collision Check (Stop if hit wall)
            // Reuse projectile wall check logic simplified
            let hitWall = false;
            // Map Boundaries
            if (ent.x < 0 || ent.x > 1600 || ent.y < 0 || ent.y > 1200) hitWall = true;

            // Obstacles
            if (!hitWall) {
              for (const obs of this.map.obstacles) {
                if (
                  ent.x > obs.x &&
                  ent.x < obs.x + obs.w &&
                  ent.y > obs.y &&
                  ent.y < obs.y + obs.h
                ) {
                  hitWall = true;
                  break;
                }
              }
            }

            if (hitWall) {
              // Stop sticky grenade on wall
              ent.vx = 0;
              ent.vy = 0;
              // Optional: Stick to wall? 
              // Currently it just falls/stops. That's fine.
            }
          }

          // Explode
          if (ent.life <= 0) {
            // Self Damage = TRUE, Knockback = FALSE
            this.createShockwave(ent.ownerId, ent.x, ent.y, ent.damage, ent.radius, ent.color, false, true);
            this.entities.splice(i, 1);
            continue;
          }

          // Sticky Collision (Only if not attached)
          if (!ent.attachedTo) {
            for (const [id, player] of this.players) {
              if (id === ent.ownerId) continue; // Don't stick to self initially?
              if (player.isDead) continue;

              const dx = ent.x - player.x;
              const dy = ent.y - player.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 30) {
                ent.attachedTo = id;
                // Stick!
                this.io.emit("visual_effect", {
                  type: "text",
                  text: "STUCK!",
                  x: player.x,
                  y: player.y - 40,
                  color: "#ff0000"
                });
                break;
              }
            }
          }
          continue; // Skip normal mine logic
        }


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
              this.handleDeath(player, killer);
            }
            break;
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
