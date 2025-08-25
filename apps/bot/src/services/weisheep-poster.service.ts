import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import QRCode from "qrcode";
import path from "node:path";
import fs from "node:fs/promises";

async function resolveAsset(relOrAbs: string) {
  if (path.isAbsolute(relOrAbs)) {
    return relOrAbs;
  }
  const p1 = path.resolve(process.cwd(), relOrAbs.replace(/^\/+/, ""));
  try {
    await fs.access(p1);
    return p1;
  } catch {}

  const p2 = path.resolve(__dirname, "..", "..", relOrAbs.replace(/^\/+/, ""));
  try {
    await fs.access(p2);
    return p2;
  } catch {}

  throw new Error(`[weisheep] Asset not found: ${relOrAbs}
Tried:
- ${p1}
- ${p2}`);
}

(async () => {
  try {
    const bold = await resolveAsset("src/assets/fonts/Inter-Bold.ttf");
    const reg = await resolveAsset("src/assets/fonts/Inter-Regular.ttf");
    GlobalFonts.registerFromPath(bold, "InterBold");
    GlobalFonts.registerFromPath(reg, "Inter");
  } catch (err) {
    console.warn("[weisheep] Font load failed:", err);
  }
})();

export type WeisheepPosterInput = {
  bgPath?: string;
  bigText: string;
  pair?: string;
  tvl?: string;
  pnl?: string;
  refLink?: string;
  qrData?: string;
};

async function loadImageSafe(imgPath: string) {
  const abs = await resolveAsset(imgPath);
  const buf = await fs.readFile(abs);
  return await loadImage(buf);
}

export async function generateWeisheepPoster(
  input: WeisheepPosterInput
): Promise<Buffer> {
  const {
    bgPath = "src/assets/images/template-flex.png",
    bigText,
    pair = "",
    tvl = "",
    pnl = "",
    refLink = "",
    qrData,
  } = input;

  const WIDTH = 1200,
    HEIGHT = 675;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background
  const bg = await loadImageSafe(bgPath);
  ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);

  // helper
  const drawText = (
    text: string,
    x: number,
    y: number,
    opts: {
      font: string;
      color?: string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      shadow?: boolean;
    }
  ) => {
    ctx.save();
    ctx.font = opts.font;
    ctx.fillStyle = opts.color ?? "#FFFFFF";
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = opts.baseline ?? "alphabetic";
    if (opts.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  // BIG TEXT
  drawText(bigText, 80, 140, {
    font: "bold 140px InterBold, Arial",
    color: "#FF2D2D",
    align: "left",
    baseline: "top",
    shadow: true,
  });

  // labels & values
  const leftX = 60,
    startY = 470,
    lineH = 42;
  const smallLabel = (t: string, r: number) =>
    drawText(t, leftX, startY + r * lineH, {
      font: "bold 22px InterBold, Arial",
      color: "rgba(255,255,255,0.85)",
      baseline: "top",
    });
  const smallValue = (t: string, r: number) =>
    drawText(t, leftX + 150, startY + r * lineH, {
      font: "24px Inter, Arial",
      color: "#FFFFFF",
      baseline: "top",
    });

  smallLabel("TIME", 0);
  smallValue("00:08:50", 0);
  smallLabel("DLMM", 1);
  smallValue(pair || "-", 1);
  smallLabel("TVL", 2);
  smallValue(tvl || "-", 2);
  smallLabel("PNL", 3);
  smallValue(pnl || "-", 3);
  smallLabel("REFERRAL LINK", 5);
  smallValue(refLink || "-", 5);

  // QR
  const qrContent = qrData || refLink || "";
  if (qrContent) {
    const qrPng = await QRCode.toDataURL(qrContent, {
      margin: 0,
      errorCorrectionLevel: "M",
      width: 160,
      color: { dark: "#000000", light: "#00000000" },
    });
    const qrImg = await loadImage(qrPng);
    const qrX = WIDTH - 60 - 160,
      qrY = HEIGHT - 60 - 160;
    ctx.drawImage(qrImg, qrX, qrY, 160, 160);
  }

  return canvas.toBuffer("image/png");
}
