#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
法术塔标注工具

功能：
1. 加载真实阵型图片
2. 交互式标注法术塔位置（点击中心点）
3. 自动生成YOLO格式标注文件
4. 支持三种法术塔类型：毒药塔、狂暴塔、隐身塔
5. 自动跳过已标注的图片

使用方法：
    uv run scripts/annotate_spell_towers.py [image_folder] [--all]
    
参数：
    image_folder    图片文件夹路径（默认: raw_formations）
    --all           显示所有图片，包括已标注的

示例：
    python scripts/annotate_spell_towers.py
    python scripts/annotate_spell_towers.py ./my_formations
    python scripts/annotate_spell_towers.py --all  # 显示所有图片

快捷键：
    1 - 选择毒药塔
    2 - 选择狂暴塔
    3 - 选择隐身塔
    z - 撤销上一个标注
    s - 保存当前图片标注
    n - 下一张图片
    q - 退出
"""

import os
import sys
import cv2
import json
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Dict

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent
ANNOTATIONS_DIR = PROJECT_ROOT / "models" / "spell_tower_annotations"

# 法术塔类别映射
CLASS_NAMES = {
    0: "毒药塔",
    1: "狂暴塔",
    2: "隐身塔"
}

# 颜色映射 (BGR格式)
CLASS_COLORS = {
    0: (0, 255, 0),    # 绿色 - 毒药塔
    1: (0, 0, 255),    # 红色 - 狂暴塔
    2: (255, 0, 0)     # 蓝色 - 隐身塔
}


class SpellTowerAnnotator:
    """
    法术塔标注器类
    
    提供交互式界面用于标注阵型图片中的法术塔位置
    """
    
    def __init__(self, image_folder: str, skip_annotated: bool = True):
        """
        初始化标注器
        
        参数：
            image_folder: 阵型图片文件夹路径
            skip_annotated: 是否跳过已标注的图片，默认为True
        """
        self.image_folder = Path(image_folder)
        self.annotations_dir = ANNOTATIONS_DIR
        self.annotations_dir.mkdir(parents=True, exist_ok=True)
        
        # 加载图片列表
        all_image_files = sorted([
            f for f in self.image_folder.iterdir()
            if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']
        ])
        
        # 根据参数决定是否过滤已标注的图片
        self.image_files = []
        self.skipped_files = []
        for f in all_image_files:
            annotation_file = self.annotations_dir / f"{f.stem}.json"
            if skip_annotated and annotation_file.exists():
                self.skipped_files.append(f)
            else:
                self.image_files.append(f)
        
        if self.skipped_files:
            print(f"跳过 {len(self.skipped_files)} 张已标注的图片")
        
        if not self.image_files:
            print(f"错误: 文件夹中没有图片文件: {image_folder}")
            sys.exit(1)
        
        print(f"找到 {len(self.image_files)} 张图片")
        
        # 当前状态
        self.current_index = 0
        self.current_image = None
        self.current_annotations: List[Dict] = []  # [{class_id, x, y, w, h}, ...]
        self.selected_class = 0  # 默认选择毒药塔
        self.window_name = "Spell Tower Annotator (1:Poison 2:Rage 3:Invis z:Undo s:Save n:Next q:Quit)"
        
        # 法术塔标准尺寸（相对于图片的比例）
        self.tower_size_ratio = 0.08  # 法术塔约占图片的8%
        
    def load_image(self, index: int) -> np.ndarray:
        """
        加载指定索引的图片
        
        参数：
            index: 图片索引
        
        返回：
            加载的图片数组
        """
        image_path = self.image_files[index]
        
        # 使用OpenCV读取
        img = cv2.imread(str(image_path))
        if img is None:
            # 尝试使用PIL读取（支持webp）
            try:
                from PIL import Image
                pil_img = Image.open(image_path)
                if pil_img.mode == 'RGBA':
                    pil_img = pil_img.convert('RGB')
                img = np.array(pil_img)
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            except Exception as e:
                print(f"无法读取图片 {image_path}: {e}")
                return None
        
        return img
    
    def load_existing_annotations(self, image_path: Path) -> List[Dict]:
        """
        加载已存在的标注
        
        参数：
            image_path: 图片路径
        
        返回：
            标注列表
        """
        annotation_file = self.annotations_dir / f"{image_path.stem}.json"
        if annotation_file.exists():
            try:
                with open(annotation_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('annotations', [])
            except Exception as e:
                print(f"加载标注失败: {e}")
        return []
    
    def save_annotations(self, image_path: Path, annotations: List[Dict]):
        """
        保存标注到文件
        
        参数：
            image_path: 图片路径
            annotations: 标注列表
        """
        # 确保标注目录存在
        self.annotations_dir.mkdir(parents=True, exist_ok=True)
        
        annotation_file = self.annotations_dir / f"{image_path.stem}.json"
        
        data = {
            'image_name': image_path.name,
            'image_width': self.current_image.shape[1],
            'image_height': self.current_image.shape[0],
            'annotations': annotations,
            'annotated_at': datetime.now().isoformat()
        }
        
        try:
            with open(annotation_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"✓ JSON标注已保存: {annotation_file}")
            print(f"  图片: {image_path.name}")
            print(f"  标注数量: {len(annotations)}")
        except Exception as e:
            print(f"✗ 保存JSON失败: {e}")
    
    def export_yolo_format(self, image_path: Path, annotations: List[Dict]):
        """
        导出YOLO格式标注文件
        
        参数：
            image_path: 图片路径
            annotations: 标注列表
        """
        if not annotations:
            return
        
        yolo_file = self.annotations_dir / f"{image_path.stem}.txt"
        
        h, w = self.current_image.shape[:2]
        
        with open(yolo_file, 'w') as f:
            for ann in annotations:
                class_id = ann['class_id']
                x_center = ann['x']
                y_center = ann['y']
                width = ann['w']
                height = ann['h']
                
                f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}\n")
        
        print(f"YOLO格式已导出: {yolo_file}")
    
    def draw_annotations(self, image: np.ndarray, annotations: List[Dict]) -> np.ndarray:
        """
        在图片上绘制标注
        
        参数：
            image: 原始图片
            annotations: 标注列表
        
        返回：
            绘制后的图片
        """
        result = image.copy()
        h, w = result.shape[:2]
        
        for i, ann in enumerate(annotations):
            class_id = ann['class_id']
            x_center = int(ann['x'] * w)
            y_center = int(ann['y'] * h)
            width = int(ann['w'] * w)
            height = int(ann['h'] * h)
            
            color = CLASS_COLORS[class_id]
            class_name = CLASS_NAMES[class_id]
            
            # 绘制边界框
            x1 = int(x_center - width / 2)
            y1 = int(y_center - height / 2)
            x2 = int(x_center + width / 2)
            y2 = int(y_center + height / 2)
            
            cv2.rectangle(result, (x1, y1), (x2, y2), color, 2)
            
            # 绘制中心点
            cv2.circle(result, (x_center, y_center), 3, color, -1)
            
            # 绘制标签（使用英文避免乱码）
            label = f"{i+1}. Tower{class_id}"
            cv2.putText(result, label, (x1, y1 - 5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        return result
    
    def draw_info_panel(self, image: np.ndarray) -> np.ndarray:
        """
        绘制信息面板
        
        参数：
            image: 原始图片
        
        返回：
            绘制后的图片
        """
        result = image.copy()
        h, w = result.shape[:2]
        
        # 检查是否有未保存的标注（通过比较当前标注和已保存的标注）
        current_image_path = self.image_files[self.current_index]
        saved_annotations = self.load_existing_annotations(current_image_path)
        has_unsaved = len(self.current_annotations) != len(saved_annotations) or \
                     (self.current_annotations and saved_annotations and 
                      json.dumps(self.current_annotations, sort_keys=True) != 
                      json.dumps(saved_annotations, sort_keys=True))
        
        # 绘制顶部信息栏（使用英文避免乱码）
        # 0=Poison, 1=Rage, 2=Invis
        tower_type = ["Poison", "Rage", "Invis"][self.selected_class]
        info_text = f"Img {self.current_index + 1}/{len(self.image_files)} | "
        info_text += f"Type: {tower_type} | "
        info_text += f"Count: {len(self.current_annotations)}"
        if has_unsaved:
            info_text += " [UNSAVED]"
        
        # 如果有未保存的标注，使用红色背景提醒
        bg_color = (0, 0, 255) if has_unsaved else (0, 0, 0)
        cv2.rectangle(result, (0, 0), (w, 40), bg_color, -1)
        cv2.putText(result, info_text, (10, 28),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # 绘制底部快捷键提示（使用英文避免乱码）
        help_text = "1:Poison 2:Rage 3:Invis | z:Undo | s:Save | n:Next | q:Quit"
        if has_unsaved:
            help_text = "UNSAVED! Press n/p to save & switch | " + help_text
        
        cv2.rectangle(result, (0, h - 40), (w, h), (0, 0, 0), -1)
        cv2.putText(result, help_text, (10, h - 12),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        return result
    
    def mouse_callback(self, event, x, y, flags, param):
        """
        鼠标回调函数
        
        参数：
            event: 鼠标事件
            x, y: 鼠标坐标
            flags: 标志
            param: 参数
        """
        if event == cv2.EVENT_LBUTTONDOWN:
            # 左键点击 - 添加标注
            if self.current_image is None:
                return
            
            h, w = self.current_image.shape[:2]
            
            # 计算归一化坐标
            x_norm = x / w
            y_norm = y / h
            
            # 使用固定尺寸（法术塔在阵型中大小相对固定）
            w_norm = self.tower_size_ratio
            h_norm = self.tower_size_ratio
            
            annotation = {
                'class_id': self.selected_class,
                'x': x_norm,
                'y': y_norm,
                'w': w_norm,
                'h': h_norm
            }
            
            self.current_annotations.append(annotation)
            print(f"添加标注: {CLASS_NAMES[self.selected_class]} at ({x}, {y})")
            
            # 更新显示
            self.update_display()
    
    def update_display(self):
        """更新显示"""
        if self.current_image is None:
            return
        
        # 绘制标注
        display_image = self.draw_annotations(self.current_image, self.current_annotations)
        
        # 绘制信息面板
        display_image = self.draw_info_panel(display_image)
        
        cv2.imshow(self.window_name, display_image)
    
    def run(self):
        """运行标注工具"""
        # 创建窗口
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        cv2.setMouseCallback(self.window_name, self.mouse_callback)
        
        # 加载第一张图片
        self.current_image = self.load_image(self.current_index)
        if self.current_image is None:
            print("无法加载第一张图片")
            return
        
        # 加载已存在的标注
        self.current_annotations = self.load_existing_annotations(
            self.image_files[self.current_index]
        )
        
        self.update_display()
        
        print("\n=== 法术塔标注工具 ===")
        print("快捷键:")
        print("  1 - 选择毒药塔")
        print("  2 - 选择狂暴塔")
        print("  3 - 选择隐身塔")
        print("  z - 撤销上一个标注")
        print("  s - 保存当前标注")
        print("  n - 下一张图片")
        print("  p - 上一张图片")
        print("  q - 退出")
        print("\n操作说明:")
        print("  左键点击图片中的法术塔中心位置进行标注")
        print("  标注框大小会自动设置为标准尺寸")
        print("=" * 40)
        
        while True:
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q'):
                # 退出前自动保存当前标注
                if self.current_annotations:
                    print("\n退出前自动保存当前标注...")
                    self.save_annotations(
                        self.image_files[self.current_index],
                        self.current_annotations
                    )
                    self.export_yolo_format(
                        self.image_files[self.current_index],
                        self.current_annotations
                    )
                break
            
            elif key == ord('1'):
                self.selected_class = 0
                print(f"切换到: {CLASS_NAMES[self.selected_class]}")
                self.update_display()
            
            elif key == ord('2'):
                self.selected_class = 1
                print(f"切换到: {CLASS_NAMES[self.selected_class]}")
                self.update_display()
            
            elif key == ord('3'):
                self.selected_class = 2
                print(f"切换到: {CLASS_NAMES[self.selected_class]}")
                self.update_display()
            
            elif key == ord('z'):
                # 撤销
                if self.current_annotations:
                    removed = self.current_annotations.pop()
                    print(f"撤销标注: {CLASS_NAMES[removed['class_id']]}")
                    self.update_display()
            
            elif key == ord('s'):
                # 保存
                if self.current_annotations:
                    self.save_annotations(
                        self.image_files[self.current_index],
                        self.current_annotations
                    )
                    self.export_yolo_format(
                        self.image_files[self.current_index],
                        self.current_annotations
                    )
                else:
                    print("当前没有标注可保存")
            
            elif key == ord('n'):
                # 下一张 - 自动保存当前标注
                if self.current_index < len(self.image_files) - 1:
                    # 自动保存当前标注（如果有）
                    if self.current_annotations:
                        self.save_annotations(
                            self.image_files[self.current_index],
                            self.current_annotations
                        )
                        self.export_yolo_format(
                            self.image_files[self.current_index],
                            self.current_annotations
                        )
                    
                    self.current_index += 1
                    self.current_image = self.load_image(self.current_index)
                    self.current_annotations = self.load_existing_annotations(
                        self.image_files[self.current_index]
                    )
                    self.update_display()
                    print(f"\n加载图片: {self.image_files[self.current_index].name}")
                else:
                    print("已经是最后一张图片")
            
            elif key == ord('p'):
                # 上一张 - 自动保存当前标注
                if self.current_index > 0:
                    # 自动保存当前标注（如果有）
                    if self.current_annotations:
                        self.save_annotations(
                            self.image_files[self.current_index],
                            self.current_annotations
                        )
                        self.export_yolo_format(
                            self.image_files[self.current_index],
                            self.current_annotations
                        )
                    
                    self.current_index -= 1
                    self.current_image = self.load_image(self.current_index)
                    self.current_annotations = self.load_existing_annotations(
                        self.image_files[self.current_index]
                    )
                    self.update_display()
                    print(f"\n加载图片: {self.image_files[self.current_index].name}")
                else:
                    print("已经是第一张图片")
        
        cv2.destroyAllWindows()
        print("\n标注工具已关闭")


def main():
    """主函数"""
    # 默认使用 raw_formations 文件夹
    default_folder = "raw_formations"
    
    # 解析命令行参数
    skip_annotated = True  # 默认跳过已标注的图片
    image_folder = default_folder
    
    for arg in sys.argv[1:]:
        if arg == '--all':
            skip_annotated = False
            print("[*] 显示所有图片（包括已标注的）")
        elif not arg.startswith('--'):
            image_folder = arg
    
    if image_folder == default_folder and len(sys.argv) < 2:
        print(f"未指定文件夹，使用默认文件夹: {image_folder}")
    
    # 如果文件夹不存在，尝试创建它
    if not os.path.exists(image_folder):
        print(f"文件夹不存在，正在创建: {image_folder}")
        try:
            os.makedirs(image_folder, exist_ok=True)
            print(f"已创建文件夹: {image_folder}")
            print(f"请将阵型图片放入此文件夹后重新运行程序")
            sys.exit(0)
        except Exception as e:
            print(f"创建文件夹失败: {e}")
            sys.exit(1)
    
    # 检查文件夹是否为空
    image_files = [f for f in os.listdir(image_folder) 
                   if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
    if not image_files:
        print(f"警告: 文件夹 {image_folder} 中没有图片文件")
        print("支持的格式: .jpg, .jpeg, .png, .webp")
        print(f"请将阵型图片放入 {image_folder} 文件夹后重新运行程序")
        sys.exit(1)
    
    annotator = SpellTowerAnnotator(image_folder, skip_annotated=skip_annotated)
    annotator.run()


if __name__ == "__main__":
    main()
