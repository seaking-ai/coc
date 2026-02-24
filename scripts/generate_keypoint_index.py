#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
关键点索引生成脚本

功能：使用OpenCV为所有阵型图片生成ORB关键点索引
特点：
1. 离线处理所有阵型图片
2. 提取ORB关键点和描述子
3. 生成JSON格式的索引文件

使用方法：
    uv run scripts/generate-keypoint-index.py

输出：
    public/index/keypoint-index.json
"""

import cv2
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Tuple
import numpy as np


def extract_keypoints_and_descriptors(image_path: str, max_keypoints: int = 200) -> Dict[str, Any]:
    """
    提取图像的ORB关键点和描述子
    
    功能：使用ORB算法检测关键点并计算描述子
    
    参数：
        image_path: 图像文件路径
        max_keypoints: 最大关键点数量，默认200
    
    返回：
        包含关键点、描述子、图像尺寸的字典
    """
    # 读取图像
    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取图像: {image_path}")
    
    # 调整图像大小以保持性能
    max_size = 512
    height, width = img.shape[:2]
    scale = min(max_size / width, max_size / height)
    
    if scale < 1:
        new_width = int(width * scale)
        new_height = int(height * scale)
        img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
    
    # 转换为灰度图
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 创建ORB检测器
    orb = cv2.ORB_create(
        nfeatures=max_keypoints,
        scaleFactor=1.2,
        nlevels=8,
        edgeThreshold=31,
        firstLevel=0,
        WTA_K=2,
        scoreType=cv2.ORB_HARRIS_SCORE,
        patchSize=31,
        fastThreshold=20
    )
    
    # 检测关键点和计算描述子
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    
    if keypoints is None or descriptors is None:
        return {
            "keypoints": [],
            "descriptors": [],
            "width": gray.shape[1],
            "height": gray.shape[0]
        }
    
    # 转换关键点为可序列化的格式
    kp_list = []
    for kp in keypoints:
        kp_list.append({
            "x": float(kp.pt[0]),
            "y": float(kp.pt[1]),
            "size": float(kp.size),
            "angle": float(kp.angle),
            "response": float(kp.response),
            "octave": int(kp.octave)
        })
    
    # 转换描述子为列表（ORB描述子是uint8类型）
    desc_list = descriptors.tolist()
    
    return {
        "keypoints": kp_list,
        "descriptors": desc_list,
        "width": gray.shape[1],
        "height": gray.shape[0]
    }


def generate_index(data_path: str, images_dir: str, output_path: str) -> Tuple[int, int, List[Dict]]:
    """
    生成关键点索引文件
    
    功能：遍历所有阵型图片，提取关键点特征，生成JSON索引
    
    参数：
        data_path: data.json文件路径
        images_dir: 阵型图片目录
        output_path: 输出索引文件路径
    
    返回：
        (成功数量, 总数, 错误列表)
    """
    # 加载阵型数据
    with open(data_path, 'r', encoding='utf-8') as f:
        layouts = json.load(f)
    
    print(f"[KeypointIndex] 开始处理 {len(layouts)} 个阵型...")
    
    index = {
        "version": "3.0",
        "algorithm": "orb-keypoints",
        "maxKeypoints": 200,
        "generatedAt": datetime.now().isoformat(),
        "layouts": []
    }
    
    errors = []
    success_count = 0
    
    for i, layout in enumerate(layouts):
        try:
            layout_id = layout.get("id", f"unknown_{i}")
            layout_title = layout.get("title", "未命名")
            image_path = layout.get("image", "")
            
            print(f"[KeypointIndex] 处理 {i+1}/{len(layouts)}: {layout_title} ({layout_id})")
            
            # 构建完整图片路径
            if image_path.startswith("/"):
                image_path = image_path[1:]  # 移除开头的/
            
            full_path = os.path.join(images_dir, os.path.basename(image_path))
            
            if not os.path.exists(full_path):
                # 尝试其他路径
                alt_path = os.path.join(os.path.dirname(data_path), image_path)
                if os.path.exists(alt_path):
                    full_path = alt_path
                else:
                    raise FileNotFoundError(f"图片不存在: {full_path}")
            
            # 提取特征
            features = extract_keypoints_and_descriptors(full_path, max_keypoints=200)
            
            # 修复图片路径：将绝对路径 /images/xxx 改为相对路径 ./images/xxx
            # 这样可以在GitHub Pages子路径部署时正确加载图片
            image_path = layout.get("image", "")
            if image_path.startswith("/"):
                image_path = "." + image_path  # /images/xxx -> ./images/xxx
            elif not image_path.startswith("./") and not image_path.startswith("http"):
                image_path = "./" + image_path

            # 添加到索引
            index["layouts"].append({
                "id": layout_id,
                "image": image_path,
                "keypoints": features["keypoints"],
                "descriptors": features["descriptors"],
                "width": features["width"],
                "height": features["height"]
            })
            
            success_count += 1
            print(f"  ✓ 提取到 {len(features['keypoints'])} 个关键点")
            
        except Exception as e:
            error_msg = str(e)
            print(f"  ✗ 处理失败: {error_msg}")
            errors.append({
                "id": layout.get("id", f"unknown_{i}"),
                "title": layout.get("title", "未命名"),
                "error": error_msg
            })
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 保存索引文件
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"\n[KeypointIndex] 索引生成完成!")
    print(f"  成功: {success_count}/{len(layouts)}")
    print(f"  失败: {len(errors)}")
    print(f"  输出: {output_path}")
    
    # 计算文件大小
    file_size = os.path.getsize(output_path)
    print(f"  文件大小: {file_size / 1024 / 1024:.2f} MB")
    
    return success_count, len(layouts), errors


def main():
    """
    主函数
    
    功能：解析命令行参数并执行索引生成
    """
    # 默认路径
    base_dir = Path(__file__).parent.parent
    data_path = base_dir / "public" / "data.json"
    images_dir = base_dir / "public" / "images"
    output_path = base_dir / "public" / "index" / "keypoint-index.json"
    
    # 检查路径
    if not data_path.exists():
        print(f"错误: 数据文件不存在: {data_path}")
        sys.exit(1)
    
    if not images_dir.exists():
        print(f"错误: 图片目录不存在: {images_dir}")
        sys.exit(1)
    
    print("=" * 60)
    print("COC阵型关键点索引生成器")
    print("=" * 60)
    print(f"数据文件: {data_path}")
    print(f"图片目录: {images_dir}")
    print(f"输出文件: {output_path}")
    print("=" * 60)
    
    # 生成索引
    success, total, errors = generate_index(
        str(data_path),
        str(images_dir),
        str(output_path)
    )
    
    # 输出错误摘要
    if errors:
        print("\n错误摘要:")
        for error in errors[:10]:  # 只显示前10个错误
            print(f"  - {error['title']}: {error['error']}")
        if len(errors) > 10:
            print(f"  ... 还有 {len(errors) - 10} 个错误")
    
    # 返回状态码
    sys.exit(0 if success == total else 1)


if __name__ == "__main__":
    main()
