#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
图片过滤和法术塔检测处理模块（修正版）
"""

import os
import sys
import re
import shutil
import json
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime
import requests
import logging
import chardet
from PIL import Image
import imagehash

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', filename='auto/filter_images.log', encoding='utf-8')
logger = logging.getLogger(__name__)

API_URL = "http://localhost:6174/detect"
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}

# ------------------------------------------------------------
# 工具函数
# ------------------------------------------------------------
def get_image_title(filename: str) -> str:
    """
    从文件名中提取视频标题
    
    参数：
        filename: 文件名
        
    返回：
        str: 视频标题（移除序号后缀）
    """
    name_without_ext = Path(filename).stem
    title = re.sub(r'_\d+$', '', name_without_ext)
    return title


def generate_new_filename(index: int, ext: str = '.jpg') -> str:
    """
    生成新的文件名格式：年.月.日.序号
    
    参数：
        index: 序号（从1开始）
        ext: 文件扩展名（默认.jpg）
        
    返回：
        str: 新文件名，例如 "2026.4.27.1.jpg"
    """
    now = datetime.now()
    return f"{now.year}.{now.month}.{now.day}.{index}{ext}"

def scan_images(pending_dir: Path) -> List[Path]:
    if not pending_dir.exists():
        logger.error(f"目录不存在: {pending_dir}")
        return []
    image_files = [f for f in pending_dir.iterdir() if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS]
    logger.info(f"扫描到 {len(image_files)} 个图片文件")
    return image_files


def calculate_image_hash(image_path: Path, hash_size: int = 16) -> Optional[imagehash.ImageHash]:
    """
    计算图片的感知哈希值（pHash）
    
    参数：
        image_path: 图片文件路径
        hash_size: 哈希大小，越大越精确但计算量越大（默认16）
        
    返回：
        Optional[imagehash.ImageHash]: 图片哈希值，失败返回None
    """
    try:
        with Image.open(image_path) as img:
            # 转换为RGB模式（处理RGBA、P模式等）
            if img.mode != 'RGB':
                img = img.convert('RGB')
            # 使用感知哈希（pHash），对图片缩放、压缩、轻微变形有较好的容忍度
            return imagehash.phash(img, hash_size=hash_size)
    except Exception as e:
        logger.error(f"计算图片哈希失败 {image_path.name}: {e}")
        return None


def filter_similar_images(image_paths: List[Path], max_hash_diff: int = 12) -> List[Path]:
    """
    过滤掉相似/重复的图片，保留第一张出现的图片
    
    参数：
        image_paths: 图片路径列表（已按顺序排序）
        max_hash_diff: 最大哈希差异阈值，小于等于此值认为是相似图片（默认12）
                       哈希值差异越小图片越相似，0表示完全相同
        
    返回：
        List[Path]: 去重后的图片路径列表
    """
    if len(image_paths) <= 1:
        return image_paths
    
    logger.info(f"  开始相似图片检测，共 {len(image_paths)} 张图片")
    logger.info(f"  相似度阈值: 哈希差异 <= {max_hash_diff}")
    
    # 计算所有图片的哈希值
    image_hashes: List[Tuple[Path, Optional[imagehash.ImageHash]]] = []
    for img_path in image_paths:
        img_hash = calculate_image_hash(img_path)
        image_hashes.append((img_path, img_hash))
        if img_hash is None:
            logger.warning(f"    无法计算哈希: {img_path.name}，将保留")
    
    # 去重：保留第一张，后续相似的删除
    unique_images: List[Path] = []
    unique_hashes: List[imagehash.ImageHash] = []  # 已保留图片的哈希值
    duplicate_count = 0
    
    for i, (current_path, current_hash) in enumerate(image_hashes):
        if current_hash is None:
            # 无法计算哈希的图片直接保留
            unique_images.append(current_path)
            continue
        
        # 检查是否与已保留的图片相似（只与保留列表中的比较）
        is_duplicate = False
        for kept_hash in unique_hashes:
            # 计算哈希差异
            hash_diff = current_hash - kept_hash
            if hash_diff <= max_hash_diff:
                logger.info(f"    发现相似图片 (差异={hash_diff}): {current_path.name}")
                is_duplicate = True
                duplicate_count += 1
                # 删除重复图片
                try:
                    current_path.unlink()
                    logger.info(f"      已删除重复图片: {current_path.name}")
                except Exception as e:
                    logger.error(f"      删除失败: {current_path.name}, 错误: {e}")
                break
        
        if not is_duplicate:
            unique_images.append(current_path)
            unique_hashes.append(current_hash)
    
    logger.info(f"  相似图片检测完成：保留 {len(unique_images)} 张，删除 {duplicate_count} 张")
    return unique_images

def detect_image(image_path: Path) -> Dict:
    try:
        with open(image_path, 'rb') as f:
            files = {'image': (image_path.name, f, 'image/jpeg')}
            response = requests.post(API_URL, files=files, timeout=30)
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
    except requests.exceptions.ConnectionError:
        return {'success': False, 'error': '连接失败'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def detect_encoding(file_path: Path) -> str:
    with open(file_path, 'rb') as f:
        raw_data = f.read()
        result = chardet.detect(raw_data)
        return result['encoding'] or 'utf-8'

def parse_link_groups(txt_path: Path) -> List[Tuple[str, Optional[str]]]:
    """
    解析链接文件，支持多种格式：
    1. 同时包含国服和国际服
    2. 只包含单一类型（国服或国际服）
    3. 支持国服带数字编号（如国服1、国服2）
    4. 国际服可省略，自动跟随前一个国服
    
    参数:
        txt_path: 链接文件路径
    返回:
        链接组列表，每项为(国服链接, 国际服链接)元组
    """
    if not txt_path.exists():
        logger.error(f"链接文件不存在: {txt_path}")
        return []
    
    encoding = detect_encoding(txt_path)
    with open(txt_path, 'r', encoding=encoding) as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    
    if not lines:
        logger.error(f"链接文件为空: {txt_path}")
        return []
    
    # 检测是否包含国服和国际服字段
    has_cn = any('国服' in line for line in lines)
    has_intl = any('国际服' in line for line in lines)
    
    # 如果都不包含，说明是纯链接格式，需要用户选择
    if not has_cn and not has_intl:
        print(f"\n[!] 文件 {txt_path.name} 未检测到'国服'或'国际服'标签")
        print("文件内容预览:")
        for i, line in enumerate(lines[:5], 1):
            print(f"  {i}. {line[:60]}{'...' if len(line) > 60 else ''}")
        
        while True:
            choice = input("\n请选择链接类型:\n  [1] 国服链接\n  [2] 国际服链接\n  [q] 跳过此文件\n请选择: ").strip()
            if choice == '1':
                # 所有行都当作国服链接
                return [(line, None) for line in lines if line.startswith('http')]
            elif choice == '2':
                # 所有行都当作国际服链接
                return [(None, line) for line in lines if line.startswith('http')]
            elif choice in ('q', 'quit', 'exit'):
                return []
            else:
                print("无效选择，请重新输入")
    
    # 如果只包含国际服，没有国服
    if not has_cn and has_intl:
        print(f"\n[!] 文件 {txt_path.name} 只包含国际服链接，没有国服链接")
        while True:
            choice = input("是否继续处理? 所有国际服链接将对应空国服链接 (y/n): ").strip().lower()
            if choice in ('y', 'yes', '是'):
                break
            elif choice in ('n', 'no', '否'):
                return []
    
    # 解析链接组
    groups = []  # 存储 (国服链接, 国际服链接, 图片编号)
    i = 0
    current_cn_link = None
    current_intl_link = None
    current_cn_index = None  # 当前国服对应的图片编号
    
    while i < len(lines):
        line = lines[i]
        
        # 检测国服行（支持"国服"、"国服1"、"国服 1"等格式）
        cn_match = re.match(r'国服\s*(\d*)', line)
        if cn_match:
            # 提取图片编号（如果有）
            index_str = cn_match.group(1)
            cn_index = int(index_str) if index_str else None
            
            # 保存之前的链接组（如果有）
            if current_cn_link is not None:
                groups.append((current_cn_index, current_cn_link, current_intl_link))
            
            # 读取国服链接
            if i + 1 < len(lines) and lines[i + 1].startswith('http'):
                current_cn_link = lines[i + 1]
                current_cn_index = cn_index
                current_intl_link = None  # 重置国际服链接
                i += 2
            else:
                logger.warning(f"国服标签后无链接: {line}")
                i += 1
            continue
        
        # 检测国际服行
        if line.startswith('国际服'):
            # 读取国际服链接
            if i + 1 < len(lines) and lines[i + 1].startswith('http'):
                current_intl_link = lines[i + 1]
                i += 2
            else:
                logger.warning(f"国际服标签后无链接: {line}")
                i += 1
            continue
        
        # 如果是http链接但没有标签，可能是格式错误
        if line.startswith('http'):
            logger.warning(f"发现无标签的链接，将被忽略: {line[:50]}...")
        
        i += 1
    
    # 保存最后一个链接组
    if current_cn_link is not None:
        groups.append((current_cn_index, current_cn_link, current_intl_link))
    
    # 处理编号，按编号排序
    # 将无编号的链接分配到相应位置
    result = []
    indexed_groups = {}  # 有编号的组
    unindexed_groups = []  # 无编号的组
    
    for idx, cn_link, intl_link in groups:
        if idx is not None:
            indexed_groups[idx] = (cn_link, intl_link)
        else:
            unindexed_groups.append((cn_link, intl_link))
    
    # 获取最大编号
    max_index = max(indexed_groups.keys()) if indexed_groups else 0
    max_index = max(max_index, len(unindexed_groups))
    
    # 按顺序组装结果
    unindexed_idx = 0
    for i in range(1, max_index + 1):
        if i in indexed_groups:
            result.append(indexed_groups[i])
        elif unindexed_idx < len(unindexed_groups):
            result.append(unindexed_groups[unindexed_idx])
            unindexed_idx += 1
    
    # 如果还有剩余的无编号组，添加到末尾
    while unindexed_idx < len(unindexed_groups):
        result.append(unindexed_groups[unindexed_idx])
        unindexed_idx += 1
    
    logger.info(f"解析完成: {txt_path.name} - 共 {len(result)} 组链接")
    for i, (cn, intl) in enumerate(result, 1):
        cn_status = "✓" if cn else "✗"
        intl_status = "✓" if intl else "✗"
        logger.info(f"  图片{i}: 国服[{cn_status}] 国际服[{intl_status}]")
    
    return result

def generate_txt_for_image(image_path: Path, cn_link: str, intl_link: Optional[str]):
    """
    生成txt文件，仅包含国服链接和国际服链接
    
    参数：
        image_path: 图片路径
        cn_link: 国服链接（可为空）
        intl_link: 国际服链接（可为空）
    """
    txt_path = image_path.with_suffix('.txt')
    
    # 过滤掉空链接
    lines = []
    if cn_link and cn_link.strip():
        lines.append(cn_link.strip())
    if intl_link and intl_link.strip():
        lines.append(intl_link.strip())
    
    if not lines:
        logger.warning(f"    跳过生成空文件: {txt_path.name}")
        return
    
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    logger.info(f"    生成: {txt_path.name}")

# ------------------------------------------------------------
# 第一步：过滤并移动（只保留检测到法术塔的图片）
# ------------------------------------------------------------
def filter_and_move_images() -> Dict[str, List[Path]]:
    """
    过滤图片并移动到对应文件夹，同时重命名为新格式
    
    返回：
        Dict[str, List[Path]]: 按标题分类的移动后图片路径列表
    """
    project_root = Path(__file__).parent.parent
    pending_dir = project_root / "auto" / "images" / "pending"
    images_dir = project_root / "auto" / "images"

    logger.info("=" * 60)
    logger.info("开始图片过滤处理")
    logger.info("=" * 60)

    image_files = scan_images(pending_dir)
    if not image_files:
        logger.info("没有找到需要处理的图片")
        return {}

    title_to_images = {}
    for img in image_files:
        title = get_image_title(img.name)
        title_to_images.setdefault(title, []).append(img)

    logger.info(f"共 {len(title_to_images)} 个不同的视频标题")

    moved_images_by_title = {}
    processed_count = 0
    filtered_count = 0

    for title, images in title_to_images.items():
        logger.info(f"\n处理视频: {title}")
        logger.info(f"  包含 {len(images)} 张截图")

        title_folder = images_dir / title
        title_folder.mkdir(parents=True, exist_ok=True)
        logger.info(f"  创建/确认文件夹: {title_folder}")

        # 按原始文件名序号排序，确保顺序正确
        def extract_number(p: Path):
            match = re.search(r'_(\d+)\.', p.name)
            return int(match.group(1)) if match else 0
        sorted_images = sorted(images, key=extract_number)

        detected_images = []
        for img_path in sorted_images:
            logger.info(f"    检测: {img_path.name}")
            result = detect_image(img_path)
            print(result)
            if result.get('success') and result.get('count', 0) > 0:
                detected_types = result.get('detected', [])
                logger.info(f"{result}\n      ✓ 检测到 {result['count']} 个法术塔: {', '.join(detected_types)}")
                detected_images.append(img_path)
            else:
                error_msg = result.get('error', '')
                if error_msg == '连接失败':
                    logger.error("法术塔服务未启动，请先启动服务")
                    sys.exit(1)
                # 正常未检测到
                logger.info(f"      ✗ 未检测到法术塔，将删除")
                # 立即删除未检测到的图片
                img_path.unlink()
                logger.info(f"        已删除: {img_path.name}")

        # 第二步：过滤相似/重复的图片
        if len(detected_images) > 1:
            detected_images = filter_similar_images(detected_images)
        
        logger.info(f"  检测完成后剩余 {len(detected_images)} 张图片")

        # 第三步：移动检测到的图片到标题文件夹，并重命名为新格式
        moved_paths = []
        for idx, img_path in enumerate(detected_images, start=1):
            # 检查文件是否存在（可能在去重阶段被删除）
            if not img_path.exists():
                logger.warning(f"    跳过不存在的文件: {img_path.name}")
                continue
            
            new_filename = generate_new_filename(idx, img_path.suffix)
            dest_path = title_folder / new_filename
            try:
                shutil.move(str(img_path), str(dest_path))
                moved_paths.append(dest_path)
                filtered_count += 1
                logger.info(f"    移动: {img_path.name} -> {title_folder.name}/{new_filename}")
            except Exception as e:
                logger.error(f"    移动文件失败 {img_path.name}: {e}")

        if moved_paths:
            moved_images_by_title[title] = moved_paths
        else:
            logger.info(f"    没有检测到任何法术塔图片，跳过此视频")
            # 如果标题文件夹为空，可以删除（可选）
            if title_folder.exists() and not any(title_folder.iterdir()):
                title_folder.rmdir()
                logger.info(f"    删除空文件夹: {title_folder}")

        processed_count += 1

    logger.info("\n" + "=" * 60)
    logger.info(f"过滤移动完成！")
    logger.info(f"  处理的视频数: {processed_count}")
    logger.info(f"  移动的图片数: {filtered_count}")
    logger.info(f"  删除的图片数: {len(image_files) - filtered_count}")
    logger.info("=" * 60)

    return moved_images_by_title

# ------------------------------------------------------------
# 第二步：校验数量并生成 .txt 文件
# ------------------------------------------------------------
def verify_and_generate_for_title(video_title: str, image_paths: List[Path], videos_dir: Path, title_folder: Path):
    """
    校验图片数量并生成链接文件，支持重试机制
    
    功能：
    1. 校验图片数量与链接组数量是否匹配
    2. 如果不匹配，提示用户手动删除图片后重试
    3. 为每张图片生成包含国服/国际服链接的txt文件
    
    参数：
        video_title: 视频标题
        image_paths: 图片路径列表（已按顺序排列）
        videos_dir: 视频链接文件所在目录
        title_folder: 图片文件夹路径
    """
    link_txt = videos_dir / f"{video_title}.txt"
    if not link_txt.exists():
        logger.error(f"缺少链接文件: {link_txt}，无法处理 {video_title}")
        return False

    groups = parse_link_groups(link_txt)
    expected_count = len(groups)
    actual_count = len(image_paths)

    # 数量不匹配时，进入重试循环
    while actual_count != expected_count:
        logger.warning(f"数量不匹配！标题 '{video_title}' 需要 {expected_count} 张图片，实际有 {actual_count} 张。")
        
        print(f"\n[!] 链接数量与图片数量不匹配")
        print(f"  链接组: {expected_count} 个")
        print(f"  图片数: {actual_count} 张")
        print(f"\n  当前图片列表:")
        for i, img_path in enumerate(image_paths, 1):
            print(f"    {i}. {img_path.name}")
        print(f"\n  图片文件夹: {title_folder}")
        
        while True:
            print(f"\n请选择操作:")
            print(f"  [d] 我已手动删除多余图片，重新检测")
            print(f"  [p] 只处理能匹配的部分（前 {min(expected_count, actual_count)} 张）")
            print(f"  [q] 退出程序")
            choice = input("请选择: ").strip().lower()
            
            if choice == 'd':
                # 重新扫描图片
                print("\n正在重新扫描图片...")
                ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
                new_image_files = [f for f in title_folder.iterdir() 
                                  if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS]
                
                # 按文件名排序
                new_image_files.sort(key=lambda p: int(p.stem.rsplit('.', 1)[-1]) if p.stem.rsplit('.', 1)[-1].isdigit() else 0)
                image_paths = new_image_files
                actual_count = len(image_paths)
                
                if actual_count == 0:
                    print(f"[!] 警告: 文件夹中没有图片了")
                    logger.warning(f"文件夹为空: {title_folder}")
                    return False
                
                print(f"  重新扫描完成，当前有 {actual_count} 张图片")
                
                # 检查数量是否匹配
                if actual_count == expected_count:
                    print(f"  [OK] 数量已匹配！")
                    break
                else:
                    print(f"  [!] 数量仍不匹配（需要 {expected_count} 张，实际 {actual_count} 张）")
                    continue
                    
            elif choice == 'p':
                # 取最小值进行处理
                process_count = min(expected_count, actual_count)
                groups = groups[:process_count]
                image_paths = image_paths[:process_count]
                logger.info(f"将只处理前 {process_count} 张图片")
                break
                
            elif choice == 'q':
                sys.exit(1)
            else:
                print("无效选择")
        
        # 如果数量匹配了，跳出循环
        if actual_count == expected_count:
            break

    # 图片已经在移动时按原始序号排序并重新命名为 年.月.日.序号 格式
    # 所以直接按列表顺序对应链接组
    logger.info(f"  开始为 {len(image_paths)} 张图片生成链接文件...")
    for idx, img_path in enumerate(image_paths):
        cn_link, intl_link = groups[idx]
        
        # 确保至少有一个链接
        if not cn_link and not intl_link:
            logger.warning(f"  图片 {img_path.name} 没有有效的链接，跳过")
            continue
        
        # 如果只有国际服链接没有国服链接，也允许生成
        if not cn_link and intl_link:
            logger.warning(f"  图片 {img_path.name} 只有国际服链接")
        
        # 仅生成包含链接的txt文件，不包含检测结果
        generate_txt_for_image(img_path, cn_link or "", intl_link)
    
    logger.info(f"  完成 {video_title} 的链接文件生成")
    return True

def post_process(moved_images_by_title: Dict[str, List[Path]]):
    """
    后处理：校验图片数量并生成链接文件
    """
    project_root = Path(__file__).parent.parent
    videos_dir = project_root / "auto" / "videos"
    images_dir = project_root / "auto" / "images"

    if not moved_images_by_title:
        logger.info("没有移动任何图片，后处理跳过")
        return

    logger.info("=" * 60)
    logger.info("开始后处理：校验图片数量并生成链接文件")
    logger.info("=" * 60)

    for video_title, image_paths in moved_images_by_title.items():
        logger.info(f"\n处理标题: {video_title}")
        title_folder = images_dir / video_title
        
        # 检查图片是否还存在（可能被手动删除）
        existing_images = [p for p in image_paths if p.exists()]
        if not existing_images:
            logger.warning(f"  跳过: {video_title} 的所有图片已被删除")
            print(f"\n[!] 跳过 {video_title}: 所有图片已被删除")
            continue
        
        verify_and_generate_for_title(video_title, existing_images, videos_dir, title_folder)

    logger.info("\n" + "=" * 60)
    logger.info("所有后处理完成！")
    logger.info("=" * 60)

# ------------------------------------------------------------
# 主流程
# ------------------------------------------------------------
def process_all():
    moved = filter_and_move_images()
    if moved:
        post_process(moved)
    else:
        logger.info("没有检测到任何法术塔图片，程序结束")

if __name__ == "__main__":
    process_all()