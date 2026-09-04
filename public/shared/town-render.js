const PALETTE = {
  grassA: "#4ea33a",
  grassB: "#3e8c32",
  grassC: "#5bb445",
  dirt: "#6b4a22",
  trunk: "#7a4e24",
  leafD: "#1f6b28",
  leafL: "#3fa84a",
  road: "#6d6a6e",
  roadDark: "#4c4a4e",
  roadLine: "#d2c07a",
  park: "#6bc25a",
  parkDark: "#3e8f40",
  flowerA: "#ff6b9d",
  flowerB: "#ffe566",
  wall: "#e8d7b3",
  roof: "#c4452d",
  roofDark: "#8e2a1c",
  door: "#5a3218",
  window: "#7ec8e8",
  shopWall: "#f3e6c8",
  awningA: "#3d7cff",
  awningB: "#f4d35e",
  metro: "#2a2438",
  metroGold: "#f0c44a",
  metroWin: "#8af0ff",
};

function px(size, n) {
  return Math.max(1, Math.round((size / 16) * n));
}

function cell(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
}

function d(ctx, ox, oy, size, gx, gy, gw, gh, color) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + px(size, gx), oy + px(size, gy), px(size, gw), px(size, gh));
}

function drawGrass(ctx, x, y, size, seed) {
  cell(ctx, x, y, size, seed % 2 === 0 ? PALETTE.grassA : PALETTE.grassB);
  d(ctx, x, y, size, 3 + (seed % 5), 4, 1, 1, PALETTE.grassC);
  d(ctx, x, y, size, 10, 11, 1, 1, PALETTE.grassC);
  if (seed % 7 === 0) d(ctx, x, y, size, 7, 2, 1, 1, PALETTE.dirt);
}

function drawTree(ctx, x, y, size) {
  drawGrass(ctx, x, y, size, 1);
  d(ctx, x, y, size, 7, 10, 2, 6, PALETTE.trunk);
  d(ctx, x, y, size, 4, 3, 8, 8, PALETTE.leafD);
  d(ctx, x, y, size, 5, 4, 6, 6, PALETTE.leafL);
  d(ctx, x, y, size, 6, 2, 4, 3, PALETTE.leafL);
}

function drawRoad(ctx, x, y, size) {
  cell(ctx, x, y, size, PALETTE.road);
  d(ctx, x, y, size, 0, 0, 16, 2, PALETTE.roadDark);
  d(ctx, x, y, size, 0, 14, 16, 2, PALETTE.roadDark);
  d(ctx, x, y, size, 7, 4, 2, 3, PALETTE.roadLine);
  d(ctx, x, y, size, 7, 9, 2, 3, PALETTE.roadLine);
}

function drawPark(ctx, x, y, size) {
  cell(ctx, x, y, size, PALETTE.park);
  d(ctx, x, y, size, 0, 12, 16, 4, PALETTE.parkDark);
  d(ctx, x, y, size, 2, 11, 5, 2, PALETTE.trunk);
  d(ctx, x, y, size, 9, 11, 5, 2, PALETTE.trunk);
  d(ctx, x, y, size, 4, 4, 2, 2, PALETTE.flowerA);
  d(ctx, x, y, size, 11, 6, 2, 2, PALETTE.flowerB);
  d(ctx, x, y, size, 7, 8, 1, 1, PALETTE.flowerA);
}

function drawHouse(ctx, x, y, size) {
  drawGrass(ctx, x, y, size, 2);
  d(ctx, x, y, size, 3, 7, 10, 8, PALETTE.wall);
  d(ctx, x, y, size, 2, 3, 12, 5, PALETTE.roof);
  d(ctx, x, y, size, 7, 2, 2, 2, PALETTE.roofDark);
  d(ctx, x, y, size, 4, 4, 10, 2, PALETTE.roofDark);
  d(ctx, x, y, size, 7, 11, 3, 4, PALETTE.door);
  d(ctx, x, y, size, 4, 9, 2, 2, PALETTE.window);
  d(ctx, x, y, size, 11, 9, 2, 2, PALETTE.window);
}

function drawShop(ctx, x, y, size) {
  drawGrass(ctx, x, y, size, 3);
  d(ctx, x, y, size, 3, 7, 10, 8, PALETTE.shopWall);
  d(ctx, x, y, size, 2, 4, 12, 4, PALETTE.awningA);
  d(ctx, x, y, size, 4, 4, 2, 4, PALETTE.awningB);
  d(ctx, x, y, size, 8, 4, 2, 4, PALETTE.awningB);
  d(ctx, x, y, size, 12, 4, 2, 4, PALETTE.awningB);
  d(ctx, x, y, size, 7, 11, 3, 4, PALETTE.door);
  d(ctx, x, y, size, 4, 9, 2, 2, PALETTE.window);
}

function drawMetro(ctx, x, y, size) {
  cell(ctx, x, y, size, PALETTE.metro);
  d(ctx, x, y, size, 1, 1, 14, 14, PALETTE.metroGold);
  d(ctx, x, y, size, 2, 2, 12, 12, PALETTE.metro);
  d(ctx, x, y, size, 4, 4, 2, 8, PALETTE.metroGold);
  d(ctx, x, y, size, 10, 4, 2, 8, PALETTE.metroGold);
  d(ctx, x, y, size, 6, 7, 4, 2, PALETTE.metroGold);
  d(ctx, x, y, size, 5, 12, 6, 2, PALETTE.metroWin);
}

const DRAW = {
  empty: drawGrass,
  tree: drawTree,
  road: drawRoad,
  park: drawPark,
  house: drawHouse,
  shop: drawShop,
  metro: drawMetro,
};

export function createTownRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  let lastFlash = 0;
  let highlight = null;

  function fit(state) {
    const pad = 8;
    const tile = Math.max(
      8,
      Math.floor(Math.min((canvas.width - pad * 2) / state.width, (canvas.height - pad * 2) / state.height)),
    );
    const ox = Math.floor((canvas.width - tile * state.width) / 2);
    const oy = Math.floor((canvas.height - tile * state.height) / 2);
    return { tile, ox, oy };
  }

  function draw(state, extras = {}) {
    const { tile, ox, oy } = fit(state);
    ctx.fillStyle = "#16351c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const t = state.tiles[y * state.width + x];
        const dx = ox + x * tile;
        const dy = oy + y * tile;
        const fn = DRAW[t.type] || drawGrass;
        if (t.type === "empty") fn(ctx, dx, dy, tile, (x * 13 + y * 7) % 16);
        else fn(ctx, dx, dy, tile);
      }
    }

    if (highlight) {
      ctx.strokeStyle = "rgba(255, 236, 120, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + highlight.x * tile + 1, oy + highlight.y * tile + 1, tile - 2, tile - 2);
    }

    if (extras.flashUntil && performance.now() < extras.flashUntil) {
      const pulse = 0.18 + 0.18 * Math.sin(performance.now() / 60);
      ctx.fillStyle = `rgba(255, 214, 70, ${pulse})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      lastFlash = extras.flashUntil;
    } else if (lastFlash) {
      lastFlash = 0;
    }
  }

  return {
    draw,
    setHighlight(cell) {
      highlight = cell;
    },
  };
}
