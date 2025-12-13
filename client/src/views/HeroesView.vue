<script setup>
import { ref, computed, watch, watchEffect } from "vue";
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

const viewingHeroId = ref(null);

watchEffect(() => {
  if (!viewingHeroId.value && game.selectedHeroId) {
    viewingHeroId.value = game.selectedHeroId;
  }
});

const viewHero = (heroId) => {
  viewingHeroId.value = heroId;
  selectedSkinIndex.value = game.getSelectedSkin(heroId);
};

const equipHero = () => {
  if (viewingHeroId.value) {
    game.selectHero(viewingHeroId.value);
  }
};

const getHeroDesc = (hero) => {
  const descs = {
    Vanguard: "ABILITY: Reflector Shield (Invulnerable 3s)",
    Titan: "ABILITY: Juggernaut (+HP, -Speed)",
    Brawler: "ABILITY: Berserker (Rapid Fire, +Speed)",
    Goliath: "ABILITY: Fortress (Rooted, Heal, Invulnerable)",
    Spectre: "ABILITY: Blink (Teleport)",
    Volt: "ABILITY: Overload (Super Speed)",
    Ghost: "ABILITY: Phasing (Walk through walls)",
    Techno: "ABILITY: Proximity Mine",
    Engineer: "ABILITY: Force Field (Block shots)",
    Medic: "ABILITY: Regenerator (Area Heal)",
    Blaze: "ABILITY: Rapid Fire",
    Frost: "ABILITY: Freeze Shot (Freezes Enemy)",
    Sniper: "ABILITY: Railgun (High Dmg, Fast Shot)",
    Shadow: "ABILITY: Stealth (Invisible 5s)",
    Nova: "ABILITY: Nova Blast (Radial Attack)",
  };
  return descs[hero.name] || "ABILITY: Standard Combat";
};

const goBack = () => {
  router.push("/dashboard");
};
</script>

<template>
  <div class="heroes-page">
    <div class="header">
      <button @click="goBack" class="btn btn-secondary">
        &lt; RETURN TO BASE
      </button>
      <div class="header-info">
        <h1 class="page-title glitch-effect" data-text="ARMORY">ARMORY</h1>
        <div class="credits">CREDITS: {{ auth.user?.coins || 0 }} 🪙</div>
      </div>
    </div>

    <!-- Main Content Split -->
    <div class="main-content">
      <!-- Left Panel: Hero Grid & Filters -->
      <div class="left-panel">
        <div class="class-tabs">
          <button
            v-for="c in classes"
            :key="c"
            class="tab-btn"
            :class="{ active: selectedClass === c }"
            @click="selectedClass = c"
          >
            {{ c }}
          </button>
        </div>

        <div class="heroes-grid-container">
          <div class="heroes-grid">
            <div
              v-for="hero in filteredHeroes"
              :key="hero.id"
              class="hero-card"
              :class="{
                active: viewingHeroId === hero.id,
                equipped: game.selectedHeroId === hero.id,
                locked: !isOwned(hero.id),
              }"
              @click="viewHero(hero.id)"
            >
              <div class="card-content">
                <div
                  class="hero-icon-placeholder"
                  :style="{
                    backgroundColor: hero.skins[0]?.value || '#444',
                    boxShadow: `0 0 15px ${hero.skins[0]?.value || '#444'}`,
                  }"
                ></div>
                <div class="hero-header">
                  <h3>{{ hero.name }}</h3>
                  <span
                    v-if="game.selectedHeroId === hero.id"
                    class="badge-equipped"
                    >EQUIPPED</span
                  >
                </div>
                <div class="hero-footer">
                  <span v-if="!isOwned(hero.id)" class="price"
                    >{{ hero.price }} CR</span
                  >
                  <span v-else class="owned-label">OWNED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel: Details -->
      <div class="right-panel">
        <div v-if="viewingHeroId" class="detail-content">
          <!-- We retrieve the hero object safely -->
          <div class="detail-header">
            <h2
              class="detail-name"
              :style="{
                color:
                  game.getHeroById(viewingHeroId)?.skins[selectedSkinIndex]
                    ?.value,
              }"
            >
              {{ game.getHeroById(viewingHeroId)?.name }}
            </h2>
            <div class="detail-class">
              {{ game.getHeroById(viewingHeroId)?.class }} CLASS
            </div>
          </div>

          <div class="detail-body">
            <div class="info-block">
              <label>COMBAT ABILITY</label>
              <p class="ability-text">
                {{ getHeroDesc(game.getHeroById(viewingHeroId)) }}
              </p>
            </div>

            <div class="info-block">
              <label>STATS OVERVIEW</label>
              <div class="stats-bars">
                <div class="stat-item">
                  <span>HP</span>
                  <div class="bar">
                    <div
                      class="fill"
                      :style="{
                        width:
                          (game.getHeroById(viewingHeroId)?.stats.hp / 300) *
                            100 +
                          '%',
                      }"
                    ></div>
                  </div>
                </div>
                <div class="stat-item">
                  <span>SPD</span>
                  <div class="bar">
                    <div
                      class="fill"
                      :style="{
                        width:
                          (game.getHeroById(viewingHeroId)?.stats.speed / 200) *
                            100 +
                          '%',
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="info-block">
              <label>SKIN VARIANT</label>
              <div class="skins-row">
                <div
                  v-for="(skin, idx) in game.getHeroById(viewingHeroId)?.skins"
                  :key="idx"
                  class="skin-option"
                  :class="{ selected: selectedSkinIndex === idx }"
                  :style="{ backgroundColor: skin.value }"
                  @click="selectSkin(viewingHeroId, idx)"
                  :title="skin.name"
                ></div>
              </div>
              <div class="skin-name">
                {{
                  game.getHeroById(viewingHeroId)?.skins[selectedSkinIndex]
                    ?.name
                }}
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <div v-if="isOwned(viewingHeroId)">
              <button
                v-if="game.selectedHeroId === viewingHeroId"
                class="btn action-btn equipped"
                disabled
              >
                SYSTEM ACTIVE
              </button>
              <button v-else @click="equipHero" class="btn action-btn equip">
                INITIALIZE SYSTEM (EQUIP)
              </button>
            </div>
            <div v-else>
              <button
                @click="handleBuy(viewingHeroId)"
                class="btn action-btn buy"
                :disabled="
                  auth.user.coins < game.getHeroById(viewingHeroId)?.price
                "
              >
                UNLOCK // {{ game.getHeroById(viewingHeroId)?.price }} CR
              </button>
              <div
                v-if="auth.user.coins < game.getHeroById(viewingHeroId)?.price"
                class="err-msg"
              >
                INSUFFICIENT FUNDS
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">SELECT A BLUEPRINT</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Page Base */
.heroes-page {
  min-height: 100vh;
  background-color: #050505;
  background-image: linear-gradient(
      rgba(0, 255, 255, 0.03) 1px,
      transparent 1px
    ),
    linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  color: #fff;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.heroes-page::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at center, transparent 0%, #000 90%);
  pointer-events: none;
  z-index: 1;
}

/* Header */
.header {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 3rem;
  background: rgba(0, 0, 0, 0.8);
  border-bottom: 2px solid var(--primary-dim);
  backdrop-filter: blur(10px);
}

.header-info {
  text-align: right;
}

.page-title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 4px;
  color: #fff;
  text-shadow: 0 0 10px var(--primary);
  margin: 0;
}

.credits {
  color: #ffd700;
  font-weight: bold;
  letter-spacing: 1px;
}

.btn-secondary {
  border: 1px solid #444;
  background: transparent;
  color: #888;
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  transition: all 0.3s;
  letter-spacing: 1px;
}

.btn-secondary:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Main Content Split */
.main-content {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  overflow: hidden; /* Prevent full page scroll */
}

/* Left Panel */
.left-panel {
  flex: 3;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  border-right: 1px solid #333;
  background: rgba(0, 0, 0, 0.2);
}

.class-tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  justify-content: center;
}

.tab-btn {
  background: rgba(20, 20, 20, 0.8);
  border: 1px solid #444;
  color: #888;
  padding: 0.8rem 2rem;
  cursor: pointer;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  transition: all 0.2s;
  min-width: 120px;
}

.tab-btn.active {
  background: var(--primary-dim);
  color: var(--primary);
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
}

.heroes-grid-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 1rem;
}

/* Grid Layout */
.heroes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem;
  padding: 1rem; /* Added padding to prevent hover clip */
}

.hero-card {
  background: rgba(30, 30, 35, 0.6);
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.hero-card:hover {
  border-color: #aaa;
  transform: translateY(-5px);
  background: rgba(40, 40, 45, 0.8);
}

.hero-card.active {
  border-color: var(--primary);
  background: rgba(0, 243, 255, 0.05);
  box-shadow: 0 0 20px rgba(0, 243, 255, 0.1);
}

.card-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.hero-icon-placeholder {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  background-color: #444;
}

.hero-header h3 {
  margin: 0;
  font-size: 1.2rem;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.badge-equipped {
  font-size: 0.7rem;
  background: var(--primary);
  color: #000;
  padding: 2px 5px;
  border-radius: 2px;
  font-weight: bold;
  display: inline-block;
  margin-top: 5px;
}

.hero-footer {
  width: 100%;
  text-align: center;
  border-top: 1px solid #444;
  padding-top: 0.5rem;
  font-size: 0.9rem;
}

.price {
  color: #ffd700;
}
.owned-label {
  color: #888;
  font-size: 0.8rem;
}

/* Right Panel */
.right-panel {
  flex: 2;
  background: rgba(10, 10, 12, 0.8);
  backdrop-filter: blur(10px);
  padding: 3rem;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--primary-dim);
}

.detail-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.detail-header {
  border-bottom: 2px solid #333;
  padding-bottom: 1rem;
}

.detail-name {
  font-size: 3.5rem;
  margin: 0;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 0 15px var(--primary-dim);
  line-height: 1;
}

.detail-class {
  color: var(--primary);
  font-size: 1.2rem;
  letter-spacing: 3px;
  margin-top: 0.5rem;
}

.info-block label {
  display: block;
  color: #666;
  font-size: 0.8rem;
  letter-spacing: 2px;
  margin-bottom: 0.5rem;
}

.ability-text {
  font-size: 1.1rem;
  color: #ddd;
  line-height: 1.5;
  background: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-left: 2px solid var(--primary);
}

.stats-bars {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.stat-item {
  display: flex;
  align-items: center;
}

.stat-item span {
  width: 50px;
  font-weight: bold;
  color: #888;
}

.bar {
  flex: 1;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--primary);
}

.skins-row {
  display: flex;
  gap: 1rem;
}

.skin-option {
  width: 50px;
  height: 50px;
  border: 2px solid #333;
  cursor: pointer;
  transition: transform 0.2s;
}

.skin-option.selected {
  border-color: #fff;
  box-shadow: 0 0 10px #fff;
  transform: scale(1.1);
}

.skin-name {
  margin-top: 0.5rem;
  color: #888;
  font-style: italic;
}

.detail-actions {
  margin-top: auto;
}

.action-btn {
  width: 100%;
  padding: 1.5rem;
  font-size: 1.4rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.action-btn.equip {
  background: transparent;
  border: 1px solid var(--primary);
  color: var(--primary);
}

.action-btn.equip:hover {
  background: var(--primary);
  box-shadow: 0 0 20px var(--primary);
  color: #000;
}

.action-btn.equipped {
  background: #222;
  color: var(--primary);
  border: 1px solid #444;
  cursor: default;
}

.action-btn.buy {
  background: #ffd700;
  color: #000;
}

.action-btn.buy:hover:not(:disabled) {
  background: #fff;
  box-shadow: 0 0 20px #ffd700;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.err-msg {
  color: #ff3333;
  text-align: center;
  margin-top: 1rem;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #444;
  letter-spacing: 2px;
  font-size: 1.5rem;
}

/* Scrollbars */
.heroes-grid-container::-webkit-scrollbar {
  width: 6px;
}
.heroes-grid-container::-webkit-scrollbar-track {
  background: #000;
}
.heroes-grid-container::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.price {
  color: #ffd700;
}
.owned-label {
  color: #888;
  font-size: 0.8rem;
}

/* Right Panel */
.right-panel {
  flex: 2;
  background: rgba(10, 10, 12, 0.8);
  backdrop-filter: blur(10px);
  padding: 3rem;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--primary-dim);
}

.detail-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.detail-header {
  border-bottom: 2px solid #333;
  padding-bottom: 1rem;
}

.detail-name {
  font-size: 3.5rem;
  margin: 0;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 0 15px var(--primary-dim);
  line-height: 1;
}

.detail-class {
  color: var(--primary);
  font-size: 1.2rem;
  letter-spacing: 3px;
  margin-top: 0.5rem;
}

.info-block label {
  display: block;
  color: #666;
  font-size: 0.8rem;
  letter-spacing: 2px;
  margin-bottom: 0.5rem;
}

.ability-text {
  font-size: 1.1rem;
  color: #ddd;
  line-height: 1.5;
  background: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-left: 2px solid var(--primary);
}

.stats-bars {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.stat-item {
  display: flex;
  align-items: center;
}

.stat-item span {
  width: 50px;
  font-weight: bold;
  color: #888;
}

.bar {
  flex: 1;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--primary);
}

.skins-row {
  display: flex;
  gap: 1rem;
}

.skin-option {
  width: 50px;
  height: 50px;
  border: 2px solid #333;
  cursor: pointer;
  transition: transform 0.2s;
}

.skin-option.selected {
  border-color: #fff;
  box-shadow: 0 0 10px #fff;
  transform: scale(1.1);
}

.skin-name {
  margin-top: 0.5rem;
  color: #888;
  font-style: italic;
}

.detail-actions {
  margin-top: auto;
}

.action-btn {
  width: 100%;
  padding: 1.5rem;
  font-size: 1.4rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.action-btn.equip {
  background: transparent;
  border: 1px solid var(--primary);
  color: var(--primary);
}

.action-btn.equip:hover {
  background: var(--primary);
  box-shadow: 0 0 20px var(--primary);
  color: #000;
}

.action-btn.equipped {
  background: #222;
  color: var(--primary);
  border: 1px solid #444;
  cursor: default;
}

.action-btn.buy {
  background: #ffd700;
  color: #000;
}

.action-btn.buy:hover:not(:disabled) {
  background: #fff;
  box-shadow: 0 0 20px #ffd700;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.err-msg {
  color: #ff3333;
  text-align: center;
  margin-top: 1rem;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #444;
  letter-spacing: 2px;
  font-size: 1.5rem;
}

/* Scrollbars */
.heroes-grid-container::-webkit-scrollbar {
  width: 6px;
}
.heroes-grid-container::-webkit-scrollbar-track {
  background: #000;
}
.heroes-grid-container::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

@media (max-width: 768px) {
  /* Layout Base */
  .heroes-page {
    height: 100vh;
    overflow: hidden;
  }

  /* Header - Compact */
  .header {
    padding: 0.5rem 1rem;
    flex-direction: row;
    height: 60px;
    gap: 0.5rem;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
  }

  .page-title {
    font-size: 1.2rem;
    line-height: 1.2;
  }

  .credits {
    font-size: 0.8rem;
    line-height: 1.2;
  }

  .btn-secondary {
    padding: 0.4rem 0.8rem;
    font-size: 0.7rem;
    white-space: nowrap;
  }

  /* Main Split */
  .main-content {
    flex-direction: column;
    height: calc(100vh - 60px);
  }

  /* TOP: LIST (35%) */
  .left-panel {
    flex: none;
    height: 35%;
    border-right: none;
    border-bottom: 2px solid var(--primary-dim);
    padding: 0.5rem;
    padding-bottom: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Scrollable Tabs */
  .class-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    overflow-x: auto;
    white-space: nowrap;
    justify-content: flex-start;
    padding-bottom: 5px;
    flex-shrink: 0;
  }
  /* Hide Scrollbar for tabs */
  .class-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab-btn {
    min-width: auto;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .heroes-grid-container {
    padding-right: 0;
    flex: 1;
    overflow-y: auto;
  }

  .heroes-grid {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 0.5rem;
    padding-bottom: 1rem;
  }

  .hero-card .card-content {
    padding: 0.5rem;
  }

  .hero-icon-placeholder {
    width: 30px;
    height: 30px;
  }

  .hero-header h3 {
    font-size: 0.8rem;
  }

  /* BOTTOM: DETAILS (65%) */
  .right-panel {
    flex: 1;
    border-left: none;
    padding: 1rem;
    background: rgba(10, 10, 12, 0.98);
    overflow-y: auto;
  }

  .detail-name {
    font-size: 1.5rem;
    margin-bottom: 0.2rem;
  }

  .detail-class {
    font-size: 0.9rem;
  }

  .info-block {
    margin-bottom: 1rem;
  }

  .ability-text {
    font-size: 0.9rem;
    padding: 0.5rem;
  }

  .action-btn {
    padding: 0.8rem;
    font-size: 1rem;
    margin-top: 0.5rem;
  }

  .skin-option {
    width: 35px;
    height: 35px;
  }
}
</style>
