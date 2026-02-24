const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

async function test() {
  // 读取一张测试图片
  const imagePath = path.join(__dirname, '..', 'public', 'images');
  const files = await fs.readdir(imagePath);
  const testImage = files.find(f => f.endsWith('.webp'));
  
  if (!testImage) {
    console.log('没有找到测试图片');
    return;
  }
  
  const imageBuffer = await fs.readFile(path.join(__dirname, '..', 'public', 'images', testImage));
  
  // 服务端处理
  const size = 256;
  const { data: serverData } = await sharp(imageBuffer)
    .resize(size, size, { fit: 'cover', position: 'center' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  // 提取服务端灰度图
  const serverGray = new Uint8Array(size * size);
  for (let i = 0; i < serverData.length; i += 4) {
    const r = serverData[i];
    const g = serverData[i + 1];
    const b = serverData[i + 2];
    serverGray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  // 提取服务端边缘并二值化
  const serverEdge = extractEdgesBinary(serverGray, size);
  
  // 服务端网格特征
  const serverCoarse = extractGridFeaturesBinary(serverEdge, size, 8);
  
  console.log('服务端 coarseGrid 前10个值:', serverCoarse.slice(0, 10));
  console.log('服务端 coarseGrid 后10个值:', serverCoarse.slice(54, 64));
  
  // 检查边角是否有值（应该是0，因为是黑色背景）
  console.log('服务端边缘像素值 (0,0):', serverEdge[0]);
  console.log('服务端边缘像素值 (255,255):', serverEdge[255 * 255]);
  console.log('服务端边缘像素值 (128,128):', serverEdge[128 * 128 + 128]);
  
  // 检查图片尺寸
  const metadata = await sharp(imageBuffer).metadata();
  console.log('图片尺寸:', metadata.width, 'x', metadata.height);
}

function extractEdgesBinary(grayData, size) {
  const edges = new Uint8Array(size * size);
  const magnitudes = new Float32Array(size * size);
  let maxMagnitude = 0;

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;

      const gx =
        -1 * grayData[(y - 1) * size + (x - 1)] +
        -2 * grayData[y * size + (x - 1)] +
        -1 * grayData[(y + 1) * size + (x - 1)] +
        1 * grayData[(y - 1) * size + (x + 1)] +
        2 * grayData[y * size + (x + 1)] +
        1 * grayData[(y + 1) * size + (x + 1)];

      const gy =
        -1 * grayData[(y - 1) * size + (x - 1)] +
        -2 * grayData[(y - 1) * size + x] +
        -1 * grayData[(y - 1) * size + (x + 1)] +
        1 * grayData[(y + 1) * size + (x - 1)] +
        2 * grayData[(y + 1) * size + x] +
        1 * grayData[(y + 1) * size + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      magnitudes[idx] = magnitude;
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
      }
    }
  }

  const threshold = maxMagnitude * 0.15;
  
  for (let i = 0; i < size * size; i++) {
    edges[i] = magnitudes[i] > threshold ? 1 : 0;
  }

  return edges;
}

function extractGridFeaturesBinary(binaryData, size, gridSize) {
  const cellSize = size / gridSize;
  const features = [];

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      let sum = 0;
      const startY = Math.floor(gy * cellSize);
      const endY = Math.floor((gy + 1) * cellSize);
      const startX = Math.floor(gx * cellSize);
      const endX = Math.floor((gx + 1) * cellSize);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          sum += binaryData[y * size + x];
        }
      }

      const cellPixels = (endY - startY) * (endX - startX);
      features.push(sum / cellPixels);
    }
  }

  return features;
}

test();
