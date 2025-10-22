import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import QRCode from "qrcode";
import path from "node:path";
import fs from "node:fs/promises";

// asset help
async function resolveAssetPath(relativeOrAbsolutePath: string) {
  if (path.isAbsolute(relativeOrAbsolutePath)) return relativeOrAbsolutePath;

  const resolvedPath1 = path.resolve(
    process.cwd(),
    relativeOrAbsolutePath.replace(/^\/+/, "")
  );
  try {
    await fs.access(resolvedPath1);
    return resolvedPath1;
  } catch {}

  const resolvedPath2 = path.resolve(
    __dirname,
    "..",
    "..",
    relativeOrAbsolutePath.replace(/^\/+/, "")
  );
  try {
    await fs.access(resolvedPath2);
    return resolvedPath2;
  } catch {}

  throw new Error(`[weisheep] Asset not found: ${relativeOrAbsolutePath}
Tried:
- ${resolvedPath1}
- ${resolvedPath2}`);
}

(async () => {
  try {
    const silkscreenBoldPath = await resolveAssetPath(
      "src/assets/fonts/Silkscreen-Bold.ttf"
    );
    const silkscreenRegularPath = await resolveAssetPath(
      "src/assets/fonts/Silkscreen-Regular.ttf"
    );
    GlobalFonts.registerFromPath(silkscreenBoldPath, "SilkscreenBold");
    GlobalFonts.registerFromPath(silkscreenRegularPath, "Silkscreen");

    const fredokaBoldPath = await resolveAssetPath(
      "src/assets/fonts/Fredoka-Medium.ttf"
    );
    const fredokaRegularPath = await resolveAssetPath(
      "src/assets/fonts/Fredoka-Medium.ttf"
    );
    GlobalFonts.registerFromPath(fredokaBoldPath, "FredokaBold");
    GlobalFonts.registerFromPath(fredokaRegularPath, "Fredoka");
  } catch (error) {
    console.warn("[weisheep] Font load failed:", error);
  }
})();

export type WeisheepPosterInput = {
  backgroundImagePath?: string;
  logoImagePath?: string;
  projectName?: string;
  highlightedText: string;
  highlightedTextColor?: string;
  tradingPair?: string;
  totalValueLocked?: string;
  profitAndLoss?: string;
  referralLink?: string;
  qrCodeData?: string;

  timeDisplayText?: string;

  borderRadius?: number;
};

async function loadImageFromSafePath(imagePath: string) {
  const absolutePath = await resolveAssetPath(imagePath);
  const fileBuffer = await fs.readFile(absolutePath);
  return await loadImage(fileBuffer);
}

 // Drawing help
function createRoundedRectanglePath(
  context: ReturnType<typeof createCanvas>["getContext"] extends (
    ...args: any
  ) => infer T
    ? T
    : never,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const adjustedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + adjustedRadius, y);
  context.lineTo(x + width - adjustedRadius, y);
  context.arcTo(x + width, y, x + width, y + adjustedRadius, adjustedRadius);
  context.lineTo(x + width, y + height - adjustedRadius);
  context.arcTo(
    x + width,
    y + height,
    x + width - adjustedRadius,
    y + height,
    adjustedRadius
  );
  context.lineTo(x + adjustedRadius, y + height);
  context.arcTo(x, y + height, x, y + height - adjustedRadius, adjustedRadius);
  context.lineTo(x, y + adjustedRadius);
  context.arcTo(x, y, x + adjustedRadius, y, adjustedRadius);
  context.closePath();
}

const getFontPixelSize = (fontDeclaration: string) => {
  const match = fontDeclaration.match(/(\d+(?:\.\d+)?)px/);
  return match ? parseFloat(match[1]) : 22;
};

export async function generateWeisheepPoster(
  input: WeisheepPosterInput
): Promise<Buffer> {
  const {
    backgroundImagePath = "src/assets/images/template-flex.png",
    logoImagePath = "src/assets/images/weisheep-logo.png",
    projectName = "WEISHEEP",
    highlightedText,
    highlightedTextColor = "#22C55E",
    tradingPair = "",
    totalValueLocked = "",
    profitAndLoss = "",
    referralLink = "",
    qrCodeData,
    timeDisplayText = "10:17:12",
    borderRadius = 0,
  } = input;

  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 675;
  const drawingCanvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const drawingContext = drawingCanvas.getContext("2d");

  // Outer rounded mask
  createRoundedRectanglePath(
    drawingContext as any,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    borderRadius
  );
  drawingContext.clip();

  // Background
  const backgroundImage = await loadImageFromSafePath(backgroundImagePath);
  drawingContext.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Inner thin border
  drawingContext.save();
  createRoundedRectanglePath(
    drawingContext as any,
    1,
    1,
    CANVAS_WIDTH - 2,
    CANVAS_HEIGHT - 2,
    Math.max(0, borderRadius - 1)
  );
  drawingContext.strokeStyle = "rgba(255,255,255,0.25)";
  drawingContext.lineWidth = 2;
  drawingContext.stroke();
  drawingContext.restore();

  // ---- Text helpers
  const drawTextBlock = (
    textContent: string,
    positionX: number,
    positionY: number,
    options: {
      font: string;
      color?: string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      shadow?: boolean;
      maxWidth?: number;
    }
  ) => {
    drawingContext.save();
    drawingContext.font = options.font;
    drawingContext.fillStyle = options.color ?? "#FFFFFF";
    drawingContext.textAlign = options.align ?? "left";
    drawingContext.textBaseline = options.baseline ?? "alphabetic";
    if (options.shadow) {
      drawingContext.shadowColor = "rgba(0,0,0,0.7)";
      drawingContext.shadowBlur = 8;
      drawingContext.shadowOffsetX = 0;
      drawingContext.shadowOffsetY = 2;
    }
    if (options.maxWidth) {
      drawingContext.fillText(
        textContent,
        positionX,
        positionY,
        options.maxWidth
      );
    } else {
      drawingContext.fillText(textContent, positionX, positionY);
    }
    drawingContext.restore();
  };

  const getEllipsizedText = (
    textContent: string,
    maxWidth: number,
    fontDeclaration: string
  ) => {
    drawingContext.save();
    drawingContext.font = fontDeclaration;
    const fullWidth = drawingContext.measureText(textContent).width;
    if (fullWidth <= maxWidth) {
      drawingContext.restore();
      return textContent;
    }
    let low = 0;
    let high = textContent.length;
    const ellipsisChar = "…";
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const sliced = textContent.slice(0, mid) + ellipsisChar;
      if (drawingContext.measureText(sliced).width <= maxWidth) low = mid + 1;
      else high = mid;
    }
    const result = textContent.slice(0, Math.max(0, low - 1)) + ellipsisChar;
    drawingContext.restore();
    return result;
  };

  /* ============ Colors ============ */
  const LABEL_TEXT_COLOR = "rgba(255,255,255,0.72)";
  const VALUE_TEXT_COLOR = "#FFFFFF";

  // Label–Value box (value below label), left-aligned
  const drawLabelValueBox = (args: {
    x: number;
    y: number;
    width: number;
    label: string;
    value: string;
    labelFont?: string;
    valueFont?: string;
    labelColor?: string;
    valueColor?: string;
    labelValueGap?: number;
  }) => {
    const {
      x,
      y,
      width,
      label,
      value,
      labelFont = "bold 20px SilkscreenBold, Arial",
      valueFont = "26px Fredoka, Arial",
      labelColor = LABEL_TEXT_COLOR,
      valueColor = VALUE_TEXT_COLOR,
      labelValueGap = 4,
    } = args;

    // label
    drawTextBlock(label, x, y, {
      font: labelFont,
      color: labelColor,
      align: "left",
      baseline: "top",
    });

    // value
    const measuredValueText = getEllipsizedText(value || "-", width, valueFont);
    const valuePositionY = y + getFontPixelSize(labelFont) + labelValueGap;
    drawTextBlock(measuredValueText, x, valuePositionY, {
      font: valueFont,
      color: valueColor,
      align: "left",
      baseline: "top",
    });
  };

   // Header: logo + project name (top-left)
  try {
    const logoImage = await loadImageFromSafePath(logoImagePath);
    const LOGO_HEIGHT = 34;
    const logoAspectRatio = logoImage.width / logoImage.height;
    const LOGO_WIDTH = Math.round(LOGO_HEIGHT * logoAspectRatio);
    const LOGO_PADDING = 24;

    drawingContext.save();
    drawingContext.globalAlpha = 0.9;
    drawingContext.drawImage(
      logoImage,
      LOGO_PADDING,
      LOGO_PADDING,
      LOGO_WIDTH,
      LOGO_HEIGHT
    );
    drawingContext.restore();

    drawTextBlock(
      projectName.toUpperCase(),
      LOGO_PADDING + LOGO_WIDTH + 12,
      LOGO_PADDING + LOGO_HEIGHT - 4,
      {
        font: "700 22px FredokaBold, Fredoka, Arial",
        color: VALUE_TEXT_COLOR,
        align: "left",
        baseline: "alphabetic",
        shadow: false,
      }
    );
  } catch {
    drawTextBlock(projectName.toUpperCase(), 24, 48, {
      font: "700 22px FredokaBold, Fredoka, Arial",
      color: VALUE_TEXT_COLOR,
    });
  }

   // BIG HIGHLIGHTED TEXT (left-top area)
  drawTextBlock(highlightedText, 80, 140, {
    font: "bold 140px FredokaBold, Arial",
    color: highlightedTextColor,
    align: "left",
    baseline: "top",
    shadow: true,
  });

   // 3-row grid of label–value
  const CONTENT_LEFT = 48;
  const CONTENT_RIGHT = CANVAS_WIDTH - 48;
  const INNER_CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

  // narrow nav
  const columnGap = -120;
  const columnWidth = (INNER_CONTENT_WIDTH - columnGap) / 2;
  const column1X = CONTENT_LEFT;
  const column2X = CONTENT_LEFT + columnWidth + columnGap;

  const GRID_START_Y = 380;
  const ROW_GAP = 8;
  const ROW_HEIGHT = 72;
  const CELL_TOP_PADDING = 0;

  // Row 1: TIME | DLMM (tradingPair)
  drawLabelValueBox({
    x: column1X,
    y: GRID_START_Y + CELL_TOP_PADDING,
    width: columnWidth,
    label: "TIME",
    value: timeDisplayText,
  });
  drawLabelValueBox({
    x: column2X,
    y: GRID_START_Y + CELL_TOP_PADDING,
    width: columnWidth,
    label: "DLMM",
    value: tradingPair || "-",
  });

  // Row 2: TVL | PNL
  const row2Y = GRID_START_Y + ROW_HEIGHT + ROW_GAP;
  drawLabelValueBox({
    x: column1X,
    y: row2Y + CELL_TOP_PADDING,
    width: columnWidth,
    label: "TVL",
    value: totalValueLocked || "-",
  });
  drawLabelValueBox({
    x: column2X,
    y: row2Y + CELL_TOP_PADDING,
    width: columnWidth,
    label: "PNL",
    value: profitAndLoss || "-",
  });

  // Row 3: REFERRAL LINK (span 2 columns)
  const row3Y = row2Y + ROW_HEIGHT + ROW_GAP;
  drawLabelValueBox({
    x: CONTENT_LEFT,
    y: row3Y + CELL_TOP_PADDING,
    width: INNER_CONTENT_WIDTH,
    label: "REFERRAL LINK",
    value: referralLink || "-",
  });

   //QR code (bottom-right)
  const qrCodeContent = qrCodeData || referralLink || "";
  const qrCodeSize = 160;
  const outerPadding = 26;
  const qrCodePositionX = CANVAS_WIDTH - outerPadding - qrCodeSize;
  const qrCodePositionY = CANVAS_HEIGHT - outerPadding - qrCodeSize;

  if (qrCodeContent) {
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeContent, {
      margin: 0,
      errorCorrectionLevel: "M",
      width: qrCodeSize,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const qrCodeImage = await loadImage(qrCodeDataUrl);
    drawingContext.drawImage(
      qrCodeImage,
      qrCodePositionX,
      qrCodePositionY,
      qrCodeSize,
      qrCodeSize
    );
  }

  return drawingCanvas.toBuffer("image/png");
}
