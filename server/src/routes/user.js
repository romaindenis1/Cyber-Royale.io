const router = require("express").Router();
const { User, Hero } = require("../models");
const auth = require("../utils/authMiddleware");

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Hero,
          as: "unlockedHeroes",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Transform to simple list of IDs
    const unlockedIds = user.unlockedHeroes
      ? user.unlockedHeroes.map((h) => h.id)
      : [];

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      coins: user.coins,
      unlockedHeroes: unlockedIds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
