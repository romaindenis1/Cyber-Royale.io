<script setup>
import { onMounted } from "vue";
import { useAuthStore } from "../stores/auth";
import { useGameStore } from "../stores/game";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const game = useGameStore();
const router = useRouter();

onMounted(async () => {
  const success = await auth.fetchProfile();
  if (success) {
    await game.fetchHeroes();
  }
});

const isOwned = (heroId) => {
  return auth.user?.unlockedHeroes?.includes(heroId);
};

const handleSelect = (heroId) => {
  game.selectHero(heroId);
};

const handleBuy = async (heroId) => {
  await game.buyHero(heroId);
};

const startGame = () => {
  if (game.selectedHeroId) {
    router.push("/play");
  }
};

const logout = () => {
  auth.logout();
};

const getHeroDesc = (name) => {
  const descs = {
    Vanguard: "TANK: Activate Shield (Invulnerable 3s)",
    Spectre: "ASSASSIN: Short Range Teleport",
    Techno: "ENGINEER: Spawn Proximity Mine",
  };
  return descs[name] || "Unknown Class";
};
const retryConnection = async () => {
  const success = await auth.fetchProfile();
  if (success) {
    await game.fetchHeroes();
  }
};
</script>

<template>
  <div class="dashboard-page">
    <header class="top-bar">
      <div class="user-info">
        <span class="neon-text">OPERATIVE: {{ auth.user?.username }}</span>
        <span class="coins">CREDITS: {{ auth.user?.coins }}</span>
      </div>
      <button @click="logout" class="btn btn-secondary">LOGOUT</button>
    </header>

    <div class="container">
      <div v-if="auth.error" class="error-banner">
        CONNECTION ERROR: {{ auth.error }}
        <button @click="retryConnection" class="btn btn-sm">RETRY</button>
      </div>

      <div v-if="!auth.user && !auth.error" class="loading-state">
        ESTABLISHING UPLINK...
      </div>

      <div v-else-if="auth.user">
        <h2 class="section-title">CHOOSE YOUR AVATAR</h2>

        <div v-if="game.msg" class="msg-box">{{ game.msg }}</div>

        <div class="hero-focus">
          <div v-if="game.selectedHero" class="focus-card">
            <h3>OPERATING AS:</h3>
            <h1 class="hero-name">{{ game.selectedHero.name }}</h1>
            <div class="hero-class">{{ game.selectedHero.class }} CLASS</div>
            <p class="hero-desc">{{ getHeroDesc(game.selectedHero.name) }}</p>
          </div>
          <div v-else>
            <p>NO HERO SELECTED</p>
          </div>

          <button
            @click="router.push('/heroes')"
            class="btn btn-secondary change-btn"
          >
            CHANGE LOADOUT / ARMORY
          </button>
        </div>

        <div class="deploy-section">
          <button
            @click="startGame"
            class="btn deploy-btn"
            :disabled="!game.selectedHeroId"
          >
            ENTER ARENA
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  min-height: 100vh;
  background: #0d0d12;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #1a1a23;
  border-bottom: 1px solid #333;
}

.user-info span {
  margin-right: 2rem;
  font-weight: bold;
  font-size: 1.2rem;
}

.coins {
  color: var(--accent);
}

.section-title {
  text-align: center;
  margin: 2rem 0;
  font-size: 2rem;
  color: var(--text-dim);
  letter-spacing: 4px;
}

.heroes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.hero-card {
  text-align: center;
  position: relative;
  border: 1px solid #444;
}

.hero-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 15px var(--primary-dim);
}

.hero-card h3 {
  margin-bottom: 1rem;
  font-size: 1.5rem;
  color: #fff;
}

.stats p {
  color: var(--text-dim);
  margin: 0.5rem 0;
}

.actions {
  margin-top: 1.5rem;
}

.deploy-section {
  text-align: center;
}

.deploy-btn {
  font-size: 2rem;
  padding: 1rem 4rem;
  letter-spacing: 5px;
}

.deploy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
  border-color: #444;
  color: #888;
}

.msg-box {
  text-align: center;
  padding: 1rem;
  color: var(--accent);
  margin-bottom: 1rem;
}
</style>
