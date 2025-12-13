require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { sequelize } = require("./models");

// Routes
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const userRoutes = require("./routes/user");
const leaderboardRoutes = require("./routes/leaderboard");

// Game Server logic
const GameServer = require("./game/GameServer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
const path = require("path");

// ... imports ... imported above

// Serve Static Files
app.use(express.static(path.join(__dirname, "../../client/dist")));

// API Routes
app.use("/auth", authRoutes);
app.use("/shop", shopRoutes);
app.use("/user", userRoutes);
app.use("/leaderboard", leaderboardRoutes);

// Catch-all handle for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

// Database Sync & Start
const PORT = process.env.PORT || 3005;

sequelize
  .sync({ alter: true }) // Safer to use alter in dev
  .then(() => {
    console.log("Database synced");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Start Game Server
      new GameServer(io);
    });
  })
  .catch((err) => {
    console.error("Failed to sync db:", err);
  });
