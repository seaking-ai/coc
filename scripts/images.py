#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
部落冲突阵型图片爬虫 - 最终版
直接下载为 level{本数}.{月}{日}.{序号}.jpg/png
每个本数独立处理，下载完立即重命名（其实下载时就是最终名）
"""

import os
import time
import random
import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import requests
from bs4 import BeautifulSoup

# 配置
BASE_DIR = Path(__file__).parent.parent / "raw_formations"
TH_LEVELS = list(range(11, 19))  # 11-18本
IMAGES_PER_LEVEL = 100
MAX_WORKERS = 3
TIMEOUT = 20
RETRY_TIMES = 3

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png'}
SUPPORTED_MIME = {'image/jpeg', 'image/png'}

# 当前日期（用于命名）
TODAY = datetime.now()
DATE_STR = f"{TODAY.month}{TODAY.day:02d}"  # 如 428

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


def get_headers(referer=None):
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "image/jpeg,image/png,image/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def is_valid_image_url(url):
    """只接受 jpg/png，拒绝 webp/gif/svg"""
    url_lower = url.lower()
    if '.webp' in url_lower or '.gif' in url_lower or '.svg' in url_lower:
        return False
    return any(ext in url_lower for ext in ['.jpg', '.jpeg', '.png'])


def download_image(url, save_path, retry=RETRY_TIMES):
    """直接下载并保存为最终文件名"""
    parsed = urlparse(url)
    referer = f"{parsed.scheme}://{parsed.netloc}/"

    for attempt in range(retry):
        try:
            headers = get_headers(referer)
            if attempt > 0:
                time.sleep(random.uniform(2, 5))

            response = requests.get(url, headers=headers, timeout=TIMEOUT, stream=True)
            response.raise_for_status()

            content_type = response.headers.get('content-type', '').lower()
            if content_type not in SUPPORTED_MIME:
                return False

            # 保存
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            if save_path.stat().st_size < 2048:
                save_path.unlink()
                return False
            return True

        except Exception:
            if attempt == retry - 1:
                return False
            continue
    return False


def search_baidu_images(keyword, max_count):
    """百度图片搜索"""
    image_urls = []
    pn = 0
    rn = 30

    while len(image_urls) < max_count and pn < 200:
        try:
            params = {"tn": "baiduimage", "word": keyword, "pn": pn, "rn": rn, "ie": "utf-8"}
            headers = get_headers("https://image.baidu.com/")
            response = requests.get("https://image.baidu.com/search/flip", params=params, headers=headers, timeout=TIMEOUT)

            urls = re.findall(r'"objURL":"(https?://[^"]+)"', response.text)
            for url in urls:
                if is_valid_image_url(url) and url not in image_urls:
                    image_urls.append(url)
                    if len(image_urls) >= max_count:
                        break
            pn += rn
            time.sleep(random.uniform(2, 3))
        except Exception:
            break
    return image_urls[:max_count]


def search_bing_images(keyword, max_count):
    """必应图片搜索"""
    image_urls = []
    first = 0
    count = 35

    while len(image_urls) < max_count and first < 200:
        try:
            params = {"q": keyword, "first": first, "count": count}
            headers = get_headers("https://www.bing.com/")
            response = requests.get("https://www.bing.com/images/search", params=params, headers=headers, timeout=TIMEOUT)

            urls = re.findall(r'"murl":"([^"]+)"', response.text)
            for url in urls:
                url = url.replace('\\u002f', '/')
                if is_valid_image_url(url) and url not in image_urls:
                    image_urls.append(url)
                    if len(image_urls) >= max_count:
                        break
            first += count
            time.sleep(random.uniform(2, 3))
        except Exception:
            break
    return image_urls[:max_count]


def search_images(keyword, max_count):
    all_urls = []
    print(f"    百度搜索...")
    baidu_urls = search_baidu_images(keyword, max_count)
    all_urls.extend(baidu_urls)
    print(f"    百度找到 {len(baidu_urls)} 张")

    if len(all_urls) < max_count:
        print(f"    必应搜索...")
        remaining = max_count - len(all_urls)
        bing_urls = search_bing_images(keyword, remaining)
        all_urls.extend(bing_urls)
        print(f"    必应找到 {len(bing_urls)} 张")
    return all_urls[:max_count]


def download_and_rename_for_level(th_level, save_dir, target_count=IMAGES_PER_LEVEL):
    """下载一个本数的图片，直接使用目标命名（序号从现有文件数+1开始）"""
    # 获取已有图片数量（用于继续序号）
    existing_files = list(save_dir.glob(f"level{th_level}.{DATE_STR}.*"))
    existing_count = len(existing_files)
    start_index = existing_count + 1

    print(f"\n  已有图片: {existing_count} 张，将从序号 {start_index} 开始下载")

    # 组合搜索关键词
    keywords = [
        f"部落冲突 {th_level}本 阵型",
        f"部落冲突 {th_level}本 布局",
        f"COC TH{th_level} base layout",
        f"Clash of Clans TH{th_level} war base",
    ]

    all_urls = []
    for kw in keywords:
        if len(all_urls) >= target_count:
            break
        remaining = target_count - len(all_urls)
        urls = search_images(kw, min(remaining, 50))
        all_urls.extend(urls)
        time.sleep(random.uniform(3, 5))

    all_urls = list(dict.fromkeys(all_urls))
    print(f"\n  获取到 {len(all_urls)} 个有效链接")

    if not all_urls:
        return 0

    # 下载
    success_count = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        idx = start_index
        for url in all_urls[:target_count * 2]:  # 多取一些，防止失败
            # 确定扩展名
            ext = '.jpg'
            if '.png' in url.lower():
                ext = '.png'
            final_name = f"level{th_level}.{DATE_STR}.{idx}{ext}"
            save_path = save_dir / final_name

            if save_path.exists():
                print(f"    跳过已存在: {final_name}")
                success_count += 1
                idx += 1
                continue

            future = executor.submit(download_image, url, save_path)
            futures[future] = (url, final_name, idx)
            idx += 1

        for future in as_completed(futures):
            url, final_name, seq = futures[future]
            if future.result():
                success_count += 1
                print(f"    [{success_count}] ✓ {final_name}")
            else:
                print(f"    [失败] {url[:60]}...")
            time.sleep(random.uniform(0.3, 0.8))

    return success_count


def main():
    print("=" * 60)
    print("部落冲突阵型爬虫 - 直接命名版")
    print(f"目标本数: {TH_LEVELS[0]} - {TH_LEVELS[-1]} 本")
    print(f"每本目标: {IMAGES_PER_LEVEL} 张")
    print(f"保存目录: {BASE_DIR}")
    print(f"命名格式: level{{本数}}.{DATE_STR}.{{序号}}.jpg/png")
    print("=" * 60)

    BASE_DIR.mkdir(parents=True, exist_ok=True)

    total_success = 0
    for th_level in TH_LEVELS:
        print(f"\n{'='*50}")
        print(f"正在处理 {th_level} 本")
        print(f"{'='*50}")

        level_dir = BASE_DIR / f"{th_level}本"
        level_dir.mkdir(exist_ok=True)

        success = download_and_rename_for_level(th_level, level_dir, IMAGES_PER_LEVEL)
        total_success += success
        print(f"\n  {th_level}本 完成: 成功下载 {success} 张，总计 {len(list(level_dir.glob(f'level{th_level}.{DATE_STR}.*')))} 张")

        if th_level != TH_LEVELS[-1]:
            print("\n等待5秒后继续下一个本数...")
            time.sleep(5)

    print("\n" + "=" * 60)
    print(f"全部完成！共新增 {total_success} 张图片")
    print(f"所有图片已保存在: {BASE_DIR}")
    print("文件名示例: level11.428.1.jpg")
    print("=" * 60)


if __name__ == "__main__":
    main()