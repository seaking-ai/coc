#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
阵型自动化处理主控模块
整合功能：下载视频 → 视频转图片 → 图片过滤 → 生成链接文件
"""

import os
import sys
import re
import json
import shutil
import logging
import requests
import chardet
import ffmpeg
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from bs4 import BeautifulSoup
from PIL import Image
import imagehash
from dotenv import load_dotenv

# ========== 日志配置 ==========
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== 路径配置 ==========
BASE_DIR = Path(__file__).parent
load_dotenv(dotenv_path=BASE_DIR.parent / '.env')
VIDEO_DIR = BASE_DIR / "videos"
PENDING_DIR = BASE_DIR / "images" / "pending"
IMAGES_DIR = BASE_DIR / "images"

# ========== 常量定义 ==========
API_URL = "http://localhost:6174/detect"
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
VIDEO_EXTENSIONS = (".mp4", ".avi", ".mov", ".flv", ".mkv", ".wmv")

# ============================================================
# 第一阶段：下载视频（来自 bilibili_download.py）
# ============================================================

def extract_url(raw_url: str) -> Optional[str]:
    """
    从用户输入中提取B站视频URL
    
    参数：
        raw_url: 用户输入的原始文本
        
    返回：
        Optional[str]: 提取到的URL，失败返回None
    """
    pattern = r"https?://[^\s]+"
    match = re.search(pattern, raw_url)
    return match.group() if match else None


def download_bilibili_video(url: str) -> Tuple[bool, str, str]:
    """
    下载B站视频和简介
    
    参数：
        url: B站视频URL
        
    返回：
        Tuple[bool, str, str]: (是否成功, 视频标题, 错误信息)
    """
    # 请求头配置
    headers = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        "referer": "https://www.bilibili.com/",
        "cookie": os.environ.get("BILIBILI_COOKIE", ""),
    }
    
    try:
        # 发送请求获取网页HTML
        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        html_content = res.text
        
        # 提取avid、bvid、cid
        pattern = r'"aid":(\d+),"bvid":"([^"]+)","cid":(\d+)'
        matches = re.findall(pattern, html_content)
        if not matches:
            return False, "", "无法提取视频ID信息"
        
        avid, bvid, cid = matches[0]
        logger.info(f"视频信息 - AID: {avid}, BVID: {bvid}, CID: {cid}")
        
        # 解析视频标题
        soup = BeautifulSoup(html_content, "html.parser")
        title_div = soup.find("div", class_="video-info-title-inner")
        if title_div:
            title_text = title_div.get_text(strip=True)
        else:
            # 尝试其他选择器
            title_match = re.search(r'<h1[^>]*title="([^"]+)"', html_content)
            title_text = title_match.group(1) if title_match else f"video_{bvid}"
        
        # 清理标题中的非法字符
        title_text = re.sub(r'[\\/:*?"<>|]', '_', title_text).strip()
        if not title_text:
            title_text = f"video_{bvid}"
        
        logger.info(f"视频标题: {title_text}")
        
        # 解析视频简介
        desc_span = soup.find("span", class_="desc-info-text")
        desc_text = desc_span.get_text(strip=False) if desc_span else ""
        
        # 构造API请求获取视频播放地址
        play_url = f"https://api.bilibili.com/x/player/wbi/playurl?avid={avid}&bvid={bvid}&cid={cid}"
        resp = requests.get(play_url, headers=headers, timeout=30)
        resp_dict = resp.json()
        
        if resp_dict.get('code') != 0 or 'data' not in resp_dict:
            return False, "", f"获取播放地址失败: {resp_dict.get('message', '未知错误')}"
        
        video_url = resp_dict['data']['durl'][0]['url']
        logger.info(f"视频下载地址获取成功")
        
        # 确保目录存在
        VIDEO_DIR.mkdir(parents=True, exist_ok=True)
        
        # 下载视频
        video_path = VIDEO_DIR / f"{title_text}.mp4"
        logger.info(f"开始下载视频...")
        response = requests.get(video_url, headers=headers, stream=True, timeout=120)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(video_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        if downloaded % (1024 * 1024) < 8192:  # 每MB打印一次
                            logger.info(f"  下载进度: {progress:.1f}%")
        
        # 保存简介
        if desc_text:
            txt_path = VIDEO_DIR / f"{title_text}.txt"
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(desc_text)
            logger.info(f"简介已保存: {txt_path.name}")
        
        logger.info(f"视频下载完成: {video_path.name}")
        return True, title_text, ""
        
    except requests.exceptions.RequestException as e:
        return False, "", f"网络请求失败: {e}"
    except Exception as e:
        return False, "", f"下载失败: {e}"


def stage1_download() -> bool:
    """
    第一阶段：下载B站视频
    
    返回：
        bool: 是否成功下载
    """
    print("\n" + "=" * 60)
    print("           第一阶段：下载B站视频")
    print("=" * 60)
    
    try:
        raw_url = input("\n请输入B站视频URL（可包含文字，会自动提取链接）: ").strip()
    except EOFError:
        print("\n[!] 无法读取输入")
        print("提示：请使用 GUI 版本: python auto_gui.py")
        return False
    except KeyboardInterrupt:
        print("\n[!] 操作已取消")
        return False
    
    if not raw_url:
        logger.error("未输入URL")
        return False
    
    # 提取URL
    url = extract_url(raw_url)
    if not url:
        logger.error("无法从输入中提取有效URL")
        return False
    
    logger.info(f"提取到的URL: {url}")
    
    # 下载视频
    success, title, error = download_bilibili_video(url)
    if not success:
        logger.error(f"下载失败: {error}")
        return False
    
    print(f"\n✅ 视频下载成功: {title}")
    return True


# ============================================================
# 第二阶段：视频转图片（来自 videos2images.py）
# ============================================================

def preprocess_image(image_path: Path) -> bool:
    """
    预处理截图图片，统一转换为标准JPEG格式

    功能：
    1. 将图片转换为RGB模式（去除透明通道）
    2. 左右各裁剪200像素
    3. 保持原始分辨率（除裁剪外不进行缩放）
    4. 保存为高质量JPEG格式

    参数：
        image_path: 图片文件路径

    返回：
        bool: 预处理是否成功
    """
    try:
        with Image.open(image_path) as img:
            # 转换为RGB模式
            if img.mode in ('RGBA', 'P', 'LA', 'L'):
                img = img.convert('RGB')

            # 左右各裁剪200像素
            img_width, img_height = img.size
            CROP_SIZE = 200
            if img_width > CROP_SIZE * 2:
                left = CROP_SIZE
                top = 0
                right = img_width - CROP_SIZE
                bottom = img_height
                img = img.crop((left, top, right, bottom))

            # 保存为JPEG格式，保持原始分辨率
            img.save(image_path, format='JPEG', quality=95, optimize=True)
            logger.info(f"  预处理完成: {image_path.name}")

        return True
    except Exception as e:
        logger.error(f"  预处理失败 {image_path}: {e}")
        return False


def process_video_to_images(video_path: Path, interval: int = 3) -> int:
    """
    处理单个视频，提取截图
    
    参数：
        video_path: 视频文件路径
        interval: 截图间隔（秒）
        
    返回：
        int: 生成的截图数量
    """
    video_name = video_path.stem
    logger.info(f"\n🎬 正在处理视频: {video_path.name}")

    # 为每个视频创建独立的子目录
    video_pending_dir = PENDING_DIR / video_name
    if video_pending_dir.exists():
        # 清理已存在的旧截图
        for f in video_pending_dir.iterdir():
            if f.is_file():
                f.unlink()
    video_pending_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 使用ffmpeg截取视频帧，使用最高质量
        (
            ffmpeg
            .input(str(video_path))
            .filter('fps', fps=1 / interval)
            .output(
                str(video_pending_dir / f"{video_name}_%03d.jpg"),
                qscale=1,
                qmin=1,
                qmax=1
            )
            .overwrite_output()
            .run(quiet=True)
        )

        # 统计生成的图片
        image_files = [f for f in video_pending_dir.iterdir()
                      if f.is_file() and f.suffix.lower() in {'.jpg', '.jpeg', '.png'}]
        logger.info(f"✅ 截图完成，生成 {len(image_files)} 张图片")

        # 预处理所有图片
        logger.info(f"📷 开始预处理截图...")
        for img_path in image_files:
            preprocess_image(img_path)

        return len(image_files)
        
    except ffmpeg.Error as e:
        logger.error(f"❌ ffmpeg处理失败: {e}")
        return 0
    except Exception as e:
        logger.error(f"❌ 处理失败: {e}")
        return 0


def stage2_video_to_images() -> bool:
    """
    第二阶段：视频转图片
    
    返回：
        bool: 是否成功处理
    """
    print("\n" + "=" * 60)
    print("           第二阶段：视频转图片")
    print("=" * 60)
    
    # 获取videos目录下的视频文件
    video_files = [f for f in VIDEO_DIR.iterdir()
                   if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
    
    if not video_files:
        logger.error(f"在 {VIDEO_DIR} 目录下未找到视频文件")
        return False
    
    print(f"\n发现 {len(video_files)} 个视频文件:")
    for i, vf in enumerate(video_files, 1):
        print(f"  {i}. {vf.name}")
    
    # 选择处理方式
    print("\n请选择处理方式:")
    print("  [1] 处理第一个视频")
    print("  [2] 处理所有视频")
    print("  [3] 跳过此阶段")
    
    choice = input("请选择: ").strip()
    
    if choice == '3':
        logger.info("跳过视频转图片阶段")
        return True
    
    if choice == '1' and video_files:
        # 只处理第一个
        count = process_video_to_images(video_files[0], interval=3)
        return count > 0
    elif choice == '2':
        # 处理所有
        total = 0
        for vf in video_files:
            count = process_video_to_images(vf, interval=3)
            total += count
        logger.info(f"\n🎉 所有视频处理完毕！共生成 {total} 张图片")
        return total > 0
    else:
        logger.warning("无效选择")
        return False


# ============================================================
# 第三阶段：图片过滤（来自 filter_images.py）
# ============================================================

def calculate_image_hash(image_path: Path, hash_size: int = 16) -> Optional[imagehash.ImageHash]:
    """
    计算图片的感知哈希值（pHash）
    
    参数：
        image_path: 图片文件路径
        hash_size: 哈希大小，越大越精确但计算量越大
        
    返回：
        Optional[imagehash.ImageHash]: 图片哈希值，失败返回None
    """
    try:
        with Image.open(image_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            return imagehash.phash(img, hash_size=hash_size)
    except Exception as e:
        logger.error(f"计算图片哈希失败 {image_path.name}: {e}")
        return None


def calculate_block_hashes(image_path: Path, grid: Tuple[int, int] = (6, 4), hash_size: int = 8) -> Optional[List[imagehash.ImageHash]]:
    """
    计算图片的块级感知哈希值

    将图片分割成网格，对每个块单独计算哈希值。
    用于检测局部差异，区分"不同布局"和"同一布局+局部变化（如陷阱版本）"。

    参数：
        image_path: 图片文件路径
        grid: (列数, 行数) 网格划分
        hash_size: 每个块的哈希大小

    返回：
        块哈希列表，失败返回None
    """
    try:
        with Image.open(image_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            w, h = img.size
            cols, rows = grid

            block_hashes = []
            for r in range(rows):
                for c in range(cols):
                    left = (c * w) // cols
                    top = (r * h) // rows
                    right = ((c + 1) * w) // cols
                    bottom = ((r + 1) * h) // rows
                    block = img.crop((left, top, right, bottom))
                    block_hashes.append(imagehash.phash(block, hash_size=hash_size))
            return block_hashes
    except Exception as e:
        logger.error(f"计算块哈希失败 {image_path.name}: {e}")
        return None


def filter_similar_images(image_paths: List[Path], max_hash_diff: int = 12) -> List[Path]:
    """
    过滤掉相似/重复的图片，保留第一张出现的图片

    改进：使用两级比较策略
    1. 全局感知哈希 - 快速过滤完全相同或高度相似的图片
    2. 块级哈希比较 - 检测"同一布局，局部差异"的图片（如含陷阱与不含陷阱版本）
                      陷阱占图比例小，只影响少数网格块

    参数：
        image_paths: 图片路径列表（已按顺序排序）
        max_hash_diff: 全局哈希差异阈值，小于等于此值直接判定为重复（默认12）

    返回：
        List[Path]: 去重后的图片路径列表
    """
    if len(image_paths) <= 1:
        return image_paths

    logger.info(f"  开始相似图片检测，共 {len(image_paths)} 张图片")
    logger.info(f"  相似度阈值: 哈希差异 <= {max_hash_diff} (0=完全相同)")

    # 配置块级比较参数
    BLOCK_GLOBAL_THRESHOLD = 28   # 全局哈希差异 ≤ 28 时触发块级比较
    PER_BLOCK_HASH_DIFF = 8       # 单块哈希差异 ≤ 8 认为该块匹配
    BLOCK_MATCH_RATIO = 0.50      # 块匹配比例 ≥ 50% 认为同一布局

    # 计算所有图片的全局哈希和块哈希
    image_hashes: List[Tuple[Path, Optional[imagehash.ImageHash], Optional[List[imagehash.ImageHash]]]] = []
    for img_path in image_paths:
        global_hash = calculate_image_hash(img_path)
        block_hashes = calculate_block_hashes(img_path)
        image_hashes.append((img_path, global_hash, block_hashes))
        if global_hash is None:
            logger.warning(f"    无法计算哈希: {img_path.name}，将保留")

    # 去重：保留第一张，后续相似的删除
    unique_images: List[Path] = []
    unique_hashes: List[imagehash.ImageHash] = []
    unique_block_hashes: List[List[imagehash.ImageHash]] = []
    duplicate_count = 0

    for current_path, current_hash, current_block_hashes in image_hashes:
        if current_hash is None:
            unique_images.append(current_path)
            continue

        is_duplicate = False
        for kept_hash, kept_block_hashes in zip(unique_hashes, unique_block_hashes):
            hash_diff = current_hash - kept_hash

            if hash_diff <= max_hash_diff:
                # 快速路径：全局哈希很相似 → 直接判定重复
                is_duplicate = True
                logger.info(f"    发现相似图片 (差异={hash_diff}): {current_path.name}")
            elif (hash_diff <= BLOCK_GLOBAL_THRESHOLD
                  and current_block_hashes is not None
                  and kept_block_hashes is not None
                  and len(current_block_hashes) == len(kept_block_hashes)):
                # 慢速路径：全局哈希有一定差异，检查块级哈希
                matching_blocks = sum(
                    1 for bh1, bh2 in zip(current_block_hashes, kept_block_hashes)
                    if (bh1 - bh2) <= PER_BLOCK_HASH_DIFF
                )
                match_ratio = matching_blocks / len(current_block_hashes)
                if match_ratio >= BLOCK_MATCH_RATIO:
                    is_duplicate = True
                    logger.info(f"    发现相似图片 (差异={hash_diff}, 块匹配率={match_ratio:.0%}): {current_path.name}")
                    logger.info(f"      同一布局含局部差异（如陷阱版本），将被删除")
                else:
                    logger.info(f"    全局差异={hash_diff} 但块匹配率仅 {match_ratio:.0%}，保留")

            if is_duplicate:
                duplicate_count += 1
                try:
                    current_path.unlink()
                    logger.info(f"      ✓ 已删除重复图片: {current_path.name}")
                except Exception as e:
                    logger.error(f"      ✗ 删除失败: {current_path.name}, 错误: {e}")
                break

        if not is_duplicate:
            unique_images.append(current_path)
            unique_hashes.append(current_hash)
            unique_block_hashes.append(current_block_hashes)

    logger.info(f"  相似图片检测完成：保留 {len(unique_images)} 张，删除 {duplicate_count} 张")
    return unique_images


def detect_image(image_path: Path) -> Dict:
    """
    调用法术塔检测API检测图片
    
    参数：
        image_path: 图片路径
        
    返回：
        Dict: 检测结果
    """
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
    """检测文件编码"""
    with open(file_path, 'rb') as f:
        raw_data = f.read()
        result = chardet.detect(raw_data)
        return result['encoding'] or 'utf-8'


def parse_link_groups(txt_path: Path) -> List[Tuple[Optional[str], Optional[str]]]:
    """
    解析链接文件，支持多种格式（包括URL末尾附带标签的无换行情况）

    返回：
        List[Tuple[Optional[str], Optional[str]]]: (国服链接, 国际服链接)列表
    """
    if not txt_path.exists():
        logger.error(f"链接文件不存在: {txt_path}")
        return []

    encoding = detect_encoding(txt_path)
    with open(txt_path, 'r', encoding=encoding) as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]

    if not lines:
        return []

    def _split_label(url: str) -> Tuple[str, bool]:
        """切分URL末尾附带的标签，返回(纯净URL, 是否国际服)"""
        for label, is_intl in [('国际服', True), ('国服', False)]:
            if label in url:
                idx = url.index(label)
                return url[:idx].strip(), is_intl
        return url, False

    result = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # 国服标签行：下一行是国服链接
        if '国服' in line and not line.startswith('http'):
            if i + 1 < len(lines) and lines[i + 1].startswith('http'):
                cn_url, _ = _split_label(lines[i + 1])
                # 如果国服链接末尾附带了"国际服"，下一行是国际服链接
                if '国际服' in lines[i + 1]:
                    intl_url, _ = _split_label(lines[i + 2]) if i + 2 < len(lines) else (None, False)
                    result.append((cn_url, intl_url if intl_url.startswith('http') else None))
                    i += 3
                else:
                    result.append((cn_url, None))
                    i += 2
            else:
                result.append((None, None))
                i += 1
            continue

        # 国际服标签行：下一行是国际服链接，与前一个国服配对
        if '国际服' in line and not line.startswith('http'):
            intl_link = lines[i + 1] if i + 1 < len(lines) and lines[i + 1].startswith('http') else None
            if result and result[-1][1] is None:
                result[-1] = (result[-1][0], intl_link)
            i += 2
            continue

        # HTTP链接行
        if line.startswith('http'):
            clean_url, has_intl_label = _split_label(line)
            if has_intl_label:
                # URL末尾有"国际服"，下一行是国际服链接
                intl_url = lines[i + 1] if i + 1 < len(lines) and lines[i + 1].startswith('http') else None
                result.append((clean_url, intl_url))
                i += 2 if intl_url else 1
                continue
            else:
                result.append((clean_url, None))

        i += 1

    return result


def generate_txt_for_image(image_path: Path, cn_link: Optional[str], intl_link: Optional[str]):
    """为图片生成包含链接的txt文件"""
    txt_path = image_path.with_suffix('.txt')
    
    lines = []
    if cn_link and cn_link.strip():
        lines.append(cn_link.strip())
    if intl_link and intl_link.strip():
        lines.append(intl_link.strip())
    
    if lines:
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        logger.info(f"    生成: {txt_path.name}")


def stage3_filter_images() -> bool:
    """
    第三阶段：图片过滤处理
    
    返回：
        bool: 是否成功处理
    """
    print("\n" + "=" * 60)
    print("           第三阶段：图片过滤处理")
    print("=" * 60)

    # 扫描pending目录下的所有子目录
    if not PENDING_DIR.exists():
        logger.error(f"目录不存在: {PENDING_DIR}")
        return False

    # 收集所有子目录中的图片
    all_image_files = []
    video_subdirs = []
    for subdir in PENDING_DIR.iterdir():
        if subdir.is_dir():
            video_subdirs.append(subdir)
            for f in subdir.iterdir():
                if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
                    all_image_files.append((subdir.name, f))

    if not all_image_files:
        logger.error("没有找到需要处理的图片")
        return False

    logger.info(f"扫描到 {len(all_image_files)} 个图片文件，来自 {len(video_subdirs)} 个视频")

    # 按视频标题分组
    title_to_images = {}
    for video_name, img_path in all_image_files:
        title_to_images.setdefault(video_name, []).append(img_path)
    
    total_moved = 0
    
    for title, images in title_to_images.items():
        logger.info(f"\n处理: {title} ({len(images)} 张图片)")
        
        # 创建目标文件夹
        title_folder = IMAGES_DIR / title
        title_folder.mkdir(parents=True, exist_ok=True)
        
        # 按序号排序
        def extract_number(p: Path):
            match = re.search(r'_(\d+)\.', p.name)
            return int(match.group(1)) if match else 0
        sorted_images = sorted(images, key=extract_number)
        
        # 法术塔检测
        detected_images = []
        for img_path in sorted_images:
            logger.info(f"  检测: {img_path.name}")
            result = detect_image(img_path)
            
            if result.get('success') and result.get('count', 0) > 0:
                detected_types = result.get('detected', [])
                logger.info(f"    ✓ 检测到 {result['count']} 个法术塔: {', '.join(detected_types)}")
                detected_images.append(img_path)
            else:
                error_msg = result.get('error', '')
                if error_msg == '连接失败':
                    logger.error("❌ 法术塔服务未启动，请先启动服务")
                    print("\n[!] 错误：法术塔检测服务未启动")
                    print("请确保检测服务在 http://localhost:6174 运行")
                    return False
                logger.info(f"    ✗ 未检测到法术塔，删除")
                img_path.unlink()
        
        # 相似图片去重（重要步骤）
        if len(detected_images) > 1:
            logger.info(f"\n{'='*40}")
            logger.info(f"开始相似图片去重，共 {len(detected_images)} 张待处理")
            logger.info(f"{'='*40}")
            detected_images = filter_similar_images(detected_images)
            logger.info(f"\n去重后剩余: {len(detected_images)} 张图片")
            logger.info(f"{'='*40}\n")
        
        # 移动并重命名
        moved_count = 0
        for idx, img_path in enumerate(detected_images, start=1):
            if not img_path.exists():
                continue
            
            now = datetime.now()
            new_filename = f"{now.year}.{now.month}.{now.day}.{idx}{img_path.suffix}"
            dest_path = title_folder / new_filename
            
            try:
                shutil.move(str(img_path), str(dest_path))
                moved_count += 1
                total_moved += 1
                logger.info(f"    移动: {img_path.name} -> {new_filename}")
            except Exception as e:
                logger.error(f"    移动失败: {e}")
        
        # 为每个图片生成链接文件
        link_txt = VIDEO_DIR / f"{title}.txt"
        if link_txt.exists() and moved_count > 0:
            groups = parse_link_groups(link_txt)
            logger.info(f"  链接组: {len(groups)} 个, 图片: {moved_count} 张")
            
            # 生成txt文件
            existing_images = [f for f in title_folder.iterdir()
                             if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS]
            existing_images.sort(key=lambda p: int(p.stem.rsplit('.', 1)[-1]) if p.stem.rsplit('.', 1)[-1].isdigit() else 0)
            
            for i, img_path in enumerate(existing_images[:len(groups)]):
                cn_link, intl_link = groups[i] if i < len(groups) else (None, None)
                generate_txt_for_image(img_path, cn_link, intl_link)
        
        # 清理空文件夹
        if title_folder.exists() and not any(title_folder.iterdir()):
            title_folder.rmdir()

    # 清理pending目录下的空子目录
    for subdir in video_subdirs:
        if subdir.exists():
            remaining_files = [f for f in subdir.iterdir() if f.is_file()]
            if not remaining_files:
                try:
                    subdir.rmdir()
                    logger.info(f"清理空目录: {subdir.name}")
                except Exception as e:
                    logger.warning(f"清理目录失败 {subdir.name}: {e}")

    logger.info(f"\n{'=' * 60}")
    logger.info(f"过滤完成！移动 {total_moved} 张图片")
    logger.info(f"{'=' * 60}")

    return total_moved > 0


# ============================================================
# 主控流程
# ============================================================

def show_menu():
    """显示主菜单"""
    print("\n" + "=" * 60)
    print("        阵型自动化处理系统")
    print("=" * 60)
    print("\n流程说明:")
    print("  ① 下载视频  →  ② 视频转图片  →  ③ 图片过滤处理")
    print("\n操作选项:")
    print("  [1] 完整流程（①→②→③）")
    print("  [2] 仅下载视频（①）")
    print("  [3] 视频转图片（②）")
    print("  [4] 图片过滤处理（③）")
    print("  [5] 从②→③（已有视频）")
    print("  [q] 退出程序")
    print("=" * 60)


def run_full_workflow():
    """运行完整流程"""
    # 阶段1：下载视频
    if not stage1_download():
        print("\n❌ 视频下载失败，流程中止")
        return False
    
    # 阶段2：视频转图片
    if not stage2_video_to_images():
        print("\n❌ 视频转图片失败")
        return False
    
    # 阶段3：图片过滤
    if not stage3_filter_images():
        print("\n❌ 图片过滤失败")
        return False
    
    print("\n" + "=" * 60)
    print("🎉 完整流程执行成功！")
    print("=" * 60)
    return True


def main():
    """主函数"""
    print("\n[ 阵型自动化处理系统 ]")
    print("本工具用于自动化处理B站视频阵型下载、截图和过滤\n")
    
    while True:
        try:
            show_menu()
            choice = input("\n请选择操作: ").strip().lower()
            
            if choice in ('q', 'quit', 'exit', '退出'):
                print("\n感谢使用，再见！")
                break
            
            if choice == '1':
                run_full_workflow()
            elif choice == '2':
                stage1_download()
            elif choice == '3':
                stage2_video_to_images()
            elif choice == '4':
                stage3_filter_images()
            elif choice == '5':
                # 从视频转图片开始
                if stage2_video_to_images():
                    stage3_filter_images()
            else:
                print("\n⚠️ 无效的选择")
            
            input("\n按回车键继续...")
            
        except EOFError:
            print("\n\n[!] 输入流已关闭")
            print("提示：请从命令行直接运行此脚本以支持交互式输入")
            print("     或者使用 GUI 版本: python auto_gui.py")
            break
        except KeyboardInterrupt:
            print("\n\n[!] 用户中断操作")
            break
        except Exception as e:
            print(f"\n[!] 发生错误: {e}")
            input("\n按回车键继续...")


if __name__ == "__main__":
    main()
