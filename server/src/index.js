require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { sequelize } = require("./models");
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const userRoutes = require("./routes/user");
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

// Routes
app.use("/auth", authRoutes);
app.use("/shop", shopRoutes);
app.use("/user", userRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("Neon Heroes API Running");
});

// Database Sync & Start
const PORT = process.env.PORT || 3005;

sequelize
  .sync()
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
