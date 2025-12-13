const { sequelize, Hero } = require("../models");

async function seed() {
  try {
    await sequelize.sync({ force: true }); // Drop and recreate tables

    // Check if heroes exist
    // const count = await Hero.count();
    // if (count > 0) {
    //   console.log("Heroes already seeded.");
    //   process.exit(0);
    // }

    const heroes = [
      {
        id: 1,
        name: "Vanguard",
        price: 0,
        class: "Tank",
        skins: [
          { name: "Default", value: "#00ccff" },
          { name: "Red Guard", value: "#ff3333" },
          { name: "Golden", value: "#ffd700" },
        ],
        stats: { hp: 150, speed: 100, cooldown: 5000 },
      },
      // ... (Content is already correct in file, just ensuring context match for the top part)

      {
        id: 2,
        name: "Spectre",
        price: 500,
        class: "Speed",
        skins: [
          { name: "Default", value: "#aa00ff" },
          { name: "Shadow", value: "#1a1a1a" },
          { name: "Ghost White", value: "#ffffff" },
        ],
        stats: { hp: 80, speed: 140, cooldown: 8000 },
      },
      {
        id: 3,
        name: "Techno",
        price: 1000,
        class: "Support",
        skins: [
          { name: "Default", value: "#ffee00" },
          { name: "Toxic", value: "#00ff00" },
          { name: "Rust", value: "#cd7f32" },
        ],
        stats: { hp: 100, speed: 110, cooldown: 10000 },
      },
      {
        id: 4,
        name: "Blaze",
        price: 1500,
        class: "Damage",
        skins: [
          { name: "Default", value: "#ff4500" },
          { name: "Blue Flame", value: "#00b7ff" },
        ],
        stats: { hp: 90, speed: 120, cooldown: 6000 },
      },
      {
        id: 5,
        name: "Titan",
        price: 2000,
        class: "Tank",
        skins: [
          { name: "Default", value: "#556b2f" },
          { name: "Iron", value: "#708090" },
        ],
        stats: { hp: 250, speed: 70, cooldown: 12000 },
      },
      {
        id: 6,
        name: "Volt",
        price: 1800,
        class: "Speed",
        skins: [
          { name: "Default", value: "#00ffff" },
          { name: "Overload", value: "#ff00ff" },
        ],
        stats: { hp: 70, speed: 160, cooldown: 4000 },
      },
      {
        id: 7,
        name: "Medic",
        price: 2200,
        class: "Support",
        skins: [
          { name: "Default", value: "#ffc0cb" },
          { name: "Combat", value: "#2e8b57" },
        ],
        stats: { hp: 110, speed: 110, cooldown: 7000 },
      },
      {
        id: 8,
        name: "Ghost",
        price: 2500,
        class: "Speed",
        skins: [
          { name: "Default", value: "#add8e6" },
          { name: "Phantom", value: "#4b0082" },
        ],
        stats: { hp: 80, speed: 130, cooldown: 3000 },
      },
      {
        id: 9,
        name: "Frost",
        price: 2000,
        class: "Damage",
        skins: [
          { name: "Default", value: "#e0ffff" },
          { name: "Deep Ice", value: "#00008b" },
        ],
        stats: { hp: 130, speed: 90, cooldown: 8000 },
      },
      {
        id: 10,
        name: "Sniper",
        price: 3000,
        class: "Damage",
        skins: [
          { name: "Default", value: "#8b4513" },
          { name: "Camo", value: "#556b2f" },
        ],
        stats: { hp: 60, speed: 100, cooldown: 10000 },
      },
      {
        id: 11,
        name: "Brawler",
        price: 1200,
        class: "Tank",
        skins: [
          { name: "Default", value: "#b22222" },
          { name: "Street", value: "#483d8b" },
        ],
        stats: { hp: 180, speed: 105, cooldown: 5000 },
      },
      {
        id: 12,
        name: "Engineer",
        price: 2400,
        class: "Support",
        skins: [
          { name: "Default", value: "#ffa500" },
          { name: "Cyber", value: "#00ced1" },
        ],
        stats: { hp: 120, speed: 100, cooldown: 6000 },
      },
      {
        id: 13,
        name: "Shadow",
        price: 2800,
        class: "Damage",
        skins: [
          { name: "Default", value: "#2f4f4f" },
          { name: "Void", value: "#000000" },
        ],
        stats: { hp: 75, speed: 150, cooldown: 5500 },
      },
      {
        id: 14,
        name: "Goliath",
        price: 2600,
        class: "Tank",
        skins: [
          { name: "Default", value: "#808000" },
          { name: "Mecha", value: "#c0c0c0" },
        ],
        stats: { hp: 200, speed: 85, cooldown: 9000 },
      },
      {
        id: 15,
        name: "Nova",
        price: 3500,
        class: "Damage",
        skins: [
          { name: "Default", value: "#9932cc" },
          { name: "Supernova", value: "#ff1493" },
        ],
        stats: { hp: 85, speed: 125, cooldown: 4500 },
      },
    ];

    await Hero.bulkCreate(heroes, {
      updateOnDuplicate: ["name", "price", "stats", "class", "skins"],
    });
    console.log("Heroes seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();
