// 自動生成（node scripts/art/build.mjs games/hippari）。手で直さない。元: art/games/hippari/art.json
export const SHEETS = {
  "chars": {
    "url": "assets/games/hippari/chars.webp",
    "cell": 192,
    "cols": 3,
    "rows": 2,
    "frames": {
      "panda": 0,
      "chick": 1,
      "penguin": 2,
      "hamster": 3,
      "piglet": 4,
      "bear": 5
    }
  },
  "enemies": {
    "url": "assets/games/hippari/enemies.webp",
    "cell": 192,
    "cols": 3,
    "rows": 2,
    "frames": {
      "robot": 0,
      "top": 1,
      "dino": 2,
      "blocks": 3,
      "teddy": 4,
      "king": 5
    }
  },
  "icons": {
    "url": "assets/games/hippari/icons.webp",
    "cell": 128,
    "cols": 4,
    "rows": 4,
    "frames": {
      "glove": 0,
      "arm": 1,
      "arrow": 2,
      "balls": 3,
      "bomb": 4,
      "spring": 5,
      "heart": 6,
      "wing": 7,
      "apple": 8,
      "spark": 9,
      "lock": 10,
      "flag": 11,
      "crown": 12,
      "trophy": 13,
      "popper": 14,
      "hand": 15
    }
  }
} as const;

export const IMAGES = {
  "field": "assets/games/hippari/field.webp",
  "title_bg": "assets/games/hippari/title_bg.webp"
} as const;
