const { sequelize, User } = require("../models");

async function giveMoney() {
  try {
    await sequelize.sync();
    await User.update({ coins: 5000 }, { where: {} });
    console.log("All users have been given 5000 credits!");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

giveMoney();
