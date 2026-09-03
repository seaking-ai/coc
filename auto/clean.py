#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理已添加的阵型文件
功能：遍历videos目录，让用户选择清理已处理的视频及其关联文件
"""

import os
import sys
from pathlib import Path


def get_video_files(videos_dir: str) -> list:
    """
    获取videos目录下的所有视频文件
    
    参数:
        videos_dir: videos目录路径
    返回:
        视频文件列表（不含扩展名）
    """
    video_extensions = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'}
    video_files = []
    
    try:
        for file in os.listdir(videos_dir):
            file_path = os.path.join(videos_dir, file)
            if os.path.isfile(file_path):
                ext = os.path.splitext(file)[1].lower()
                if ext in video_extensions:
                    # 返回不含扩展名的文件名
                    video_files.append(os.path.splitext(file)[0])
    except FileNotFoundError:
        print(f"错误: 目录不存在 - {videos_dir}")
        return []
    except Exception as e:
        print(f"错误: 读取目录失败 - {e}")
        return []
    
    return sorted(video_files)


def get_related_folders(images_dir: str, video_name: str) -> list:
    """
    在images目录下查找与视频名称相关的文件夹
    
    参数:
        images_dir: images目录路径
        video_name: 视频名称（不含扩展名）
    返回:
        相关文件夹列表
    """
    related_folders = []
    
    try:
        if not os.path.exists(images_dir):
            return related_folders
            
        for folder in os.listdir(images_dir):
            folder_path = os.path.join(images_dir, folder)
            if os.path.isdir(folder_path):
                # 检查文件夹名是否包含视频名，或视频名包含文件夹名
                if video_name in folder or folder in video_name:
                    related_folders.append(folder)
    except Exception as e:
        print(f"警告: 扫描images目录时出错 - {e}")
    
    return related_folders


def display_menu(video_files: list, videos_dir: str, images_dir: str) -> None:
    """
    显示清理菜单
    
    参数:
        video_files: 视频文件列表
        videos_dir: videos目录路径
        images_dir: images目录路径
    """
    print("\n" + "=" * 60)
    print("           阵型文件清理工具")
    print("=" * 60)
    print(f"\nvideos目录: {videos_dir}")
    print(f"images目录: {images_dir}\n")
    
    if not video_files:
        print("[!] videos目录下没有找到视频文件")
        return
    
    print(f"发现 {len(video_files)} 个视频文件:\n")
    print(f"{'序号':<6}{'视频标题':<40}{'关联文件夹'}")
    print("-" * 60)
    
    for i, video_name in enumerate(video_files, 1):
        # 查找关联的images文件夹
        related_folders = get_related_folders(images_dir, video_name)
        folder_info = f"({len(related_folders)}个)" if related_folders else "-"
        
        # 截断过长的名称
        display_name = video_name[:38] + ".." if len(video_name) > 40 else video_name
        print(f"{i:<6}{display_name:<40}{folder_info}")
    
    print("-" * 60)
    print("\n操作选项:")
    print("  [1-9]  选择对应序号的视频进行清理")
    print("  [a]    清理所有视频文件")
    print("  [q]    退出程序")
    print("=" * 60)


def confirm_deletion(video_name: str, videos_dir: str, images_dir: str) -> bool:
    """
    确认删除操作
    
    参数:
        video_name: 视频名称
        videos_dir: videos目录路径
        images_dir: images目录路径
    返回:
        是否确认删除
    """
    print(f"\n{'=' * 60}")
    print(f"即将删除以下文件/文件夹:")
    print(f"{'=' * 60}")
    
    # 列出将要删除的文件
    files_to_delete = []
    
    # 视频文件
    video_extensions = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'}
    for ext in video_extensions:
        video_file = os.path.join(videos_dir, video_name + ext)
        if os.path.exists(video_file):
            files_to_delete.append(("视频", video_file))
            break
    
    # txt文件
    txt_file = os.path.join(videos_dir, video_name + '.txt')
    if os.path.exists(txt_file):
        files_to_delete.append(("链接文件", txt_file))
    
    # images文件夹
    related_folders = get_related_folders(images_dir, video_name)
    for folder in related_folders:
        folder_path = os.path.join(images_dir, folder)
        files_to_delete.append(("图片文件夹", folder_path))
    
    if not files_to_delete:
        print("[!] 未找到相关文件")
        return False
    
    for file_type, file_path in files_to_delete:
        print(f"  [{file_type}] {file_path}")
    
    print(f"{'=' * 60}")
    
    while True:
        choice = input("\n确认删除? (y/n): ").strip().lower()
        if choice in ('y', 'yes', '是'):
            return True
        elif choice in ('n', 'no', '否', 'q', 'quit'):
            return False
        else:
            print("请输入 y 或 n")


def delete_files(video_name: str, videos_dir: str, images_dir: str) -> dict:
    """
    执行文件删除操作
    
    参数:
        video_name: 视频名称
        videos_dir: videos目录路径
        images_dir: images目录路径
    返回:
        删除结果统计
    """
    import shutil
    
    result = {
        'deleted': [],
        'failed': [],
        'not_found': []
    }
    
    # 删除视频文件
    video_extensions = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'}
    video_deleted = False
    for ext in video_extensions:
        video_file = os.path.join(videos_dir, video_name + ext)
        if os.path.exists(video_file):
            try:
                os.remove(video_file)
                result['deleted'].append(f"视频: {os.path.basename(video_file)}")
                video_deleted = True
                break
            except Exception as e:
                result['failed'].append(f"视频删除失败: {e}")
    
    if not video_deleted:
        result['not_found'].append("视频文件")
    
    # 删除txt文件
    txt_file = os.path.join(videos_dir, video_name + '.txt')
    if os.path.exists(txt_file):
        try:
            os.remove(txt_file)
            result['deleted'].append(f"链接文件: {os.path.basename(txt_file)}")
        except Exception as e:
            result['failed'].append(f"链接文件删除失败: {e}")
    else:
        result['not_found'].append("链接文件")
    
    # 删除images文件夹
    related_folders = get_related_folders(images_dir, video_name)
    for folder in related_folders:
        folder_path = os.path.join(images_dir, folder)
        if os.path.exists(folder_path):
            try:
                shutil.rmtree(folder_path)
                result['deleted'].append(f"图片文件夹: {folder}")
            except Exception as e:
                result['failed'].append(f"文件夹删除失败 [{folder}]: {e}")
    
    return result


def delete_all_videos(video_files: list, videos_dir: str, images_dir: str) -> None:
    """
    删除所有视频及其关联文件
    
    参数:
        video_files: 视频文件列表
        videos_dir: videos目录路径
        images_dir: images目录路径
    """
    print(f"\n{'=' * 60}")
    print(f"批量清理模式 - 共 {len(video_files)} 个视频")
    print(f"{'=' * 60}")
    
    total_deleted = 0
    total_failed = 0
    
    for i, video_name in enumerate(video_files, 1):
        print(f"\n[{i}/{len(video_files)}] 正在清理: {video_name}")
        result = delete_files(video_name, videos_dir, images_dir)
        
        if result['deleted']:
            total_deleted += len(result['deleted'])
            print(f"  [OK] 已删除 {len(result['deleted'])} 项")
        if result['failed']:
            total_failed += len(result['failed'])
            print(f"  [FAIL] 失败 {len(result['failed'])} 项")
    
    print(f"\n{'=' * 60}")
    print(f"清理完成: 成功 {total_deleted} 项, 失败 {total_failed} 项")
    print(f"{'=' * 60}")


def main():
    """
    主函数
    """
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    videos_dir = os.path.join(script_dir, 'videos')
    images_dir = os.path.join(script_dir, 'images')
    
    print("\n[ 阵型文件清理工具 ]")
    print("本工具用于清理已添加到系统的阵型源文件\n")
    
    while True:
        # 获取视频列表
        video_files = get_video_files(videos_dir)
        
        # 显示菜单
        display_menu(video_files, videos_dir, images_dir)
        
        if not video_files:
            input("\n按回车键退出...")
            break
        
        # 获取用户输入
        try:
            choice = input("\n请选择操作: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\n\n程序已退出")
            break
        
        # 退出
        if choice in ('q', 'quit', 'exit', '退出'):
            print("\n感谢使用，再见！")
            break
        
        # 清理所有
        if choice == 'a':
            if video_files:
                confirm = input(f"\n[!] 确定要清理所有 {len(video_files)} 个视频? (yes/no): ").strip().lower()
                if confirm in ('yes', 'y', '是'):
                    delete_all_videos(video_files, videos_dir, images_dir)
                    # 批量清理完成后询问是否退出
                    exit_choice = input("\n[回车] 返回主菜单  [q] 退出程序: ").strip().lower()
                    if exit_choice in ('q', 'quit', 'exit', '退出'):
                        print("\n感谢使用，再见！")
                        break
                else:
                    print("已取消批量清理")
            continue
        
        # 选择序号
        try:
            index = int(choice) - 1
            if index < 0 or index >= len(video_files):
                print(f"\n⚠️  无效的选择，请输入 1-{len(video_files)} 之间的数字")
                input("按回车键继续...")
                continue
        except ValueError:
            print("\n⚠️  无效的输入")
            input("按回车键继续...")
            continue
        
        # 获取选中的视频
        selected_video = video_files[index]
        print(f"\n已选择: {selected_video}")
        
        # 确认删除
        if confirm_deletion(selected_video, videos_dir, images_dir):
            result = delete_files(selected_video, videos_dir, images_dir)
            
            print(f"\n{'=' * 60}")
            print("清理结果:")
            print(f"{'=' * 60}")
            
            if result['deleted']:
                print(f"\n[OK] 成功删除 ({len(result['deleted'])} 项):")
                for item in result['deleted']:
                    print(f"  - {item}")

            if result['failed']:
                print(f"\n[FAIL] 删除失败 ({len(result['failed'])} 项):")
                for item in result['failed']:
                    print(f"  - {item}")

            if result['not_found']:
                print(f"\n[WARNING] 未找到 ({len(result['not_found'])} 项):")
                for item in result['not_found']:
                    print(f"  - {item}")
            
            print(f"{'=' * 60}")
            
            # 删除完成后询问是否退出
            exit_choice = input("\n[回车] 返回主菜单  [q] 退出程序: ").strip().lower()
            if exit_choice in ('q', 'quit', 'exit', '退出'):
                print("\n感谢使用，再见！")
                break
        else:
            print("\n已取消删除操作")
            input("\n按回车键继续...")


if __name__ == '__main__':
    main()
