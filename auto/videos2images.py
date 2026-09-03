import ffmpeg
import os
from pathlib import Path
from PIL import Image
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== 基础路径配置 ==========
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(BASE_DIR, "videos")  # 视频所在文件夹
SAVE_DIR = os.path.join(BASE_DIR, "images", "pending")  # 截图保存位置

# 支持的视频格式（可自行添加）
VIDEO_EXTENSIONS = (".mp4", ".avi", ".mov", ".flv", ".mkv", ".wmv")


def preprocess_image(image_path: Path) -> bool:
    """
    预处理截图图片，统一转换为标准JPEG格式
    
    功能：
    1. 将图片resize到1000x1000（使用cover模式，从中心裁剪）
    2. 将图片转换为RGB模式（去除透明通道）
    3. 重新保存为JPEG格式，质量90
    4. 确保与前端server.js的处理流程完全一致，提高检测成功率
    
    参数：
        image_path: 图片文件路径
        
    返回：
        bool: 预处理是否成功
        
    异常：
        预处理失败时会记录错误日志，但不会抛出异常
    """
    try:
        with Image.open(image_path) as img:
            # 转换为RGB模式（去除透明通道）
            if img.mode in ('RGBA', 'P', 'LA', 'L'):
                img = img.convert('RGB')
            
            # resize到1000x1000，使用cover模式（与前端sharp一致）
            # cover模式：保持比例，裁剪多余部分，从中心裁剪
            TARGET_SIZE = (1000, 1000)
            
            # 计算缩放比例（cover模式）
            img_width, img_height = img.size
            target_width, target_height = TARGET_SIZE
            
            # 计算需要缩放的比例
            scale_w = target_width / img_width
            scale_h = target_height / img_height
            scale = max(scale_w, scale_h)  # cover模式使用较大的比例
            
            # 计算缩放后的尺寸
            new_width = int(img_width * scale)
            new_height = int(img_height * scale)
            
            # 缩放图片
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # 从中心裁剪到目标尺寸
            left = (new_width - target_width) // 2
            top = (new_height - target_height) // 2
            right = left + target_width
            bottom = top + target_height
            img = img.crop((left, top, right, bottom))
            
            # 保存为JPEG格式，质量90（与前端一致）
            img.save(image_path, format='JPEG', quality=90, optimize=True)
            logger.info(f"  预处理完成: {image_path.name} ({img.size[0]}x{img.size[1]})")
                
        return True
        
    except Exception as e:
        logger.error(f"  预处理失败 {image_path}: {e}")
        return False


def preprocess_all_images_in_dir(directory: Path) -> int:
    """
    预处理目录中的所有图片文件
    
    参数：
        directory: 图片所在目录
        
    返回：
        int: 成功预处理的图片数量
    """
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    success_count = 0
    
    if not directory.exists():
        logger.warning(f"目录不存在: {directory}")
        return 0
    
    image_files = [f for f in directory.iterdir() 
                   if f.is_file() and f.suffix.lower() in image_extensions]
    
    logger.info(f"开始预处理 {len(image_files)} 张图片...")
    
    for img_path in image_files:
        if preprocess_image(img_path):
            success_count += 1
    
    logger.info(f"预处理完成: {success_count}/{len(image_files)} 张图片")
    return success_count


def process_all_videos(interval=2):
    """
    处理所有视频文件，提取截图并进行预处理
    
    参数：
        interval: 截图间隔（秒）
    """
    # 自动创建保存目录
    os.makedirs(SAVE_DIR, exist_ok=True)
    
    # 获取所有视频文件
    video_files = [
        f for f in os.listdir(VIDEO_DIR)
        if os.path.isfile(os.path.join(VIDEO_DIR, f)) 
        and f.lower().endswith(VIDEO_EXTENSIONS)
    ]
    
    if not video_files:
        logger.warning(f"在 {VIDEO_DIR} 目录下未找到视频文件")
        return
    
    logger.info(f"发现 {len(video_files)} 个视频文件待处理")

    # 遍历 videos 目录下所有文件
    for filename in video_files:
        video_path = os.path.join(VIDEO_DIR, filename)
        logger.info(f"\n🎬 正在处理视频: {filename}")

        # 获取视频文件名（不带后缀）
        video_name = os.path.splitext(filename)[0]

        try:
            # 使用ffmpeg截取视频帧
            (
                ffmpeg
                .input(video_path)
                .filter('fps', fps=1 / interval)
                # 输出格式：视频名_第几秒.jpg
                .output(os.path.join(SAVE_DIR, f"{video_name}_%03d.jpg"))
                .overwrite_output()
                .run(quiet=True)  # 安静模式，减少输出
            )
            logger.info(f"✅ {filename} 截图完成")
            
            # 对该视频的所有截图进行预处理
            logger.info(f"📷 开始预处理 {video_name} 的截图...")
            preprocess_all_images_in_dir(Path(SAVE_DIR))

        except ffmpeg.Error as e:
            logger.error(f"❌ {filename} ffmpeg处理失败: {e}")
        except Exception as e:
            logger.error(f"❌ {filename} 处理失败: {e}")

    logger.info("\n🎉 所有视频处理完毕！")


# ========== 执行 ==========
if __name__ == "__main__":
    process_all_videos(interval=3)  # 每3秒截一张
