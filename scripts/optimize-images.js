const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

function resizeBilinear(src, targetW, targetH) {
  const dst = { width: targetW, height: targetH, data: Buffer.alloc(targetW * targetH * 4) };
  const xRatio = src.width / targetW;
  const yRatio = src.height / targetH;
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const px = x * xRatio;
      const py = y * yRatio;
      const x1 = Math.floor(px);
      const y1 = Math.floor(py);
      const x2 = Math.min(x1 + 1, src.width - 1);
      const y2 = Math.min(y1 + 1, src.height - 1);
      const xWeight = px - x1;
      const yWeight = py - y1;
      const dstIdx = (y * targetW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src.data[(y1 * src.width + x1) * 4 + c] * (1 - xWeight) + src.data[(y1 * src.width + x2) * 4 + c] * xWeight;
        const bottom = src.data[(y2 * src.width + x1) * 4 + c] * (1 - xWeight) + src.data[(y2 * src.width + x2) * 4 + c] * xWeight;
        dst.data[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return dst;
}

const imagesToOptimize = [
  { name: 'munch.jpg', size: 400, quality: 80 },
  { name: 'chocos.jpg', size: 400, quality: 80 },
  { name: 'bournvita.jpg', size: 400, quality: 80 },
  { name: 'dailee_mango.jpg', size: 400, quality: 80 },
  { name: 'snickers.jpg', size: 400, quality: 80 },
  { name: 'lays.jpg', size: 400, quality: 80 },
  { name: 'oreo.jpg', size: 400, quality: 80 },
  { name: 'logo.jpg', size: 300, quality: 82 }
];

let totalOld = 0;
let totalNew = 0;

for (const item of imagesToOptimize) {
  const filePath = path.join(__dirname, '..', 'assets', item.name);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    continue;
  }
  const oldBuf = fs.readFileSync(filePath);
  totalOld += oldBuf.length;

  const decoded = jpeg.decode(oldBuf, { useTArray: true });
  const resized = resizeBilinear(decoded, item.size, item.size);
  const encoded = jpeg.encode(resized, item.quality);

  fs.writeFileSync(filePath, encoded.data);
  totalNew += encoded.data.length;
  console.log(`Optimized ${item.name}: ${(oldBuf.length / 1024).toFixed(1)} KB -> ${(encoded.data.length / 1024).toFixed(1)} KB (-${((1 - encoded.data.length / oldBuf.length) * 100).toFixed(1)}%)`);
}

console.log(`\n========================================`);
console.log(`TOTAL: ${(totalOld / 1024).toFixed(1)} KB -> ${(totalNew / 1024).toFixed(1)} KB (-${((1 - totalNew / totalOld) * 100).toFixed(1)}% reduction)`);
console.log(`========================================`);
