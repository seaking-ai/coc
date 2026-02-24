console.log('开始测试启动时间...');
const start = Date.now();

// 记录每个模块加载时间
const modules = [
  'express',
  'multer',
  'cors',
  'fs/promises',
  'fs',
  'path',
  'url',
  'sharp',
  'uuid',
  'form-data',
  'node-fetch'
];

for (const mod of modules) {
  const modStart = Date.now();
  try {
    await import(mod);
    console.log(`${mod}: ${Date.now() - modStart}ms`);
  } catch (e) {
    console.log(`${mod}: 失败 - ${e.message}`);
  }
}

console.log(`总耗时: ${Date.now() - start}ms`);
