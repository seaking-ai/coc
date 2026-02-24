/**
 * 阵型布局匹配算法 - 基于关键点检测的混合特征匹配
 *
 * 功能：使用OpenCV.js提取图像关键点和描述子，实现结构匹配
 * 特点：
 * 1. 使用ORB算法检测关键点（城墙拐角、建筑边缘等）
 * 2. 对裁剪、旋转、光照变化具有鲁棒性
 * 3. 使用RANSAC剔除错误匹配
 * 4. 完全在浏览器端运行，无需大模型
 *
 * @module keypoint-matcher
 */

import cv from '@techstark/opencv-js';

// OpenCV加载状态
let isOpenCVLoaded = false;
let openCVLoadPromise = null;

/**
 * 初始化OpenCV
 * 确保OpenCV.js完全加载后再使用
 *
 * @returns {Promise<void>}
 */
export function initOpenCV() {
  if (isOpenCVLoaded) {
    return Promise.resolve();
  }

  if (openCVLoadPromise) {
    return openCVLoadPromise;
  }

  openCVLoadPromise = new Promise((resolve, reject) => {
    // 检查OpenCV是否已加载
    if (cv && cv.Mat) {
      isOpenCVLoaded = true;
      resolve();
      return;
    }

    // 等待OpenCV加载完成
    const checkInterval = setInterval(() => {
      if (cv && cv.Mat) {
        clearInterval(checkInterval);
        isOpenCVLoaded = true;
        resolve();
      }
    }, 100);

    // 超时处理（30秒）
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('OpenCV加载超时'));
    }, 30000);
  });

  return openCVLoadPromise;
}

/**
 * 将File对象转换为Image对象
 *
 * @param {File} file - 图片文件
 * @returns {Promise<HTMLImageElement>}
 */
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 将Image对象转换为OpenCV Mat对象
 *
 * @param {HTMLImageElement} img - 图片元素
 * @returns {Object} OpenCV Mat对象
 */
function imageToMat(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return cv.matFromImageData(imageData);
}

/**
 * 提取图像特征（关键点和描述子）
 * 使用ORB算法，对城墙结构等特征敏感
 *
 * @param {File} imageFile - 图片文件
 * @returns {Promise<{keypoints: Array, descriptors: Array}>}
 */
export async function extractFeatures(imageFile) {
  await initOpenCV();

  const img = await fileToImage(imageFile);
  let mat = imageToMat(img);

  try {
    // 调整图像大小以保持性能（与Python脚本保持一致）
    const maxSize = 512;
    const width = mat.cols;
    const height = mat.rows;
    const scale = Math.min(maxSize / width, maxSize / height);

    if (scale < 1) {
      const newWidth = Math.floor(width * scale);
      const newHeight = Math.floor(height * scale);
      const resized = new cv.Mat();
      cv.resize(mat, resized, new cv.Size(newWidth, newHeight), 0, 0, cv.INTER_AREA);
      mat.delete();
      mat = resized;
    }

    // 转换为灰度图
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

    // 使用ORB检测关键点和描述子
    // 参数与 Python 脚本 generate_keypoint_index.py 保持一致
    const orb = new cv.ORB(
      200,        // nfeatures: 最多200个关键点
      1.2,        // scaleFactor: 金字塔缩放因子
      8,          // nlevels: 金字塔层数
      31,         // edgeThreshold: 边缘阈值
      0,          // firstLevel: 第一层
      2,          // WTA_K: 用于生成描述子的像素对数
      cv.ORB_HARRIS_SCORE,  // scoreType: 使用Harris评分
      31,         // patchSize: 特征点周围区域大小
      20          // fastThreshold: FAST检测阈值
    );
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors);

    // 提取关键点信息
    const kpArray = [];
    for (let i = 0; i < keypoints.size(); i++) {
      const kp = keypoints.get(i);
      kpArray.push({
        x: kp.pt.x,
        y: kp.pt.y,
        size: kp.size,
        angle: kp.angle,
        response: kp.response,
        octave: kp.octave
      });
    }

    // 提取描述子
    // ORB描述子是uint8类型，每行32字节
    const descArray = [];
    if (!descriptors.empty()) {
      const data = descriptors.data;
      const cols = descriptors.cols;
      for (let i = 0; i < descriptors.rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
          row.push(data[i * cols + j]);
        }
        descArray.push(row);
      }
    }

    // 释放资源
    gray.delete();
    orb.delete();
    keypoints.delete();
    descriptors.delete();
    mat.delete();

    return {
      keypoints: kpArray,
      descriptors: descArray
    };
  } catch (error) {
    mat.delete();
    throw error;
  }
}

/**
 * 使用Web Worker进行批量匹配
 * 避免阻塞主线程UI
 *
 * @param {File} queryFile - 查询图像文件
 * @param {number} topK - 返回前K个结果
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<Array>}
 */
export async function searchSimilarLayouts(queryFile, topK = 5, progressCallback = null) {
  // 提取查询图像特征
  const queryFeatures = await extractFeatures(queryFile);

  // 加载关键点索引文件
  const indexResponse = await fetch(`${import.meta.env.BASE_URL}index/keypoint-index.json`);
  if (!indexResponse.ok) {
    throw new Error('关键点索引文件不存在，请先生成索引');
  }
  const keypointIndex = await indexResponse.json();

  // 加载阵型基础数据
  const dataResponse = await fetch(`${import.meta.env.BASE_URL}data.json`);
  const layouts = await dataResponse.json();

  // 创建ID到基础数据的映射
  const layoutMap = new Map(layouts.map(l => [l.id, l]));

  // 获取有关键点特征的阵型
  const layoutsWithKeypoints = keypointIndex.layouts || [];

  if (layoutsWithKeypoints.length === 0) {
    throw new Error('暂无支持图片搜索的阵型，请先生成关键点索引');
  }

  // 使用Web Worker进行匹配计算
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/keypoint-matcher.worker.js', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e) => {
      const { type, results, error, current, total } = e.data;

      if (type === 'progress' && progressCallback) {
        progressCallback(current, total);
      } else if (type === 'complete') {
        worker.terminate();

        // 获取前K个结果并补充完整信息
        const topResults = results.slice(0, topK).map(result => {
          const baseLayout = layoutMap.get(result.id);
          return {
            ...baseLayout,
            similarity: result.similarity,
            matchInfo: {
              matchCount: result.matchCount,
              inlierCount: result.inlierCount,
              inlierRatio: result.inlierRatio
            }
          };
        });

        resolve(topResults);
      } else if (type === 'error') {
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    // 发送匹配任务
    worker.postMessage({
      type: 'match',
      queryFeatures,
      layouts: layoutsWithKeypoints.map(layout => ({
        id: layout.id,
        image: layout.image,
        keypoints: layout.keypoints,
        descriptors: layout.descriptors
      }))
    });
  });
}

/**
 * 计算两个图像的相似度（用于单对比较）
 *
 * @param {Object} features1 - 图像1特征
 * @param {Object} features2 - 图像2特征
 * @returns {number} 相似度（0-100）
 */
export function computeSimilarity(features1, features2) {
  if (!features1 || !features2 ||
      !features1.descriptors || !features2.descriptors ||
      features1.descriptors.length === 0 || features2.descriptors.length === 0) {
    return 0;
  }

  // 简化的相似度计算：基于描述子匹配数量
  const minDesc = Math.min(features1.descriptors.length, features2.descriptors.length);
  const maxDesc = Math.max(features1.descriptors.length, features2.descriptors.length);

  // 关键点数量差异惩罚
  const countRatio = minDesc / maxDesc;

  // 基于关键点数量的基础相似度
  let similarity = Math.min(100, (minDesc / 50) * 100 * countRatio);

  return Math.round(similarity);
}

/**
 * 生成关键点索引
 * 为所有阵型图片提取ORB关键点并生成索引
 *
 * @param {Array} layouts - 阵型数据数组
 * @param {Function} onProgress - 进度回调函数 (current, total, layout)
 * @returns {Promise<{index: Object, success: number, errors: Array, total: number}>}
 */
export async function generateKeypointIndex(layouts, onProgress = null) {
  await initOpenCV();

  const index = {};
  const errors = [];
  let success = 0;

  const baseUrl = import.meta.env.BASE_URL || '/';

  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i];

    try {
      // 报告进度
      if (onProgress) {
        onProgress(i + 1, layouts.length, layout);
      }

      // 加载图片
      const imageUrl = layout.image?.startsWith('/') 
        ? `${baseUrl}${layout.image.slice(1)}` 
        : layout.image;

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`无法加载图片: ${response.status}`);
      }

      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });

      // 提取特征
      const features = await extractFeatures(file);

      // 保存到索引
      index[layout.id] = {
        id: layout.id,
        title: layout.title,
        image: layout.image,
        keypoints: features.keypoints,
        descriptors: features.descriptors
      };

      success++;
    } catch (error) {
      console.error(`处理阵型 ${layout.id} 失败:`, error);
      errors.push({
        id: layout.id,
        title: layout.title,
        error: error.message
      });
    }

    // 让出时间片，避免阻塞UI
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  return {
    index,
    success,
    errors,
    total: layouts.length
  };
}
