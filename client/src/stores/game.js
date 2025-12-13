import { defineStore } from "pinia";
import api from "../utils/axios";
import { useAuthStore } from "./auth";

export const useGameStore = defineStore("game", {
  state: () => ({
    allHeroes: [],
    selectedHeroId: parseInt(localStorage.getItem("selectedHeroId")) || null, // ID
    enabledSkins: JSON.parse(localStorage.getItem("enabledSkins")) || {}, // HeroID -> SkinIndex
    loading: false,
    msg: null,
  }),
  getters: {
    selectedHero: (state) =>
      state.allHeroes.find((h) => h.id === state.selectedHeroId),
    getSelectedSkin: (state) => (heroId) => {
      return state.enabledSkins[heroId] || 0;
    },
  },
  actions: {
    async fetchHeroes() {
      const auth = useAuthStore();
      if (!auth.token) return;
      try {
        const res = await api.get("/shop/heroes");
        this.allHeroes = res.data;
      } catch (err) {
        if (err.response?.status !== 401) {
          console.error(err);
        }
      }
    },
    async buyHero(heroId) {
      const auth = useAuthStore();
      try {
        const res = await api.post("/shop/buy-hero", { heroId });
        this.msg = "Purchased!";
        setTimeout(() => (this.msg = null), 2000);
        await auth.fetchProfile(); // Update coins and unlocks
      } catch (err) {
        this.msg = err.response?.data?.message || "Error";
        setTimeout(() => (this.msg = null), 2000);
      }
    },
    selectHero(heroId) {
      this.selectedHeroId = heroId;
      localStorage.setItem("selectedHeroId", heroId);
    },
    selectSkin(heroId, skinIndex) {
      this.enabledSkins[heroId] = skinIndex;
      localStorage.setItem("enabledSkins", JSON.stringify(this.enabledSkins));
    },
  },
});
