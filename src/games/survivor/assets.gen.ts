// 自動生成（node scripts/art/build.mjs games/survivor）。手で直さない。元: art/games/survivor/art.json
export const SHEETS = {
  "enemies": {
    "url": "assets/games/survivor/enemies.webp",
    "cell": 160,
    "cols": 3,
    "rows": 2,
    "frames": {
      "slime": 0,
      "ghost": 1,
      "bat": 2,
      "mushroom": 3,
      "golem": 4,
      "dragon": 5
    }
  },
  "icons": {
    "url": "assets/games/survivor/icons.webp",
    "cell": 128,
    "cols": 4,
    "rows": 3,
    "frames": {
      "bolt": 0,
      "orbit": 1,
      "gem": 2,
      "boom": 3,
      "heart": 4,
      "shoe": 5,
      "magnet": 6,
      "sword": 7,
      "star": 8,
      "clock": 9,
      "swords": 10,
      "hammer": 11
    }
  }
} as const;

export const IMAGES = {
  "ground": "assets/games/survivor/ground.webp",
  "title_bg": "assets/games/survivor/title_bg.webp"
} as const;
