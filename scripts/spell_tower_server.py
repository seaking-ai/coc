#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
法术塔检测服务（常驻内存，快速响应）

功能：
1. 启动时加载模型并保持常驻内存
2. 提供HTTP API进行快速检测
3. 避免每次请求重复加载模型

使用方法：
    python scripts/spell_tower_server.py
    uv run scripts/spell_tower_server.py
    E:\anaconda\envs\pytorch\python.exe scripts/spell_tower_server.py

API：
    POST /detect - 接收图片文件，返回检测结果
"""

import os
import sys

# 修复OpenMP冲突
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import json
import time
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from PIL import Image
import cv2

app = Flask(__name__)
CORS(app)

# 全局模型变量
model = None
model_type = None

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent
ONNX_MODEL_PATH = PROJECT_ROOT / "models" / "spell_tower_yolo" / "spell_tower_yolo.onnx"
PT_MODEL_PATH = PROJECT_ROOT / "models" / "spell_tower_yolo" / "train" / "weights" / "best.pt"

# 类别映射
CLASS_NAMES = {
    0: "毒药塔",
    1: "狂暴塔",
    2: "隐身塔"
}


def load_model():
    """
    加载模型（启动时调用一次）
    
    返回：
        (模型对象, 模型类型) 元组
    """
    print("[*] 正在加载模型...")
    start_time = time.time()
    
    # 优先加载PyTorch模型（更稳定）
    if PT_MODEL_PATH.exists():
        try:
            from ultralytics import YOLO
            model = YOLO(str(PT_MODEL_PATH))
            print(f"[+] PyTorch模型加载完成，耗时: {time.time() - start_time:.2f}s")
            return model, 'pytorch'
        except Exception as e:
            print(f"[-] PyTorch模型加载失败: {e}")
    
    # 如果PyTorch失败，尝试ONNX模型
    if ONNX_MODEL_PATH.exists():
        try:
            net = cv2.dnn.readNetFromONNX(str(ONNX_MODEL_PATH))
            print(f"[+] ONNX模型加载完成，耗时: {time.time() - start_time:.2f}s")
            return net, 'onnx'
        except Exception as e:
            print(f"[-] ONNX模型加载失败: {e}")
    
    print("[-] 错误: 无法加载任何模型")
    return None, None


def detect_with_pytorch_cached(image_bytes):
    """
    使用缓存的PyTorch模型检测
    
    参数：
        image_bytes: 图片二进制数据
    
    返回：
        检测结果列表
    """
    global model
    
    # 将字节转换为numpy数组
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("无法读取图片")
    
    # 使用YOLO内置推理
    results = model(img, verbose=False)
    
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


@app.route('/detect', methods=['POST'])
def detect():
    """
    检测接口
    
    接收：
        - image: 图片文件（multipart/form-data）
    
    返回：
        JSON格式检测结果
    """
    global model, model_type
    
    if model is None:
        return jsonify({
            'success': False,
            'error': '模型未加载',
            'detected': [],
            'count': 0
        }), 500
    
    if 'image' not in request.files:
        return jsonify({
            'success': False,
            'error': '缺少图片',
            'detected': [],
            'count': 0
        }), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({
            'success': False,
            'error': '文件名为空',
            'detected': [],
            'count': 0
        }), 400
    
    try:
        start_time = time.time()
        
        # 读取图片数据
        image_bytes = file.read()
        
        # 检测
        if model_type == 'pytorch':
            detections = detect_with_pytorch_cached(image_bytes)
        else:
            # ONNX检测（暂未实现）
            detections = []
        
        # 提取检测到的法术塔类型（不去重，保留所有检测到的法术塔）
        detected_types = [d['class_name'] for d in detections]
        
        time_ms = int((time.time() - start_time) * 1000)
        
        return jsonify({
            'success': True,
            'detected': detected_types,
            'count': len(detected_types),
            'detections': [
                {'type': d['class_name'], 'confidence': round(d['confidence'], 3)}
                for d in detections
            ],
            'time_ms': time_ms
        })
        
    except Exception as e:
        print(f"[-] 检测失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'detected': [],
            'count': 0
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'model_type': model_type
    })


def main():
    """主函数"""
    global model, model_type
    
    print("=" * 60)
    print("法术塔检测服务")
    print("=" * 60)
    
    # 加载模型
    model, model_type = load_model()
    
    if model is None:
        print("[-] 模型加载失败，服务无法启动")
        sys.exit(1)
    
    print("=" * 60)
    print("启动服务...")
    print("API地址: http://localhost:5000/detect")
    print("健康检查: http://localhost:5000/health")
    print("=" * 60)
    
    # 启动Flask服务
    app.run(host='0.0.0.0', port=5000, debug=False)


if __name__ == '__main__':
    main()
