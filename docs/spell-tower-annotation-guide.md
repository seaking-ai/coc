# 法术塔检测模型训练指南（真实图片版本）

## 概述

由于合成数据训练的模型在真实阵型图片上检测效果不佳，建议使用真实阵型图片进行人工标注后训练。

## 工作流程

### 第一步：准备阵型图片

1. 收集包含法术塔的真实阵型截图
2. 将图片放入一个文件夹，例如 `raw_formations/`
3. 建议收集至少 50-100 张不同阵型的图片（每个法术塔类型都要有）

### 第二步：标注法术塔

运行标注工具：

```bash
python scripts/annotate_spell_towers.py raw_formations/
```

#### 标注工具快捷键：

- **1** - 选择毒药塔（绿色）
- **2** - 选择狂暴塔（红色）
- **3** - 选择隐身塔（蓝色）
- **z** - 撤销上一个标注
- **s** - 保存当前图片标注
- **n** - 下一张图片
- **p** - 上一张图片
- **q** - 退出

#### 标注步骤：

1. 工具会自动加载文件夹中的图片
2. 按数字键 **1/2/3** 选择要标注的法术塔类型
3. 用**鼠标左键点击**法术塔的中心位置
4. 标注框会自动生成（大小固定为图片的 8%）
5. 按 **s** 保存当前图片的标注
6. 按 **n** 进入下一张图片
7. 重复步骤 2-6 直到所有图片标注完成

#### 标注技巧：

- 确保点击法术塔的**中心位置**
- 每个阵型应该标注 **2 个法术塔**（游戏设定）
- 如果图片中没有法术塔，可以不标注直接保存
- 标注会自动保存到 `models/spell_tower_annotations/`

### 第三步：训练模型

标注完成后，运行训练脚本：

```bash
python scripts/train_spell_tower_yolo_real.py
```

训练流程：
1. 自动加载所有标注数据
2. 划分训练集（80%）和验证集（20%）
3. 训练 YOLOv8n 模型（默认 50 轮）
4. 导出 ONNX 格式模型

### 第四步：测试检测效果

训练完成后，模型会自动替换之前的模型。你可以在 admin 界面上传阵型图片测试检测效果。

## 文件结构

```
models/
├── spell_tower_annotations/     # 标注文件保存位置
│   ├── formation1.json          # 标注信息（JSON格式）
│   ├── formation1.txt           # YOLO格式标注
│   ├── formation2.json
│   └── ...
├── spell_tower_dataset_real/    # 真实图片数据集
│   ├── images/
│   │   ├── train/              # 训练集图片
│   │   └── val/                # 验证集图片
│   └── labels/
│       ├── train/              # 训练集标注
│       └── val/                # 验证集标注
└── spell_tower_yolo/           # 训练好的模型
    ├── train/
    │   └── weights/
    │       └── best.pt         # PyTorch模型
    └── spell_tower_yolo.onnx   # ONNX模型（可选）
```

## 提高检测精度的建议

### 1. 数据量
- 至少标注 **50 张**图片（推荐 100+）
- 每个法术塔类型都要有足够样本
- 包含不同角度、光照条件的阵型

### 2. 标注质量
- 精确点击法术塔中心
- 确保标注框大小合适（默认 8% 通常合适）
- 检查保存后的标注是否正确

### 3. 训练参数调整
如果检测效果仍不理想，可以修改训练参数：

```python
# 在 train_spell_tower_yolo_real.py 中调整
results = model.train(
    data=str(yaml_path),
    epochs=100,        # 增加训练轮数
    imgsz=640,         # 保持大尺寸以提高小目标检测
    batch=8,           # 如果显存不足可以减小
    patience=30,       # 增加早停耐心值
    # ...
)
```

### 4. 模型选择
如果 YOLOv8n 效果不佳，可以尝试更大的模型：

```python
# 使用 YOLOv8s（small）替代 YOLOv8n（nano）
model = YOLO('yolov8s.pt')  # 需要下载 yolov8s.pt
```

## 常见问题

### Q: 标注工具无法打开图片？
A: 确保图片格式为 JPG、PNG 或 WebP，且文件没有损坏。

### Q: 标注后检测仍然不准确？
A: 
1. 检查标注质量，确保点击位置准确
2. 增加标注图片数量
3. 尝试调整 `tower_size_ratio` 参数（默认 0.08）
4. 使用更大的输入尺寸（imgsz=1280）

### Q: 训练时显存不足？
A: 
1. 减小 batch size：`batch=8` 或 `batch=4`
2. 减小图片尺寸：`imgsz=320`
3. 使用 CPU 训练（较慢但不需要显存）

### Q: 如何查看标注是否正确？
A: 标注工具会在图片上显示标注框，保存后可以在 `models/spell_tower_annotations/` 中查看生成的 `.txt` 文件。

## 进阶：混合训练

如果你有合成数据和真实数据，可以混合训练：

1. 先运行合成数据训练生成基础模型
2. 然后使用真实数据进行微调（fine-tune）
3. 在 `train_yolo_model` 函数中加载之前的模型：

```python
# 加载之前训练的模型作为预训练权重
model = YOLO('models/spell_tower_yolo/train/weights/best.pt')
```

## 技术支持

如有问题，请检查：
1. 所有依赖是否正确安装（ultralytics, opencv-python, pillow）
2. Python 版本是否 >= 3.8
3. 是否有足够的磁盘空间
4. 标注文件格式是否正确
