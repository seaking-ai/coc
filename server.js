/**
 * 本地开发服务器
 * 功能：接收前端POST请求，处理图片上传并写入data.json，支持添加、编辑、删除阵型
 */

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 目录配置
const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const DATA_FILE = path.join(__dirname, 'public', 'data.json');

// 配置 multer 存储到内存
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/**
 * 确保目录存在
 * @param {string} dir - 目录路径
 */
async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * 处理图片上传并调整大小
 * @param {Buffer} buffer - 图片buffer
 * @param {string} filename - 文件名
 * @returns {Promise<string>} 保存的文件路径
 */
async function processImage(buffer, filename) {
  await ensureDir(IMAGES_DIR);
  const outputPath = path.join(IMAGES_DIR, filename);
  
  // 统一图片尺寸
  const TARGET_WIDTH = 1000;
  const TARGET_HEIGHT = 1000;
  
  // 目标文件大小范围（字节）
  const MIN_SIZE = 100 * 1024; // 100KB
  const MAX_SIZE = 200 * 1024; // 200KB
  const TARGET_SIZE = 150 * 1024; // 150KB（目标值）
  
  // 初始质量设置
  let quality = 80;
  let outputBuffer;
  let fileSize;
  
  // 二分查找最佳质量参数
  let minQuality = 10;
  let maxQuality = 100;
  let iterations = 0;
  const MAX_ITERATIONS = 10;
  
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    // 使用当前质量压缩图片，统一尺寸为1000x1000，使用cover模式裁剪多余部分
    outputBuffer = await sharp(buffer)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { 
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality })
      .toBuffer();
    
    fileSize = outputBuffer.length;
    
    // 如果文件大小在目标范围内，直接保存
    if (fileSize >= MIN_SIZE && fileSize <= MAX_SIZE) {
      break;
    }
    
    // 如果文件太大，降低质量
    if (fileSize > MAX_SIZE) {
      maxQuality = quality - 1;
      quality = Math.max(minQuality, Math.floor((minQuality + maxQuality) / 2));
    } 
    // 如果文件太小，提高质量
    else if (fileSize < MIN_SIZE) {
      minQuality = quality + 1;
      quality = Math.min(maxQuality, Math.floor((minQuality + maxQuality) / 2));
    }
  }
  
  // 最终保存
  await sharp(buffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { 
      fit: 'cover',
      position: 'center'
    })
    .webp({ quality })
    .toFile(outputPath);
  
  console.log(`[${new Date().toISOString()}] 图片处理完成: ${filename}, 质量: ${quality}, 大小: ${(fileSize / 1024).toFixed(2)}KB, 尺寸: ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
    
  return `/images/${filename}`;
}

/**
 * 删除图片文件
 * @param {string} imagePath - 图片路径
 */
async function deleteImage(imagePath) {
  try {
    if (imagePath) {
      const fullPath = path.join(__dirname, 'public', imagePath);
      await fs.unlink(fullPath);
      console.log(`[${new Date().toISOString()}] 图片删除成功: ${imagePath}`);
    }
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] 删除图片失败: ${imagePath}`, error.message);
  }
}

/**
 * 读取数据文件
 * @returns {Promise<Array>} 阵型数据数组
 */
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * 写入数据文件
 * @param {Array} data - 阵型数据数组
 */
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 添加新阵型接口
 * POST /api/add-layout
 * 接收图片和表单数据，处理后保存
 */
app.post('/api/add-layout', upload.single('image'), async (req, res) => {
  try {
    const { title, chinaLink, internationalLink, tags, description } = req.body;
    
    // 验证必填字段：至少需要提供一个链接
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
        message: '图片为必填项'
      });
    }

    if (!chinaLink && !internationalLink) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
        message: '至少需要提供国服或国际服其中一种链接'
      });
    }

    // 处理图片
    const ext = '.webp';
    const filename = `layout_${Date.now()}${ext}`;
    const imagePath = await processImage(req.file.buffer, filename);

    // 解析标签
    let tagList = [];
    try {
      tagList = tags ? JSON.parse(tags) : [];
    } catch {
      tagList = [];
    }

    // 验证标签与链接的关联
    const hasChinaTag = tagList.includes('国服');
    const hasInternationalTag = tagList.includes('国际服');

    if (hasChinaTag && !chinaLink) {
      return res.status(400).json({
        success: false,
        error: '标签与链接不匹配',
        message: '选择国服标签时必须提供国服阵型链接'
      });
    }

    if (hasInternationalTag && !internationalLink) {
      return res.status(400).json({
        success: false,
        error: '标签与链接不匹配',
        message: '选择国际服标签时必须提供国际服链接'
      });
    }

    // 创建新记录
    const layoutId = uuidv4();
    const newLayout = {
      id: layoutId,
      title: title?.trim() || '',
      image: imagePath,
      chinaLink: chinaLink?.trim() || '',
      internationalLink: internationalLink?.trim() || '',
      tags: tagList,
      description: description?.trim() || '',
      createdAt: new Date().toISOString()
    };

    // 读取并更新数据
    const layouts = await readData();
    layouts.unshift(newLayout);
    await writeData(layouts);

    console.log(`[${new Date().toISOString()}] 新阵型添加成功: ${newLayout.title || '无标题'}`);

    res.json({
      success: true,
      data: newLayout
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 添加阵型失败:`, error.message);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

/**
 * 编辑阵型接口
 * POST /api/edit-layout
 * 更新现有阵型信息，支持更新图片
 */
app.post('/api/edit-layout', upload.single('image'), async (req, res) => {
  try {
    const { id, title, chinaLink, internationalLink, tags, description } = req.body;

    // 验证必填字段
    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
        message: '阵型ID为必填项'
      });
    }

    if (!chinaLink && !internationalLink) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
        message: '至少需要提供国服或国际服其中一种链接'
      });
    }

    // 读取现有数据
    const layouts = await readData();
    const layoutIndex = layouts.findIndex(l => l.id === id);

    if (layoutIndex === -1) {
      return res.status(404).json({
        success: false,
        error: '未找到阵型',
        message: '指定的阵型不存在'
      });
    }

    const oldLayout = layouts[layoutIndex];

    // 解析标签
    let tagList = [];
    try {
      tagList = tags ? JSON.parse(tags) : [];
    } catch {
      tagList = [];
    }

    // 验证标签与链接的关联
    const hasChinaTag = tagList.includes('国服');
    const hasInternationalTag = tagList.includes('国际服');
    
    if (hasChinaTag && !chinaLink) {
      return res.status(400).json({
        success: false,
        error: '标签与链接不匹配',
        message: '选择国服标签时必须提供国服阵型链接'
      });
    }
    
    if (hasInternationalTag && !internationalLink) {
      return res.status(400).json({
        success: false,
        error: '标签与链接不匹配',
        message: '选择国际服标签时必须提供国际服链接'
      });
    }

    // 处理图片（如果上传了新图片）
    let newImagePath = oldLayout.image;
    if (req.file) {
      const ext = '.webp';
      const filename = `layout_${Date.now()}${ext}`;
      newImagePath = await processImage(req.file.buffer, filename);

      // 删除旧图片
      await deleteImage(oldLayout.image);
    }

    // 更新记录
    const updatedLayout = {
      ...oldLayout,
      title: title?.trim() || '',
      image: newImagePath,
      chinaLink: chinaLink?.trim() || '',
      internationalLink: internationalLink?.trim() || '',
      tags: tagList,
      description: description?.trim() || '',
      updatedAt: new Date().toISOString()
    };

    layouts[layoutIndex] = updatedLayout;
    await writeData(layouts);

    console.log(`[${new Date().toISOString()}] 阵型编辑成功: ${updatedLayout.title || '无标题'}`);

    res.json({
      success: true,
      data: updatedLayout
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 编辑阵型失败:`, error.message);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

/**
 * 删除阵型接口
 * POST /api/delete-layout
 * 删除指定阵型及其图片
 */
app.post('/api/delete-layout', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
        message: '阵型ID为必填项'
      });
    }

    // 读取现有数据
    const layouts = await readData();
    const layoutIndex = layouts.findIndex(l => l.id === id);

    if (layoutIndex === -1) {
      return res.status(404).json({
        success: false,
        error: '未找到阵型',
        message: '指定的阵型不存在'
      });
    }

    const deletedLayout = layouts[layoutIndex];

    // 删除图片文件
    await deleteImage(deletedLayout.image);

    // 从数组中移除
    layouts.splice(layoutIndex, 1);
    await writeData(layouts);

    console.log(`[${new Date().toISOString()}] 阵型删除成功: ${deletedLayout.title || '无标题'}`);

    res.json({
      success: true,
      message: '阵型删除成功'
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] 删除阵型失败:`, error.message);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

/**
 * 获取所有阵型接口
 * GET /api/layouts
 */
app.get('/api/layouts', async (req, res) => {
  try {
    const layouts = await readData();
    res.json({ success: true, data: layouts });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 获取阵型列表失败:`, error.message);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

// ============================================
// 法术塔检测API
// ============================================

import FormData from 'form-data';
import fetch from 'node-fetch';
import { createReadStream } from 'fs';

// Python检测服务配置
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5000';

/**
 * 使用HTTP调用Python检测服务
 * @param {string} imagePath - 图片路径
 * @returns {Promise<Object>} 检测结果
 */
async function detectSpellTowersHTTP(imagePath) {
  const form = new FormData();
  form.append('image', createReadStream(imagePath));
  
  const response = await fetch(`${PYTHON_SERVICE_URL}/detect`, {
    method: 'POST',
    body: form,
    timeout: 30000
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`检测服务错误: ${error}`);
  }
  
  return await response.json();
}

/**
 * 检测图片中的法术塔（使用HTTP服务）
 * @param {string} imagePath - 图片路径
 * @returns {Promise<Object>} 检测结果
 */
async function detectSpellTowers(imagePath) {
  // 尝试使用Python HTTP服务
  try {
    console.log(`[${new Date().toISOString()}] 尝试使用Python服务检测...`);
    const result = await detectSpellTowersHTTP(imagePath);
    console.log(`[${new Date().toISOString()}] Python服务检测完成`);
    return result;
  } catch (e) {
    console.log(`[${new Date().toISOString()}] Python服务不可用: ${e.message}`);
    throw new Error('法术塔检测服务未启动，请先启动Python后端服务');
  }
}

/**
 * 法术塔检测接口
 * POST /api/detect-spell-towers
 * 接收图片，返回检测到的法术塔类型
 */
app.post('/api/detect-spell-towers', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '缺少图片',
        message: '请上传阵型图片'
      });
    }
    
    // 保存临时图片
    const tempDir = path.join(__dirname, 'temp');
    await ensureDir(tempDir);
    const tempPath = path.join(tempDir, `detect_${Date.now()}.jpg`);
    
    await sharp(req.file.buffer)
      .jpeg({ quality: 90 })
      .toFile(tempPath);
    
    console.log(`[${new Date().toISOString()}] 开始检测法术塔: ${tempPath}`);
    
    // 调用Python脚本检测
    const result = await detectSpellTowers(tempPath);
    
    // 删除临时文件
    try {
      await fs.unlink(tempPath);
    } catch (e) {
      console.warn(`[${new Date().toISOString()}] 删除临时文件失败:`, e.message);
    }
    
    console.log(`[${new Date().toISOString()}] 法术塔检测完成:`, result);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 法术塔检测失败:`, error.message);
    res.status(500).json({
      success: false,
      error: '检测失败',
      message: error.message
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 本地服务器运行在 http://localhost:${PORT}`);
});
