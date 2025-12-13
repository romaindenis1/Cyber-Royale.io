const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserUnlock = sequelize.define("UserUnlock", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
});

module.exports = UserUnlock;
