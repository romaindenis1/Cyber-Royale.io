const MapData = {
  width: 1600,
  height: 1200,
  obstacles: [
    // Central Arena
    { x: 700, y: 500, w: 200, h: 200, type: "CORE" }, // Center block

    // Outer Walls
    { x: 200, y: 200, w: 50, h: 300, type: "WALL" },
    { x: 1350, y: 200, w: 50, h: 300, type: "WALL" },
    { x: 200, y: 700, w: 50, h: 300, type: "WALL" },
    { x: 1350, y: 700, w: 50, h: 300, type: "WALL" },

    // Horizontal Barriers
    { x: 500, y: 100, w: 600, h: 50, type: "WALL" },
    { x: 500, y: 1050, w: 600, h: 50, type: "WALL" },

    // Cover spots
    { x: 400, y: 400, w: 100, h: 100, type: "COVER" },
    { x: 1100, y: 400, w: 100, h: 100, type: "COVER" },
    { x: 400, y: 700, w: 100, h: 100, type: "COVER" },
    { x: 1100, y: 700, w: 100, h: 100, type: "COVER" },
  ],
};

module.exports = MapData;
