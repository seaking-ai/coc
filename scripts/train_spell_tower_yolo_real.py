#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
法术塔YOLOv8n检测模型训练脚本（真实图片版本）

功能：
1. 加载人工标注的真实阵型图片
2. 数据增强生成训练集
3. 训练YOLOv8n模型
4. 导出为ONNX格式供Node.js调用

使用方法：
    uv run scripts/train_spell_tower_yolo_real.py
    python scripts/train_spell_tower_yolo_real.py

输出：
    models/spell_tower_yolo/ - 训练好的模型
    models/spell_tower_yolo.onnx - ONNX格式模型
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
from typing import List, Tuple, Dict
import json
import random
from PIL import Image


# 添加项目根目录到路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# 配置路径
ANNOTATIONS_DIR = PROJECT_ROOT / "models" / "spell_tower_annotations"
DATASET_DIR = PROJECT_ROOT / "models" / "spell_tower_dataset_real"
MODEL_DIR = PROJECT_ROOT / "models" / "spell_tower_yolo"

# 法术塔类别映射
SPELL_TOWER_CLASSES = {
    0: "毒药塔",
    1: "狂暴塔",
    2: "隐身塔"
}


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
        print(f"创建目录: {d}")


def load_annotations() -> List[Dict]:
    """
    加载所有标注文件
    
    返回：
        标注数据列表，每个元素包含图片路径和标注信息
    """
    annotations = []
    
    if not ANNOTATIONS_DIR.exists():
        print(f"错误: 标注目录不存在: {ANNOTATIONS_DIR}")
        return annotations
    
    # 查找所有JSON标注文件
    json_files = list(ANNOTATIONS_DIR.glob("*.json"))
    
    print(f"找到 {len(json_files)} 个标注文件")
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 查找对应的图片文件
            image_name = data.get('image_name', '')
            if not image_name:
                continue
            
            # 在annotations目录或原始图片目录中查找
            image_path = ANNOTATIONS_DIR / image_name
            if not image_path.exists():
                # 尝试其他常见位置
                possible_paths = [
                    PROJECT_ROOT / "raw_formations" / image_name,
                    PROJECT_ROOT / "public" / "images" / image_name,
                ]
                for path in possible_paths:
                    if path.exists():
                        image_path = path
                        break
            
            if not image_path.exists():
                print(f"警告: 找不到图片文件: {image_name}")
                continue
            
            # 检查是否有对应的YOLO格式标注文件
            yolo_file = json_file.with_suffix('.txt')
            if not yolo_file.exists():
                print(f"警告: 找不到YOLO标注文件: {yolo_file}")
                continue
            
            annotations.append({
                'image_path': image_path,
                'yolo_file': yolo_file,
                'annotations': data.get('annotations', [])
            })
            
        except Exception as e:
            print(f"加载标注文件失败 {json_file}: {e}")
    
    print(f"成功加载 {len(annotations)} 个有效标注")
    return annotations


def copy_to_dataset(annotations: List[Dict], train_ratio: float = 0.8):
    """
    将标注图片复制到数据集目录
    
    参数：
        annotations: 标注数据列表
        train_ratio: 训练集比例
    """
    if not annotations:
        print("错误: 没有可用的标注数据")
        return
    
    # 随机打乱
    random.shuffle(annotations)
    
    # 分割训练集和验证集
    train_count = int(len(annotations) * train_ratio)
    train_data = annotations[:train_count]
    val_data = annotations[train_count:]
    
    print(f"训练集: {len(train_data)} 张")
    print(f"验证集: {len(val_data)} 张")
    
    # 复制文件
    for split, data in [("train", train_data), ("val", val_data)]:
        for i, item in enumerate(data):
            image_path = item['image_path']
            yolo_file = item['yolo_file']
            
            # 复制图片
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
                
            except Exception as e:
                print(f"复制文件失败 {image_path}: {e}")
    
    print("数据集准备完成!")


def create_data_yaml():
    """
    创建YOLO数据集配置文件
    """
    yaml_content = f"""# 法术塔检测数据集配置
path: {DATASET_DIR.absolute()}
train: images/train
val: images/val
test:  # 可选

# 类别
nc: 3  # 类别数量
names:
  0: 毒药塔
  1: 狂暴塔
  2: 隐身塔
"""
    
    yaml_path = DATASET_DIR / "data.yaml"
    with open(yaml_path, 'w', encoding='utf-8') as f:
        f.write(yaml_content)
    
    print(f"创建数据集配置: {yaml_path}")
    return yaml_path


def download_yolov8n_model():
    """
    下载YOLOv8n预训练模型
    
    返回：
        模型文件路径，如果下载失败返回None
    """
    import urllib.request
    import ssl
    
    model_url = "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt"
    model_path = Path("yolov8n.pt")
    
    if model_path.exists():
        print(f"模型文件已存在: {model_path}")
        return str(model_path)
    
    print(f"正在下载YOLOv8n预训练模型...")
    print(f"下载地址: {model_url}")
    
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
        print(f"模型下载完成: {model_path}")
        return str(model_path)
    except Exception as e:
        print(f"模型下载失败: {e}")
        print("请手动下载模型文件:")
        print(f"1. 访问: {model_url}")
        print(f"2. 下载后放到项目根目录: {Path.cwd() / 'yolov8n.pt'}")
        return None


def train_yolo_model(yaml_path: Path, epochs: int = 100):
    """
    训练YOLOv8n模型
    
    参数：
        yaml_path: 数据集配置文件路径
        epochs: 训练轮数
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("错误: 未安装ultralytics，请先安装: pip install ultralytics")
        return None
    
    print(f"开始训练YOLOv8n模型，轮数: {epochs}")
    
    # 创建模型目录
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    
    # 下载预训练模型
    model_file = download_yolov8n_model()
    if model_file is None:
        print("错误: 无法获取预训练模型")
        return None
    
    # 检测GPU是否可用（在加载模型之前）
    import torch
    print(f"[*] PyTorch版本: {torch.__version__}")
    print(f"[*] CUDA可用: {torch.cuda.is_available()}")
    
    if torch.cuda.is_available():
        device = 0  # 使用第一个GPU
        print(f"[+] 使用GPU加速训练: {torch.cuda.get_device_name(0)}")
        print(f"[+] GPU显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    else:
        device = 'cpu'
        print("[-] GPU不可用，使用CPU训练")
    
    # 加载预训练模型
    model = YOLO(model_file)
    
    # 训练（优化参数加快训练速度）
    results = model.train(
        data=str(yaml_path),
        epochs=epochs,
        imgsz=640,        # 使用更大的图片尺寸以提高小目标检测精度
        batch=16,
        project=str(MODEL_DIR),
        name='train',
        exist_ok=True,
        patience=20,
        save=True,
        device=device,
        verbose=True,
        plots=True
    )
    
    print("训练完成!")
    return model


def export_to_onnx(model):
    """
    导出模型为ONNX格式
    
    参数：
        model: 训练好的YOLO模型
    
    返回：
        ONNX模型路径，如果导出失败返回None
    """
    print("导出ONNX模型...")
    
    onnx_path = MODEL_DIR / "spell_tower_yolo.onnx"
    
    try:
        # 尝试使用ultralytics内置导出
        model.export(format='onnx', imgsz=640, dynamic=True, simplify=True)
        
        # 移动ONNX文件到模型目录
        exported_path = MODEL_DIR / "train" / "weights" / "best.onnx"
        if exported_path.exists():
            shutil.copy(str(exported_path), str(onnx_path))
            print(f"ONNX模型已导出: {onnx_path}")
            return onnx_path
    except Exception as e:
        print(f"ultralytics导出失败: {e}")
        print("尝试使用torch直接导出...")
        
        try:
            # 使用torch直接导出作为备选方案
            import torch
            
            # 加载最佳模型权重
            best_pt_path = MODEL_DIR / "train" / "weights" / "best.pt"
            if best_pt_path.exists():
                # 创建示例输入
                dummy_input = torch.randn(1, 3, 640, 640)
                
                # 导出ONNX
                torch.onnx.export(
                    model.model,
                    dummy_input,
                    str(onnx_path),
                    export_params=True,
                    opset_version=12,
                    do_constant_folding=True,
                    input_names=['images'],
                    output_names=['output0'],
                    dynamic_axes={
                        'images': {0: 'batch'},
                        'output0': {0: 'batch'}
                    }
                )
                print(f"ONNX模型已导出 (torch): {onnx_path}")
                return onnx_path
        except Exception as e2:
            print(f"torch导出也失败: {e2}")
    
    print("警告: ONNX导出失败，但PyTorch模型(.pt)仍然可用")
    print(f"PyTorch模型位置: {MODEL_DIR / 'train' / 'weights' / 'best.pt'}")
    return None


def main():
    """
    主函数
    """
    print("=" * 60)
    print("法术塔YOLOv8n检测模型训练（真实图片版本）")
    print("=" * 60)
    
    # 1. 创建数据集目录结构
    create_dataset_structure()
    
    # 2. 加载标注数据
    annotations = load_annotations()
    
    if not annotations:
        print("\n错误: 没有找到任何标注数据!")
        print(f"请先将阵型图片放入标注目录并使用标注工具进行标注:")
        print(f"  python scripts/annotate_spell_towers.py <图片文件夹>")
        print(f"\n标注文件将保存在: {ANNOTATIONS_DIR}")
        return
    
    # 3. 复制到数据集目录
    copy_to_dataset(annotations, train_ratio=0.8)
    
    # 4. 创建数据集配置
    yaml_path = create_data_yaml()
    
    # 5. 训练模型
    model = train_yolo_model(yaml_path, epochs=50)
    
    # 6. 导出ONNX
    onnx_path = None
    if model:
        onnx_path = export_to_onnx(model)
    
    print("=" * 60)
    print("训练流程完成!")
    print(f"模型目录: {MODEL_DIR}")
    if onnx_path:
        print(f"ONNX模型: {onnx_path}")
    else:
        print(f"PyTorch模型: {MODEL_DIR / 'train' / 'weights' / 'best.pt'}")
        print("提示: ONNX导出失败，可以使用PyTorch模型进行推理")
    print("=" * 60)


if __name__ == "__main__":
    main()
