/**
 * 管理端页面
 * 功能：添加/编辑/删除阵型，仅在本地环境可用
 * 使用统一的标签配置系统
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import LayoutForm from '../components/admin/LayoutForm';
import { KeypointIndexGenerator } from '../components/admin/KeypointIndexGenerator';
import { useTags } from '../hooks/useTags';

/**
 * 图片查看器组件
 * 功能：全屏查看阵型图片，点击空白处退出
 *
 * @param {string} imageUrl - 图片URL
 * @param {boolean} isOpen - 是否打开
 * @param {Function} onClose - 关闭回调函数
 */
function ImageViewer({ imageUrl, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-zoom-out"
      onClick={onClose}
    >
      <div className="relative w-full h-full flex items-center justify-center p-4">
        <img
          src={imageUrl}
          alt="阵型图片"
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
          点击任意位置关闭全图
        </p>
      </div>
    </div>
  );
}

function Admin() {
  const [message, setMessage] = useState(null);
  const [layouts, setLayouts] = useState([]);
  const [editingLayout, setEditingLayout] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [randomLayout, setRandomLayout] = useState(null);
  const [filterMode, setFilterMode] = useState('none'); // 'none' | 'chinaExpired' | 'intlExpired' | 'untested'
  const [viewerImage, setViewerImage] = useState(null); // 当前查看的图片URL

  /**
   * 加载阵型数据
   */
  useEffect(() => {
    loadLayouts();
  }, []);

  /**
   * 从服务器加载阵型数据
   */
  const loadLayouts = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data.json`);
      const data = await response.json();
      setLayouts(data);
      setIsLoading(false);
    } catch (error) {
      console.error('加载阵型数据失败:', error);
      setMessage({ type: 'error', text: '加载阵型数据失败' });
      setIsLoading(false);
    }
  };

  /**
   * 处理表单提交（添加或编辑）
   * @param {FormData} formData - 表单数据
   */
  const handleSubmit = async (formData) => {
    try {
      const isEdit = formData.has('id');
      const endpoint = isEdit 
        ? 'http://localhost:3001/api/edit-layout'
        : 'http://localhost:3001/api/add-layout';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: isEdit ? '阵型修改成功！请记得 git push 部署。' : '阵型添加成功！请记得 git push 部署。' 
        });
        setEditingLayout(null);
        await loadLayouts();
      } else {
        setMessage({ type: 'error', text: result.message || '操作失败' });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: '无法连接到本地服务器，请确保已运行 npm run dev' 
      });
      console.error('提交失败:', error);
    }
  };

  /**
   * 处理删除阵型
   * @param {string} layoutId - 要删除的阵型ID
   */
  const handleDelete = async (layoutId) => {
    try {
      const response = await fetch('http://localhost:3001/api/delete-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: layoutId })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: '阵型删除成功！请记得 git push 部署。' });
        setEditingLayout(null);
        await loadLayouts();
      } else {
        setMessage({ type: 'error', text: result.message || '删除失败' });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: '无法连接到本地服务器，请确保已运行 npm run dev' 
      });
      console.error('删除失败:', error);
    }
  };

  /**
   * 开始编辑阵型
   * @param {Object} layout - 要编辑的阵型数据
   */
  const startEdit = (layout) => {
    setEditingLayout(layout);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * 取消编辑
   */
  const cancelEdit = () => {
    setEditingLayout(null);
  };

  /**
   * 切换随机展示模式
   */
  const toggleRandomMode = () => {
    if (isRandomMode) {
      setIsRandomMode(false);
      setRandomLayout(null);
    } else {
      setIsRandomMode(true);
      selectRandomLayout();
    }
  };

  /**
   * 随机选择一个阵型（基于筛选后的结果）
   * 兼容搜索和筛选模式
   */
  const selectRandomLayout = () => {
    // 使用filteredLayouts，它已经包含了搜索和筛选的结果
    if (filteredLayouts.length === 0) return;
    const randomIndex = Math.floor(Math.random() * filteredLayouts.length);
    setRandomLayout(filteredLayouts[randomIndex]);
  };

  /**
   * 跳转到展示页
   */
  const goToHome = () => {
    window.location.href = `${import.meta.env.BASE_URL}`;
  };

  /**
   * 处理图片路径，确保正确拼接 BASE_URL
   */
  const getImagePath = (path) => {
    if (path.startsWith('/')) {
      return `${import.meta.env.BASE_URL}${path.slice(1)}`;
    }
    return `${import.meta.env.BASE_URL}${path}`;
  };

  /**
   * 从描述中提取指定服务器的测试日期
   * 匹配格式：YYYY-MM-DD测试，国服链接可用 或 YYYY-M-D测试，国际服链接可用
   * @param {string} description - 阵型描述
   * @param {string} serverType - 服务器类型：'china' 或 'intl'
   * @returns {Date|null} 提取到的日期，如果没有则返回null
   */
  const extractTestDate = (description, serverType = null) => {
    if (!description) return null;

    if (serverType === 'china') {
      // 匹配国服测试日期：日期后面跟着"测试，国服链接可用"
      const chinaMatch = description.match(/(\d{4})-(\d{1,2})-(\d{1,2})测试，国服链接可用/);
      if (chinaMatch) {
        const [, year, month, day] = chinaMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return null;
    } else if (serverType === 'intl') {
      // 匹配国际服测试日期：日期后面跟着"测试，国际服链接可用"
      const intlMatch = description.match(/(\d{4})-(\d{1,2})-(\d{1,2})测试，国际服链接可用/);
      if (intlMatch) {
        const [, year, month, day] = intlMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return null;
    } else {
      // 不指定服务器类型时，匹配任意测试日期
      const dateMatch = description.match(/(\d{4})-(\d{1,2})-(\d{1,2})测试/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return null;
    }
  };

  /**
   * 检查阵型国服是否过期（超过30天未测试）
   * @param {Object} layout - 阵型数据
   * @returns {boolean} 国服是否过期
   */
  const isChinaExpired = (layout) => {
    const testDate = extractTestDate(layout.description, 'china');
    if (!testDate) return false; // 没有国服测试日期的不算过期
    const now = new Date();
    const diffTime = now - testDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  };

  /**
   * 检查阵型国际服是否过期（超过30天未测试）
   * @param {Object} layout - 阵型数据
   * @returns {boolean} 国际服是否过期
   */
  const isIntlExpired = (layout) => {
    const testDate = extractTestDate(layout.description, 'intl');
    if (!testDate) return false; // 没有国际服测试日期的不算过期
    const now = new Date();
    const diffTime = now - testDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  };

  /**
   * 检查阵型是否未测试（描述中没有任何测试日期）
   * @param {Object} layout - 阵型数据
   * @returns {boolean} 是否未测试
   */
  const isUntested = (layout) => {
    return !extractTestDate(layout.description);
  };

  /**
   * 过滤后的阵型列表
   * 支持多关键字搜索，关键字用空格分隔
   * 每个关键字可以匹配阵型名称、编号、标签或描述
   * 支持排除功能：以 - 开头的关键字表示排除包含该内容的阵型（检查标签和描述）
   * 支持筛选模式：过期、未测试
   */
  const filteredLayouts = useMemo(() => {
    let result = layouts;

    // 先应用搜索过滤
    if (searchQuery.trim()) {
      // 分割搜索关键字，支持空格分隔多个关键字
      const keywords = searchQuery.toLowerCase().trim().split(/\s+/).filter(k => k.length > 0);

      // 分离排除关键字和普通关键字
      const excludeKeywords = keywords.filter(k => k.startsWith('-')).map(k => k.slice(1));
      const searchKeywords = keywords.filter(k => !k.startsWith('-'));

      result = result.filter(layout => {
        // 检查排除关键字：如果阵型的标签或描述包含任何排除关键字，则过滤掉
        if (excludeKeywords.length > 0) {
          // 检查标签
          const hasExcludedTag = layout.tags && excludeKeywords.some(excludeKeyword =>
            layout.tags.some(tag => tag.toLowerCase().includes(excludeKeyword))
          );
          // 检查描述
          const hasExcludedDescription = layout.description && excludeKeywords.some(excludeKeyword =>
            layout.description.toLowerCase().includes(excludeKeyword)
          );
          if (hasExcludedTag || hasExcludedDescription) return false;
        }

        // 检查普通关键字：所有关键字都必须匹配（AND逻辑）
        if (searchKeywords.length > 0) {
          return searchKeywords.every(keyword => {
            const matchTitle = layout.title && layout.title.toLowerCase().includes(keyword);
            const matchId = layout.id && layout.id.toString().includes(keyword);
            const matchTags = layout.tags && layout.tags.some(tag => tag.toLowerCase().includes(keyword));
            const matchDescription = layout.description && layout.description.toLowerCase().includes(keyword);
            return matchTitle || matchId || matchTags || matchDescription;
          });
        }

        return true;
      });
    }

    // 再应用筛选模式过滤
    if (filterMode === 'chinaExpired') {
      result = result.filter(isChinaExpired);
    } else if (filterMode === 'intlExpired') {
      result = result.filter(isIntlExpired);
    } else if (filterMode === 'untested') {
      result = result.filter(isUntested);
    }

    return result;
  }, [layouts, searchQuery, filterMode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {editingLayout ? '编辑阵型' : '管理阵型'}
            </h1>
            <p className="text-gray-600 mt-1">
              仅在本地开发环境可用。修改后请手动执行 git push 部署。
            </p>
          </div>
          <div className="flex gap-3">
            {!editingLayout && (
              <>
                <KeypointIndexGenerator />
                <button
                  onClick={goToHome}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  查看展示页
                </button>
              </>
            )}
            {editingLayout && (
              <button
                onClick={cancelEdit}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                取消编辑
              </button>
            )}
          </div>
        </div>
        
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <LayoutForm 
              key={editingLayout?.id || 'add'}
              onSubmit={handleSubmit} 
              initialData={editingLayout}
              onDelete={handleDelete}
            />
          </div>
          
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              已有阵型 ({filteredLayouts.length}/{layouts.length})
              {filterMode === 'chinaExpired' && <span className="ml-2 text-sm text-red-600">[已筛选: 国服过期]</span>}
              {filterMode === 'intlExpired' && <span className="ml-2 text-sm text-red-600">[已筛选: 国际服过期]</span>}
              {filterMode === 'untested' && <span className="ml-2 text-sm text-orange-600">[已筛选: 未测试阵型]</span>}
            </h2>
            
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索名称/编号/标签/描述（空格分隔多个关键字，-关键字排除包含该内容的阵型）..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={toggleRandomMode}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isRandomMode
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {isRandomMode ? '退出随机' : '随机展示'}
              </button>
            </div>

            {/* 筛选按钮组 */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setFilterMode(filterMode === 'chinaExpired' ? 'none' : 'chinaExpired')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  filterMode === 'chinaExpired'
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
                title="筛选国服超过30天未测试的阵型"
              >
                {filterMode === 'chinaExpired' ? '✓ 国服过期' : '国服过期'}
              </button>
              <button
                onClick={() => setFilterMode(filterMode === 'intlExpired' ? 'none' : 'intlExpired')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  filterMode === 'intlExpired'
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
                title="筛选国际服超过30天未测试的阵型"
              >
                {filterMode === 'intlExpired' ? '✓ 国际服过期' : '国际服过期'}
              </button>
              <button
                onClick={() => setFilterMode(filterMode === 'untested' ? 'none' : 'untested')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  filterMode === 'untested'
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
                title="筛选未测试的阵型（描述中无测试日期）"
              >
                {filterMode === 'untested' ? '✓ 未测试' : '未测试'}
              </button>
              {(filterMode !== 'none' || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterMode('none');
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  清除筛选
                </button>
              )}
            </div>
            
            {isRandomMode && randomLayout ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <img
                      src={getImagePath(randomLayout.image)}
                      alt={randomLayout.title || '阵型'}
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => setViewerImage(getImagePath(randomLayout.image))}
                      className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 hover:bg-black/80 text-white text-xs rounded transition-colors flex items-center gap-1"
                      title="全屏查看"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      全屏
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-800 text-lg">
                      {randomLayout.title || '无标题'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-2">
                      {randomLayout.tags.join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      ID: {randomLayout.id}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(randomLayout)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex-shrink-0"
                  >
                    编辑
                  </button>
                </div>
                <button
                  onClick={selectRandomLayout}
                  className="mt-4 w-full px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  换一个
                </button>
              </div>
            ) : filteredLayouts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                {searchQuery ? '没有找到匹配的阵型' : '暂无阵型数据'}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow divide-y max-h-[500px] overflow-y-auto">
                {filteredLayouts.map(layout => (
                  <div
                    key={layout.id}
                    className={`p-4 flex items-start gap-4 ${
                      editingLayout?.id === layout.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        src={getImagePath(layout.image)}
                        alt={layout.title || '阵型'}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => setViewerImage(getImagePath(layout.image))}
                        className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 hover:bg-black/80 text-white text-xs rounded transition-colors"
                        title="全屏查看"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-800 truncate">
                        {layout.title || '无标题'}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {layout.tags.slice(0, 3).join(', ')}
                        {layout.tags.length > 3 && ` +${layout.tags.length - 3}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        ID: {layout.id}
                      </p>
                    </div>
                    <button
                      onClick={() => startEdit(layout)}
                      className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors flex-shrink-0"
                    >
                      编辑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 图片查看器 */}
      <ImageViewer
        imageUrl={viewerImage}
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
      />
    </div>
  );
}

export default Admin;
