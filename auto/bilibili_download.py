import requests
import re
import json
from bs4 import BeautifulSoup
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / '.env')
 
raw_url="https://www.bilibili.com/video/BV1HMVN6JEcr?t=0.6"
# 用户输入 B 站视频 URL
# raw_url = input("请输入你想爬取视频的 URL：")
pattern = r"https?://[^\s]+"
# 查找链接
match = re.search(pattern, raw_url)

if match:
    url = match.group()
    print("提取到的URL：", url)
else:
    print("未找到链接")

# 请求头，模拟浏览器访问 B 站
headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "referer": "https://www.bilibili.com/",
    "cookie": os.environ.get("BILIBILI_COOKIE", ""),  # 通过环境变量设置Cookie
}
 
# 发送请求，获取网页 HTML 内容
res = requests.get(url, headers=headers).text
 
# 使用正则表达式提取视频的 avid、bvid 和 cid
pattern = r'"aid":(\d+),"bvid":"([^"]+)","cid":(\d+)'
avid, bvid, cid = re.findall(pattern, res)[0]
print(f"AID: {avid}, BVID: {bvid}, CID: {cid}")

# 解析HTML，提取 desc-info-text 下的文本
soup = BeautifulSoup(res, "html.parser")
desc_span = soup.find("span", class_="desc-info-text")
if desc_span:
    # 获取纯文本（会自动去掉HTML标签，保留换行/空格）
    desc_text = desc_span.get_text(strip=False)
    print("\n视频简介文本：")
    print(desc_text)
else:
    print("\n未找到 desc-info-text 标签，可能页面结构有变化或需要登录")

# 解析HTML，提取 pubdate-ip-text 下的文本 获取视频发布时间
# 结果：视频发布时间和IP：
# 2026-05-26 23:26:28
soup = BeautifulSoup(res, "html.parser")
desc_span = soup.find("div", class_="pubdate-ip-text")
if desc_span:
    # 获取纯文本（会自动去掉HTML标签，保留换行/空格）
    desc_text = desc_span.get_text(strip=False)
    print("\n视频发布时间和IP：")
    print(desc_text)
else:
    print("\n未找到 pubdate-ip-text 标签，可能页面结构有变化或需要登录")

# 解析HTML，提取 video-info-title-inner 下的文本
soup = BeautifulSoup(res, "html.parser")
desc_span = soup.find("div", class_="video-info-title-inner")
if desc_span:
    # 获取纯文本（会自动去掉HTML标签，保留换行/空格）
    title_text = desc_span.get_text(strip=False)
    print("\n视频标题：")
    print(title_text)
else:
    print("\n未找到 video-info-title-inner 标签，可能页面结构有变化或需要登录")
 
# 构造 API 请求，获取视频播放地址
play_url = f"https://api.bilibili.com/x/player/wbi/playurl?avid={avid}&bvid={bvid}&cid={cid}&qn=112"
resp = requests.get(play_url, headers=headers).text
resp_dict = json.loads(resp)
 
# 提取视频的真实 URL
video_url = resp_dict['data']['durl'][0]['url']
print("视频地址:", video_url)

# 下载视频
response = requests.get(video_url, headers=headers).content
print(len(response))
with open(os.path.join(BASE_DIR, "videos", f"{title_text}.mp4"), "wb") as f:
    f.write(response)

# 下载简介
with open(os.path.join(BASE_DIR, "videos", f"{title_text}.txt"), "w") as f:
    f.write(desc_text)
 
print("视频下载完成！")