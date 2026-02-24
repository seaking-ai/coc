/**
 * Keypoint Matcher Web Worker
 *
 * 功能：在后台线程执行ORB关键点匹配计算
 * 特点：
 * 1. 使用简化的RANSAC计算单应性矩阵
 * 2. 支持局部匹配（截图场景）
 * 3. 优化的评分函数，提高区分度
 *
 * @module keypoint-matcher.worker
 */

/**
 * 计算两个描述子之间的汉明距离
 *
 * @param {Uint8Array} desc1 - 描述子1
 * @param {Uint8Array} desc2 - 描述子2
 * @returns {number} 汉明距离
 */
function hammingDistance(desc1, desc2) {
  let distance = 0;
  for (let i = 0; i < desc1.length; i++) {
    const xor = desc1[i] ^ desc2[i];
    distance += ((xor >> 0) & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1) +
                ((xor >> 4) & 1) + ((xor >> 5) & 1) + ((xor >> 6) & 1) + ((xor >> 7) & 1);
  }
  return distance;
}

/**
 * BFMatcher - 暴力匹配找到最佳匹配对
 * 使用双向匹配和更严格的比率测试
 *
 * @param {Array} desc1 - 查询图像描述子
 * @param {Array} desc2 - 目标图像描述子
 * @param {number} ratioThresh - 比率阈值
 * @returns {Array} 匹配对数组
 */
function matchDescriptors(desc1, desc2, ratioThresh = 0.75) {
  if (!desc1 || !desc2 || desc1.length === 0 || desc2.length === 0) {
    return [];
  }

  const matches = [];

  // 从desc1到desc2的匹配
  for (let i = 0; i < desc1.length; i++) {
    let bestDist = Infinity;
    let secondBestDist = Infinity;
    let bestIdx = -1;

    for (let j = 0; j < desc2.length; j++) {
      const dist = hammingDistance(desc1[i], desc2[j]);

      if (dist < bestDist) {
        secondBestDist = bestDist;
        bestDist = dist;
        bestIdx = j;
      } else if (dist < secondBestDist) {
        secondBestDist = dist;
      }
    }

    // Lowe's ratio test + 距离阈值
    if (bestIdx >= 0 && secondBestDist > 0 && 
        bestDist < ratioThresh * secondBestDist &&
        bestDist < 80) { // 最大汉明距离阈值
      matches.push({
        queryIdx: i,
        trainIdx: bestIdx,
        distance: bestDist,
        ratio: bestDist / secondBestDist
      });
    }
  }

  return matches;
}

/**
 * 双向匹配验证 - 提高匹配质量
 */
function bidirectionalMatch(desc1, desc2, ratioThresh = 0.75) {
  // 从1到2的匹配
  const matches1to2 = matchDescriptors(desc1, desc2, ratioThresh);
  
  // 从2到1的匹配
  const matches2to1 = matchDescriptors(desc2, desc1, ratioThresh);
  
  // 取交集：双向都匹配的点对
  const consistentMatches = matches1to2.filter(m1 => {
    return matches2to1.some(m2 => 
      m1.queryIdx === m2.trainIdx && m1.trainIdx === m2.queryIdx
    );
  });

  return consistentMatches;
}

/**
 * 计算单应性矩阵（简化版）
 * 使用4点法计算透视变换
 */
function computeHomography(pts1, pts2) {
  if (pts1.length < 4 || pts2.length < 4) {
    return null;
  }

  // 简化的单应性计算：假设主要是平移和缩放
  // 计算平均位移和缩放
  let sumDx = 0, sumDy = 0;
  let sumScale = 0;
  const count = Math.min(pts1.length, pts2.length);

  for (let i = 0; i < count; i++) {
    sumDx += pts2[i].x - pts1[i].x;
    sumDy += pts2[i].y - pts1[i].y;
  }

  const avgDx = sumDx / count;
  const avgDy = sumDy / count;

  return { dx: avgDx, dy: avgDy };
}

/**
 * RANSAC - 使用简化的几何变换模型
 * 支持平移、缩放、旋转
 */
function ransacFilter(keypoints1, keypoints2, matches, threshold = 10.0) {
  if (matches.length < 4) {
    return { inliers: matches, model: null };
  }

  let bestInliers = [];
  let bestModel = null;

  // RANSAC迭代
  const iterations = Math.min(100, matches.length * 2);
  
  for (let iter = 0; iter < iterations; iter++) {
    // 随机选择4个点
    const sampleIndices = [];
    while (sampleIndices.length < 4) {
      const idx = Math.floor(Math.random() * matches.length);
      if (!sampleIndices.includes(idx)) {
        sampleIndices.push(idx);
      }
    }

    // 获取样本点
    const samplePts1 = sampleIndices.map(idx => {
      const m = matches[idx];
      return keypoints1[m.queryIdx];
    });
    const samplePts2 = sampleIndices.map(idx => {
      const m = matches[idx];
      return keypoints2[m.trainIdx];
    });

    // 计算变换模型（简化的相似变换）
    const model = computeSimilarityTransform(samplePts1, samplePts2);
    if (!model) continue;

    // 统计内点
    const inliers = [];
    for (const match of matches) {
      const kp1 = keypoints1[match.queryIdx];
      const kp2 = keypoints2[match.trainIdx];

      // 应用变换
      const transformed = applyTransform(kp1, model);
      
      // 计算误差
      const error = Math.sqrt(
        Math.pow(transformed.x - kp2.x, 2) + 
        Math.pow(transformed.y - kp2.y, 2)
      );

      if (error < threshold) {
        inliers.push(match);
      }
    }

    // 更新最佳模型
    if (inliers.length > bestInliers.length) {
      bestInliers = inliers;
      bestModel = model;
    }
  }

  return { inliers: bestInliers, model: bestModel };
}

/**
 * 计算相似变换（平移+缩放+旋转）
 */
function computeSimilarityTransform(pts1, pts2) {
  if (pts1.length < 2 || pts2.length < 2) {
    return null;
  }

  // 计算中心点
  const center1 = { x: 0, y: 0 };
  const center2 = { x: 0, y: 0 };
  
  for (let i = 0; i < pts1.length; i++) {
    center1.x += pts1[i].x;
    center1.y += pts1[i].y;
    center2.x += pts2[i].x;
    center2.y += pts2[i].y;
  }
  
  center1.x /= pts1.length;
  center1.y /= pts1.length;
  center2.x /= pts2.length;
  center2.y /= pts2.length;

  // 计算缩放
  let scale = 1;
  if (pts1.length >= 2) {
    let sumDist1 = 0, sumDist2 = 0;
    for (let i = 0; i < pts1.length; i++) {
      sumDist1 += Math.sqrt(
        Math.pow(pts1[i].x - center1.x, 2) + 
        Math.pow(pts1[i].y - center1.y, 2)
      );
      sumDist2 += Math.sqrt(
        Math.pow(pts2[i].x - center2.x, 2) + 
        Math.pow(pts2[i].y - center2.y, 2)
      );
    }
    if (sumDist1 > 0) {
      scale = sumDist2 / sumDist1;
    }
  }

  // 计算平移
  const dx = center2.x - center1.x * scale;
  const dy = center2.y - center1.y * scale;

  return { scale, dx, dy, center1, center2 };
}

/**
 * 应用相似变换
 */
function applyTransform(pt, model) {
  return {
    x: pt.x * model.scale + model.dx,
    y: pt.y * model.scale + model.dy
  };
}

/**
 * 局部匹配 - 支持截图场景
 * 寻找匹配最密集的局部区域
 */
function localMatching(keypoints1, keypoints2, matches) {
  if (matches.length < 10) {
    return { inliers: matches, isLocal: false };
  }

  // 将匹配点按空间位置分组（网格化）
  const gridSize = 100; // 100x100像素的网格
  const grids = new Map();

  for (const match of matches) {
    const kp1 = keypoints1[match.queryIdx];
    const gridX = Math.floor(kp1.x / gridSize);
    const gridY = Math.floor(kp1.y / gridSize);
    const key = `${gridX},${gridY}`;
    
    if (!grids.has(key)) {
      grids.set(key, []);
    }
    grids.get(key).push(match);
  }

  // 找到匹配最多的网格
  let bestGrid = null;
  let bestCount = 0;
  
  for (const [key, gridMatches] of grids) {
    if (gridMatches.length > bestCount) {
      bestCount = gridMatches.length;
      bestGrid = gridMatches;
    }
  }

  // 如果局部匹配足够多，使用局部匹配
  if (bestCount >= matches.length * 0.3 && bestCount >= 5) {
    return { inliers: bestGrid, isLocal: true };
  }

  return { inliers: matches, isLocal: false };
}

/**
 * 计算相似度 - 优化版本
 * 重点提高区分度
 */
function computeSimilarity(query, target) {
  // 双向匹配
  const matches = bidirectionalMatch(
    query.descriptors, 
    target.descriptors, 
    0.75
  );

  if (matches.length < 4) {
    return {
      similarity: 0,
      matchCount: 0,
      inlierCount: 0,
      inlierRatio: 0
    };
  }

  // RANSAC几何验证
  const ransacResult = ransacFilter(
    query.keypoints,
    target.keypoints,
    matches,
    15.0
  );

  // 尝试局部匹配（支持截图）
  const localResult = localMatching(
    query.keypoints,
    target.keypoints,
    matches
  );

  // 选择更好的结果
  let inliers = ransacResult.inliers;
  let isLocalMatch = false;
  
  if (localResult.isLocal && localResult.inliers.length > inliers.length * 0.8) {
    inliers = localResult.inliers;
    isLocalMatch = true;
  }

  // 计算各种指标
  const matchRatio = matches.length / Math.max(query.descriptors.length, 1);
  const inlierRatio = inliers.length / Math.max(matches.length, 1);
  const minKeypoints = Math.min(query.keypoints.length, target.keypoints.length);
  const coverageRatio = inliers.length / Math.max(minKeypoints, 1);

  // 新的评分策略：重点考虑质量而非数量
  let similarity = 0;

  // 1. 匹配质量分（0-50分）
  // 使用内点率的平方，高内点率获得显著更高分数
  similarity += 50 * Math.pow(inlierRatio, 1.5);

  // 2. 覆盖率分（0-30分）
  similarity += 30 * coverageRatio;

  // 3. 匹配数量分（0-20分）
  // 使用对数函数，避免大量低质量匹配获得高分
  similarity += 20 * Math.min(1, Math.log(1 + inliers.length) / Math.log(100));

  // 调整分数分布
  if (similarity > 30) {
    // 对中高分进行非线性放大，拉大区分度
    similarity = 30 + (similarity - 30) * 1.3;
  }

  similarity = Math.min(100, Math.max(0, similarity));

  // 质量惩罚/奖励
  if (inlierRatio > 0.6 && inliers.length >= 20) {
    // 高质量匹配：显著奖励
    similarity = Math.min(100, similarity * 1.15);
  } else if (inlierRatio < 0.2 || inliers.length < 5) {
    // 低质量匹配：显著惩罚
    similarity *= 0.3;
  } else if (inlierRatio < 0.4) {
    // 中等质量：轻微惩罚
    similarity *= 0.7;
  }

  // 局部匹配调整
  if (isLocalMatch && similarity > 40) {
    // 局部匹配成功，适当降低分数（因为是部分匹配）
    similarity *= 0.9;
  }

  return {
    similarity: Math.round(similarity),
    matchCount: matches.length,
    inlierCount: inliers.length,
    inlierRatio: Math.round(inlierRatio * 100),
    isLocalMatch
  };
}

/**
 * 处理一批阵型
 */
function processBatch(queryFeatures, layouts) {
  return layouts.map(target => {
    const result = computeSimilarity(queryFeatures, target);
    return {
      id: target.id,
      image: target.image,
      ...result
    };
  });
}

/**
 * 批量匹配所有阵型
 */
async function batchMatch(queryFeatures, layouts, batchSize = 50) {
  const results = [];
  const total = layouts.length;
  const numBatches = Math.ceil(total / batchSize);

  // 预转换描述子
  const queryDescriptors = queryFeatures.descriptors.map(d => new Uint8Array(d));
  const queryFeaturesOptimized = {
    ...queryFeatures,
    descriptors: queryDescriptors
  };

  const optimizedLayouts = layouts.map(layout => ({
    ...layout,
    descriptors: layout.descriptors.map(d => new Uint8Array(d))
  }));

  // 并行处理
  const batchPromises = [];
  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, total);
    const batch = optimizedLayouts.slice(start, end);

    batchPromises.push(
      new Promise(resolve => {
        setTimeout(() => {
          const batchResults = processBatch(queryFeaturesOptimized, batch);
          resolve({ results: batchResults, processed: end });
        }, 0);
      })
    );
  }

  const batchResults = await Promise.all(batchPromises);

  for (const batchResult of batchResults) {
    results.push(...batchResult.results);
    self.postMessage({
      type: 'progress',
      current: batchResult.processed,
      total: total
    });
  }

  return results;
}

/**
 * 处理主线程消息
 */
self.onmessage = async function(e) {
  const { type, queryFeatures, layouts } = e.data;

  if (type === 'match') {
    try {
      self.postMessage({ type: 'started' });

      const startTime = performance.now();
      const results = await batchMatch(queryFeatures, layouts, 50);
      const matchTime = performance.now() - startTime;

      results.sort((a, b) => b.similarity - a.similarity);

      self.postMessage({
        type: 'complete',
        results: results,
        matchTime: matchTime
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message
      });
    }
  }
};
