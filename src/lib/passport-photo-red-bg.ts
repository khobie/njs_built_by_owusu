/** Standard passport / ID photo red (Ghana-style) — solid, no blending. */
export const PASSPORT_PHOTO_RED = { r: 204, g: 0, b: 0 } as const;

export const PASSPORT_PHOTO_WIDTH = 413;
export const PASSPORT_PHOTO_HEIGHT = 531;

export type PassportPhotoProgress = (message: string) => void;

const BG_COLOR_TOLERANCE = 72;
const BG_CHAIN_TOLERANCE = 52;

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function saturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isBackdropLike(r: number, g: number, b: number, a: number, bg: { r: number; g: number; b: number }) {
  if (a < 16) return true;
  if (colorDistance(r, g, b, bg.r, bg.g, bg.b) <= BG_COLOR_TOLERANCE) return true;
  const lum = luminance(r, g, b);
  const sat = saturation(r, g, b);
  if (lum >= 175 && sat <= 0.28) return true;
  if (lum <= 70 && sat <= 0.25) return true;
  if (g > r + 28 && g > b + 28 && g > 90) return true;
  if (b > r + 22 && b > g + 12 && b > 90) return true;
  return false;
}

function sampleEdgeBackground(data: Uint8ClampedArray, w: number, h: number) {
  const strip = Math.max(4, Math.floor(Math.min(w, h) * 0.1));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  const collect = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < strip; y++) collect(x, y);
    for (let y = h - strip; y < h; y++) collect(x, y);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < strip; x++) collect(x, y);
    for (let x = w - strip; x < w; x++) collect(x, y);
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  return { r: Math.round(avg(rs)), g: Math.round(avg(gs)), b: Math.round(avg(bs)) };
}

function buildBackgroundMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: { r: number; g: number; b: number }
) {
  const mask = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  const trySeed = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    const o = idx * 4;
    if (!isBackdropLike(data[o], data[o + 1], data[o + 2], data[o + 3], bg)) return;
    visited[idx] = 1;
    mask[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    const o = idx * 4;
    const pr = data[o];
    const pg = data[o + 1];
    const pb = data[o + 2];
    const neighbours: [number, number][] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      const no = ni * 4;
      const nr = data[no];
      const ng = data[no + 1];
      const nb = data[no + 2];
      const na = data[no + 3];
      if (
        isBackdropLike(nr, ng, nb, na, bg) ||
        colorDistance(nr, ng, nb, pr, pg, pb) <= BG_CHAIN_TOLERANCE
      ) {
        visited[ni] = 1;
        mask[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return mask;
}

function applySolidRedBackground(data: Uint8ClampedArray, mask: Uint8Array) {
  const { r, g, b } = PASSPORT_PHOTO_RED;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

/** Fit image on solid red passport canvas; export JPEG. */
async function compositeCutoutOnRedPassport(source: Blob | HTMLImageElement): Promise<string> {
  const url =
    source instanceof Blob ? URL.createObjectURL(source) : (source as HTMLImageElement).src;
  const revoke = source instanceof Blob;
  try {
    const img = source instanceof HTMLImageElement ? source : await loadImage(url);
    const scale = Math.min(
      PASSPORT_PHOTO_WIDTH / img.naturalWidth,
      PASSPORT_PHOTO_HEIGHT / img.naturalHeight,
      1.5
    );
    const drawW = Math.round(img.naturalWidth * scale);
    const drawH = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = PASSPORT_PHOTO_WIDTH;
    canvas.height = PASSPORT_PHOTO_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image.');

    ctx.fillStyle = `rgb(${PASSPORT_PHOTO_RED.r},${PASSPORT_PHOTO_RED.g},${PASSPORT_PHOTO_RED.b})`;
    ctx.fillRect(0, 0, PASSPORT_PHOTO_WIDTH, PASSPORT_PHOTO_HEIGHT);

    const offsetX = (PASSPORT_PHOTO_WIDTH - drawW) / 2;
    const offsetY = (PASSPORT_PHOTO_HEIGHT - drawH) / 2;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

    return exportPassportJpeg(canvas);
  } finally {
    if (revoke) URL.revokeObjectURL(url);
  }
}

function exportPassportJpeg(canvas: HTMLCanvasElement): string {
  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 650_000 && quality > 0.5) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > 700_000) {
    throw new Error('Photo is still too large after compression. Try a smaller image.');
  }
  return dataUrl;
}

/** AI removes any background; result is placed on flat red. */
async function removeBackgroundWithAi(file: File, onProgress?: PassportPhotoProgress): Promise<string> {
  onProgress?.('Loading background removal (first time may take a minute)…');
  const { removeBackground } = await import('@imgly/background-removal');

  const cutout = await removeBackground(file, {
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (_key: string, current: number, total: number) => {
      if (total > 0) {
        const pct = Math.round((current / total) * 100);
        onProgress?.(`Removing background… ${pct}%`);
      }
    },
  });

  onProgress?.('Applying passport red background…');
  return compositeCutoutOnRedPassport(cutout);
}

/** Fallback when AI is unavailable — flood fill from image edges. */
async function removeBackgroundFallback(file: File, onProgress?: PassportPhotoProgress): Promise<string> {
  onProgress?.('Applying red background (fallback)…');
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(
      PASSPORT_PHOTO_WIDTH / img.naturalWidth,
      PASSPORT_PHOTO_HEIGHT / img.naturalHeight,
      1.5
    );
    const drawW = Math.round(img.naturalWidth * scale);
    const drawH = Math.round(img.naturalHeight * scale);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = drawW;
    srcCanvas.height = drawH;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('Could not process image.');
    srcCtx.drawImage(img, 0, 0, drawW, drawH);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = PASSPORT_PHOTO_WIDTH;
    outCanvas.height = PASSPORT_PHOTO_HEIGHT;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new Error('Could not process image.');

    outCtx.fillStyle = `rgb(${PASSPORT_PHOTO_RED.r},${PASSPORT_PHOTO_RED.g},${PASSPORT_PHOTO_RED.b})`;
    outCtx.fillRect(0, 0, PASSPORT_PHOTO_WIDTH, PASSPORT_PHOTO_HEIGHT);
    outCtx.drawImage(srcCanvas, (PASSPORT_PHOTO_WIDTH - drawW) / 2, (PASSPORT_PHOTO_HEIGHT - drawH) / 2);

    const imageData = outCtx.getImageData(0, 0, PASSPORT_PHOTO_WIDTH, PASSPORT_PHOTO_HEIGHT);
    const bg = sampleEdgeBackground(imageData.data, PASSPORT_PHOTO_WIDTH, PASSPORT_PHOTO_HEIGHT);
    const mask = buildBackgroundMask(imageData.data, PASSPORT_PHOTO_WIDTH, PASSPORT_PHOTO_HEIGHT, bg);
    applySolidRedBackground(imageData.data, mask);
    outCtx.putImageData(imageData, 0, 0);

    return exportPassportJpeg(outCanvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Remove any photo background and place the subject on solid passport red.
 */
export async function processPassportPhotoFile(
  file: File,
  onProgress?: PassportPhotoProgress
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a JPEG or PNG image.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Image is too large (max 12 MB).');
  }
  if (typeof window === 'undefined') {
    throw new Error('Photo processing must run in the browser.');
  }

  try {
    return await removeBackgroundWithAi(file, onProgress);
  } catch (e) {
    console.warn('AI background removal failed, using edge fallback:', e);
    try {
      return await removeBackgroundFallback(file, onProgress);
    } catch (fallbackErr) {
      const msg =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : e instanceof Error
            ? e.message
            : 'Could not process photo.';
      throw new Error(msg);
    }
  }
}
