#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
阵型自动化处理系统 - GUI版本
整合功能：下载视频 → 视频转图片 → 图片过滤 → 生成链接文件
使用tkinter构建图形界面
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
import winsound
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from bs4 import BeautifulSoup
from PIL import Image
import imagehash
from dotenv import load_dotenv
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed

# ========== 路径配置 ==========
def get_base_dir() -> Path:
    """
    获取程序基础目录
    兼容直接运行 Python 脚本和 PyInstaller 打包后的 exe

    返回:
        Path: 程序所在目录（exe 所在目录或脚本所在目录）
    """
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后的 exe 运行环境
        # sys.executable 指向 exe 文件本身，取其所在目录
        return Path(sys.executable).parent
    else:
        # 直接运行 Python 脚本
        return Path(__file__).parent


BASE_DIR = get_base_dir()
load_dotenv(dotenv_path=BASE_DIR.parent / '.env')
VIDEO_DIR = BASE_DIR / "videos"
PENDING_DIR = BASE_DIR / "images" / "pending"
IMAGES_DIR = BASE_DIR / "images"

# ========== 常量定义 ==========
API_URL = "http://localhost:6174/detect"
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
VIDEO_EXTENSIONS = (".mp4", ".avi", ".mov", ".flv", ".mkv", ".wmv")


# ============================================================
# 日志处理器 - 将日志输出到GUI
# ============================================================
class GUIHandler(logging.Handler):
    """自定义日志处理器，将日志输出到GUI的文本框"""
    
    def __init__(self, text_widget):
        super().__init__()
        self.text_widget = text_widget
        self.queue = queue.Queue()
        
    def emit(self, record):
        """将日志记录放入队列"""
        msg = self.format(record)
        self.queue.put(msg)
        
    def update(self):
        """从队列中取出日志并更新到文本框"""
        while not self.queue.empty():
            try:
                msg = self.queue.get_nowait()
                self.text_widget.insert(tk.END, msg + "\n")
                self.text_widget.see(tk.END)
            except queue.Empty:
                break


# ============================================================
# 核心功能函数（与auto.py相同）
# ============================================================

def extract_url(raw_url: str) -> Optional[str]:
    """从用户输入中提取B站视频URL"""
    pattern = r"https?://[^\s]+"
    match = re.search(pattern, raw_url)
    return match.group() if match else None


def download_bilibili_video(url: str, progress_callback=None, link_input_callback=None) -> Tuple[bool, str, str, str]:
    """
    下载B站视频和简介

    参数：
        url: B站视频URL
        progress_callback: 进度回调函数，接收(当前字节, 总字节)
        link_input_callback: 链接输入回调函数，当简介中没有链接时调用，返回用户输入的链接文本

    返回：
        Tuple[bool, str, str, str]: (是否成功, 视频标题, 视频发布日期(YYYY-MM-DD格式), 错误信息)
    """
    headers = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        "referer": "https://www.bilibili.com/",
        "cookie": os.environ.get("BILIBILI_COOKIE", ""),
    }
    
    try:
        logging.info(f"正在获取视频信息...")
        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        html_content = res.text
        
        # 提取avid、bvid、cid
        pattern = r'"aid":(\d+),"bvid":"([^"]+)","cid":(\d+)'
        matches = re.findall(pattern, html_content)
        if not matches:
            return False, "", "无法提取视频ID信息"
        
        avid, bvid, cid = matches[0]
        logging.info(f"视频信息 - AID: {avid}, BVID: {bvid}")
        
        # 解析视频标题
        soup = BeautifulSoup(html_content, "html.parser")
        title_div = soup.find("div", class_="video-info-title-inner")
        if title_div:
            title_text = title_div.get_text(strip=True)
        else:
            title_match = re.search(r'<h1[^>]*title="([^"]+)"', html_content)
            title_text = title_match.group(1) if title_match else f"video_{bvid}"
        
        # 清理标题中的非法字符
        title_text = re.sub(r'[\\/:*?"<>|]', '_', title_text).strip()
        if not title_text:
            title_text = f"video_{bvid}"
        
        logging.info(f"视频标题: {title_text}")
        
        # 解析视频简介
        desc_span = soup.find("span", class_="desc-info-text")
        desc_text = desc_span.get_text(strip=False) if desc_span else ""

        # 解析视频发布时间
        pubdate_div = soup.find("div", class_="pubdate-ip-text")
        pub_date = ""
        if pubdate_div:
            pubdate_text = pubdate_div.get_text(strip=True)
            # 从文本中提取日期，格式如 "2026-05-26 23:26:28"
            date_match = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', pubdate_text)
            if date_match:
                year, month, day = date_match.groups()
                pub_date = f"{year}-{int(month):02d}-{int(day):02d}"
                logging.info(f"视频发布日期: {pub_date}")
        if not pub_date:
            logging.warning("未能提取视频发布日期，将使用当前日期")
            now = datetime.now()
            pub_date = f"{now.year}-{now.month:02d}-{now.day:02d}"

        # 获取视频播放地址
        logging.info("正在获取视频下载地址...")
        play_url = f"https://api.bilibili.com/x/player/wbi/playurl?avid={avid}&bvid={bvid}&cid={cid}&qn=112"
        resp = requests.get(play_url, headers=headers, timeout=30)
        resp_dict = resp.json()
        
        if resp_dict.get('code') != 0 or 'data' not in resp_dict:
            return False, "", f"获取播放地址失败: {resp_dict.get('message', '未知错误')}"
        
        video_url = resp_dict['data']['durl'][0]['url']
        
        # 确保目录存在
        VIDEO_DIR.mkdir(parents=True, exist_ok=True)

        # 构建带日期的文件名前缀（格式：YYYY.MM.DD_视频标题）
        date_prefix = pub_date.replace("-", ".")
        file_name_with_date = f"{date_prefix}_{title_text}"

        # 下载视频
        video_path = VIDEO_DIR / f"{file_name_with_date}.mp4"
        logging.info(f"开始下载视频到: {video_path.name}")
        response = requests.get(video_url, headers=headers, stream=True, timeout=120)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        last_progress = 0

        with open(video_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and progress_callback:
                        progress = int((downloaded / total_size) * 100)
                        if progress != last_progress and progress % 5 == 0:
                            progress_callback(progress, total_size)
                            last_progress = progress

        # 检测简介中是否包含链接（http链接 或 国服TH纯文本链接）
        has_http = 'http' in desc_text.lower()
        has_http = has_http or bool(re.search(r'TH\d+:[\w\-:]+', desc_text))
        print("简介中是否包含链接:", has_http)
        needs_manual_input = not has_http
        
        if needs_manual_input and link_input_callback:
            logging.info("简介中未检测到有效链接，等待用户输入...")
            user_input = link_input_callback(desc_text)
            if user_input:
                desc_text = user_input
                logging.info("已获取用户输入的链接")
            else:
                logging.warning("用户未输入链接，将使用原简介")

        # 保存简介
        if desc_text:
            txt_path = VIDEO_DIR / f"{file_name_with_date}.txt"
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(desc_text)
            logging.info(f"简介已保存: {txt_path.name}")

        # 保存发布日期，供后续图片命名使用
        date_path = VIDEO_DIR / f"{file_name_with_date}.date"
        with open(date_path, "w", encoding="utf-8") as f:
            f.write(pub_date)
        logging.info(f"发布日期已保存: {date_path.name}")

        logging.info(f"✅ 视频下载完成: {video_path.name}")
        return True, file_name_with_date, pub_date, ""

    except requests.exceptions.RequestException as e:
        return False, "", "", f"网络请求失败: {e}"
    except Exception as e:
        return False, "", "", f"下载失败: {e}"


def preprocess_image(image_path: Path) -> bool:
    try:
        with Image.open(image_path) as img:
            if img.mode in ('RGBA', 'P', 'LA', 'L'):
                img = img.convert('RGB')

            img_width, img_height = img.size
            
            # 智能裁剪：根据图片宽度比例决定裁剪大小
            CROP_RATIO = 0.20  # 裁剪20%
            crop_size = int(img_width * CROP_RATIO)
            
            if img_width > crop_size * 2:
                img = img.crop((crop_size, 0, img_width - crop_size, img_height))
                logging.info(f"裁剪 {crop_size}px 从两侧，原始 {img_width}px -> {img.size[0]}px")

            MAX_DIM = 1280
            if max(img.size) > MAX_DIM:
                img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

            img.save(image_path, format='JPEG', quality=95, optimize=True)
        return True
    except Exception as e:
        logging.error(f"预处理失败 {image_path}: {e}")
        return False


def process_video_to_images(video_path: Path, interval: int = 2, progress_callback=None) -> int:
    """
    处理单个视频，提取截图到独立的子目录

    参数：
        video_path: 视频文件路径
        interval: 截图间隔（秒）
        progress_callback: 进度回调函数

    返回：
        int: 生成的截图数量
    """
    video_name = video_path.stem
    logging.info(f"正在处理视频: {video_path.name}")

    # 为每个视频创建独立的子目录
    video_pending_dir = PENDING_DIR / video_name
    if video_pending_dir.exists():
        # 清理已存在的旧截图
        for f in video_pending_dir.iterdir():
            if f.is_file():
                f.unlink()
    video_pending_dir.mkdir(parents=True, exist_ok=True)

    try:
        logging.info("正在截取视频帧...")
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
        
        # 输出截图尺寸信息
        if image_files:
            from PIL import Image
            sizes = []
            for img_path in image_files[:3]:  # 只检查前3张
                try:
                    with Image.open(img_path) as img:
                        sizes.append(f"{img_path.name}: {img.size}")
                except Exception as e:
                    sizes.append(f"{img_path.name}: 无法读取")
            logging.info(f"[DEBUG] 截图完成，生成 {len(image_files)} 张图片，部分尺寸: {', '.join(sizes)}")
        else:
            logging.info(f"截图完成，生成 {len(image_files)} 张图片")

        # 预处理所有图片
        if progress_callback:
            progress_callback(0, len(image_files), "预处理图片...")

        for i, img_path in enumerate(image_files):
            preprocess_image(img_path)
            if progress_callback and (i + 1) % 5 == 0:
                progress_callback(i + 1, len(image_files), f"预处理图片 {i+1}/{len(image_files)}")

        return len(image_files)

    except ffmpeg.Error as e:
        logging.error(f"ffmpeg处理失败: {e}")
        return 0
    except Exception as e:
        logging.error(f"处理失败: {e}")
        return 0


def calculate_image_hash(image_path: Path, hash_size: int = 16) -> Optional[imagehash.ImageHash]:
    """计算图片的感知哈希值（pHash）"""
    try:
        with Image.open(image_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            return imagehash.phash(img, hash_size=hash_size)
    except Exception as e:
        logging.error(f"计算图片哈希失败 {image_path.name}: {e}")
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
        logging.error(f"计算块哈希失败 {image_path.name}: {e}")
        return None


def filter_similar_images(image_paths: List[Path], max_hash_diff: int = 12, progress_callback=None) -> List[Path]:
    """
    过滤掉相似/重复的图片，保留第一张出现的图片

    改进：使用两级比较策略
    1. 全局感知哈希 - 快速过滤完全相同或高度相似的图片
    2. 块级哈希比较 - 检测"同一布局，局部差异"的图片（如含陷阱与不含陷阱版本）
                      陷阱占图比例小，只影响少数网格块

    参数：
        image_paths: 图片路径列表（已按顺序排序）
        max_hash_diff: 全局哈希差异阈值，小于等于此值直接判定为重复（默认12）
        progress_callback: 进度回调函数

    返回：
        List[Path]: 去重后的图片路径列表
    """
    if len(image_paths) <= 1:
        return image_paths

    logging.info(f"开始相似图片检测，共 {len(image_paths)} 张图片")
    logging.info(f"相似度阈值: 哈希差异 <= {max_hash_diff} (0=完全相同)")

    # 配置块级比较参数
    BLOCK_GLOBAL_THRESHOLD = 28   # 全局哈希差异 ≤ 28 时触发块级比较
    PER_BLOCK_HASH_DIFF = 8       # 单块哈希差异 ≤ 8 认为该块匹配
    BLOCK_MATCH_RATIO = 0.50      # 块匹配比例 ≥ 50% 认为同一布局

    # 计算所有图片的全局哈希和块哈希
    image_hashes: List[Tuple[Path, Optional[imagehash.ImageHash], Optional[List[imagehash.ImageHash]]]] = []
    for i, img_path in enumerate(image_paths):
        global_hash = calculate_image_hash(img_path)
        block_hashes = calculate_block_hashes(img_path)
        image_hashes.append((img_path, global_hash, block_hashes))
        if global_hash is None:
            logging.warning(f"  无法计算哈希: {img_path.name}，将保留")
        if progress_callback and (i + 1) % 5 == 0:
            progress_callback(i + 1, len(image_paths), f"计算哈希 {i+1}/{len(image_paths)}")

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
        for j, (kept_hash, kept_block_hashes) in enumerate(zip(unique_hashes, unique_block_hashes)):
            hash_diff = current_hash - kept_hash

            if hash_diff <= max_hash_diff:
                # 快速路径：全局哈希很相似 → 直接判定重复
                is_duplicate = True
                logging.info(f"  发现相似图片 (差异={hash_diff}): {current_path.name}")
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
                    logging.info(f"  发现相似图片 (差异={hash_diff}, 块匹配率={match_ratio:.0%}): {current_path.name}")
                    logging.info(f"    同一布局含局部差异（如陷阱版本），将被删除")
                else:
                    logging.info(f"  全局差异={hash_diff} 但块匹配率仅 {match_ratio:.0%}，保留")

            if is_duplicate:
                duplicate_count += 1
                try:
                    current_path.unlink()
                    logging.info(f"    ✓ 已删除重复图片: {current_path.name}")
                except Exception as e:
                    logging.error(f"    ✗ 删除失败: {current_path.name}, 错误: {e}")
                break

        if not is_duplicate:
            unique_images.append(current_path)
            unique_hashes.append(current_hash)
            unique_block_hashes.append(current_block_hashes)

    logging.info(f"相似图片检测完成：保留 {len(unique_images)} 张，删除 {duplicate_count} 张")
    return unique_images


def detect_image(image_path: Path) -> Dict:
    """调用法术塔检测API检测图片"""
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
    """解析链接文件，支持多种格式（包括URL末尾附带标签的无换行情况）"""
    if not txt_path.exists():
        logging.error(f"链接文件不存在: {txt_path}")
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

    def _is_link(line: str) -> bool:
        """判断是否为链接行：http链接 或 国服TH纯文本格式（如 TH18:WB:AAAA...）"""
        if line.startswith('http'):
            return True
        return bool(re.match(r'^TH\d+:[A-Za-z0-9_+\-/=:]+$', line))

    result = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # 国服标签行：下一行是国服链接
        if '国服' in line and not _is_link(line):
            if i + 1 < len(lines) and _is_link(lines[i + 1]):
                cn_url, _ = _split_label(lines[i + 1])
                # 如果国服链接末尾附带了"国际服"，下一行是国际服链接
                if '国际服' in lines[i + 1]:
                    intl_url, _ = _split_label(lines[i + 2]) if i + 2 < len(lines) else (None, False)
                    result.append((cn_url, intl_url if intl_url and _is_link(intl_url) else None))
                    i += 3
                else:
                    result.append((cn_url, None))
                    i += 2
            else:
                result.append((None, None))
                i += 1
            continue

        # 国际服标签行：下一行是国际服链接，与前一个国服配对
        if '国际服' in line and not _is_link(line):
            intl_link = lines[i + 1] if i + 1 < len(lines) and _is_link(lines[i + 1]) else None
            if result and result[-1][1] is None:
                result[-1] = (result[-1][0], intl_link)
            i += 2
            continue

        # 链接行（http 或 国服TH纯文本）
        if _is_link(line):
            clean_url, has_intl_label = _split_label(line)
            if has_intl_label:
                # 链接末尾附带了"国际服"，下一行是国际服链接
                intl_url = lines[i + 1] if i + 1 < len(lines) and _is_link(lines[i + 1]) else None
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
        logging.info(f"生成: {txt_path.name}")


# ============================================================
# GUI主窗口类
# ============================================================
class AutoGUI:
    """阵型自动化处理系统GUI主类"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("阵型自动化处理系统")
        self.root.geometry("1000x850")
        self.root.minsize(900, 700)
        
        # 设置窗口样式
        self.style = ttk.Style()
        self.style.configure('Title.TLabel', font=('微软雅黑', 16, 'bold'))
        self.style.configure('Header.TLabel', font=('微软雅黑', 12, 'bold'))
        self.style.configure('Action.TButton', font=('微软雅黑', 10))
        
        # 线程控制
        self.is_running = False
        self.current_thread = None
        
        # 创建界面
        self.create_widgets()
        
        # 设置日志
        self.setup_logging()
        
        # 启动日志更新循环
        self.update_log()
        
        logging.info("系统初始化完成")
    
    def create_widgets(self):
        """创建GUI界面组件"""
        # 主容器
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # 配置网格权重
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(6, weight=1)  # 日志区域(row=6)可扩展
        
        # ========== 标题 ==========
        title_label = ttk.Label(
            main_frame, 
            text="🎮 阵型自动化处理系统", 
            style='Title.TLabel'
        )
        title_label.grid(row=0, column=0, pady=(0, 10))
        
        # ========== 阶段1：下载视频 ==========
        stage1_frame = ttk.LabelFrame(main_frame, text="阶段1：下载B站视频", padding="10")
        stage1_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=5)
        stage1_frame.columnconfigure(0, weight=1)
        
        # URL输入框
        url_frame = ttk.Frame(stage1_frame)
        url_frame.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=5)
        url_frame.columnconfigure(0, weight=1)
        
        ttk.Label(url_frame, text="视频URL:").grid(row=0, column=0, sticky=tk.W)
        self.url_var = tk.StringVar()
        self.url_entry = ttk.Entry(url_frame, textvariable=self.url_var)
        self.url_entry.grid(row=1, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        
        self.download_btn = ttk.Button(
            url_frame, 
            text="📥 下载视频", 
            command=self.start_download,
            style='Action.TButton'
        )
        self.download_btn.grid(row=1, column=1)
        
        # 粘贴按钮
        self.paste_btn = ttk.Button(
            url_frame,
            text="📋 粘贴",
            command=self.paste_url
        )
        self.paste_btn.grid(row=1, column=2, padx=(5, 0))
        
        # ========== 阶段2：视频转图片 ==========
        stage2_frame = ttk.LabelFrame(main_frame, text="阶段2：视频转图片", padding="10")
        stage2_frame.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=5)
        stage2_frame.columnconfigure(0, weight=1)
        
        # 视频列表和操作按钮
        video_frame = ttk.Frame(stage2_frame)
        video_frame.grid(row=0, column=0, sticky=(tk.W, tk.E))
        
        ttk.Label(video_frame, text="视频列表:").grid(row=0, column=0, sticky=tk.W)
        
        btn_frame = ttk.Frame(video_frame)
        btn_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=5)
        
        self.refresh_video_btn = ttk.Button(
            btn_frame,
            text="🔄 刷新列表",
            command=self.refresh_video_list
        )
        self.refresh_video_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        self.process_video_btn = ttk.Button(
            btn_frame,
            text="🎬 处理选中视频",
            command=self.start_process_video
        )
        self.process_video_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        self.process_all_btn = ttk.Button(
            btn_frame,
            text="🎬 处理所有视频",
            command=self.start_process_all_videos
        )
        self.process_all_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        self.delete_video_btn = ttk.Button(
            btn_frame,
            text="🗑️ 删除选中视频",
            command=self.start_delete_video
        )
        self.delete_video_btn.pack(side=tk.LEFT, padx=(0, 5))

        self.edit_link_btn = ttk.Button(
            btn_frame,
            text="✏️ 修改链接",
            command=self.start_edit_link
        )
        self.edit_link_btn.pack(side=tk.LEFT)
        
        # 视频列表框
        list_frame = ttk.Frame(stage2_frame)
        list_frame.grid(row=2, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        list_frame.columnconfigure(0, weight=1)
        
        self.video_listbox = tk.Listbox(list_frame, height=6, selectmode=tk.SINGLE)
        self.video_listbox.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.video_listbox.yview)
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        self.video_listbox.configure(yscrollcommand=scrollbar.set)
        
        # ========== 阶段3：图片过滤 ==========
        stage3_frame = ttk.LabelFrame(main_frame, text="阶段3：图片过滤处理", padding="10")
        stage3_frame.grid(row=3, column=0, sticky=(tk.W, tk.E), pady=5)
        
        self.filter_btn = ttk.Button(
            stage3_frame,
            text="🔍 开始图片过滤（法术塔检测 + 去重 + 生成链接文件）",
            command=self.start_filter_images,
            style='Action.TButton'
        )
        self.filter_btn.pack(pady=5)
        
        # ========== 完整流程按钮 ==========
        full_frame = ttk.Frame(main_frame)
        full_frame.grid(row=4, column=0, pady=10)
        
        self.full_workflow_btn = ttk.Button(
            full_frame,
            text="🚀 执行完整流程（①→②→③）",
            command=self.start_full_workflow,
            style='Action.TButton'
        )
        self.full_workflow_btn.pack(side=tk.LEFT, padx=5)

        self.stop_btn = ttk.Button(
            full_frame,
            text="⏹️ 停止",
            command=self.stop_process,
            state=tk.DISABLED
        )
        self.stop_btn.pack(side=tk.LEFT, padx=5)

        # 完整流程状态标签
        self.workflow_status_var = tk.StringVar(value="")
        self.workflow_status_label = ttk.Label(
            full_frame,
            textvariable=self.workflow_status_var,
            foreground="green",
            font=('微软雅黑', 10, 'bold')
        )
        self.workflow_status_label.pack(side=tk.LEFT, padx=(10, 0))
        
        # ========== 进度条 ==========
        progress_frame = ttk.Frame(main_frame)
        progress_frame.grid(row=5, column=0, sticky=(tk.W, tk.E), pady=5)
        progress_frame.columnconfigure(0, weight=1)
        
        self.progress_var = tk.DoubleVar(value=0)
        self.progress_bar = ttk.Progressbar(
            progress_frame,
            variable=self.progress_var,
            maximum=100,
            mode='determinate'
        )
        self.progress_bar.grid(row=0, column=0, sticky=(tk.W, tk.E))
        
        self.status_var = tk.StringVar(value="就绪")
        self.status_label = ttk.Label(progress_frame, textvariable=self.status_var)
        self.status_label.grid(row=1, column=0, sticky=tk.W, pady=(2, 0))
        
        # ========== 日志输出区域 ==========
        log_frame = ttk.LabelFrame(main_frame, text="日志输出", padding="5")
        log_frame.grid(row=6, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            width=80,
            height=15,
            font=('Consolas', 9)
        )
        self.log_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # 日志控制按钮
        log_btn_frame = ttk.Frame(log_frame)
        log_btn_frame.grid(row=1, column=0, sticky=tk.E, pady=(5, 0))
        
        ttk.Button(log_btn_frame, text="清空日志", command=self.clear_log).pack(side=tk.LEFT, padx=2)
        ttk.Button(log_btn_frame, text="保存日志", command=self.save_log).pack(side=tk.LEFT, padx=2)
        
        # ========== 底部信息 ==========
        info_frame = ttk.Frame(main_frame)
        info_frame.grid(row=7, column=0, sticky=(tk.W, tk.E), pady=(5, 0))
        
        ttk.Label(
            info_frame,
            text="💡 提示：使用完整流程会自动按顺序执行①→②→③",
            foreground="gray"
        ).pack(side=tk.LEFT)
        
        ttk.Button(
            info_frame,
            text="打开输出目录",
            command=self.open_output_dir
        ).pack(side=tk.RIGHT)
        
        # 初始化视频列表（放在最后，确保所有UI组件已创建）
        self.refresh_video_list()
    
    def setup_logging(self):
        """配置日志系统"""
        self.gui_handler = GUIHandler(self.log_text)
        self.gui_handler.setLevel(logging.INFO)
        self.gui_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        
        # 清除之前的处理器
        for handler in logging.getLogger().handlers[:]:
            if isinstance(handler, GUIHandler):
                logging.getLogger().removeHandler(handler)
        
        logging.getLogger().addHandler(self.gui_handler)
        logging.getLogger().setLevel(logging.INFO)
    
    def update_log(self):
        """定期更新日志显示"""
        if hasattr(self, 'gui_handler'):
            self.gui_handler.update()
        self.root.after(100, self.update_log)
    
    def update_progress(self, value: int, status: str = ""):
        """更新进度条和状态"""
        self.progress_var.set(value)
        if status:
            self.status_var.set(status)
        self.root.update_idletasks()
    
    def set_running_state(self, running: bool):
        """设置运行状态"""
        self.is_running = running
        state = tk.DISABLED if running else tk.NORMAL
        
        self.download_btn.config(state=state)
        self.process_video_btn.config(state=state)
        self.process_all_btn.config(state=state)
        self.filter_btn.config(state=state)
        self.full_workflow_btn.config(state=state)
        self.stop_btn.config(state=tk.NORMAL if running else tk.DISABLED)
    
    def paste_url(self):
        """从剪贴板粘贴URL"""
        try:
            url = self.root.clipboard_get()
            self.url_var.set(url)
        except:
            pass
    
    def refresh_video_list(self):
        """刷新视频列表"""
        self.video_listbox.delete(0, tk.END)
        
        if not VIDEO_DIR.exists():
            VIDEO_DIR.mkdir(parents=True, exist_ok=True)
            return
        
        video_files = [f for f in VIDEO_DIR.iterdir()
                      if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
        
        for vf in sorted(video_files):
            self.video_listbox.insert(tk.END, vf.name)
        
        self.status_var.set(f"找到 {len(video_files)} 个视频文件")
    
    def clear_log(self):
        """清空日志"""
        self.log_text.delete(1.0, tk.END)
    
    def save_log(self):
        """保存日志到文件"""
        file_path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("文本文件", "*.txt"), ("所有文件", "*.*")]
        )
        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(self.log_text.get(1.0, tk.END))
            messagebox.showinfo("保存成功", f"日志已保存到:\n{file_path}")
    
    def open_output_dir(self):
        """打开输出目录"""
        import subprocess
        for path in [VIDEO_DIR, IMAGES_DIR]:
            path.mkdir(parents=True, exist_ok=True)
        
        # 使用explorer打开目录
        try:
            subprocess.run(['explorer', str(BASE_DIR)])
        except:
            pass
    
    # ============================================================
    # 功能操作（在线程中执行）
    # ============================================================
    
    def show_link_input_dialog(self, original_desc: str) -> str:
        """
        显示链接输入对话框，等待用户输入链接

        参数：
            original_desc: 原始简介内容

        返回：
            str: 用户输入的链接文本，如果取消则返回空字符串
        """
        result = {"value": ""}

        def on_ok():
            result["value"] = text_widget.get(1.0, tk.END).strip()
            dialog.destroy()

        def on_cancel():
            result["value"] = ""
            dialog.destroy()

        # 创建对话框
        dialog = tk.Toplevel(self.root)
        dialog.title("请输入阵型链接")
        dialog.geometry("500x400")
        dialog.transient(self.root)
        dialog.grab_set()

        # 提示信息
        ttk.Label(
            dialog,
            text="检测到视频简介中未包含有效链接（无http链接且内容较长）",
            foreground="red",
            font=('微软雅黑', 10, 'bold')
        ).pack(pady=(10, 5))

        ttk.Label(
            dialog,
            text="请在下方输入阵型链接（国服链接和国际服链接）：",
            font=('微软雅黑', 10)
        ).pack(pady=5)

        # 显示原始简介
        if original_desc.strip():
            ttk.Label(dialog, text="原始简介内容：", font=('微软雅黑', 9)).pack(anchor=tk.W, padx=10)
            desc_text = tk.Text(dialog, height=3, wrap=tk.WORD, font=('Consolas', 9))
            desc_text.insert(1.0, original_desc)
            desc_text.config(state=tk.DISABLED)
            desc_text.pack(fill=tk.X, padx=10, pady=2)

        # 输入框
        text_widget = tk.Text(dialog, height=10, wrap=tk.WORD, font=('Consolas', 10))
        text_widget.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        text_widget.focus()

        # 按钮区域
        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)

        ttk.Button(btn_frame, text="确定", command=on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="跳过（使用原简介）", command=on_cancel).pack(side=tk.LEFT, padx=5)

        # 居中显示
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() - dialog.winfo_width()) // 2
        y = self.root.winfo_y() + (self.root.winfo_height() - dialog.winfo_height()) // 2
        dialog.geometry(f"+{x}+{y}")

        # 等待对话框关闭
        self.root.wait_window(dialog)
        return result["value"]

    def start_download(self):
        """开始下载视频"""
        raw_url = self.url_var.get().strip()
        if not raw_url:
            messagebox.showwarning("输入错误", "请输入B站视频URL")
            return

        url = extract_url(raw_url)
        if not url:
            messagebox.showwarning("输入错误", "无法从输入中提取有效URL")
            return

        self.set_running_state(True)
        self.update_progress(0, "正在下载视频...")

        def download_progress(progress, total):
            self.root.after(0, lambda: self.update_progress(progress, f"下载进度: {progress}%"))

        def link_input_callback(original_desc):
            """在主线程中显示输入对话框并返回结果"""
            result_container = {"value": None}

            def show_dialog():
                result_container["value"] = self.show_link_input_dialog(original_desc)

            # 使用 after 确保在主线程执行
            self.root.after(0, show_dialog)

            # 等待结果
            while result_container["value"] is None:
                import time
                time.sleep(0.1)

            return result_container["value"]

        def download_task():
            try:
                success, title, pub_date, error = download_bilibili_video(url, download_progress, link_input_callback)

                if success:
                    self.root.after(0, lambda: messagebox.showinfo("下载成功", f"视频已下载:\n{title}"))
                    self.root.after(0, self.refresh_video_list)
                    self.root.after(0, lambda: self.update_progress(100, "下载完成"))
                else:
                    self.root.after(0, lambda: messagebox.showerror("下载失败", error))
                    self.root.after(0, lambda: self.update_progress(0, "下载失败"))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("错误", str(e)))
            finally:
                self.root.after(0, lambda: self.set_running_state(False))

        self.current_thread = threading.Thread(target=download_task, daemon=True)
        self.current_thread.start()
    
    def start_process_video(self):
        """开始处理选中的视频"""
        selection = self.video_listbox.curselection()
        if not selection:
            messagebox.showwarning("选择错误", "请先从列表中选择一个视频")
            return
        
        video_name = self.video_listbox.get(selection[0])
        video_path = VIDEO_DIR / video_name
        
        self.set_running_state(True)
        self.update_progress(0, "正在处理视频...")
        
        def progress_callback(current, total, msg=""):
            progress = int((current / total) * 100) if total > 0 else 0
            self.root.after(0, lambda: self.update_progress(progress, msg))
        
        def process_task():
            try:
                count = process_video_to_images(video_path, interval=2, progress_callback=progress_callback)
                
                if count > 0:
                    self.root.after(0, lambda: messagebox.showinfo("处理完成", f"已生成 {count} 张图片"))
                    self.root.after(0, lambda: self.update_progress(100, f"生成 {count} 张图片"))
                else:
                    self.root.after(0, lambda: messagebox.showerror("处理失败", "未能生成图片"))
                    self.root.after(0, lambda: self.update_progress(0, "处理失败"))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("错误", str(e)))
            finally:
                self.root.after(0, lambda: self.set_running_state(False))
        
        self.current_thread = threading.Thread(target=process_task, daemon=True)
        self.current_thread.start()
    
    def start_process_all_videos(self):
        """开始处理所有视频"""
        video_files = [f for f in VIDEO_DIR.iterdir()
                      if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
        
        if not video_files:
            messagebox.showwarning("无视频", "videos 目录下没有视频文件")
            return
        
        self.set_running_state(True)
        self.update_progress(0, "正在处理所有视频...")
        
        def progress_callback(current, total, msg=""):
            progress = int((current / total) * 100) if total > 0 else 0
            self.root.after(0, lambda: self.update_progress(progress, msg))
        
        def process_task():
            try:
                total_count = 0
                for i, vf in enumerate(video_files):
                    if not self.is_running:
                        break
                    
                    progress_callback(i, len(video_files), f"处理视频 {i+1}/{len(video_files)}: {vf.name}")
                    count = process_video_to_images(vf, interval=2)
                    total_count += count
                
                if total_count > 0:
                    self.root.after(0, lambda: self.update_progress(100, f"共生成 {total_count} 张图片"))
                    # 播放完成提示音
                    winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS)
                else:
                    self.root.after(0, lambda: messagebox.showerror("处理失败", "未能生成图片"))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("错误", str(e)))
            finally:
                self.root.after(0, lambda: self.set_running_state(False))
        
        self.current_thread = threading.Thread(target=process_task, daemon=True)
        self.current_thread.start()
    
    def start_delete_video(self):
        """删除选中的视频及其配套文件"""
        selection = self.video_listbox.curselection()
        if not selection:
            messagebox.showwarning("选择错误", "请先从列表中选择一个视频")
            return
        
        video_name = self.video_listbox.get(selection[0])
        video_stem = Path(video_name).stem  # 不含扩展名的文件名
        
        # 确认删除
        if not messagebox.askyesno("确认删除", f"确定要删除视频及其配套文件吗？\n\n视频: {video_name}\n\n这将删除:\n- 视频文件\n- 链接文件(.txt)\n- 对应的图片文件夹"):
            return
        
        self.set_running_state(True)
        self.update_progress(0, f"正在删除: {video_name}...")
        
        def delete_task():
            try:
                deleted_items = []
                failed_items = []
                
                # 1. 删除视频文件
                video_path = VIDEO_DIR / video_name
                if video_path.exists():
                    try:
                        video_path.unlink()
                        deleted_items.append(f"视频: {video_name}")
                        logging.info(f"已删除视频: {video_name}")
                    except Exception as e:
                        failed_items.append(f"视频删除失败: {e}")
                
                # 2. 删除txt文件
                txt_path = VIDEO_DIR / f"{video_stem}.txt"
                if txt_path.exists():
                    try:
                        txt_path.unlink()
                        deleted_items.append(f"链接文件: {video_stem}.txt")
                        logging.info(f"已删除链接文件: {video_stem}.txt")
                    except Exception as e:
                        failed_items.append(f"链接文件删除失败: {e}")

                # 3. 删除date文件
                date_path = VIDEO_DIR / f"{video_stem}.date"
                if date_path.exists():
                    try:
                        date_path.unlink()
                        deleted_items.append(f"日期文件: {video_stem}.date")
                        logging.info(f"已删除日期文件: {video_stem}.date")
                    except Exception as e:
                        failed_items.append(f"日期文件删除失败: {e}")
                
                # 3. 删除images目录下的对应文件夹
                if IMAGES_DIR.exists():
                    for folder in IMAGES_DIR.iterdir():
                        if folder.is_dir():
                            # 检查文件夹名是否匹配（包含关系）
                            if video_stem in folder.name or folder.name in video_stem:
                                try:
                                    shutil.rmtree(folder)
                                    deleted_items.append(f"图片文件夹: {folder.name}")
                                    logging.info(f"已删除图片文件夹: {folder.name}")
                                except Exception as e:
                                    failed_items.append(f"文件夹删除失败 [{folder.name}]: {e}")
                
                # 显示结果
                result_msg = "删除结果:\n\n"
                if deleted_items:
                    result_msg += f"[OK] 成功删除 ({len(deleted_items)} 项):\n"
                    for item in deleted_items:
                        result_msg += f"  - {item}\n"
                if failed_items:
                    result_msg += f"\n[FAIL] 删除失败 ({len(failed_items)} 项):\n"
                    for item in failed_items:
                        result_msg += f"  - {item}\n"
                
                self.root.after(0, lambda: messagebox.showinfo("删除完成", result_msg))
                self.root.after(0, lambda: self.update_progress(100, f"删除完成"))
                self.root.after(0, self.refresh_video_list)
                
            except Exception as e:
                logging.error(f"删除失败: {e}")
                self.root.after(0, lambda: messagebox.showerror("错误", str(e)))
            finally:
                self.root.after(0, lambda: self.set_running_state(False))
        
        self.current_thread = threading.Thread(target=delete_task, daemon=True)
        self.current_thread.start()

    def start_edit_link(self):
        """修改选中视频对应的链接文件"""
        selection = self.video_listbox.curselection()
        if not selection:
            messagebox.showwarning("选择错误", "请先从列表中选择一个视频")
            return

        video_name = self.video_listbox.get(selection[0])
        video_stem = Path(video_name).stem  # 不含扩展名的文件名

        # 查找对应的 txt 文件
        txt_path = VIDEO_DIR / f"{video_stem}.txt"

        # 读取现有内容
        current_content = ""
        if txt_path.exists():
            try:
                with open(txt_path, "r", encoding="utf-8") as f:
                    current_content = f.read()
            except Exception as e:
                logging.error(f"读取链接文件失败: {e}")

        # 显示编辑对话框
        result = {"value": None}

        def on_ok():
            result["value"] = text_widget.get(1.0, tk.END).strip()
            dialog.destroy()

        def on_cancel():
            result["value"] = None
            dialog.destroy()

        # 创建对话框
        dialog = tk.Toplevel(self.root)
        dialog.title(f"修改链接 - {video_name}")
        dialog.geometry("500x400")
        dialog.transient(self.root)
        dialog.grab_set()

        # 提示信息
        ttk.Label(
            dialog,
            text=f"编辑视频 [{video_name}] 的链接内容：",
            font=('微软雅黑', 10, 'bold')
        ).pack(pady=(10, 5))

        # 输入框
        text_widget = tk.Text(dialog, height=15, wrap=tk.WORD, font=('Consolas', 10))
        text_widget.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        text_widget.insert(1.0, current_content)
        text_widget.focus()

        # 按钮区域
        btn_frame = ttk.Frame(dialog)
        btn_frame.pack(pady=10)

        ttk.Button(btn_frame, text="保存", command=on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="取消", command=on_cancel).pack(side=tk.LEFT, padx=5)

        # 居中显示
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() - dialog.winfo_width()) // 2
        y = self.root.winfo_y() + (self.root.winfo_height() - dialog.winfo_height()) // 2
        dialog.geometry(f"+{x}+{y}")

        # 等待对话框关闭
        self.root.wait_window(dialog)

        # 保存结果
        if result["value"] is not None:
            try:
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(result["value"])
                logging.info(f"链接文件已更新: {txt_path.name}")
                messagebox.showinfo("保存成功", f"链接文件已保存:\n{txt_path.name}")
            except Exception as e:
                logging.error(f"保存链接文件失败: {e}")
                messagebox.showerror("保存失败", str(e))

    def start_filter_images(self):
        """开始图片过滤处理"""
        if not PENDING_DIR.exists() or not list(PENDING_DIR.iterdir()):
            messagebox.showwarning("无图片", "images/pending目录下没有图片\n请先执行视频转图片操作")
            return
        
        self.set_running_state(True)
        self.update_progress(0, "正在过滤图片...")
        
        def filter_task():
            try:
                self._filter_images_impl()
            except Exception as e:
                logging.error(f"过滤失败: {e}")
                self.root.after(0, lambda: messagebox.showerror("错误", str(e)))
            finally:
                self.root.after(0, lambda: self.set_running_state(False))
        
        self.current_thread = threading.Thread(target=filter_task, daemon=True)
        self.current_thread.start()
    
    def _filter_images_impl(self):
        """图片过滤实现 - 支持多视频子目录"""
        # 收集所有子目录中的图片
        all_image_files = []
        video_subdirs = []

        if PENDING_DIR.exists():
            for subdir in PENDING_DIR.iterdir():
                if subdir.is_dir():
                    video_subdirs.append(subdir)
                    for f in subdir.iterdir():
                        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
                            all_image_files.append((subdir.name, f))

        if not all_image_files:
            self.root.after(0, lambda: messagebox.showwarning("无图片", "没有找到需要处理的图片"))
            return

        logging.info(f"扫描到 {len(all_image_files)} 个图片文件，来自 {len(video_subdirs)} 个视频")

        # 按视频标题分组
        title_to_images = {}
        for video_name, img_path in all_image_files:
            title_to_images.setdefault(video_name, []).append(img_path)
        
        total_moved = 0
        total_groups = len(title_to_images)
        
        for idx, (title, images) in enumerate(title_to_images.items()):
            if not self.is_running:
                break
            
            progress = int((idx / total_groups) * 100)
            self.root.after(0, lambda p=progress, t=title: self.update_progress(p, f"处理: {t}"))
            
            logging.info(f"\n处理: {title} ({len(images)} 张图片)")
            
            # 创建目标文件夹
            title_folder = IMAGES_DIR / title
            title_folder.mkdir(parents=True, exist_ok=True)
            
            # 按序号排序
            def extract_number(p: Path):
                match = re.search(r'_(\d+)\.', p.name)
                return int(match.group(1)) if match else 0
            sorted_images = sorted(images, key=extract_number)
            
            # 法术塔检测（并行）
            detected_images = []
            detect_results = {}
            
            if not self.is_running:
                return
            
            with ThreadPoolExecutor(max_workers=4) as executor:
                future_to_path = {executor.submit(detect_image, p): p for p in sorted_images}
                
                for future in as_completed(future_to_path):
                    if not self.is_running:
                        break
                    img_path = future_to_path[future]
                    result = future.result()
                    detect_results[img_path] = result
            
            # 检查是否有连接失败
            has_connection_error = any(
                r.get('error') == '连接失败' for r in detect_results.values()
            )
            if has_connection_error:
                self.root.after(0, lambda: messagebox.showerror("服务错误", 
                    "法术塔检测服务未启动\n请确保检测服务在 http://localhost:6174 运行"))
                return
            
            # 按原顺序处理结果
            for img_path in sorted_images:
                if not self.is_running:
                    break
                result = detect_results.get(img_path, {'success': False, 'error': '未知错误'})
                
                if result.get('success') and result.get('count', 0) > 0:
                    logging.info(f"  ✓ {img_path.name}: 检测到 {result['count']} 个法术塔")
                    detected_images.append(img_path)
                else:
                    logging.info(f"  ✗ {img_path.name}: 未检测到法术塔")
                    img_path.unlink()
            
            # 相似图片去重（重要步骤）
            if len(detected_images) > 1 and self.is_running:
                logging.info(f"\n{'='*40}")
                logging.info(f"开始相似图片去重，共 {len(detected_images)} 张待处理")
                logging.info(f"{'='*40}")
                
                def hash_progress(current, total, msg):
                    if current % 5 == 0:
                        logging.info(f"  哈希计算进度: {current}/{total}")
                
                detected_images = filter_similar_images(detected_images, progress_callback=hash_progress)
                
                logging.info(f"\n去重后剩余: {len(detected_images)} 张图片")
                logging.info(f"{'='*40}\n")
            
            # 读取视频发布日期，如果没有则使用当前日期
            date_path = VIDEO_DIR / f"{title}.date"
            if date_path.exists():
                with open(date_path, "r", encoding="utf-8") as f:
                    pub_date = f.read().strip()
                # 解析日期格式 YYYY-MM-DD 转为 YYYY.M.D
                date_parts = pub_date.split("-")
                if len(date_parts) == 3:
                    date_str = f"{date_parts[0]}.{int(date_parts[1])}.{int(date_parts[2])}"
                else:
                    now = datetime.now()
                    date_str = f"{now.year}.{now.month}.{now.day}"
            else:
                now = datetime.now()
                date_str = f"{now.year}.{now.month}.{now.day}"
                logging.warning(f"未找到发布日期文件，使用当前日期: {date_str}")

            # 移动并重命名
            moved_count = 0
            for i, img_path in enumerate(detected_images, start=1):
                if not img_path.exists() or not self.is_running:
                    continue

                new_filename = f"{date_str}.{i}{img_path.suffix}"
                dest_path = title_folder / new_filename
                
                try:
                    shutil.move(str(img_path), str(dest_path))
                    moved_count += 1
                    total_moved += 1
                    logging.info(f"  移动: {img_path.name} -> {new_filename}")
                except Exception as e:
                    logging.error(f"  移动失败: {e}")
            
            # 生成链接文件
            link_txt = VIDEO_DIR / f"{title}.txt"
            if link_txt.exists() and moved_count > 0 and self.is_running:
                groups = parse_link_groups(link_txt)
                logging.info(f"  链接组: {len(groups)} 个, 图片: {moved_count} 张")
                
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
                        logging.info(f"清理空目录: {subdir.name}")
                    except Exception as e:
                        logging.warning(f"清理目录失败 {subdir.name}: {e}")

        self.root.after(0, lambda: self.update_progress(100, f"完成！移动 {total_moved} 张图片"))
        # 播放完成提示音
        winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS)
    
    def start_full_workflow(self):
        """开始完整流程"""
        # 检查是否有视频 URL 或已有视频
        raw_url = self.url_var.get().strip()
        video_files = [f for f in VIDEO_DIR.iterdir()
                      if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]
        
        if not raw_url and not video_files:
            messagebox.showwarning("无输入", "请输入视频 URL 或确保 videos 目录有视频文件")
            return
        
        self.set_running_state(True)
        self.update_progress(0, "开始完整流程...")
        # 显示执行中状态
        self.root.after(0, lambda: self.workflow_status_var.set("执行中..."))
        self.root.after(0, lambda: self.workflow_status_label.config(foreground="orange"))

        def link_input_callback(original_desc):
            """在主线程中显示输入对话框并返回结果"""
            result_container = {"value": None}

            def show_dialog():
                result_container["value"] = self.show_link_input_dialog(original_desc)

            # 使用 after 确保在主线程执行
            self.root.after(0, show_dialog)

            # 等待结果
            while result_container["value"] is None:
                import time
                time.sleep(0.1)

            return result_container["value"]

        def workflow_task():
            try:
                # 阶段1：下载（如果有URL）
                if raw_url and self.is_running:
                    self.root.after(0, lambda: self.update_progress(5, "阶段1：下载视频..."))
                    url = extract_url(raw_url)
                    if url:
                        success, title, pub_date, error = download_bilibili_video(url, link_input_callback=link_input_callback)
                        if not success:
                            self.root.after(0, lambda: self.workflow_status_var.set("下载失败"))
                            self.root.after(0, lambda: self.workflow_status_label.config(foreground="red"))
                            return
                        self.root.after(0, self.refresh_video_list)

                # 阶段2：视频转图片
                if self.is_running:
                    self.root.after(0, lambda: self.update_progress(33, "阶段2：视频转图片..."))
                    video_files = [f for f in VIDEO_DIR.iterdir()
                                  if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS]

                    total_count = 0
                    for vf in video_files:
                        if not self.is_running:
                            break
                        count = process_video_to_images(vf, interval=2)
                        total_count += count

                    if total_count == 0:
                        self.root.after(0, lambda: self.workflow_status_var.set("转图片失败"))
                        self.root.after(0, lambda: self.workflow_status_label.config(foreground="red"))
                        return

                # 阶段3：图片过滤
                if self.is_running:
                    self.root.after(0, lambda: self.update_progress(66, "阶段3：图片过滤..."))
                    self._filter_images_impl()

                if self.is_running:
                    self.root.after(0, lambda: self.update_progress(100, "完整流程完成！"))
                    # 显示已完成状态，播放提示音
                    self.root.after(0, lambda: self.workflow_status_var.set("已完成"))
                    self.root.after(0, lambda: self.workflow_status_label.config(foreground="green"))
                    # 播放完成提示音
                    winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS)

            except Exception as e:
                logging.error(f"流程失败: {e}")
                self.root.after(0, lambda: self.workflow_status_var.set("执行失败"))
                self.root.after(0, lambda: self.workflow_status_label.config(foreground="red"))
            finally:
                self.root.after(0, lambda: self.set_running_state(False))
        
        self.current_thread = threading.Thread(target=workflow_task, daemon=True)
        self.current_thread.start()
    
    def stop_process(self):
        """停止当前操作"""
        self.is_running = False
        self.status_var.set("已停止")
        self.set_running_state(False)
        # 清除完整流程状态
        self.workflow_status_var.set("")
        logging.info("操作已停止")


# ============================================================
# 主程序入口
# ============================================================

def main():
    """主函数"""
    root = tk.Tk()
    
    # 设置DPI感知（Windows高DPI支持）
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except:
        pass
    
    app = AutoGUI(root)
    
    # 居中显示窗口
    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f'{width}x{height}+{x}+{y}')
    
    root.mainloop()


if __name__ == "__main__":
    main()
