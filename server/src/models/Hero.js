const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Hero = sequelize.define("Hero", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  price: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  class: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Damage", // Tank, Damage, Speed, Support
  },
  skins: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [], // Array of { name: string, value: string (hex/url) }
  },
  stats: {
    type: DataTypes.JSON,
    allowNull: false,
    // Expected structure: { speed: number, hp: number, cooldown: number }
  },
});

module.exports = Hero;
