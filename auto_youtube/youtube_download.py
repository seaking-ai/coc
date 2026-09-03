from pytubefix import YouTube
from pytubefix.cli import on_progress
import os

# 你的代理配置保持不变（curl能通就说明是对的）
proxy = "http://127.0.0.1:7890"
os.environ['HTTP_PROXY'] = proxy
os.environ['HTTPS_PROXY'] = proxy

# 视频链接
url = "https://www.youtube.com/watch?v=CUZeKRwcMIU"

# 🔑 关键修改：指定客户端为 'WEB' 并启用 use_po_token
yt = YouTube(url, 
             'WEB',                    # 指定使用 Web 客户端
             use_po_token=True,        # 启用 PoToken 自动生成
             on_progress_callback=on_progress,
             proxies={"http": proxy, "https": proxy})

# 现在应该能正常获取标题了
print(f"标题: {yt.title}")
print(f"作者: {yt.author}")

# 获取最高分辨率的视频流并下载
ys = yt.streams.get_highest_resolution()
print(f"分辨率: {ys.resolution}")
ys.download()
print("下载完成！")