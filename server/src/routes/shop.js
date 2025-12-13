const router = require("express").Router();
const { User, Hero, UserUnlock, sequelize } = require("../models");
const auth = require("../utils/authMiddleware");

router.get("/heroes", auth, async (req, res) => {
  try {
    const heroes = await Hero.findAll();
    // In a real app we might want to flag which ones are owned here, but we can do that on frontend by fetching user profile
    res.json(heroes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/buy-hero", auth, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { heroId } = req.body;
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    const hero = await Hero.findByPk(heroId);

    if (!hero) throw new Error("Hero not found");

    // Check if already owned
    const owned = await UserUnlock.findOne({ where: { userId, heroId } });
    if (owned) {
      await t.rollback();
      return res.status(400).json({ message: "Hero already owned" });
    }

    if (user.coins < hero.price) {
      await t.rollback();
      return res.status(400).json({ message: "Insufficient coins" });
    }

    // Deduct coins
    user.coins -= hero.price;
    await user.save({ transaction: t });

    // Unlock hero
    await UserUnlock.create({ userId, heroId }, { transaction: t });

    await t.commit();
    res.json({ message: "Hero purchased", coins: user.coins });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
