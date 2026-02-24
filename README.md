# COC 阵型展示站

部落冲突（Clash of Clans）阵型展示与法术塔检测系统

## 项目简介

这是一个基于 React + Python 的部落冲突阵型展示站，主要功能包括：

- 阵型图片展示与管理
- 法术塔自动检测（使用 YOLOv8n）
- 基于 ORB 算法的图片匹配搜索
- 法术塔标注工具
- 模型训练与导出

## 技术栈

### 前端
- React 18
- Vite
- Tailwind CSS
- 原生 JavaScript

### 后端
- Python 3.10+
- Flask（法术塔检测服务）
- OpenCV（图像处理）
- Ultralytics YOLOv8（目标检测）
- PyTorch（模型训练）

## 项目结构

```
├── public/          # 静态资源
│   ├── images/      # 阵型图片
│   ├── index/       # 搜索索引
│   └── data.json    # 阵型数据
├── scripts/         # Python 脚本
│   ├── spell_tower_server.py      # 法术塔检测服务
│   ├── detect_spell_towers.py     # 法术塔检测脚本
│   ├── train_spell_tower_yolo_real.py  # 模型训练脚本
│   ├── annotate_spell_towers.py   # 法术塔标注工具
│   └── generate-keypoint-index.py    # 关键点索引生成
├── src/             # React 源码
├── models/          # 模型文件
│   ├── spell_tower_yolo/    # YOLO 模型
│   └── spell_tower_annotations/  # 标注数据
├── raw_formations/  # 原始阵型图片
├── temp/            # 临时文件
├── pyproject.toml   # Python 项目配置
└── package.json     # Node.js 项目配置
```

## 快速开始

### 1. 安装依赖

#### Python 依赖（使用 uv）
```bash
uv sync
```

#### Node.js 依赖
```bash
npm install
```

### 2. 启动服务

#### 启动法术塔检测服务
```bash
uv run spell-tower-server
# 或
python scripts/spell_tower_server.py
```

#### 启动前端开发服务器
```bash
npm run dev
```

### 3. 构建生产版本
```bash
npm run build
```

## 核心功能

### 1. 法术塔检测
- 支持检测毒药塔、狂暴塔、隐身塔
- 提供 HTTP API 接口
- 模型常驻内存，响应迅速

### 2. 图片匹配搜索
- 使用 ORB 算法提取关键点
- 离线生成索引文件
- 前端实时匹配

### 3. 模型训练
- 支持标注真实阵型图片
- 自动数据增强
- 导出 ONNX 格式模型

### 4. 标注工具
- 交互式标注界面
- 自动生成 YOLO 格式标注文件
- 支持撤销和批量操作

## API 接口

### 法术塔检测
- **POST /detect** - 上传图片，返回检测结果
- **GET /health** - 健康检查

## 部署

项目可部署到 GitHub Pages，配置如下：

1. 构建前端：`npm run build`
2. 配置 GitHub Pages 指向 `dist` 目录
3. 设置自定义域名：`cocformation.dpdns.org`

## 开发指南

### 添加新阵型
1. 将阵型图片放入 `raw_formations/` 目录
2. 使用标注工具标注法术塔：`uv run annotate-spell-towers raw_formations`
3. 生成关键点索引：`uv run generate-keypoint-index`
4. 更新 `public/data.json` 文件

### 重新训练模型
```bash
uv run train-spell-tower-yolo
```

## 许可证

MIT License
