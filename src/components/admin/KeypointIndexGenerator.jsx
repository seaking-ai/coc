/**
 * ORB关键点索引生成组件
 * 
 * 功能：在浏览器端生成本地阵型图片的关键点索引
 * 特点：
 * 1. 完全在浏览器端运行，无需后端服务
 * 2. 使用OpenCV.js提取ORB关键点和描述子
 * 3. 生成JSON格式的索引文件，可直接下载
 * 4. 生成的索引文件用于GitHub Pages静态部署
 * 
 * @module KeypointIndexGenerator
 */

import { useState, useEffect, useCallback } from 'react';
import { initOpenCV, generateKeypointIndex } from '../../utils/keypoint-matcher';

/**
 * 关键点索引生成组件
 * @returns {JSX.Element} 生成界面
 */
export function KeypointIndexGenerator() {
  const [isOpen, setIsOpen] = useState(false);
  const [cvStatus, setCvStatus] = useState('unloaded'); // unloaded, loading, loaded, error
  const [layouts, setLayouts] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  /**
   * 加载OpenCV和数据
   */
  const initialize = useCallback(async () => {
    setError(null);
    setCvStatus('loading');

    try {
      // 1. 加载OpenCV.js
      await initOpenCV();
      setCvStatus('loaded');

      // 2. 加载阵型数据
      const baseUrl = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${baseUrl}data.json`);
      if (!response.ok) {
        throw new Error('无法加载阵型数据');
      }
      const data = await response.json();
      setLayouts(data);
    } catch (err) {
      console.error('初始化失败:', err);
      setError(err.message);
      setCvStatus('error');
    }
  }, []);

  /**
   * 打开弹窗时初始化
   */
  useEffect(() => {
    if (isOpen && cvStatus === 'unloaded') {
      initialize();
    }
  }, [isOpen, initialize, cvStatus]);

  /**
   * 开始生成索引
   */
  const startGeneration = async () => {
    if (layouts.length === 0) {
      setError('没有可处理的阵型数据');
      return;
    }

    if (!confirm(`确定要开始生成索引吗？\n\n这将：\n1. 使用OpenCV提取所有阵型图片的关键点\n2. 生成关键点索引文件（约${(layouts.length * 120).toFixed(1)}KB）\n3. 共 ${layouts.length} 个阵型\n\n此操作可能需要几分钟时间。`)) {
      return;
    }

    setIsGenerating(true);
    setResult(null);
    setError(null);
    setProgress({ current: 0, total: layouts.length });

    try {
      const onProgress = (current, total, layout) => {
        setProgress({ current, total });
      };

      const generationResult = await generateKeypointIndex(layouts, onProgress);
      setResult(generationResult);
    } catch (err) {
      console.error('生成失败:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 下载索引文件
   */
  const downloadIndex = () => {
    if (!result || !result.index) return;

    const blob = new Blob([JSON.stringify(result.index, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keypoint-index.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 复制索引到剪贴板
   */
  const copyToClipboard = async () => {
    if (!result || !result.index) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(result.index, null, 2));
      alert('索引内容已复制到剪贴板');
    } catch (err) {
      alert('复制失败，请使用下载功能');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
        title="生成ORB关键点索引"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        生成索引
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !isGenerating && setIsOpen(false)}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">ORB关键点索引生成</h3>
              <p className="text-sm text-gray-500">生成阵型图片关键点索引</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            disabled={isGenerating}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* OpenCV状态 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">OpenCV状态</span>
              <span className={`
                text-xs px-2 py-1 rounded-full
                ${cvStatus === 'loaded' ? 'bg-green-100 text-green-700' : ''}
                ${cvStatus === 'loading' ? 'bg-yellow-100 text-yellow-700' : ''}
                ${cvStatus === 'error' ? 'bg-red-100 text-red-700' : ''}
                ${cvStatus === 'unloaded' ? 'bg-gray-100 text-gray-700' : ''}
              `}>
                {cvStatus === 'loaded' && '已加载'}
                {cvStatus === 'loading' && '加载中...'}
                {cvStatus === 'error' && '加载失败'}
                {cvStatus === 'unloaded' && '未加载'}
              </span>
            </div>
            {cvStatus === 'loading' && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            )}
          </div>

          {/* 阵型统计 */}
          {layouts.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700">可处理阵型数量</span>
                <span className="text-2xl font-bold text-blue-600">{layouts.length}</span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                预计生成索引大小：约 {(layouts.length * 120).toFixed(1)}KB
              </p>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-red-700">{error}</div>
              </div>
            </div>
          )}

          {/* 生成进度 */}
          {isGenerating && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">生成进度</span>
                <span className="text-sm text-purple-600">
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-purple-200 rounded-full h-3">
                <div
                  className="bg-purple-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-purple-600 mt-2">
                正在提取ORB关键点，请稍候...
              </p>
            </div>
          )}

          {/* 生成结果 */}
          {result && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-medium text-green-900 mb-3">生成完成</h4>
              
              {/* 统计信息 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-lg font-bold text-green-600">{result.success}</div>
                  <div className="text-xs text-gray-600">成功</div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-lg font-bold text-red-600">{result.errors.length}</div>
                  <div className="text-xs text-gray-600">失败</div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-lg font-bold text-blue-600">{result.total}</div>
                  <div className="text-xs text-gray-600">总计</div>
                </div>
              </div>

              {/* 错误列表 */}
              {result.errors.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-red-600 font-medium mb-1">失败详情 ({result.errors.length}):</p>
                  <ul className="text-xs text-red-600 list-disc list-inside max-h-24 overflow-y-auto bg-red-50 rounded p-2">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err.title || err.id}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={downloadIndex}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  下载索引文件
                </button>
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  复制
                </button>
              </div>

              <p className="text-xs text-green-700 mt-3">
                提示：将下载的 keypoint-index.json 文件放入 public/index/ 目录，然后重新部署即可。
              </p>
            </div>
          )}

          {/* 说明信息 */}
          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <h5 className="font-medium text-gray-800 mb-2">使用说明</h5>
            <ol className="list-decimal list-inside space-y-1">
              <li>点击"开始生成"按钮，使用OpenCV提取所有阵型图片的关键点</li>
              <li>生成完成后，下载生成的 keypoint-index.json 文件</li>
              <li>将文件放入项目的 public/index/ 目录下</li>
              <li>提交代码并推送到GitHub，GitHub Pages会自动更新</li>
              <li>用户访问时，使用预计算的索引进行快速关键点匹配</li>
            </ol>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => {
              setResult(null);
              setError(null);
              initialize();
            }}
            disabled={isGenerating || cvStatus === 'loading'}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            重新加载
          </button>
          <button
            onClick={startGeneration}
            disabled={isGenerating || cvStatus !== 'loaded' || layouts.length === 0}
            className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                生成中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                开始生成
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
