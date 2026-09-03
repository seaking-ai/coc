/**
 * 文件夹批量上传组件
 * 功能：支持上传整个文件夹，自动匹配同名txt文件读取国服/国际服链接，批量处理阵型图片
 * 特性：每张图片自动进行法术塔检测并匹配标签，支持全屏查看
 * 
 * @param {Function} onSubmit - 提交回调函数，接收FormData数组
 * @param {Function} onClose - 关闭回调函数
 */

import { useState, useRef, useCallback } from 'react';
import { useTags } from '../../hooks/useTags';

/**
 * 判断是否为链接行：http URL 或 国服TH纯文本格式（如 TH18:WB:...）
 * @param {string} line - 文本行
 * @returns {boolean} 是否为链接
 */
const isLinkLine = (line) => {
  if (!line) return false;
  if (line.startsWith('http')) return true;
  return /^TH\d+:[A-Za-z0-9_+\-/=:]+$/.test(line);
};

/**
 * 去除行尾附带的"国服"/"国际服"标签
 * @param {string} line - 原始行
 * @returns {string} 纯净链接
 */
const cleanLinkLabel = (line) => {
  return line.replace(/(国际服|国服)\s*$/, '').trim();
};

/**
 * 解析txt文件内容，提取国服和国际服链接
 * 国服链接支持两种格式：http/https URL 或 国服TH纯文本（如 TH18:WB:...）
 * 支持"国服[N]/国际服"标签结构
 * @param {string} content - txt文件内容
 * @returns {Object} 包含chinaLink和internationalLink的对象
 */
const parseLinksFromTxt = (content) => {
  if (!content) return { chinaLink: '', internationalLink: '' };

  const lines = content.trim().split('\n').map(line => line.trim()).filter(line => line);

  let chinaLink = '';
  let internationalLink = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];

    // "国服[N]" 标签行：下一行是国服链接
    if (/^国服\s*\d*$/.test(line) && isLinkLine(next)) {
      chinaLink = cleanLinkLabel(next);
      i += 1;
    } else if (/^国际服/.test(line) && isLinkLine(next)) {
      // "国际服" 标签行：下一行是国际服链接
      internationalLink = cleanLinkLabel(next);
      i += 1;
    } else if (line.includes('/cn?') || line.includes('link.clashofclans.com/cn') || /^TH\d+:/.test(line)) {
      // 国服链接：http(cn) 或 TH纯文本
      chinaLink = cleanLinkLabel(line);
    } else if (line.includes('/en?') || line.includes('/en/?') || line.includes('link.clashofclans.com/en')) {
      internationalLink = cleanLinkLabel(line);
    }
  }

  // 兜底：无标识时按行顺序分配
  if (!chinaLink && !internationalLink && lines.length >= 1) {
    chinaLink = lines[0];
    if (lines.length >= 2) {
      internationalLink = lines[1];
    }
  }

  return { chinaLink, internationalLink };
};

/**
 * 检查文件是否为图片
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为图片
 */
const isImageFile = (file) => {
  return file && file.type.startsWith('image/');
};

/**
 * 获取文件扩展名
 * @param {string} fileName - 文件名
 * @returns {string} 扩展名（不含点）
 */
const getFileExtension = (fileName) => {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.substring(lastDotIndex + 1).toLowerCase() : '';
};

/**
 * 获取不含扩展名的文件名
 * @param {string} fileName - 文件名
 * @returns {string} 不含扩展名的文件名
 */
const getFileNameWithoutExtension = (fileName) => {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
};

/**
 * 全屏图片查看组件
 * @param {string} imageUrl - 图片URL
 * @param {boolean} isOpen - 是否打开
 * @param {Function} onClose - 关闭回调
 */
function ImageViewer({ imageUrl, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-zoom-out"
      onClick={onClose}
    >
      {/* 图片容器 - 使用 vw/vh 单位确保占满视口 */}
      <div className="relative w-screen h-screen flex items-center justify-center">
        <img 
          src={imageUrl} 
          alt="全图查看" 
          className="max-w-[95vw] max-h-[95vh] object-contain"
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

/**
 * 法术塔检测警告组件
 * @param {Object} warning - 警告信息对象
 */
function SpellTowerWarning({ warning }) {
  if (!warning) return null;
  
  return (
    <div className={`mt-2 p-2 rounded text-xs ${
      warning.type === 'error' 
        ? 'bg-red-50 text-red-700 border border-red-200'
        : warning.type === 'warning'
        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
        : 'bg-green-50 text-green-700 border border-green-200'
    }`}>
      <div className="flex items-start gap-1.5">
        {warning.type === 'error' ? (
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : warning.type === 'warning' ? (
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <span>{warning.message}</span>
      </div>
    </div>
  );
}

/**
 * 批量项目卡片组件
 * @param {Object} item - 批量项目数据
 * @param {number} index - 索引
 * @param {Function} onUpdate - 更新回调
 * @param {Function} onRemove - 删除回调
 * @param {Function} onViewImage - 查看图片回调
 * @param {Function} onApplyToAll - 应用到所有回调
 * @param {number} totalCount - 总数量
 * @param {Array} categories - 标签分类
 * @param {Function} getTagsByCategoryId - 获取分类标签函数
 */
function BatchItemCard({ item, index, onUpdate, onRemove, onViewImage, onApplyToAll, totalCount, categories, getTagsByCategoryId }) {
  const [isExpanded, setIsExpanded] = useState(index === 0);
  
  /**
   * 处理标签切换
   * @param {string} tagName - 标签名称
   * @param {string} categoryType - 分类类型
   * @param {Array} categoryTags - 该分类下的所有标签名称
   */
  const handleTagToggle = (tagName, categoryType, categoryTags) => {
    const currentTags = item.tags || [];
    
    // 如果标签已选中，则取消选择
    if (currentTags.includes(tagName)) {
      const newTags = currentTags.filter(t => t !== tagName);
      onUpdate(index, { ...item, tags: newTags });
      return;
    }
    
    // 单选类型：先移除该分类下所有已选标签，再添加新标签
    if (categoryType === 'single') {
      const otherTagsInCategory = categoryTags.filter(t => t !== tagName);
      const newTags = currentTags.filter(t => !otherTagsInCategory.includes(t));
      newTags.push(tagName);
      onUpdate(index, { ...item, tags: newTags });
      return;
    }
    
    // 多选类型：直接添加
    const newTags = [...currentTags, tagName];
    onUpdate(index, { ...item, tags: newTags });
  };

  const shouldShowCategory = (category) => {
    const tags = item.tags || [];
    if (category.parentCategory && category.parentTag) {
      return tags.includes(category.parentTag);
    }
    if (category.parentConditions && Array.isArray(category.parentConditions)) {
      return category.parentConditions.every(condition => tags.includes(condition.tagName));
    }
    return true;
  };

  const renderCategoryGroup = (category) => {
    if (!shouldShowCategory(category)) return null;

    const categoryTags = getTagsByCategoryId(category.id);
    const itemTags = item.tags || [];
    const selectedInCategory = itemTags.filter(t => categoryTags.map(ct => ct.name).includes(t));
    const isLimited = category.type === 'limited';
    const isMaxReached = isLimited && selectedInCategory.length >= (category.maxSelect || 2);

    return (
      <div key={category.id} className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-600">{category.name}</span>
          {category.type === 'single' && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">单选</span>
          )}
          {isLimited && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${isMaxReached ? 'text-orange-600 bg-orange-50' : 'text-purple-600 bg-purple-50'}`}>
              最多{category.maxSelect}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categoryTags.map(tag => {
            const isSelected = itemTags.includes(tag.name);
            const isDisabled = isLimited && !isSelected && isMaxReached;
            const categoryTagNames = categoryTags.map(t => t.name);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => !isDisabled && handleTagToggle(tag.name, category.type, categoryTagNames)}
                disabled={isDisabled}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : isDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* 头部 - 始终显示 */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 图片预览区域 */}
        <div className="relative flex-shrink-0">
          <img 
            src={item.preview} 
            alt={item.title} 
            className="w-16 h-16 object-cover rounded"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewImage(item.preview);
            }}
            className="absolute bottom-0.5 right-0.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded transition-colors"
            title="全屏查看"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={item.title}
            onChange={(e) => onUpdate(index, { ...item, title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-sm font-medium text-gray-800 border-none focus:ring-0 p-0 bg-transparent"
            placeholder="标题"
          />
          
          {/* 标签展示 */}
          <p className="text-xs text-gray-500 mt-1 truncate">
            {(item.tags || []).slice(0, 5).join(', ')}
            {(item.tags || []).length > 5 && ` +${(item.tags || []).length - 5}`}
          </p>

          {/* 检测状态 */}
          <div className="flex items-center gap-2 mt-1">
            {item.isDetecting ? (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                检测中...
              </span>
            ) : item.spellTowerWarning ? (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                item.spellTowerWarning.type === 'error' ? 'bg-red-100 text-red-600' :
                item.spellTowerWarning.type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                'bg-green-100 text-green-600'
              }`}>
                {item.spellTowerWarning.type === 'success' ? '检测完成' : 
                 item.spellTowerWarning.type === 'warning' ? '检测警告' : '检测失败'}
              </span>
            ) : null}
          </div>

          {/* 链接状态 */}
          <div className="flex gap-2 mt-1 text-xs">
            {item.chinaLink && (
              <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">国服✓</span>
            )}
            {item.internationalLink && (
              <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">国际服✓</span>
            )}
            {!item.chinaLink && !item.internationalLink && (
              <span className="text-red-500 bg-red-50 px-1.5 py-0.5 rounded">无链接</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
            title="删除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <svg 
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {/* 法术塔检测警告（展开时显示详细信息） */}
          {item.spellTowerWarning && <SpellTowerWarning warning={item.spellTowerWarning} />}

          {/* 链接输入 */}
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-gray-600">国服链接</label>
              <input
                type="text"
                value={item.chinaLink}
                onChange={(e) => onUpdate(index, { ...item, chinaLink: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://... 或 TH18:WB:..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">国际服链接</label>
              <input
                type="url"
                value={item.internationalLink}
                onChange={(e) => onUpdate(index, { ...item, internationalLink: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://link.clashofclans.com/en..."
              />
            </div>
          </div>

          {/* 标签选择 */}
          <div>
            <label className="text-xs text-gray-600 mb-2 block">标签选择</label>
            <div className="max-h-60 overflow-y-auto">
              {categories.map(category => renderCategoryGroup(category))}
            </div>
          </div>

          {/* 应用到所有按钮（仅在第一个item显示） */}
          {index === 0 && totalCount > 1 && onApplyToAll && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-700 font-medium">应用到所有阵型</p>
                  <p className="text-xs text-purple-600 mt-0.5">
                    将此阵型的精致台期数、防御武器、描述同步到其他 {totalCount - 1} 个阵型
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onApplyToAll(index)}
                  className="px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  同步到其他阵型
                </button>
              </div>
            </div>
          )}

          {/* 描述 */}
          <div>
            <label className="text-xs text-gray-600 mb-2 block">描述</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  const textToAdd = '源自：b站coc星辉';
                  const newDesc = item.description ? `${item.description}\n${textToAdd}` : textToAdd;
                  onUpdate(index, { ...item, description: newDesc });
                }}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
              >
                源自：b站coc星辉
              </button>
              <button
                type="button"
                onClick={() => {
                  const textToAdd = '源自：b站部落冲突XO';
                  const newDesc = item.description ? `${item.description}\n${textToAdd}` : textToAdd;
                  onUpdate(index, { ...item, description: newDesc });
                }}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
              >
                源自：b站部落冲突XO
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  const textToAdd = `${dateStr}测试，国服链接可用`;
                  const newDesc = item.description ? `${item.description}\n${textToAdd}` : textToAdd;
                  onUpdate(index, { ...item, description: newDesc });
                }}
                className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100 transition-colors"
              >
                {`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}测试，国服链接可用`}
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  const textToAdd = `${dateStr}测试，国际服链接可用`;
                  const newDesc = item.description ? `${item.description}\n${textToAdd}` : textToAdd;
                  onUpdate(index, { ...item, description: newDesc });
                }}
                className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100 transition-colors"
              >
                {`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}测试，国际服链接可用`}
              </button>
            </div>
            <textarea
              value={item.description || ''}
              onChange={(e) => onUpdate(index, { ...item, description: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="描述信息..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FolderUpload({ onSubmit, onClose }) {
  const { categories, getTagsByCategoryId } = useTags();
  const folderInputRef = useRef(null);
  
  const [items, setItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessing, setCurrentProcessing] = useState('');
  const [message, setMessage] = useState(null);
  const [viewerImage, setViewerImage] = useState(null);

  /**
   * 执行法术塔检测
   * @param {File} imageFile - 图片文件
   * @param {Array} existingTags - 现有标签
   * @returns {Promise<Object>} 检测结果
   */
  const detectSpellTowers = async (imageFile, existingTags = []) => {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      
      const response = await fetch('http://localhost:3001/api/detect-spell-towers', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        const detectedTowers = result.data.detected || [];
        const detections = result.data.detections || [];
        
        // 分离法术塔和大本等级
        const spellTowerNames = ['狂暴塔', '毒药塔', '隐身塔'];
        const townHallNames = ['11级大本营', '12级大本营', '13级大本营', '14级大本营', 
                               '15级大本营', '16级大本营', '17级大本营', '18级大本营',
                               '19级大本营', '20级大本营'];
        
        // 大本等级名称映射
        const townHallNameMap = {
          '11级大本营': '11本',
          '12级大本营': '12本',
          '13级大本营': '13本',
          '14级大本营': '14本',
          '15级大本营': '15本',
          '16级大本营': '16本',
          '17级大本营': '17本',
          '18级大本营': '18本',
          '19级大本营': '19本',
          '20级大本营': '20本'
        };
        
        const detectedSpellTowers = detectedTowers.filter(name => spellTowerNames.includes(name));
        const detectedTownHalls = detectedTowers.filter(name => townHallNames.includes(name));

        // 构建最终标签
        let finalTags = [...existingTags];

        if (detectedTowers.length > 0) {
          // 移除已有的法术塔标签
          finalTags = finalTags.filter(tag => !spellTowerNames.includes(tag));

          // 处理大本等级标签
          const convertedTownHalls = detectedTownHalls.map(name => townHallNameMap[name] || name);
          if (convertedTownHalls.length > 0) {
            finalTags = finalTags.filter(tag => !Object.values(townHallNameMap).includes(tag));
            finalTags = [...finalTags, ...convertedTownHalls];
          }
          
          // 添加检测到的法术塔标签
          finalTags = [...finalTags, ...detectedSpellTowers];
        }
        
        // 构建提示消息
        let messageParts = [];
        
        if (detectedSpellTowers.length === 0) {
          messageParts.push('未检测到法术塔');
        } else if (detectedSpellTowers.length === 1) {
          messageParts.push(`检测到1个法术塔（${detectedSpellTowers[0]}）`);
        } else {
          messageParts.push(`检测到 ${detectedSpellTowers.length} 个法术塔：${detectedSpellTowers.join('、')}`);
        }
        
        if (detectedTownHalls.length === 0) {
          messageParts.push('未检测到大本等级');
        } else if (detectedTownHalls.length === 1) {
          const tagName = townHallNameMap[detectedTownHalls[0]] || detectedTownHalls[0];
          messageParts.push(`检测到大本等级：${tagName}`);
        } else {
          const townHallDetections = detections.filter(d => townHallNames.includes(d.type));
          const bestTownHall = townHallDetections.sort((a, b) => b.confidence - a.confidence)[0];
          const tagName = townHallNameMap[bestTownHall?.type] || bestTownHall?.type || detectedTownHalls[0];
          messageParts.push(`检测到大本等级：${tagName}（取最高置信度）`);
        }
        
        let warningType = 'success';
        if (detectedSpellTowers.length === 0 && detectedTownHalls.length === 0) {
          warningType = 'error';
        } else if (detectedSpellTowers.length < 2 || detectedTownHalls.length === 0) {
          warningType = 'warning';
        }
        
        return {
          success: true,
          tags: [...new Set(finalTags)],
          warning: {
            type: warningType,
            message: messageParts.join('；')
          }
        };
      } else {
        return {
          success: false,
          tags: existingTags,
          warning: {
            type: 'error',
            message: `检测失败：${result.message || '未知错误'}`
          }
        };
      }
    } catch (error) {
      console.error('法术塔检测失败:', error);
      return {
        success: false,
        tags: existingTags,
        warning: {
          type: 'error',
          message: `检测失败：${error.message}`
        }
      };
    }
  };

  /**
   * 处理文件夹选择
   * @param {Event} e - 文件选择事件
   */
  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsProcessing(true);
    setCurrentProcessing('正在扫描文件夹...');
    setMessage(null);

    try {
      // 分离图片和txt文件
      const imageFiles = [];
      const txtFiles = new Map();

      files.forEach(file => {
        const ext = getFileExtension(file.name);
        if (isImageFile(file)) {
          imageFiles.push(file);
        } else if (ext === 'txt') {
          const baseName = getFileNameWithoutExtension(file.name);
          txtFiles.set(baseName, file);
        }
      });

      if (imageFiles.length === 0) {
        setMessage({ type: 'error', text: '未找到图片文件' });
        setIsProcessing(false);
        return;
      }

      // 处理每个图片文件
      const processedItems = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        setCurrentProcessing(`正在处理: ${imageFile.name} (${i + 1}/${imageFiles.length})`);

        const baseName = getFileNameWithoutExtension(imageFile.name);
        const txtFile = txtFiles.get(baseName);

        // 读取txt文件内容
        let chinaLink = '';
        let internationalLink = '';
        
        if (txtFile) {
          try {
            const content = await txtFile.text();
            const links = parseLinksFromTxt(content);
            chinaLink = links.chinaLink;
            internationalLink = links.internationalLink;
          } catch (err) {
            console.error(`读取txt文件失败: ${txtFile.name}`, err);
          }
        }

        // 创建预览
        const preview = URL.createObjectURL(imageFile);

        // 基础标签
        let autoTags = ['冲杯'];
        if (chinaLink) autoTags.push('国服');
        if (internationalLink) autoTags.push('国际服');

        processedItems.push({
          id: `${Date.now()}_${i}`,
          imageFile,
          title: baseName,
          preview,
          chinaLink,
          internationalLink,
          tags: autoTags,
          description: '',
          txtFound: !!txtFile,
          isDetecting: true,
          spellTowerWarning: null
        });
      }

      setItems(processedItems);
      setMessage({ 
        type: 'success', 
        text: `成功读取 ${imageFiles.length} 张图片，${txtFiles.size} 个txt文件，正在进行法术塔检测...` 
      });

      // 逐个进行法术塔检测
      for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        setCurrentProcessing(`正在检测法术塔: ${item.title} (${i + 1}/${processedItems.length})`);
        
        const detectionResult = await detectSpellTowers(item.imageFile, item.tags);
        
        // 更新项目状态
        setItems(prev => {
          const newItems = [...prev];
          if (newItems[i]) {
            newItems[i] = {
              ...newItems[i],
              tags: detectionResult.tags,
              isDetecting: false,
              spellTowerWarning: detectionResult.warning
            };
          }
          return newItems;
        });
      }

      setMessage({ 
        type: 'success', 
        text: `完成！共处理 ${imageFiles.length} 张图片，法术塔检测完成` 
      });
    } catch (error) {
      console.error('处理文件夹失败:', error);
      setMessage({ type: 'error', text: `处理失败: ${error.message}` });
    } finally {
      setIsProcessing(false);
      setCurrentProcessing('');
    }
  };

  /**
   * 更新单个项目
   * @param {number} index - 索引
   * @param {Object} updatedItem - 更新后的项目
   */
  const updateItem = useCallback((index, updatedItem) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = updatedItem;
      return newItems;
    });
  }, []);

  /**
   * 删除单个项目
   * @param {number} index - 索引
   */
  const removeItem = useCallback((index) => {
    setItems(prev => {
      const item = prev[index];
      if (item.preview) {
        URL.revokeObjectURL(item.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  /**
   * 批量应用描述到所有项目
   * @param {string} description - 描述
   */
  const applyDescriptionToAll = (description) => {
    setItems(prev => prev.map(item => ({
      ...item,
      description: item.description ? `${item.description}\n${description}` : description
    })));
  };

  /**
   * 将第一个项目的标签和描述应用到所有其他项目
   * @param {number} sourceIndex - 源项目索引（通常为0）
   */
  const applyFirstItemToAll = (sourceIndex) => {
    const sourceItem = items[sourceIndex];
    if (!sourceItem) return;

    // 获取源项目的标签
    const sourceTags = sourceItem.tags || [];

    // 要同步的标签集合
    const tagsToSync = new Set();

    // 1. 同步精致台相关标签（期数及对应的防御武器）
    // 同步精致台期数（第一期/第二期/第三期）
    const phaseTags = ['第一期', '第二期', '第三期'];
    phaseTags.forEach(tag => {
      if (sourceTags.includes(tag)) {
        tagsToSync.add(tag);
      }
    });

    // 同步对应的防御武器
    // 根据期数确定对应的防御武器分类
    const phaseToWeapons = {
      '第一期': ['weapons-phase1'],
      '第二期': ['weapons-phase2'],
      '第三期': ['weapons-phase3']
    };

    phaseTags.forEach(phaseTag => {
      if (sourceTags.includes(phaseTag)) {
        const weaponCatIds = phaseToWeapons[phaseTag] || [];
        weaponCatIds.forEach(catId => {
          const weaponTags = getTagsByCategoryId(catId).map(t => t.name);
          weaponTags.forEach(tagName => {
            if (sourceTags.includes(tagName)) {
              tagsToSync.add(tagName);
            }
          });
        });
      }
    });

    // 应用到所有其他项目
    setItems(prev => prev.map((item, idx) => {
      if (idx === sourceIndex) return item; // 跳过源项目

      // 合并标签：保留原有标签 + 添加同步的标签
      const newTags = [...new Set([...item.tags, ...tagsToSync])];

      return {
        ...item,
        tags: newTags,
        description: sourceItem.description || item.description
      };
    }));

    setMessage({ 
      type: 'success', 
      text: `已将"${sourceItem.title}"的精致台设置和描述应用到其他 ${items.length - 1} 个阵型` 
    });
  };

  /**
   * 处理批量提交
   */
  const handleBatchSubmit = async () => {
    if (items.length === 0) return;

    // 验证必填项
    const invalidItems = items.filter(item => !item.chinaLink && !item.internationalLink);
    if (invalidItems.length > 0) {
      setMessage({ 
        type: 'error', 
        text: `有 ${invalidItems.length} 个阵型缺少国服和国际服链接` 
      });
      return;
    }

    setIsProcessing(true);
    setCurrentProcessing('正在保存...');

    try {
      const results = [];
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setCurrentProcessing(`正在保存: ${item.title} (${i + 1}/${items.length})`);

        const formData = new FormData();
        formData.append('image', item.imageFile);
        formData.append('title', item.title);
        formData.append('chinaLink', item.chinaLink);
        formData.append('internationalLink', item.internationalLink);
        formData.append('description', item.description);
        formData.append('tags', JSON.stringify(item.tags));

        const response = await fetch('http://localhost:3001/api/add-layout', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        results.push({ item, success: result.success, message: result.message });
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      if (failCount === 0) {
        setMessage({ type: 'success', text: `成功保存 ${successCount} 个阵型！` });
        setTimeout(() => {
          items.forEach(item => {
            if (item.preview) URL.revokeObjectURL(item.preview);
          });
          onClose();
        }, 1500);
      } else {
        setMessage({ 
          type: 'warning', 
          text: `保存完成：成功 ${successCount} 个，失败 ${failCount} 个` 
        });
      }
    } catch (error) {
      console.error('批量保存失败:', error);
      setMessage({ type: 'error', text: `保存失败: ${error.message}` });
    } finally {
      setIsProcessing(false);
      setCurrentProcessing('');
    }
  };

  /**
   * 清空所有项目
   */
  const clearAll = () => {
    items.forEach(item => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
    setItems([]);
    setMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">文件夹批量上传</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 上传区域或批量编辑区域 */}
          {items.length === 0 ? (
            <div className="flex-1 p-8 flex flex-col items-center justify-center">
              <div 
                onClick={() => folderInputRef.current?.click()}
                className="w-full max-w-md border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-700 mb-2">选择文件夹</h3>
                <p className="text-sm text-gray-500 mb-4">
                  选择包含图片和同名txt文件的文件夹<br/>
                  txt文件格式：第一行国服链接，第二行国际服链接
                </p>
                <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                  浏览文件夹
                </button>
              </div>
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* 批量操作栏 */}
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">
                    共 {items.length} 个阵型
                    {items.some(i => i.isDetecting) && (
                      <span className="ml-2 text-blue-600">（法术塔检测中...）</span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={clearAll}
                      className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      清空全部
                    </button>
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      重新选择
                    </button>
                  </div>
                </div>
                
                {/* 快速操作 */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => applyDescriptionToAll('源自：b站coc星辉')}
                    className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    + 源自：b站coc星辉
                  </button>
                  <button
                    onClick={() => applyDescriptionToAll('源自：b站部落冲突XO')}
                    className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    + 源自：b站部落冲突XO
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                      applyDescriptionToAll(`${dateStr}测试，国服链接可用`);
                    }}
                    className="px-3 py-1 text-xs bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100 transition-colors"
                  >
                    + 今日国服测试
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                      applyDescriptionToAll(`${dateStr}测试，国际服链接可用`);
                    }}
                    className="px-3 py-1 text-xs bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100 transition-colors"
                  >
                    + 今日国际服测试
                  </button>
                </div>
              </div>

              {/* 项目列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((item, index) => (
                  <BatchItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                    onViewImage={setViewerImage}
                    onApplyToAll={applyFirstItemToAll}
                    totalCount={items.length}
                    categories={categories}
                    getTagsByCategoryId={getTagsByCategoryId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 消息提示 */}
          {message && (
            <div className={`px-4 py-3 border-t ${
              message.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : message.type === 'warning'
                ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* 处理状态 */}
          {isProcessing && (
            <div className="px-4 py-3 border-t bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 text-blue-700">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm">{currentProcessing}</span>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        {items.length > 0 && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isProcessing}
            >
              取消
            </button>
            <button
              onClick={handleBatchSubmit}
              disabled={isProcessing || items.length === 0 || items.some(i => i.isDetecting)}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? '保存中...' : `保存全部 (${items.length})`}
            </button>
          </div>
        )}

        {/* 隐藏的文件夹输入 */}
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderSelect}
          className="hidden"
        />

      </div>

      {/* 全屏图片查看器 - 移到最外层，避免被父容器限制 */}
      <ImageViewer
        imageUrl={viewerImage}
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
      />
    </div>
  );
}

export default FolderUpload;
