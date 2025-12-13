const sequelize = require("../config/database");
const User = require("./User");
const Hero = require("./Hero");
const UserUnlock = require("./UserUnlock");

User.belongsToMany(Hero, {
  through: UserUnlock,
  as: "unlockedHeroes",
  foreignKey: "userId",
});
Hero.belongsToMany(User, {
  through: UserUnlock,
  as: "owners",
  foreignKey: "heroId",
});

module.exports = {
  sequelize,
  User,
  Hero,
  UserUnlock,
};
