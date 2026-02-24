/**
 * 阵型添加/编辑表单组件
 * 使用统一的标签配置系统，支持分类展示和单选/多选/限制数量多选模式
 * 
 * @param {Function} onSubmit - 提交回调函数
 * @param {Array} existingTags - 现有标签列表（向后兼容）
 * @param {Object} initialData - 初始数据（编辑模式时使用）
 * @param {Function} onDelete - 删除回调函数（编辑模式时使用）
 */

import { useState, useRef, useEffect } from 'react';
import { useTags } from '../../hooks/useTags';

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
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-zoom-out"
      onClick={onClose}
    >
      <div className="relative w-full h-full flex items-center justify-center p-4">
        <img 
          src={imageUrl} 
          alt="全图查看" 
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

function LayoutForm({ onSubmit, existingTags = [], initialData = null, onDelete = null }) {
  const { categories, getTagsByCategoryId } = useTags();
  
  const isEditMode = !!initialData;
  
  const [title, setTitle] = useState(initialData?.title || '');
  const [chinaLink, setChinaLink] = useState(initialData?.chinaLink || '');
  const [internationalLink, setInternationalLink] = useState(initialData?.internationalLink || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [tags, setTags] = useState(initialData?.tags || []);
  const [newTag, setNewTag] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(initialData?.image || null);
  const [errors, setErrors] = useState({});
  const [keepFormData, setKeepFormData] = useState(true);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isDetectingSpellTowers, setIsDetectingSpellTowers] = useState(false);
  const [spellTowerWarning, setSpellTowerWarning] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initialData?.image && !preview) {
      setPreview(initialData.image);
    }
  }, [initialData, preview]);

  /**
   * 当切换到编辑模式时，更新表单数据
   * 只在initialData.id变化时更新，避免覆盖用户输入
   */
  useEffect(() => {
    if (initialData?.id) {
      setTitle(initialData.title || '');
      setChinaLink(initialData.chinaLink || '');
      setInternationalLink(initialData.internationalLink || '');
      setDescription(initialData.description || '');
      setTags(initialData.tags || []);
      setPreview(initialData.image || null);
      setErrors({});
    }
  }, [initialData?.id]);

  /**
   * 自动根据链接输入更新服务器类型标签
   * 当国服链接有内容时自动添加'国服'标签，国际服链接有内容时自动添加'国际服'标签
   */
  useEffect(() => {
    setTags(prevTags => {
      const newTags = [...prevTags];
      const hasChinaTag = newTags.includes('国服');
      const hasInternationalTag = newTags.includes('国际服');

      // 处理国服标签
      if (chinaLink && !hasChinaTag) {
        newTags.push('国服');
      } else if (!chinaLink && hasChinaTag) {
        const index = newTags.indexOf('国服');
        if (index > -1) newTags.splice(index, 1);
      }

      // 处理国际服标签
      if (internationalLink && !hasInternationalTag) {
        newTags.push('国际服');
      } else if (!internationalLink && hasInternationalTag) {
        const index = newTags.indexOf('国际服');
        if (index > -1) newTags.splice(index, 1);
      }

      return newTags;
    });
  }, [chinaLink, internationalLink]);

  /**
   * 处理图片选择
   * @param {Event} e - 文件选择事件
   */
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
      
      // 自动检测法术塔
      await detectSpellTowers(file);
    }
  };
  
  /**
   * 自动检测法术塔
   * @param {File} imageFile - 图片文件
   */
  const detectSpellTowers = async (imageFile) => {
    setIsDetectingSpellTowers(true);
    setSpellTowerWarning(null);
    
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
        const count = result.data.count || 0;
        
        // 自动添加检测到的法术塔标签（去重，只保留唯一的法术塔类型）
        if (detectedTowers.length > 0) {
          setTags(prevTags => {
            // 移除已有的法术塔标签
            const spellTowerTags = ['狂暴塔', '毒药塔', '隐身塔'];
            const filteredTags = prevTags.filter(tag => !spellTowerTags.includes(tag));
            
            // 对检测到的法术塔去重（使用Set）
            const uniqueDetectedTowers = [...new Set(detectedTowers)];
            
            // 添加新检测到的法术塔标签
            return [...filteredTags, ...uniqueDetectedTowers];
          });
        }
        
        // 检查检测数量并设置警告
        if (count === 0) {
          setSpellTowerWarning({
            type: 'error',
            message: '未检测到法术塔，请手动选择或检查图片质量'
          });
        } else if (count === 1) {
          setSpellTowerWarning({
            type: 'warning',
            message: `只检测到1个法术塔（${detectedTowers[0]}），请确认是否还有另一个法术塔`
          });
        } else if (count >= 2) {
          setSpellTowerWarning({
            type: 'success',
            message: `成功检测到 ${count} 个法术塔：${detectedTowers.join('、')}`
          });
        }
      } else {
        setSpellTowerWarning({
          type: 'error',
          message: `检测失败：${result.message || '未知错误'}`
        });
      }
    } catch (error) {
      console.error('法术塔检测失败:', error);
      setSpellTowerWarning({
        type: 'error',
        message: `检测失败：${error.message}`
      });
    } finally {
      setIsDetectingSpellTowers(false);
    }
  };

  /**
   * 切换标签选择
   * @param {Object} tag - 标签对象
   * @param {string} categoryType - 分类类型（'single', 'multiple', 'limited'）
   * @param {string} categoryId - 分类ID
   * @param {number} maxSelect - 最大选择数量（仅 limited 类型有效）
   */
  const toggleTag = (tag, categoryType, categoryId, maxSelect) => {
    const tagName = tag.name;
    const categoryTagNames = getTagsByCategoryId(categoryId).map(t => t.name);
    const selectedInCategory = tags.filter(t => categoryTagNames.includes(t));
    
    if (categoryType === 'single') {
      // 单选：选择/取消选择
      if (tags.includes(tagName)) {
        const otherCategoryTags = tags.filter(t => !categoryTagNames.includes(t));
        setTags(otherCategoryTags);
      } else {
        const otherCategoryTags = tags.filter(t => !categoryTagNames.includes(t));
        setTags([...otherCategoryTags, tagName]);
      }
    } else if (categoryType === 'limited') {
      // 限制数量多选：最多选 maxSelect 个
      if (tags.includes(tagName)) {
        // 取消选择
        setTags(tags.filter(t => t !== tagName));
      } else {
        // 检查是否已达到最大选择数量
        if (selectedInCategory.length >= maxSelect) {
          // 已达到上限，不添加新标签
          return;
        }
        setTags([...tags, tagName]);
      }
    } else {
      // 普通多选
      if (tags.includes(tagName)) {
        setTags(tags.filter(t => t !== tagName));
      } else {
        setTags([...tags, tagName]);
      }
    }
  };

  /**
   * 添加自定义标签
   */
  const addCustomTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
    }
    setNewTag('');
  };

  /**
   * 移除标签
   * @param {string} tagToRemove - 要移除的标签
   */
  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  /**
   * 验证表单数据
   * @returns {Object} 验证错误对象
   */
  const validateForm = () => {
    const newErrors = {};
    
    if (!isEditMode && !image && !preview) {
      newErrors.image = '请上传阵型图片';
    }
    
    if (!chinaLink && !internationalLink) {
      newErrors.links = '至少需要提供国服或国际服其中一种链接';
    }
    
    const hasChinaTag = tags.includes('国服');
    const hasInternationalTag = tags.includes('国际服');
    
    if (hasChinaTag && !chinaLink) {
      newErrors.chinaLink = '选择国服标签时必须提供国服阵型链接';
    }
    
    if (hasInternationalTag && !internationalLink) {
      newErrors.internationalLink = '选择国际服标签时必须提供国际服链接';
    }
    
    const urlPattern = /^https?:\/.+/;
    if (chinaLink && !urlPattern.test(chinaLink)) {
      newErrors.chinaLink = newErrors.chinaLink || '国服链接格式不正确，必须以http://或https://开头';
    }
    if (internationalLink && !urlPattern.test(internationalLink)) {
      newErrors.internationalLink = newErrors.internationalLink || '国际服链接格式不正确，必须以http://或https://开头';
    }
    
    setErrors(newErrors);
    return newErrors;
  };

  /**
   * 处理表单提交
   * @param {Event} e - 表单提交事件
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      return;
    }
    
    const formData = new FormData();
    if (image) {
      formData.append('image', image);
    }
    if (isEditMode && initialData?.id) {
      formData.append('id', initialData.id);
    }
    formData.append('title', title);
    formData.append('chinaLink', chinaLink);
    formData.append('internationalLink', internationalLink);
    formData.append('description', description);
    formData.append('tags', JSON.stringify(tags));
    
    onSubmit(formData);

    if (!isEditMode && !keepFormData) {
      resetForm();
    } else if (!isEditMode && keepFormData) {
      // 保留表单数据模式：只清空图片、链接和错误信息，保留其他数据
      setImage(null);
      setPreview(null);
      setChinaLink('');
      setInternationalLink('');
      setErrors({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // 注意：保留 title, description, tags（链接已清空）
    }
  };

  /**
   * 重置表单
   */
  const resetForm = () => {
    setTitle('');
    setChinaLink('');
    setInternationalLink('');
    setDescription('');
    setTags([]);
    setImage(null);
    setPreview(null);
    setErrors({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * 处理删除
   */
  const handleDelete = () => {
    if (onDelete && initialData?.id) {
      if (confirm('确定要删除这个阵型吗？此操作不可撤销。')) {
        onDelete(initialData.id);
      }
    }
  };

  /**
   * 渲染分类标签组
   * @param {Object} category - 分类对象
   * @returns {JSX} 分类标签组元素
   */
  const renderCategoryGroup = (category) => {
    const categoryTags = getTagsByCategoryId(category.id);
    const categoryTagNames = categoryTags.map(t => t.name);
    const selectedInCategory = tags.filter(t => categoryTagNames.includes(t));
    const isLimited = category.type === 'limited';
    const isMaxReached = isLimited && selectedInCategory.length >= (category.maxSelect || 2);

    return (
      <div key={category.id} className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-gray-700">{category.name}</span>
          {category.type === 'single' && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              单选
            </span>
          )}
          {isLimited && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              isMaxReached 
                ? 'text-orange-600 bg-orange-50' 
                : 'text-purple-600 bg-purple-50'
            }`}>
              最多{category.maxSelect}个
            </span>
          )}
          {selectedInCategory.length > 0 && (
            <span className="text-xs text-blue-500">
              已选 {selectedInCategory.length}{isLimited ? `/${category.maxSelect}` : ''}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categoryTags.map(tag => {
            const isSelected = tags.includes(tag.name);
            const isDisabled = isLimited && !isSelected && isMaxReached;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag, category.type, category.id, category.maxSelect)}
                disabled={isDisabled}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  isSelected
                    ? (category.type === 'single' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                    : isDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title={tag.description}
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
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
      {isEditMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-blue-700 text-sm">编辑模式：可以修改阵型信息</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          阵型图片 {isEditMode ? '' : '*'}
        </label>
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors relative"
        >
          {preview ? (
            <div className="relative inline-block">
              <img src={preview} alt="预览" className="max-h-48 mx-auto rounded" />
              {isEditMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsImageViewerOpen(true);
                  }}
                  className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  查看图片
                </button>
              )}
            </div>
          ) : (
            <div className="text-gray-500">
              <svg className="mx-auto h-12 w-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>点击上传图片</span>
            </div>
          )}
        </div>
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          onChange={handleImageChange}
          className="hidden"
          required={!isEditMode}
        />
        {errors.image && (
          <p className="text-red-500 text-sm mt-1">{errors.image}</p>
        )}
        
        {/* 法术塔检测状态 */}
        {isDetectingSpellTowers && (
          <div className="mt-2 flex items-center gap-2 text-blue-600 text-sm">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>正在自动识别法术塔...</span>
          </div>
        )}
        
        {/* 法术塔检测警告/提示 */}
        {spellTowerWarning && (
          <div className={`mt-2 p-3 rounded-lg text-sm ${
            spellTowerWarning.type === 'error' 
              ? 'bg-red-50 text-red-700 border border-red-200'
              : spellTowerWarning.type === 'warning'
              ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            <div className="flex items-start gap-2">
              {spellTowerWarning.type === 'error' ? (
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : spellTowerWarning.type === 'warning' ? (
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{spellTowerWarning.message}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">标题（可选）</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例如：18本传奇杯通用"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">国服阵型链接</label>
          <input
            type="url"
            value={chinaLink}
            onChange={(e) => setChinaLink(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
              errors.chinaLink ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="https://link.clashofclans.com/..."
          />
          {errors.chinaLink && (
            <p className="text-red-500 text-sm mt-1">{errors.chinaLink}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">国际服阵型链接</label>
          <input
            type="url"
            value={internationalLink}
            onChange={(e) => setInternationalLink(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
              errors.internationalLink ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="https://link.clashofclans.com/..."
          />
          {errors.internationalLink && (
            <p className="text-red-500 text-sm mt-1">{errors.internationalLink}</p>
          )}
        </div>
      </div>

      {errors.links && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm">{errors.links}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">标签选择</label>
        {categories.map(category => renderCategoryGroup(category))}
        
        <div className="flex gap-2 mt-4">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="自定义标签，按回车添加"
          />
          <button
            type="button"
            onClick={addCustomTag}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            添加
          </button>
        </div>
        
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {tags.map(tag => (
              <span key={tag} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                {tag}
                <button 
                  type="button" 
                  onClick={() => removeTag(tag)} 
                  className="text-blue-600 hover:text-blue-800 font-bold"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">描述（可选）</label>
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              const textToAdd = '源自：b站coc星辉';
              setDescription(prev => prev ? `${prev}\n${textToAdd}` : textToAdd);
            }}
            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
          >
            源自：b站coc星辉
          </button>
          <button
            type="button"
            onClick={() => {
              const textToAdd = '源自：b站部落冲突XO';
              setDescription(prev => prev ? `${prev}\n${textToAdd}` : textToAdd);
            }}
            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
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
              setDescription(prev => prev ? `${prev}\n${textToAdd}` : textToAdd);
            }}
            className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
          >
            {`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}测试，国服链接可用`}
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const textToAdd = `${dateStr}测试，国际服链接可用`;
              setDescription(prev => prev ? `${prev}\n${textToAdd}` : textToAdd);
            }}
            className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
          >
            {`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}测试，国际服链接可用`}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="输入描述或点击上方按钮快速填充"
        />
      </div>

      {!isEditMode && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="keepFormData"
              checked={keepFormData}
              onChange={(e) => setKeepFormData(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="keepFormData" className="text-sm text-gray-700 cursor-pointer">
              添加后保留表单数据（方便继续添加多个阵型）
            </label>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <button
          type="submit"
          className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
        >
          {isEditMode ? '保存修改' : '保存阵型'}
        </button>
        
        {isEditMode && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
          >
            删除阵型
          </button>
        )}
      </div>

      {/* 全屏图片查看器 */}
      <ImageViewer
        imageUrl={preview}
        isOpen={isImageViewerOpen}
        onClose={() => setIsImageViewerOpen(false)}
      />
    </form>
  );
}

export default LayoutForm;
