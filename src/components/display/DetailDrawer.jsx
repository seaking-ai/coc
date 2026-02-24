/**
 * 详情侧边栏组件
 * @param {Object} layout - 当前选中的阵型数据
 * @param {Function} onClose - 关闭回调函数
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Toast from '../common/Toast';

function DetailDrawer({ layout, onClose }) {
  // 服务器类型状态：'china' 或 'international'
  const [serverType, setServerType] = useState('china');
  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Toast 状态
  const [toast, setToast] = useState(null);

  // 图片缩放相关状态
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const initialDistanceRef = useRef(0);
  const initialScaleRef = useRef(1);
  const lastTouchRef = useRef({ x: 0, y: 0 });
  
  // 处理图片路径，确保正确拼接 BASE_URL
  const getImagePath = (path) => {
    if (path.startsWith('/')) {
      return `${import.meta.env.BASE_URL}${path.slice(1)}`;
    }
    return `${import.meta.env.BASE_URL}${path}`;
  };
  
  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, isFullscreen]);

  // 根据标签自动选择服务器类型
  useEffect(() => {
    if (layout) {
      const hasChinaTag = layout.tags?.includes('国服');
      const hasInternationalTag = layout.tags?.includes('国际服');
      
      // 如果有国服标签，优先选择国服
      if (hasChinaTag) {
        setServerType('china');
      } else if (hasInternationalTag) {
        setServerType('international');
      }
    }
  }, [layout]);

  /**
   * 获取当前服务器类型的链接
   * @returns {string} 当前链接
   */
  const getCurrentLink = () => {
    if (!layout) return '';
    return serverType === 'china' ? layout.chinaLink : layout.internationalLink;
  };

  /**
   * 获取国服链接，根据平台添加后缀
   * @param {string} platform - 平台类型：'android' | 'ios'
   * @returns {string} 处理后的链接
   */
  const getChinaLink = (platform) => {
    if (!layout?.chinaLink) return '';
    
    let link = layout.chinaLink;
    
    link = link.replace(/[?&]platform=[^&]*/i, '');
    
    const separator = link.includes('?') ? '&' : '?';
    link = `${link}${separator}platform=${platform}`;
    
    return link;
  };

  /**
   * 复制国服链接
   * @param {string} platform - 平台类型：'android' | 'ios'
   */
  const copyChinaLink = async (platform) => {
    const link = getChinaLink(platform);
    if (!link) return;
    
    try {
      await navigator.clipboard.writeText(link);
      setToast(platform === 'android' ? '安卓链接已复制' : '苹果链接已复制');
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  /**
   * 复制国际服链接
   */
  const copyInternationalLink = async () => {
    const link = layout?.internationalLink;
    if (!link) return;
    
    try {
      await navigator.clipboard.writeText(link);
      setToast('国际服链接已复制');
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  /**
   * 切换服务器类型
   */
  const toggleServerType = () => {
    setServerType(prev => prev === 'china' ? 'international' : 'china');
  };

  /**
   * 切换全屏模式
   */
  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
    // 重置缩放状态
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  /**
   * 计算两点之间的距离
   * @param {Touch} touch1 - 第一个触摸点
   * @param {Touch} touch2 - 第二个触摸点
   * @returns {number} 两点之间的距离
   */
  const getDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /**
   * 处理触摸开始事件
   * @param {TouchEvent} e - 触摸事件对象
   */
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      // 单指拖拽
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      // 双指缩放
      const distance = getDistance(e.touches[0], e.touches[1]);
      initialDistanceRef.current = distance;
      initialScaleRef.current = scale;
      setIsDragging(false);
    }
  }, [scale]);

  /**
   * 处理触摸移动事件
   * @param {TouchEvent} e - 触摸事件对象
   */
  const handleTouchMove = useCallback((e) => {
    e.preventDefault();

    if (e.touches.length === 1 && isDragging && scale > 1) {
      // 单指拖拽（仅在放大状态下）
      const touch = e.touches[0];
      const deltaX = touch.clientX - lastTouchRef.current.x;
      const deltaY = touch.clientY - lastTouchRef.current.y;

      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));

      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      // 双指缩放
      const distance = getDistance(e.touches[0], e.touches[1]);
      const scaleFactor = distance / initialDistanceRef.current;
      const newScale = Math.min(Math.max(initialScaleRef.current * scaleFactor, 1), 5);
      setScale(newScale);
    }
  }, [isDragging, scale]);

  /**
   * 处理触摸结束事件
   */
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // 如果缩放小于1，重置为1
    if (scale < 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [scale]);

  /**
   * 处理鼠标滚轮缩放
   * @param {WheelEvent} e - 滚轮事件对象
   */
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.min(Math.max(prev * delta, 1), 5));
  }, []);

  if (!layout) return null;

  const currentLink = getCurrentLink();
  const hasChinaLink = layout.chinaLink;
  const hasInternationalLink = layout.internationalLink;
  const canSwitch = hasChinaLink && hasInternationalLink;

  return (
    <>
      {/* 全屏图片遮罩层 */}
      {isFullscreen && (
        <div
          ref={containerRef}
          className="fixed inset-0 bg-black z-[120] flex items-center justify-center overflow-hidden"
          onClick={(e) => {
            // 只有点击背景时才关闭，点击图片不关闭
            if (e.target === containerRef.current) {
              toggleFullscreen();
            }
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{ touchAction: 'none' }}
        >
          <img
            ref={imageRef}
            src={getImagePath(layout.image)}
            alt={layout.title}
            className="max-w-full max-h-full object-contain transition-transform duration-100 ease-out"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default'
            }}
            draggable={false}
          />
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/70 px-4 py-2 rounded-lg text-center">
            <div>双指捏合缩放，单指拖动</div>
            <div className="text-xs text-gray-300 mt-1">点击空白处退出</div>
          </div>
          {/* 缩放比例指示器 */}
          <div className="absolute top-4 right-4 text-white text-sm bg-black/70 px-3 py-1.5 rounded-lg">
            {Math.round(scale * 100)}%
          </div>
          {/* 重置缩放按钮 */}
          {scale > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="absolute top-4 left-4 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/60 z-[100]"
        onClick={onClose}
        style={{ touchAction: 'none' }}
      />

      {/* 侧边栏 - 移动端宽度调整，留出左侧空间 */}
      <div
        className="fixed right-0 top-0 h-full w-[85vw] sm:w-full sm:max-w-2xl bg-white shadow-2xl z-[110] overflow-y-auto will-change-transform"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="p-6">
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* 图片 - 增大展示尺寸，固定为正方形 */}
          <div className="relative group aspect-square">
            <img 
              src={getImagePath(layout.image)}
              alt={layout.title}
              className="w-full h-full object-cover rounded-xl cursor-pointer transition-transform hover:scale-[1.02] shadow-lg"
              onClick={toggleFullscreen}
            />
            <button
              onClick={toggleFullscreen}
              className="absolute bottom-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
              title="全屏查看"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>

          {/* 标题 */}
          {layout.title && (
            <h2 className="text-3xl font-bold text-gray-800 mb-4">{layout.title}</h2>
          )}

          {/* 服务器类型切换按钮 */}
          {canSwitch && (
            <div className="mb-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setServerType('china')}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all server-button ${
                    serverType === 'china'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  国服
                </button>
                <button
                  onClick={() => setServerType('international')}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all server-button ${
                    serverType === 'international'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  国际服
                </button>
              </div>
            </div>
          )}

          {/* 标签 */}
          <div className="flex flex-wrap gap-2 mb-6">
            {layout.tags.map(tag => (
              <span 
                key={tag} 
                className="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium border border-blue-200 shadow-sm"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* 描述 */}
          {layout.description && (
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 mb-6 border border-gray-200">
              <p className="text-gray-700 leading-relaxed">{layout.description}</p>
            </div>
          )}

          {/* 复制链接按钮 */}
          {serverType === 'china' && layout?.chinaLink ? (
            <div className="space-y-3">
              {/* 链接失效提示 */}
              <div className="text-xs text-gray-500 text-center py-2 bg-gray-50 rounded-lg">
                链接失效是正常情况，超过30天没人复制就会失效
              </div>
              <button
                onClick={() => copyChinaLink('android')}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-xl font-medium hover:from-green-600 hover:to-green-700 transition-all shadow-lg shadow-green-500/30 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                复制安卓链接
              </button>
              <button
                onClick={() => copyChinaLink('ios')}
                className="w-full bg-gradient-to-r from-gray-800 to-gray-900 text-white py-3 rounded-xl font-medium hover:from-gray-700 hover:to-gray-800 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                复制苹果链接
              </button>
            </div>
          ) : layout?.internationalLink ? (
            <div className="space-y-3">
              {/* 链接失效提示 */}
              <div className="text-xs text-gray-500 text-center py-2 bg-gray-50 rounded-lg">
                链接失效是正常情况，超过30天没人复制就会失效
              </div>
              <button
                onClick={copyInternationalLink}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制国际服阵型链接
              </button>
            </div>
          ) : null}

          {/* 提示信息 */}
          {!currentLink && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 text-amber-700">
              该阵型暂无{serverType === 'china' ? '国服' : '国际服'}链接
              {canSwitch && '，请切换服务器类型'}
            </div>
          )}
        </div>
      </div>

      {/* Toast 提示 */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

export default DetailDrawer;
