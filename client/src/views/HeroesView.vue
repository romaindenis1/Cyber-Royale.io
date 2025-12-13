<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "../stores/game";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const game = useGameStore();
const auth = useAuthStore();

const selectedClass = ref("Damage");
const classes = ["Damage", "Tank", "Speed", "Support"];

// Filter heroes
const filteredHeroes = computed(() => {
  return game.allHeroes.filter((h) => h.class === selectedClass.value);
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

// Skin Selection (Persisted via GameStore)
const selectedSkinIndex = ref(0);

// Watch for selection change to update local view
import { watch } from "vue";
watch(
  () => game.selectedHeroId,
  (newId) => {
    if (newId) {
      selectedSkinIndex.value = game.getSelectedSkin(newId);
    }
  }
);

const selectSkin = (heroId, index) => {
  selectedSkinIndex.value = index;
  game.selectSkin(heroId, index);
};

const getHeroDesc = (hero) => {
  // Dynamic desc based on hero name/class
  if (hero.class === "Tank") return "High Health, Defensive Abilities";
  if (hero.class === "Speed") return "High Mobility, Fast Cooldowns";
  if (hero.class === "Support") return "Utility and Control";
  return "Balanced Stats, High Damage";
};

// Back to Dashboard
const goBack = () => {
  router.push("/dashboard");
};
</script>

<template>
  <div class="heroes-page">
    <div class="header">
      <button @click="goBack" class="btn btn-secondary">BACK</button>
      <h1 class="neon-text">ARMORY</h1>
      <div class="coins">CREDITS: {{ auth.user?.coins || 0 }}</div>
    </div>

    <!-- Class Tabs -->
    <div class="tabs">
      <button
        v-for="c in classes"
        :key="c"
        class="tab-btn"
        :class="{ active: selectedClass === c }"
        @click="selectedClass = c"
      >
        {{ c.toUpperCase() }}
      </button>
    </div>

    <div class="content-split">
      <!-- Hero Grid -->
      <div class="hero-grid">
        <div
          v-for="hero in filteredHeroes"
          :key="hero.id"
          class="hero-card"
          :class="{
            active: game.selectedHeroId === hero.id,
            locked: !isOwned(hero.id),
          }"
          @click="game.selectHero(hero.id)"
        >
          <div
            class="hero-icon"
            :style="{ backgroundColor: hero.skins[0]?.value || '#ccc' }"
          >
            <!-- Placeholder for Hero Image -->
          </div>
          <div class="hero-info">
            <h3>{{ hero.name }}</h3>
            <span class="price" v-if="!isOwned(hero.id)"
              >{{ hero.price }} CR</span
            >
            <span class="owned" v-else>OWNED</span>
          </div>
        </div>
      </div>

      <!-- Hero Detail Panel -->
      <div class="hero-detail" v-if="game.selectedHeroId">
        <!-- We need to find the selected hero object from the full list -->
        <div v-for="hero in game.allHeroes" :key="hero.id">
          <div v-if="hero.id === game.selectedHeroId" class="detail-container">
            <h2 class="detail-name">{{ hero.name }}</h2>
            <div class="detail-class">{{ hero.class }} CLASS</div>

            <div class="stats-box">
              <div class="stat-row">
                <span>HP</span>
                <div class="bar-bg">
                  <div
                    class="bar-fill"
                    :style="{ width: (hero.stats.hp / 300) * 100 + '%' }"
                  ></div>
                </div>
              </div>
              <div class="stat-row">
                <span>SPD</span>
                <div class="bar-bg">
                  <div
                    class="bar-fill"
                    :style="{ width: (hero.stats.speed / 200) * 100 + '%' }"
                  ></div>
                </div>
              </div>
              <div class="stat-row">
                <span>CD</span>
                <div class="bar-bg">
                  <div
                    class="bar-fill"
                    :style="{
                      width:
                        ((15000 - hero.stats.cooldown) / 15000) * 100 + '%',
                    }"
                  ></div>
                </div>
              </div>
            </div>

            <p class="description">{{ getHeroDesc(hero) }}</p>

            <!-- Skins -->
            <div class="skins-section">
              <h3>SKINS</h3>
              <div class="skins-list">
                <div
                  v-for="(skin, idx) in hero.skins"
                  :key="idx"
                  class="skin-swatch"
                  :style="{ backgroundColor: skin.value }"
                  :class="{ selected: selectedSkinIndex === idx }"
                  @click="selectSkin(hero.id, idx)"
                ></div>
              </div>
              <div class="skin-name">
                {{ hero.skins[selectedSkinIndex]?.name || "Default" }}
              </div>
            </div>

            <!-- Action Button -->
            <div class="action-area">
              <button v-if="isOwned(hero.id)" class="btn deploy-btn">
                EQUIPPED
              </button>
              <button v-else @click="handleBuy(hero.id)" class="btn buy-btn">
                UNLOCK PROTOCOL ({{ hero.price }})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heroes-page {
  min-height: 100vh;
  background: #0d0d12;
  color: #fff;
  display: flex;
  flex-direction: column;
}

.header {
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  background: #15151a;
}

.coins {
  color: var(--accent);
  font-weight: bold;
  font-size: 1.2rem;
}

.tabs {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  background: #111;
  border-bottom: 1px solid #222;
}

.tab-btn {
  background: transparent;
  border: 1px solid #444;
  color: #888;
  padding: 0.5rem 2rem;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--primary);
  color: #000;
  border-color: var(--primary);
  box-shadow: 0 0 10px var(--primary);
}

.content-split {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.hero-grid {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: max-content;
  gap: 1.5rem;
}

.hero-card {
  background: #1a1a23;
  border: 1px solid #333;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.hero-card:hover {
  transform: translateY(-2px);
  border-color: #666;
}

.hero-card.active {
  border-color: var(--primary);
  box-shadow: 0 0 10px var(--primary-dim);
}

.hero-card.locked {
  opacity: 0.6;
}

.hero-icon {
  height: 120px;
  width: 100%;
  background-position: center;
  background-size: cover;
}

.hero-info {
  padding: 1rem;
  text-align: center;
}

.hero-detail {
  width: 400px;
  background: #1a1a23;
  border-left: 1px solid #333;
  padding: 2rem;
  overflow-y: auto;
}

.detail-name {
  font-size: 2.5rem;
  color: var(--primary);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.detail-class {
  color: #888;
  margin-bottom: 2rem;
  letter-spacing: 2px;
  font-weight: bold;
}

.stats-box {
  margin-bottom: 2rem;
}

.stat-row {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}

.stat-row span {
  width: 50px;
  font-weight: bold;
  color: #aaa;
}

.bar-bg {
  flex: 1;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: var(--accent);
}

.description {
  line-height: 1.6;
  color: #ccc;
  margin-bottom: 2rem;
}

.skins-list {
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
}

.skin-swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid #555;
  cursor: pointer;
}

.skin-swatch.selected {
  border-color: #fff;
  box-shadow: 0 0 10px #fff;
  transform: scale(1.1);
}

.action-area {
  margin-top: 3rem;
  text-align: center;
}

.deploy-btn {
  width: 100%;
  padding: 1rem;
  background: #333;
  color: #888;
  cursor: default;
  border: 1px solid #444;
}

.buy-btn {
  width: 100%;
  padding: 1rem;
  background: var(--accent);
  color: #000;
  font-weight: bold;
  font-size: 1.2rem;
}
</style>
