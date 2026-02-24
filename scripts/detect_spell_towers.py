#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
法术塔检测脚本（优化版，带模型缓存）

功能：
1. 加载训练好的YOLOv8n模型（支持ONNX和PyTorch格式）
2. 检测阵型图片中的法术塔
3. 返回检测到的法术塔类型列表

使用方法：
    uv run scripts/detect_spell_towers.py <image_path>

输出：
    JSON格式：{"detected": ["狂暴塔", "毒药塔"], "count": 2}
"""

import os
import sys
import time

# 修复OpenMP冲突
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

# 全局模型缓存
_model_cache = None
_model_type = None

def load_model_cached():
    """
    加载模型（带缓存，避免重复加载）
    
    返回：
        (模型对象, 模型类型) 元组
    """
    global _model_cache, _model_type
    
    # 如果模型已缓存，直接返回
    if _model_cache is not None:
        return _model_cache, _model_type
    
    # 重定向stdout到stderr（在导入ultralytics之前）
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    
    import json
    import cv2
    import numpy as np
    from pathlib import Path
    from typing import List, Dict, Tuple
    from PIL import Image
    
    # 恢复stdout
    sys.stdout = old_stdout
    
    # 项目根目录
    PROJECT_ROOT = Path(__file__).parent.parent
    ONNX_MODEL_PATH = PROJECT_ROOT / "models" / "spell_tower_yolo" / "spell_tower_yolo.onnx"
    PT_MODEL_PATH = PROJECT_ROOT / "models" / "spell_tower_yolo" / "train" / "weights" / "best.pt"
    
    print(f"[{time.time():.3f}] 正在加载模型...", file=sys.stderr)
    start_time = time.time()
    
    # 首先尝试加载ONNX模型（更快）
    if ONNX_MODEL_PATH.exists():
        try:
            net = cv2.dnn.readNetFromONNX(str(ONNX_MODEL_PATH))
            _model_cache = net
            _model_type = 'onnx'
            print(f"[{time.time():.3f}] ONNX模型加载完成，耗时: {time.time() - start_time:.2f}s", file=sys.stderr)
            return _model_cache, _model_type
        except Exception as e:
            print(f"[{time.time():.3f}] ONNX模型加载失败: {e}", file=sys.stderr)
    
    # 如果ONNX失败，尝试加载PyTorch模型
    if PT_MODEL_PATH.exists():
        try:
            from ultralytics import YOLO
            
            # 重定向stdout到stderr
            old_stdout = sys.stdout
            sys.stdout = sys.stderr
            
            try:
                model = YOLO(str(PT_MODEL_PATH))
                _model_cache = model
                _model_type = 'pytorch'
                print(f"[{time.time():.3f}] PyTorch模型加载完成，耗时: {time.time() - start_time:.2f}s", file=sys.stderr)
                return _model_cache, _model_type
            finally:
                sys.stdout = old_stdout
        except Exception as e:
            print(f"[{time.time():.3f}] PyTorch模型加载失败: {e}", file=sys.stderr)
    
    print("错误: 无法加载任何模型", file=sys.stderr)
    return None, None


def read_image(image_path: str):
    """读取图片文件"""
    import cv2
    from PIL import Image
    import numpy as np
    
    # 首先尝试OpenCV直接读取
    img = cv2.imread(image_path)
    if img is not None:
        return img
    
    # 如果失败，使用PIL读取
    try:
        pil_image = Image.open(image_path)
        if pil_image.mode == 'RGBA':
            pil_image = pil_image.convert('RGB')
        img = np.array(pil_image)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        return img
    except Exception as e:
        print(f"读取图片失败 {image_path}: {e}", file=sys.stderr)
        return None


def detect_with_onnx(net, image_path: str):
    """使用ONNX模型检测"""
    import cv2
    import numpy as np
    
    # 读取图片
    img = read_image(image_path)
    if img is None:
        raise ValueError(f"无法读取图片: {image_path}")
    
    h, w = img.shape[:2]
    input_size = 320
    
    # 计算缩放比例
    scale = min(input_size / w, input_size / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    # 调整大小
    resized = cv2.resize(img, (new_w, new_h))
    
    # 创建填充画布
    padded = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
    x_offset = (input_size - new_w) // 2
    y_offset = (input_size - new_h) // 2
    padded[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = resized
    
    # 转换为blob格式
    blob = cv2.dnn.blobFromImage(padded, scalefactor=1/255.0, size=(input_size, input_size), swapRB=True, crop=False)
    
    # 设置输入并推理
    net.setInput(blob)
    outputs = net.forward()
    
    # 后处理
    CLASS_NAMES = {0: "毒药塔", 1: "狂暴塔", 2: "隐身塔"}
    detections = []
    
    predictions = outputs[0].T
    for pred in predictions:
        x_center, y_center, width, height = pred[:4]
        class_scores = pred[4:7]
        class_id = np.argmax(class_scores)
        confidence = class_scores[class_id]
        
        if confidence < 0.5:
            continue
        
        detections.append({
            'class_id': int(class_id),
            'class_name': CLASS_NAMES.get(int(class_id), "未知"),
            'confidence': float(confidence)
        })
    
    return detections


def detect_with_pytorch(model, image_path: str):
    """使用PyTorch模型检测"""
    import sys
    
    # 重定向stdout到stderr
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    
    try:
        results = model(image_path, verbose=False)
        
        CLASS_NAMES = {0: "毒药塔", 1: "狂暴塔", 2: "隐身塔"}
        detections = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                    
                    if class_id in CLASS_NAMES:
                        detections.append({
                            'class_id': class_id,
                            'class_name': CLASS_NAMES[class_id],
                            'confidence': confidence
                        })
        
        return detections
    finally:
        sys.stdout = old_stdout


def detect_spell_towers(image_path: str):
    """
    检测图片中的法术塔
    
    参数：
        image_path: 图片路径
    
    返回：
        检测结果字典
    """
    import time
    import json
    
    start_time = time.time()
    
    # 加载模型（使用缓存）
    model, model_type = load_model_cached()
    if model is None:
        return {"error": "模型加载失败", "detected": [], "count": 0}
    
    try:
        # 根据模型类型选择检测方法
        if model_type == 'onnx':
            detections = detect_with_onnx(model, image_path)
        else:
            detections = detect_with_pytorch(model, image_path)
        
        # 提取检测到的法术塔类型（去重）
        CLASS_NAMES = {0: "毒药塔", 1: "狂暴塔", 2: "隐身塔"}
        detected_types = list(set([d['class_name'] for d in detections]))
        detected_types.sort(key=lambda x: list(CLASS_NAMES.values()).index(x))
        
        result = {
            "detected": detected_types,
            "count": len(detected_types),
            "detections": [
                {"type": d['class_name'], "confidence": round(d['confidence'], 3)}
                for d in detections
            ],
            "time_ms": int((time.time() - start_time) * 1000)
        }
        
        print(f"[{time.time():.3f}] 检测完成，耗时: {result['time_ms']}ms", file=sys.stderr)
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"error": str(e), "detected": [], "count": 0}


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python detect_spell_towers.py <image_path>", file=sys.stderr)
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    # 检测法术塔
    result = detect_spell_towers(image_path)
    
    # 输出JSON结果
    import json
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
