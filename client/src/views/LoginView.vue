<script setup>
import { ref } from "vue";
import { useAuthStore } from "../stores/auth";

const isLogin = ref(true);
const auth = useAuthStore();

const form = ref({
  username: "",
  email: "",
  identifier: "",
  password: "",
});

const submit = async () => {
  if (isLogin.value) {
    await auth.login(form.value.identifier, form.value.password);
  } else {
    await auth.register(
      form.value.username,
      form.value.email,
      form.value.password
    );
  }
};
</script>

<template>
  <div class="auth-page">
    <div class="card auth-card">
      <h1 class="neon-text">
        {{ isLogin ? "SYSTEM LOGIN" : "NEW OPERATIVE" }}
      </h1>

      <p v-if="auth.error" class="error">{{ auth.error }}</p>

      <form @submit.prevent="submit">
        <div v-if="isLogin">
          <input
            v-model="form.identifier"
            type="text"
            placeholder="EMAIL OR USERNAME"
            class="input-field"
            required
          />
        </div>
        <div v-else>
          <input
            v-model="form.username"
            type="text"
            placeholder="CODENAME"
            class="input-field"
            required
          />
          <input
            v-model="form.email"
            type="email"
            placeholder="EMAIL_ADDRESS"
            class="input-field"
            required
          />
        </div>

        <input
          v-model="form.password"
          type="password"
          placeholder="PASSWORD"
          class="input-field"
          required
        />

        <button type="submit" class="btn block">
          {{ isLogin ? "INITIALIZE" : "REGISTER" }}
        </button>
      </form>

      <div class="toggle-mode">
        <span @click="isLogin = !isLogin">
          {{ isLogin ? "Apply for clearance" : "Already have access?" }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: radial-gradient(circle at center, #1a1a2e 0%, #000 100%);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.auth-card h1 {
  margin-bottom: 2rem;
  font-size: 2rem;
  letter-spacing: 2px;
}

.block {
  width: 100%;
  margin-top: 1rem;
}

.toggle-mode {
  margin-top: 1.5rem;
  font-size: 0.9rem;
  color: var(--text-dim);
  cursor: pointer;
}

.toggle-mode span:hover {
  color: var(--primary);
  text-decoration: underline;
}

.error {
  color: #ff3333;
  margin-bottom: 1rem;
}
</style>
