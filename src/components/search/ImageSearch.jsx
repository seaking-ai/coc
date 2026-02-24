/**
 * 图片搜索组件
 * 支持用户上传图片搜索相似阵型，返回前5个最相似的结果
 * 
 * 特点：
 * 1. 支持完整阵型截图或部分截图匹配
 * 2. 对裁剪、旋转、光照变化具有鲁棒性
 * 3. 计算在浏览器本地完成
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { searchSimilarLayouts, initOpenCV } from '../../utils/keypoint-matcher';
import DetailDrawer from '../display/DetailDrawer';

/**
 * 图片搜索组件
 * @returns {JSX.Element} 搜索组件
 */
export function ImageSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const [selectedLayout, setSelectedLayout] = useState(null);
  const fileInputRef = useRef(null);

  /**
   * 组件挂载时预加载OpenCV
   */
  useEffect(() => {
    const preloadOpenCV = async () => {
      try {
        await initOpenCV();
        setModelLoading(false);
      } catch (err) {
        console.error('OpenCV加载失败:', err);
        setError('OpenCV加载失败，请刷新页面重试');
        setModelLoading(false);
      }
    };

    preloadOpenCV();
  }, []);

  /**
   * 处理图片上传和搜索
   * @param {File} file - 用户选择的图片文件
   */
  const handleImageSearch = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('请选择有效的图片文件');
      return;
    }

    // 显示预览
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setIsSearching(true);
    setError(null);
    setResults([]);
    setSearchProgress({ current: 0, total: 0 });

    try {
      // 搜索相似阵型，带进度回调
      const searchResults = await searchSimilarLayouts(file, 5, (current, total) => {
        setSearchProgress({ current, total });
      });
      setResults(searchResults);
    } catch (err) {
      console.error('搜索失败:', err);
      setError(err.message || '搜索失败，请重试');
    } finally {
      setIsSearching(false);
      setSearchProgress({ current: 0, total: 0 });
    }
  }, []);

  /**
   * 处理文件选择变化
   * @param {Event} event - 文件选择事件
   */
  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageSearch(file);
    }
  }, [handleImageSearch]);

  /**
   * 处理拖拽进入
   * @param {DragEvent} e - 拖拽事件
   */
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  /**
   * 处理拖拽离开
   * @param {DragEvent} e - 拖拽事件
   */
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  /**
   * 处理拖拽悬停
   * @param {DragEvent} e - 拖拽事件
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * 处理文件拖放
   * @param {DragEvent} e - 拖拽事件
   */
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleImageSearch(file);
    }
  }, [handleImageSearch]);

  /**
   * 触发文件选择
   */
  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * 清除搜索状态
   */
  const clearSearch = useCallback(() => {
    setPreview(null);
    setResults([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * 获取相似度颜色
   * @param {number} similarity - 相似度百分比
   * @returns {string} 颜色类名
   */
  const getSimilarityColor = (similarity) => {
    if (similarity >= 90) return 'text-green-500';
    if (similarity >= 80) return 'text-blue-500';
    if (similarity >= 70) return 'text-yellow-500';
    return 'text-gray-500';
  };

  /**
   * 获取相似度标签
   * @param {number} similarity - 相似度百分比
   * @returns {string} 相似度标签
   */
  const getSimilarityLabel = (similarity) => {
    if (similarity >= 95) return '极高';
    if (similarity >= 90) return '很高';
    if (similarity >= 80) return '高';
    if (similarity >= 70) return '中等';
    if (similarity >= 60) return '低';
    return '极低';
  };

  // OpenCV加载中显示
  if (modelLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <div className="text-center py-12">
          <div className="inline-flex items-center px-6 py-3 bg-blue-50 rounded-lg">
            <svg
              className="animate-spin h-6 w-6 text-blue-500 mr-3"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-blue-700">正在加载OpenCV...</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            首次加载需要初始化图像处理库，请稍候
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {/* 标题 */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">图片搜索阵型</h2>
        <p className="text-gray-600">上传一张COC阵型截图，系统将为您找到相似的阵型</p>
        <p className="text-xs text-gray-400 mt-1">支持部分截图匹配</p>
      </div>

      {/* 上传区域 */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }
          ${isSearching ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={isSearching ? undefined : triggerFileInput}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={isSearching ? undefined : handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={isSearching}
          className="hidden"
        />

        {/* 上传图标 */}
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        <p className="text-lg font-medium text-gray-700 mb-2">
          点击上传或拖拽图片到此处
        </p>
        <p className="text-sm text-gray-500">
          支持 JPG、PNG、WebP 格式，文件大小不超过 10MB
        </p>
        <p className="text-xs text-gray-400 mt-2">
          支持完整阵型截图或部分截图（只要包含城墙结构即可）
        </p>
      </div>

      {/* 加载状态 */}
      {isSearching && (
        <div className="mt-8 text-center">
          <div className="inline-flex flex-col items-center px-6 py-4 bg-blue-50 rounded-lg">
            <div className="flex items-center mb-2">
              <svg
                className="animate-spin h-5 w-5 text-blue-500 mr-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-blue-700">正在分析图片特征，请稍候...</span>
            </div>
            {/* 进度条 */}
            {searchProgress.total > 0 && (
              <div className="w-48">
                <div className="flex justify-between text-xs text-blue-600 mb-1">
                  <span>匹配进度</span>
                  <span>{Math.round((searchProgress.current / searchProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(searchProgress.current / searchProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-blue-500 mt-1">
                  {searchProgress.current} / {searchProgress.total} 个阵型
                </p>
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-500">
            正在搜索相似阵型...
          </p>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* 查询图片预览 */}
      {preview && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">查询图片</h3>
            <button
              onClick={clearSearch}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              清除并重新搜索
            </button>
          </div>
          <div className="relative inline-block">
            <img
              src={preview}
              alt="查询图片"
              className="max-h-64 rounded-lg shadow-md"
            />
          </div>
        </div>
      )}

      {/* 搜索结果 */}
      {results.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            找到 {results.length} 个相似阵型
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((layout, index) => (
              <div
                key={layout.id}
                onClick={() => setSelectedLayout(layout)}
                className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg will-change-transform cursor-pointer"
              >
                {/* 排名和相似度 */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-500 text-white text-sm font-bold rounded-full">
                    {index + 1}
                  </span>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${getSimilarityColor(layout.similarity)}`}>
                      {layout.similarity}%
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      ({getSimilarityLabel(layout.similarity)})
                    </span>
                  </div>
                </div>

                {/* 匹配信息 */}
                {layout.matchInfo && (
                  <div className="px-4 py-1 bg-blue-50 text-xs text-blue-600 border-b border-blue-100">
                    匹配点: {layout.matchInfo.inlierCount}/{layout.matchInfo.matchCount}
                    (内点率: {layout.matchInfo.inlierRatio}%)
                  </div>
                )}

                {/* 阵型图片 */}
                <div className="relative aspect-square bg-gray-100">
                  <img
                    src={layout.image?.startsWith('/') ? `${import.meta.env.BASE_URL}${layout.image.slice(1)}` : layout.image}
                    alt={layout.title || '阵型图片'}
                    className="w-full h-full object-cover"
                    decoding="async"
                    onError={(e) => {
                      // 图片加载失败时尝试备用路径
                      if (e.target.src.includes('./images/')) {
                        e.target.src = e.target.src.replace('./images/', `${import.meta.env.BASE_URL}images/`);
                      }
                    }}
                  />
                </div>

                {/* 阵型信息 */}
                <div className="p-4">
                  <h4 className="font-semibold text-gray-800 mb-2 truncate">
                    {layout.title || '未命名阵型'}
                  </h4>

                  {/* 标签 */}
                  {layout.tags && layout.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {layout.tags.slice(0, 3).map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                      {layout.tags.length > 3 && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                          +{layout.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 提示文字 */}
                  <p className="text-xs text-gray-400 text-center">
                    点击卡片查看详情和复制链接
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 无结果提示 */}
      {results.length === 0 && !isSearching && !error && preview && (
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
          <svg className="mx-auto h-12 w-12 text-yellow-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-yellow-800 font-medium">未找到相似的阵型</p>
          <p className="text-yellow-600 text-sm mt-1">
            请尝试上传更清晰的阵型截图，或稍后再试
          </p>
        </div>
      )}

      {/* 详情侧边栏 */}
      <DetailDrawer
        layout={selectedLayout}
        onClose={() => setSelectedLayout(null)}
      />
    </div>
  );
}
