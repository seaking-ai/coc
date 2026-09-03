#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
法术塔和大本等级YOLO检测模型训练脚本

类别定义（与classes.txt顺序一致）：
  法术塔类别：
    0 = rage_tower (狂暴塔)
    1 = invisibility_tower (隐身塔)
    2 = poison_tower (毒药塔)
  大本等级类别：
    3 = level18 (18级大本营)
    4 = level17 (17级大本营)
    5 = level16 (16级大本营)
    6 = level15 (15级大本营)
    7 = level14 (14级大本营)
    8 = level13 (13级大本营)
    9 = level12 (12级大本营)
    10 = level11 (11级大本营)

使用方法：
    uv run scripts/train_spell_tower_yolo_real.py
    python scripts/train_spell_tower_yolo_real.py

标注文件格式（YOLO格式）：
    每个图片对应一个同名.txt文件，每行一个目标：
    class_id x_center y_center width height
    （所有值为相对于图片尺寸的0-1之间的归一化值）

目录结构：
    raw_formations/           # 原始图片和LabelImg标注目录
    ├── 1.png
    ├── 1.txt                 # LabelImg生成的标注文件
    ├── classes.txt           # 类别定义文件
    └── ...

输出：
    models/spell_tower_yolo/ - 训练好的模型 (PyTorch .pt格式)

模型选择：
    默认使用 YOLOv8s (small)，比 YOLOv8n (nano) 更大，精度更高
    可选: yolov8n, yolov8s, yolov8m, yolov8l, yolov8x
"""

import os
import sys

# 修复OpenMP冲突
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import cv2
import numpy as np
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Dict, Optional
import json
import random
from PIL import Image
import logging

# 添加项目根目录到路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# 配置日志
log_file = PROJECT_ROOT / 'train_spell_tower.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8', mode='a'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)
logger.info(f"日志文件位置: {log_file.absolute()}")

# 配置路径
RAW_FORMATIONS_DIR = PROJECT_ROOT / "raw_formations"           # 原始图片和标注目录
ANNOTATIONS_DIR = PROJECT_ROOT / "models" / "spell_tower_annotations"  # 备用标注目录
DATASET_DIR = PROJECT_ROOT / "models" / "spell_tower_dataset_real"
MODEL_DIR = PROJECT_ROOT / "models" / "spell_tower_yolo"

# 类别映射（与LabelImg的classes.txt保持一致）
# 注意：类别顺序必须与classes.txt中的顺序一致
# 法术塔: 0=rage_tower, 1=invisibility_tower, 2=poison_tower
# 大本等级: 3=level18, 4=level17, 5=level16, 6=level15, 7=level14, 8=level13, 9=level12, 10=level11
ALL_CLASSES = {
    0: "狂暴塔",
    1: "隐身塔",
    2: "毒药塔",
    3: "18级大本营",
    4: "17级大本营",
    5: "16级大本营",
    6: "15级大本营",
    7: "14级大本营",
    8: "13级大本营",
    9: "12级大本营",
    10: "11级大本营"
}

# 法术塔类别（用于兼容旧代码）
SPELL_TOWER_CLASSES = {
    0: "狂暴塔",
    1: "隐身塔",
    2: "毒药塔"
}

# 支持的图片格式
SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif']


def create_dataset_structure():
    """
    创建YOLO数据集目录结构
    
    目录结构：
    models/spell_tower_dataset_real/
    ├── images/
    │   ├── train/      # 训练集图片
    │   └── val/        # 验证集图片
    └── labels/
        ├── train/      # 训练集标注
        └── val/        # 验证集标注
    """
    dirs = [
        DATASET_DIR / "images" / "train",
        DATASET_DIR / "images" / "val",
        DATASET_DIR / "labels" / "train",
        DATASET_DIR / "labels" / "val"
    ]
    
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
        logger.info(f"创建目录: {d}")


def find_image_file(base_path: Path) -> Optional[Path]:
    """
    根据基础路径查找对应的图片文件
    
    参数：
        base_path: 基础路径（不含扩展名）
    
    返回：
        找到的图片路径，未找到返回None
    
    注意：
        使用字符串拼接而非with_suffix，避免文件名中包含点号时的问题
        例如：2026.3.21.1 应该匹配 2026.3.21.1.png，而不是 2026.3.21.png
    """
    base_str = str(base_path)
    for ext in SUPPORTED_IMAGE_EXTENSIONS:
        # 使用字符串拼接，避免with_suffix把最后一个点号后内容当作扩展名
        image_path = Path(base_str + ext)
        if image_path.exists():
            return image_path
    return None


def parse_yolo_annotation(txt_file: Path) -> List[Dict]:
    """
    解析YOLO格式的标注文件
    
    参数：
        txt_file: YOLO标注文件路径(.txt)
    
    返回：
        标注列表，每个元素包含class_id, x, y, w, h
    
    异常：
        文件格式错误时返回空列表并记录错误
    """
    annotations = []
    
    try:
        with open(txt_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            parts = line.split()
            if len(parts) != 5:
                logger.warning(f"标注文件 {txt_file} 第{line_num}行格式错误: {line}")
                continue
            
            try:
                class_id = int(parts[0])
                x_center = float(parts[1])
                y_center = float(parts[2])
                width = float(parts[3])
                height = float(parts[4])
                
                # 验证数值范围（现在支持11个类别：3个法术塔 + 8个大本等级）
                if not (0 <= class_id <= 10):
                    logger.warning(f"标注文件 {txt_file} 第{line_num}行类别ID越界: {class_id}")
                    continue
                if not all(0 <= v <= 1 for v in [x_center, y_center, width, height]):
                    logger.warning(f"标注文件 {txt_file} 第{line_num}行坐标值越界")
                    continue
                
                annotations.append({
                    'class_id': class_id,
                    'x': x_center,
                    'y': y_center,
                    'w': width,
                    'h': height
                })
            except ValueError as e:
                logger.warning(f"标注文件 {txt_file} 第{line_num}行解析错误: {e}")
                continue
        
    except Exception as e:
        logger.error(f"读取标注文件失败 {txt_file}: {e}")
        return []
    
    return annotations


def load_annotations_from_directory(image_dir: Path) -> List[Dict]:
    """
    从指定目录加载LabelImg标准格式的标注
    
    扫描目录中的所有.txt文件，查找同名的图片文件
    
    参数：
        image_dir: 图片和标注文件所在目录
    
    返回：
        标注数据列表，每个元素包含图片路径和标注信息
    
    说明：
        LabelImg生成的标注文件与图片同名，扩展名为.txt
        例如：image1.jpg 对应 image1.txt
    """
    annotations = []
    
    if not image_dir.exists():
        logger.warning(f"目录不存在: {image_dir}")
        return annotations
    
    # 查找所有YOLO格式标注文件(.txt)，排除classes.txt
    txt_files = [f for f in image_dir.glob("*.txt") if f.name != "classes.txt"]
    
    logger.info(f"在 {image_dir} 找到 {len(txt_files)} 个YOLO标注文件")
    
    for txt_file in txt_files:
        try:
            # 查找对应的图片文件（同名不同扩展名）
            base_name = txt_file.stem
            image_path = find_image_file(image_dir / base_name)
            
            if image_path is None:
                logger.warning(f"找不到图片文件: {base_name}.* (对应标注: {txt_file.name})")
                continue
            
            # 解析YOLO标注文件
            yolo_annotations = parse_yolo_annotation(txt_file)
            
            if not yolo_annotations:
                logger.warning(f"标注文件为空或格式错误: {txt_file}")
                continue
            
            annotations.append({
                'image_path': image_path,
                'yolo_file': txt_file,
                'annotations': yolo_annotations,
                'image_name': image_path.name
            })
            
            logger.debug(f"成功加载标注: {image_path.name} - {len(yolo_annotations)}个目标")
            
        except Exception as e:
            logger.error(f"加载标注文件失败 {txt_file}: {e}")
    
    logger.info(f"从 {image_dir} 成功加载 {len(annotations)} 个有效标注")
    return annotations


def load_annotations() -> List[Dict]:
    """
    加载所有标注文件（优先从raw_formations读取）
    
    搜索顺序：
        1. raw_formations/ 目录（LabelImg标注的主要位置）
        2. models/spell_tower_annotations/ 目录（备用位置）
    
    返回：
        标注数据列表，每个元素包含图片路径和标注信息
    """
    annotations = []
    
    # 1. 首先尝试从 raw_formations 加载（LabelImg标注位置）
    if RAW_FORMATIONS_DIR.exists():
        logger.info(f"正在从 {RAW_FORMATIONS_DIR} 加载标注...")
        annotations = load_annotations_from_directory(RAW_FORMATIONS_DIR)
    
    # 2. 如果 raw_formations 没有，尝试备用标注目录
    if not annotations and ANNOTATIONS_DIR.exists():
        logger.info(f"未在 raw_formations 找到标注，尝试从 {ANNOTATIONS_DIR} 加载...")
        annotations = load_annotations_from_directory(ANNOTATIONS_DIR)
    
    # 3. 如果还是没有，尝试旧版JSON格式（向后兼容）
    if not annotations:
        logger.info("尝试加载旧版JSON格式标注...")
        annotations = load_annotations_from_legacy()
    
    return annotations


def load_annotations_from_legacy() -> List[Dict]:
    """
    从旧版JSON格式加载标注（向后兼容）
    
    返回：
        标注数据列表
    """
    annotations = []
    
    if not ANNOTATIONS_DIR.exists():
        return annotations
    
    json_files = list(ANNOTATIONS_DIR.glob("*.json"))
    logger.info(f"找到 {len(json_files)} 个旧版JSON标注文件")
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            image_name = data.get('image_name', '')
            if not image_name:
                continue
            
            # 查找图片文件
            image_path = ANNOTATIONS_DIR / image_name
            if not image_path.exists():
                image_path = RAW_FORMATIONS_DIR / image_name
            if not image_path.exists():
                possible_paths = [
                    PROJECT_ROOT / "public" / "images" / image_name,
                ]
                for path in possible_paths:
                    if path.exists():
                        image_path = path
                        break
            
            if not image_path.exists():
                logger.warning(f"找不到图片文件: {image_name}")
                continue
            
            # 检查是否有对应的YOLO格式标注文件
            yolo_file = json_file.with_suffix('.txt')
            if not yolo_file.exists():
                logger.warning(f"找不到YOLO标注文件: {yolo_file}")
                continue
            
            # 解析YOLO标注
            yolo_annotations = parse_yolo_annotation(yolo_file)
            
            annotations.append({
                'image_path': image_path,
                'yolo_file': yolo_file,
                'annotations': yolo_annotations,
                'image_name': image_name
            })
            
        except Exception as e:
            logger.error(f"加载旧版标注失败 {json_file}: {e}")
    
    return annotations


def copy_to_dataset(annotations: List[Dict], train_ratio: float = 0.8):
    """
    将标注图片复制到数据集目录
    
    参数：
        annotations: 标注数据列表
        train_ratio: 训练集比例，默认0.8表示80%训练集，20%验证集
    
    异常：
        复制失败时会记录错误但继续处理其他文件
    """
    if not annotations:
        logger.error("没有可用的标注数据")
        return
    
    # 随机打乱
    random.shuffle(annotations)
    
    # 分割训练集和验证集
    train_count = int(len(annotations) * train_ratio)
    train_data = annotations[:train_count]
    val_data = annotations[train_count:]
    
    logger.info(f"训练集: {len(train_data)} 张")
    logger.info(f"验证集: {len(val_data)} 张")
    
    # 复制文件
    for split, data in [("train", train_data), ("val", val_data)]:
        for i, item in enumerate(data):
            image_path = item['image_path']
            yolo_file = item['yolo_file']
            
            # 生成统一格式的文件名
            img_filename = f"{split}_{i:05d}.jpg"
            img_dest = DATASET_DIR / "images" / split / img_filename
            
            try:
                # 读取并转换为jpg格式
                img = cv2.imread(str(image_path))
                if img is None:
                    # 尝试PIL读取
                    pil_img = Image.open(image_path)
                    if pil_img.mode == 'RGBA':
                        pil_img = pil_img.convert('RGB')
                    img = np.array(pil_img)
                    img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                
                cv2.imwrite(str(img_dest), img)
                
                # 复制标注文件
                label_filename = f"{split}_{i:05d}.txt"
                label_dest = DATASET_DIR / "labels" / split / label_filename
                shutil.copy(str(yolo_file), str(label_dest))
                
                logger.debug(f"复制成功: {image_path.name} -> {img_filename}")
                
            except Exception as e:
                logger.error(f"复制文件失败 {image_path}: {e}")
    
    logger.info("数据集准备完成!")


def create_data_yaml():
    """
    创建YOLO数据集配置文件(data.yaml)
    
    返回：
        配置文件路径
    """
    yaml_content = f"""# 法术塔和大本等级检测数据集配置
path: {DATASET_DIR.absolute()}
train: images/train
val: images/val
test:  # 可选

# 类别
nc: 11  # 类别数量 (3个法术塔 + 8个大本等级)
names:
  # 法术塔类别
  0: rage_tower           # 狂暴塔
  1: invisibility_tower   # 隐身塔
  2: poison_tower         # 毒药塔
  # 大本等级类别
  3: level18              # 18级大本营
  4: level17              # 17级大本营
  5: level16              # 16级大本营
  6: level15              # 15级大本营
  7: level14              # 14级大本营
  8: level13              # 13级大本营
  9: level12              # 12级大本营
  10: level11             # 11级大本营
"""
    
    yaml_path = DATASET_DIR / "data.yaml"
    with open(yaml_path, 'w', encoding='utf-8') as f:
        f.write(yaml_content)
    
    logger.info(f"创建数据集配置: {yaml_path}")
    return yaml_path


def create_classes_txt():
    """
    创建classes.txt文件供LabelImg使用
    
    会在 raw_formations 和备用标注目录都创建
    
    说明：
        LabelImg需要classes.txt文件来定义类别名称
        类别顺序:
        0=rage_tower(狂暴塔), 1=invisibility_tower(隐身塔), 2=poison_tower(毒药塔)
        3=level18(18级大本营), 4=level17(17级大本营), 5=level16(16级大本营), 6=level15(15级大本营)
        7=level14(14级大本营), 8=level13(13级大本营), 9=level12(12级大本营), 10=level11(11级大本营)
    """
    content = "rage_tower\ninvisibility_tower\npoison_tower\nlevel18\nlevel17\nlevel16\nlevel15\nlevel14\nlevel13\nlevel12\nlevel11\n"
    
    # 在 raw_formations 创建
    if RAW_FORMATIONS_DIR.exists():
        classes_file = RAW_FORMATIONS_DIR / "classes.txt"
        with open(classes_file, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"创建LabelImg类别文件: {classes_file}")
    
    # 在备用标注目录创建
    if ANNOTATIONS_DIR.exists():
        classes_file = ANNOTATIONS_DIR / "classes.txt"
        with open(classes_file, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"创建LabelImg类别文件: {classes_file}")
    
    logger.info("类别顺序: 0=rage_tower(狂暴塔), 1=invisibility_tower(隐身塔), 2=poison_tower(毒药塔)")


def download_yolo_model(model_name: str = "yolov8s"):
    """
    下载YOLO预训练模型
    
    参数：
        model_name: 模型名称，可选 yolov8n, yolov8s, yolov8m, yolov8l, yolov8x
                   默认 yolov8s (small)，比 nano 更大，精度更高
    
    返回：
        模型文件路径，如果下载失败返回None
    
    异常：
        网络错误时会提供手动下载指引
    """
    import urllib.request
    import ssl
    
    model_url = f"https://github.com/ultralytics/assets/releases/download/v8.3.0/{model_name}.pt"
    model_path = Path(f"{model_name}.pt")
    
    if model_path.exists():
        logger.info(f"模型文件已存在: {model_path}")
        return str(model_path)
    
    logger.info(f"正在下载 {model_name} 预训练模型...")
    logger.info(f"下载地址: {model_url}")
    
    try:
        # 创建SSL上下文（忽略证书验证）
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        # 下载模型
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl_context)
        )
        urllib.request.install_opener(opener)
        
        urllib.request.urlretrieve(model_url, model_path)
        logger.info(f"模型下载完成: {model_path}")
        return str(model_path)
    except Exception as e:
        logger.error(f"模型下载失败: {e}")
        logger.info("请手动下载模型文件:")
        logger.info(f"1. 访问: {model_url}")
        logger.info(f"2. 下载后放到项目根目录: {model_path.absolute()}")
        return None


def create_yolov8_p2_yaml(original_model_name: str = "yolov8s") -> Path:
    """
    创建启用P2检测层的YOLOv8配置文件
    """
    # 提取模型大小标识 (n, s, m, l, x)
    size_key = original_model_name.replace('yolov8', '')
    if size_key not in ['n', 's', 'm', 'l', 'x']:
        size_key = 's'
    
    # 根据模型大小确定缩放系数对应的值
    scale_configs = {
        'n': {'depth': 0.33, 'width': 0.25, 'max_channels': 1024},
        's': {'depth': 0.33, 'width': 0.50, 'max_channels': 1024},
        'm': {'depth': 0.67, 'width': 0.75, 'max_channels': 768},
        'l': {'depth': 1.00, 'width': 1.00, 'max_channels': 512},
        'x': {'depth': 1.00, 'width': 1.25, 'max_channels': 512},
    }
    
    scale = scale_configs[size_key]
    
    yaml_content = f'''# YOLOv8 with P2 detection layer (小目标优化版)
# 基于 {original_model_name} 配置，添加P2检测层

nc: 11
scales:
  {size_key}: [{scale['depth']}, {scale['width']}, {scale['max_channels']}]

backbone:
  # [from, repeats, module, args]
  - [-1, 1, Conv, [64, 3, 2]]  # 0-P1/2
  - [-1, 1, Conv, [128, 3, 2]]  # 1-P2/4
  - [-1, 3, C2f, [128, True]]
  - [-1, 1, Conv, [256, 3, 2]]  # 3-P3/8
  - [-1, 6, C2f, [256, True]]
  - [-1, 1, Conv, [512, 3, 2]]  # 5-P4/16
  - [-1, 6, C2f, [512, True]]
  - [-1, 1, Conv, [1024, 3, 2]]  # 7-P5/32
  - [-1, 3, C2f, [1024, True]]
  - [-1, 1, SPPF, [1024, 5]]  # 9

head:
  - [-1, 1, nn.Upsample, [None, 2, "nearest"]]
  - [[-1, 6], 1, Concat, [1]]  # cat backbone P4
  - [-1, 3, C2f, [512]]  # 12

  - [-1, 1, nn.Upsample, [None, 2, "nearest"]]
  - [[-1, 4], 1, Concat, [1]]  # cat backbone P3
  - [-1, 3, C2f, [256]]  # 15

  - [-1, 1, nn.Upsample, [None, 2, "nearest"]]
  - [[-1, 2], 1, Concat, [1]]  # cat backbone P2
  - [-1, 3, C2f, [128]]  # 18 (P2层 - 小目标专用)

  - [-1, 1, Conv, [128, 3, 2]]
  - [[-1, 15], 1, Concat, [1]]
  - [-1, 3, C2f, [256]]  # 21

  - [-1, 1, Conv, [256, 3, 2]]
  - [[-1, 12], 1, Concat, [1]]
  - [-1, 3, C2f, [512]]  # 24

  - [-1, 1, Conv, [512, 3, 2]]
  - [[-1, 9], 1, Concat, [1]]
  - [-1, 3, C2f, [1024]]  # 27

  # Detect head 包含 P2, P3, P4, P5
  - [[18, 21, 24, 27], 1, Detect, [nc]]
'''
    
    yaml_path = MODEL_DIR / f"{original_model_name}_p2.yaml"
    with open(yaml_path, 'w', encoding='utf-8') as f:
        f.write(yaml_content)
    
    logger.info(f"创建P2检测层配置文件: {yaml_path}")
    return yaml_path


def find_existing_models() -> List[Path]:
    """
    查找已存在的训练好的模型文件
    
    返回：
        找到的模型文件路径列表，按修改时间排序（最新的在前）
    """
    existing_models = []
    
    # 搜索路径：models/spell_tower_yolo/ 目录下的所有 .pt 文件
    if MODEL_DIR.exists():
        # 搜索 train/weights/best.pt 和 last.pt
        for pattern in ["train/weights/*.pt", "**/*.pt"]:
            existing_models.extend(MODEL_DIR.glob(pattern))
    
    # 去重并按修改时间排序
    existing_models = list(set(existing_models))
    existing_models.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    
    return existing_models


def select_pretrained_model() -> Optional[Path]:
    """
    交互式选择预训练模型
    
    返回：
        用户选择的模型路径，如果选择不加载或没有可用模型则返回None
    """
    existing_models = find_existing_models()
    
    if not existing_models:
        logger.info("未找到已训练的模型，将使用官方预训练模型(COCO)")
        return None
    
    print("\n" + "=" * 60)
    print("发现已训练的模型文件：")
    print("=" * 60)
    
    for idx, model_path in enumerate(existing_models[:10], 1):  # 最多显示10个
        # 计算相对路径，便于阅读
        try:
            rel_path = model_path.relative_to(PROJECT_ROOT)
        except ValueError:
            rel_path = model_path
        
        # 获取文件修改时间
        mtime = datetime.fromtimestamp(model_path.stat().st_mtime)
        size_mb = model_path.stat().st_size / (1024 * 1024)
        
        print(f"  {idx}. {rel_path}")
        print(f"     修改时间: {mtime.strftime('%Y-%m-%d %H:%M:%S')}, 大小: {size_mb:.1f}MB")
    
    print("\n选项：")
    print(f"  1-{min(len(existing_models), 10)}. 选择对应序号的模型继续训练")
    print("  0. 不使用已有模型，从官方预训练模型(COCO)开始训练")
    print("  n. 自定义模型路径")
    
    while True:
        try:
            choice = input("\n请输入选项 (0/n/1-{}): ".format(min(len(existing_models), 10))).strip().lower()
            
            if choice == '0':
                logger.info("用户选择从官方预训练模型开始训练")
                return None
            elif choice == 'n':
                custom_path = input("请输入模型文件的完整路径: ").strip()
                custom_model = Path(custom_path)
                if custom_model.exists() and custom_model.suffix == '.pt':
                    logger.info(f"用户指定自定义模型: {custom_model}")
                    return custom_model
                else:
                    print(f"错误: 文件不存在或不是有效的.pt文件: {custom_path}")
            elif choice.isdigit():
                idx = int(choice)
                if 1 <= idx <= min(len(existing_models), 10):
                    selected_model = existing_models[idx - 1]
                    logger.info(f"用户选择模型 {idx}: {selected_model}")
                    return selected_model
                else:
                    print(f"请输入 0 到 {min(len(existing_models), 10)} 之间的数字")
            else:
                print("无效输入，请重新输入")
        except KeyboardInterrupt:
            print("\n操作已取消")
            logger.info("用户取消模型选择")
            return None
        except Exception as e:
            logger.error(f"选择模型时出错: {e}")
            print(f"发生错误: {e}")


def train_yolo_model(
    yaml_path: Path, 
    epochs: int = 100, 
    model_name: str = "yolov8s", 
    use_p2: bool = True,
    pretrained_model_path: Optional[Path] = None
):
    """
    训练YOLO模型
    
    参数：
        yaml_path: 数据集配置文件路径
        epochs: 训练轮数，默认100轮
        model_name: 模型名称，默认 yolov8s (small)
                   可选: yolov8n, yolov8s, yolov8m, yolov8l, yolov8x
        use_p2: 是否启用P2检测层(小目标专用头)，默认True
               P2层为下采样4倍(160x160特征图)，对40x40左右的小目标检测效果极佳
        pretrained_model_path: 预训练模型路径，如果提供则从此模型继续训练
                              如果为None，则下载官方COCO预训练模型
    
    返回：
        训练好的模型对象，失败返回None
    
    异常：
        未安装ultralytics时会提示安装方法
        模型文件不存在时会记录错误并返回None
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        logger.error("未安装ultralytics，请先安装: pip install ultralytics")
        return None
    
    logger.info(f"开始训练 {model_name} 模型，轮数: {epochs}")
    if use_p2:
        logger.info("已启用P2检测层(小目标专用头) - 适合检测40x40像素左右的小目标")
    
    # 创建模型目录
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    
    # 检测GPU是否可用
    import torch
    logger.info(f"PyTorch版本: {torch.__version__}")
    logger.info(f"CUDA可用: {torch.cuda.is_available()}")
    
    if torch.cuda.is_available():
        device = 0  # 使用第一个GPU
        logger.info(f"使用GPU加速训练: {torch.cuda.get_device_name(0)}")
        logger.info(f"GPU显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
        # 根据显存大小调整batch size (P2模型需要更多显存)
        total_memory_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        if use_p2:
            # P2模型有4个检测头，需要更多显存
            if total_memory_gb < 6:
                batch_size = 6
            elif total_memory_gb < 12:
                batch_size = 8
            else:
                batch_size = 12
        else:
            if total_memory_gb < 4:
                batch_size = 4
            elif total_memory_gb < 8:
                batch_size = 8
            else:
                batch_size = 12
        logger.info(f"根据显存自动设置 batch_size: {batch_size}")
    else:
        device = 'cpu'
        batch_size = 4 if use_p2 else 8  # P2模型在CPU上使用更小的batch
        logger.info(f"GPU不可用，使用CPU训练，batch_size 设置为 {batch_size}")
    
    # 加载模型
    if pretrained_model_path is not None:
        # 使用用户指定的预训练模型
        logger.info("=" * 60)
        logger.info(f"加载已训练的模型: {pretrained_model_path}")
        logger.info("=" * 60)
        
        if not pretrained_model_path.exists():
            logger.error(f"模型文件不存在: {pretrained_model_path}")
            return None
        
        try:
            model = YOLO(str(pretrained_model_path))
            logger.info("预训练模型加载成功，将继续在此基础上训练")
        except Exception as e:
            logger.error(f"加载预训练模型失败: {e}")
            return None
    elif use_p2:
        # 创建带P2检测层的配置文件
        p2_yaml_path = create_yolov8_p2_yaml(model_name)
        logger.info(f"使用P2检测层配置: {p2_yaml_path}")
        # 从配置文件加载模型结构
        model = YOLO(str(p2_yaml_path))
        logger.info("P2检测层模型结构已加载")
    else:
        # 下载并加载标准预训练模型
        model_file = download_yolo_model(model_name)
        if model_file is None:
            logger.error("无法获取预训练模型")
            return None
        model = YOLO(model_file)
    
    # 训练参数
    results = model.train(
        data=str(yaml_path),
        epochs=epochs,
        imgsz=800,        # 图片尺寸
        #batch=batch_size,
        batch=10,
        project=str(MODEL_DIR),
        name='train',
        exist_ok=True,
        patience=40,       # 增加早停耐心，让模型有更多时间收敛
        save=True,
        device=device,
        verbose=True,
        plots=True,

       # 优化器设置
        optimizer='AdamW',        # 对小目标更稳定
        lr0=0.001,                # 初始学习率
        lrf=0.01,                 # 最终学习率

            # 添加这些
        cos_lr=True,         # 余弦退火
        warmup_epochs=5,     # 预热
        
        # 损失权重调整（小目标优化）
        box=1.0,                  # 提高框损失权重
        cls=2,                 # 降低分类损失
        dfl=0.5,                 # 分布焦点损失
        
        # 数据增强（针对小目标）
        erasing=0.1,       
        augment=True,
        mixup=0.05,               
        copy_paste=0.05,          # 增加copy-paste，复制小目标
        
        # 几何增强（限制幅度，避免小目标消失）
        perspective=0.0,
        flipud=0.2,
        fliplr=0.5,
        degrees=3.0,       # 添加小角度旋转（新增）
        translate=0.05,    # 添加小范围平移（新增）
        scale=0.3,         # 添加缩放控制（新增）
        
        # 颜色增强
        hsv_h=0.005,
        hsv_s=0.3,
        hsv_v=0.2,
    )
    
    # 记录训练结果
    logger.info("=" * 60)
    logger.info("训练结果汇总")
    logger.info("=" * 60)
    
    # 获取最佳结果
    if hasattr(results, 'results_dict'):
        metrics = results.results_dict
        logger.info(f"最佳 mAP50: {metrics.get('metrics/mAP50(B)', 0):.4f}")
        logger.info(f"最佳 mAP50-95: {metrics.get('metrics/mAP50-95(B)', 0):.4f}")
        logger.info(f"最佳 精确率: {metrics.get('metrics/precision(B)', 0):.4f}")
        logger.info(f"最佳 召回率: {metrics.get('metrics/recall(B)', 0):.4f}")
    
    # 记录每个类别的AP
    if hasattr(results, 'ap_per_class'):
        logger.info("-" * 60)
        logger.info("各类别 AP50:")
        for class_id, class_name in SPELL_TOWER_CLASSES.items():
            ap = results.ap_per_class.get(class_id, 0) if hasattr(results.ap_per_class, 'get') else 0
            logger.info(f"  {class_name}: {ap:.4f}")
    
    # 记录模型路径
    best_model_path = MODEL_DIR / "train" / "weights" / "best.pt"
    logger.info("-" * 60)
    logger.info(f"最佳模型: {best_model_path}")
    logger.info("=" * 60)
    
    return model


def main():
    """
    主函数
    
    执行完整的训练流程：
    1. 创建数据集目录结构
    2. 创建LabelImg类别文件
    3. 从raw_formations加载标注数据
    4. 复制到数据集目录
    5. 创建数据集配置
    6. 训练模型
    """
    print("=" * 60)
    print("法术塔YOLO检测模型训练（真实图片版本）")
    print("=" * 60)
    logger.info("训练流程开始")
    
    # 1. 创建数据集目录结构
    create_dataset_structure()
    
    # 2. 创建LabelImg类别文件
    create_classes_txt()
    
    # 3. 加载标注数据（优先从raw_formations读取）
    annotations = load_annotations()
    
    if not annotations:
        print("\n错误: 没有找到任何标注数据!")
        print(f"\n请使用LabelImg进行标注:")
        print(f"  1. 确保图片放在: {RAW_FORMATIONS_DIR}")
        print(f"  2. 运行: labelimg {RAW_FORMATIONS_DIR}")
        print(f"  3. 在LabelImg中:")
        print(f"     - 左下角选择 YOLO 格式")
        print(f"     - 按 W 画框标注法术塔")
        print(f"     - 选择类别: 0=rage_tower(狂暴塔), 1=invisibility_tower(隐身塔), 2=poison_tower(毒药塔)")
        print(f"     - Ctrl+S 保存，D 下一张")
        print(f"\n标注文件会自动保存为与图片同名的.txt文件")
        print(f"\n类别定义 (已自动生成 classes.txt):")
        print(f"  0: rage_tower (狂暴塔)")
        print(f"  1: invisibility_tower (隐身塔)")
        print(f"  2: poison_tower (毒药塔)")
        return
    
    # 4. 复制到数据集目录
    copy_to_dataset(annotations, train_ratio=0.8)
    
    # 5. 创建数据集配置
    yaml_path = create_data_yaml()
    
    # 6. 选择预训练模型（询问用户是否使用已有模型）
    print("\n" + "=" * 60)
    print("模型选择")
    print("=" * 60)
    pretrained_model_path = select_pretrained_model()
    
    # 7. 训练模型（默认使用 yolov8s，可通过修改参数更换模型）
    # 可选模型: yolov8n (最快), yolov8s (推荐), yolov8m (更准但更慢)
    # use_p2=True 启用P2检测层，对小目标(如40x40像素的法术塔)检测效果更好
    # 注意：如果选择了已有的预训练模型，将忽略use_p2参数（保持原模型结构）
    model = train_yolo_model(
        yaml_path, 
        epochs=150, 
        model_name="yolov8s", 
        use_p2=True,
        pretrained_model_path=pretrained_model_path
    )
    
    print("=" * 60)
    print("训练流程完成!")
    print(f"模型目录: {MODEL_DIR}")
    print(f"PyTorch模型: {MODEL_DIR / 'train' / 'weights' / 'best.pt'}")
    print(f"\n推理示例:")
    print(f"  from ultralytics import YOLO")
    print(f"  model = YOLO('{MODEL_DIR / 'train' / 'weights' / 'best.pt'}')")
    print(f"  results = model('image.png')")
    print("=" * 60)
    logger.info("训练流程完成")


if __name__ == "__main__":
    main()
