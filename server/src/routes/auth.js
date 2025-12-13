const router = require("express").Router();
const { User, UserUnlock, Hero } = require("../models");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Create user
    const user = await User.create({ username, email, password });

    // 2. Unlock default hero (Vanguard - ID 1)
    const defaultHero = await Hero.findByPk(1);
    if (defaultHero) {
      await UserUnlock.create({ userId: user.id, heroId: defaultHero.id });
    }

    // 3. Generate Token for Auto-Login
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.status(201).json({
      message: "User created",
      token,
      user: { id: user.id, username: user.username, coins: user.coins },
    });
  } catch (err) {
    // Specific Error Handling
    if (err.name === "SequelizeUniqueConstraintError") {
      return res
        .status(400)
        .json({ error: "Username or Email already exists." });
    }
    if (err.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json({ error: err.errors.map((e) => e.message).join(", ") });
    }
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Find by Email OR Username
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) return res.status(400).json({ message: "User not found" });

    const validPass = await user.validPassword(password);
    if (!validPass)
      return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });
    res.json({
      token,
      user: { id: user.id, username: user.username, coins: user.coins },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
