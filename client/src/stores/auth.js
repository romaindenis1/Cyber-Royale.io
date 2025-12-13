import { defineStore } from "pinia";
import api from "../utils/axios";
import router from "../router";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    token: localStorage.getItem("token") || null,
    error: null,
  }),
  actions: {
    async register(username, email, password) {
      try {
        this.error = null;
        const res = await api.post("/auth/register", {
          username,
          email,
          password,
        });

        // Auto login with returned token
        this.token = res.data.token;
        this.user = res.data.user;
        localStorage.setItem("token", this.token);

        router.push("/dashboard");
      } catch (err) {
        this.error = err.response?.data?.error || "Registration failed";
      }
    },
    async login(identifier, password) {
      try {
        this.error = null;
        const res = await api.post("/auth/login", { identifier, password });
        this.token = res.data.token;
        this.user = res.data.user;
        localStorage.setItem("token", this.token);
        router.push("/dashboard");
      } catch (err) {
        this.error = err.response?.data?.message || "Login failed";
      }
    },
    async fetchProfile() {
      if (!this.token) {
        this.user = null;
        return false;
      }
      try {
        const res = await api.get("/user/me");
        this.user = res.data;
        return true;
      } catch (err) {
        // If 401 (Unauthorized) or 400 (Bad Token), logout
        if (err.response?.status === 401 || err.response?.status === 400) {
          this.logout();
        } else {
          console.error("Profile Fetch Error", err);
          this.error = "Connection to server failed.";
        }
        return false;
      }
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem("token");
      router.push("/login");
    },
  },
});
