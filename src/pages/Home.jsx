/**
 * 展示端首页
 * 功能：瀑布流展示阵型，支持搜索和标签筛选，随机展示
 * 使用统一的标签配置系统，支持分类筛选和单选/多选模式
 * 布局：左侧标签选择侧边栏 + 主展示区域
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MasonryGrid from '../components/display/MasonryGrid';
import SearchBar from '../components/display/SearchBar';
import TagFilter from '../components/display/TagFilter';
import { ImageSearch } from '../components/search/ImageSearch';
import { useTags } from '../hooks/useTags';

function Home() {
  const navigate = useNavigate();
  const { categories, getTagsByCategoryId } = useTags();
  
  const [layouts, setLayouts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clickCount, setClickCount] = useState(0);
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [randomLayouts, setRandomLayouts] = useState([]);
  const [recentlyShownIds, setRecentlyShownIds] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
  const randomCountRef = useRef(6);

  /**
   * 加载阵型数据
   */
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data.json`)
      .then(res => res.json())
      .then(data => {
        setLayouts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('加载数据失败:', err);
        setLoading(false);
      });
  }, []);

  /**
   * 点击计数器重置（2秒无操作重置）
   */
  useEffect(() => {
    if (clickCount > 0) {
      const timer = setTimeout(() => setClickCount(0), 2000);
      return () => clearTimeout(timer);
    }
  }, [clickCount]);

  /**
   * 处理标题点击，连续点击5次进入管理界面
   */
  const handleTitleClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        navigate('/admin');
        return 0;
      }
      return newCount;
    });
  };

  /**
   * 获取指定分类的已选标签
   * @param {string} categoryId - 分类ID
   * @returns {Array} 该分类下已选中的标签名称数组
   */
  const getSelectedTagsByCategory = (categoryId) => {
    const categoryTagNames = getTagsByCategoryId(categoryId).map(t => t.name);
    return selectedTags.filter(tag => categoryTagNames.includes(tag));
  };

  /**
   * 生成随机展示的阵型列表（Fisher-Yates洗牌算法）
   * @param {Array} sourceLayouts - 源阵型数组
   * @param {number} count - 需要展示的数量
   * @param {boolean} updateHistory - 是否更新历史记录（避免在渲染时调用setState）
   * @returns {Array} 随机阵型数组
   */
  const generateRandomLayouts = (sourceLayouts, count, updateHistory = true) => {
    if (sourceLayouts.length === 0) return [];
    
    const availableLayouts = sourceLayouts.filter(
      layout => !recentlyShownIds.includes(layout.id)
    );
    
    const layoutsToShuffle = availableLayouts.length < count 
      ? sourceLayouts 
      : availableLayouts;
    
    const shuffled = [...layoutsToShuffle];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    const result = shuffled.slice(0, count);
    
    // 只在非渲染时更新历史记录
    if (updateHistory) {
      setRecentlyShownIds(prev => {
        const newIds = result.map(layout => layout.id);
        const combined = [...prev, ...newIds];
        return combined.slice(-50);
      });
    }
    
    return result;
  };

  /**
   * 切换随机模式
   */
  const toggleRandomMode = () => {
    setIsRandomMode(prev => !prev);
    if (!isRandomMode) {
      const source = filteredLayouts.length > 0 ? filteredLayouts : layouts;
      const random = generateRandomLayouts(source, randomCountRef.current);
      setRandomLayouts(random);
    }
  };

  /**
   * 换一批随机阵型
   */
  const refreshRandom = () => {
    const source = filteredLayouts.length > 0 ? filteredLayouts : layouts;
    const random = generateRandomLayouts(source, randomCountRef.current);
    setRandomLayouts(random);
  };

  /**
   * 筛选逻辑：支持单选、多选、限制数量多选标签的组合筛选
   * 法术塔类型使用精确匹配：阵型的法术塔标签必须与选择的完全一致
   * 搜索支持多关键字（空格分隔），可匹配标题和标签
   */
  const filteredLayouts = useMemo(() => {
    // 解析搜索关键字（空格分隔）
    const searchKeywords = searchQuery
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(k => k.length > 0);

    return layouts.filter(layout => {
      // 搜索匹配：支持多关键字，匹配标题或标签
      let matchSearch = true;
      if (searchKeywords.length > 0) {
        const searchContent = [
          layout.title || '',
          ...(layout.tags || [])
        ].join(' ').toLowerCase();
        
        // 所有关键字都必须匹配（AND逻辑）
        matchSearch = searchKeywords.every(keyword => 
          searchContent.includes(keyword)
        );
      }
      
      let matchTags = true;
      
      if (selectedTags.length > 0) {
        // 按分类检查标签匹配
        for (const category of categories) {
          const categoryTagNames = getTagsByCategoryId(category.id).map(t => t.name);
          const selectedInCategory = selectedTags.filter(t => categoryTagNames.includes(t));
          
          if (selectedInCategory.length > 0) {
            if (category.type === 'single') {
              // 单选分类：必须包含该标签
              if (!layout.tags.includes(selectedInCategory[0])) {
                matchTags = false;
                break;
              }
            } else if (category.id === 'spell-tower') {
              // 法术塔类型：精确匹配
              // 获取阵型的法术塔标签
              const layoutSpellTowers = layout.tags.filter(tag => categoryTagNames.includes(tag));
              // 选择的法术塔必须与阵型的法术塔完全一致
              const selectedSet = new Set(selectedInCategory);
              const layoutSet = new Set(layoutSpellTowers);
              
              if (selectedSet.size !== layoutSet.size) {
                matchTags = false;
                break;
              }
              
              for (const tag of selectedSet) {
                if (!layoutSet.has(tag)) {
                  matchTags = false;
                  break;
                }
              }
              
              if (!matchTags) break;
            } else {
              // 其他多选分类：至少包含一个已选标签
              if (!selectedInCategory.some(tag => layout.tags.includes(tag))) {
                matchTags = false;
                break;
              }
            }
          }
        }
      }
      
      return matchSearch && matchTags;
    });
  }, [layouts, searchQuery, selectedTags, categories]);

  const displayLayouts = isRandomMode ? randomLayouts : filteredLayouts;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex">
      <aside className={`fixed inset-y-0 left-0 z-30 w-72 bg-white shadow-xl transform transition-transform duration-200 ease-out will-change-transform ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-5 border-b border-gray-100 bg-blue-50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            标签筛选
          </h2>
        </div>
        <div className="p-5 overflow-y-auto h-[calc(100vh-72px)]" style={{ WebkitOverflowScrolling: 'touch' }}>
          <TagFilter
            selectedTags={selectedTags}
            onChange={setSelectedTags}
            categories={categories}
          />
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-72' : 'ml-0'}`}>
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 py-3">
            {/* 第一行：搜索框 */}
            <div className="mb-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索标题或标签（空格分隔多个关键字）"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2.5 pl-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all shadow-sm"
                />
                <svg className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            
            {/* 第二行：按钮和统计 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all shadow-sm hover:shadow-md flex-shrink-0"
                title={isSidebarOpen ? '收起侧边栏' : '展开侧边栏'}
              >
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isSidebarOpen ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"} />
                </svg>
              </button>

              {/* 图片搜索按钮 */}
              <button
                onClick={() => setIsImageSearchOpen(true)}
                className="h-10 px-3 rounded-xl font-medium bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/30 text-sm flex-shrink-0"
                title="图片搜索阵型"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">图片搜索</span>
                <span className="sm:hidden">搜图</span>
              </button>

              <button
                onClick={toggleRandomMode}
                className={`h-10 px-3 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5 shadow-sm text-sm flex-shrink-0 ${
                  isRandomMode
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-gray-200 hover:to-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">{isRandomMode ? '退出随机' : '随机展示'}</span>
                <span className="sm:hidden">{isRandomMode ? '退出' : '随机'}</span>
              </button>
              
              {isRandomMode && (
                <button
                  onClick={refreshRandom}
                  className="h-10 px-3 rounded-xl font-medium bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-green-500/30 text-sm flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>换一批</span>
                </button>
              )}

              <div className="ml-auto flex items-center gap-2 px-3 h-10 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 shadow-sm flex-shrink-0">
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {filteredLayouts.length === layouts.length ? (
                    <>共 <span className="text-blue-600 font-bold">{layouts.length}</span> 个</>
                  ) : (
                    <><span className="text-blue-600 font-bold">{filteredLayouts.length}</span> / {layouts.length}</>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div
          onClick={() => isSidebarOpen && setIsSidebarOpen(false)}
          className={`fixed inset-0 bg-black/40 z-10 transition-opacity duration-200 lg:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        />

        {/* 图片搜索弹窗 */}
        {isImageSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsImageSearchOpen(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
              {/* 弹窗头部 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">图片搜索阵型</h3>
                    <p className="text-sm text-gray-500">上传阵型截图，AI智能匹配相似布局</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsImageSearchOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* 弹窗内容 */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                <ImageSearch />
              </div>
            </div>
          </div>
        )}
        
        <div className="p-4">
          <h1 
            onClick={handleTitleClick}
            className="text-2xl font-bold text-gray-800 mb-4 cursor-pointer select-none text-center lg:text-left bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"
            title="连续点击5次进入管理界面"
          >
            部落冲突阵型库
          </h1>
          
          {displayLayouts.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-12 border border-gray-200">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500 text-lg">{isRandomMode ? '暂无阵型可展示' : '没有找到匹配的阵型'}</p>
              </div>
            </div>
          ) : (
            <MasonryGrid layouts={displayLayouts} isRandomMode={isRandomMode} />
          )}
        </div>
      </main>
    </div>
  );
}

export default Home;
