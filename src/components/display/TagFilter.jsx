/**
 * 增强版标签筛选组件
 * 支持分类展示、单选、多选和限制数量多选
 * 
 * @param {Array} selectedTags - 已选中的标签名称数组
 * @param {Function} onChange - 标签变化回调函数
 * @param {Array} categories - 分类配置数组（可选，默认从配置读取）
 */

import { useTags } from '../../hooks/useTags';

function TagFilter({ selectedTags = [], onChange, categories: propCategories }) {
  const { categories: hookCategories, getTagsByCategoryId, isSingleSelect } = useTags();
  const categories = propCategories || hookCategories;

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
    const selectedInCategory = selectedTags.filter(t => categoryTagNames.includes(t));
    
    if (categoryType === 'single') {
      // 单选：选择/取消选择
      if (selectedTags.includes(tagName)) {
        const otherCategoryTags = selectedTags.filter(t => !categoryTagNames.includes(t));
        onChange(otherCategoryTags);
      } else {
        const otherCategoryTags = selectedTags.filter(t => !categoryTagNames.includes(t));
        onChange([...otherCategoryTags, tagName]);
      }
    } else if (categoryType === 'limited') {
      // 限制数量多选：最多选 maxSelect 个
      if (selectedTags.includes(tagName)) {
        // 取消选择
        onChange(selectedTags.filter(t => t !== tagName));
      } else {
        // 检查是否已达到最大选择数量
        if (selectedInCategory.length >= maxSelect) {
          // 已达到上限，不添加新标签
          return;
        }
        onChange([...selectedTags, tagName]);
      }
    } else {
      // 普通多选
      if (selectedTags.includes(tagName)) {
        onChange(selectedTags.filter(t => t !== tagName));
      } else {
        onChange([...selectedTags, tagName]);
      }
    }
  };

  /**
   * 渲染单个标签按钮
   * @param {Object} tag - 标签对象
   * @param {boolean} isSelected - 是否已选中
   * @param {string} categoryType - 分类类型
   * @param {string} categoryId - 分类ID
   * @param {number} maxSelect - 最大选择数量
   * @param {boolean} isDisabled - 是否禁用
   * @returns {JSX} 标签按钮元素
   */
  const renderTagButton = (tag, isSelected, categoryType, categoryId, maxSelect, isDisabled) => {
    const baseClasses = 'px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 tag-button ';
    
    if (categoryType === 'single') {
      return (
        <button
          key={tag.id}
          onClick={() => toggleTag(tag, 'single', categoryId)}
          className={`${baseClasses} ${
            isSelected
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title={tag.description}
        >
          {tag.name}
        </button>
      );
    }
    
    // limited 或 multiple 类型
    return (
      <button
        key={tag.id}
        onClick={() => toggleTag(tag, categoryType, categoryId, maxSelect)}
        disabled={isDisabled}
        className={`${baseClasses} ${
          isSelected
            ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-md shadow-blue-400/30'
            : isDisabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
        title={tag.description}
      >
        {tag.name}
      </button>
    );
  };

  /**
   * 渲染分类标签组
   * @param {Object} category - 分类对象
   * @returns {JSX} 分类标签组元素
   */
  const renderCategoryGroup = (category) => {
    const categoryTags = getTagsByCategoryId(category.id);
    const categoryTagNames = categoryTags.map(t => t.name);
    const selectedInCategory = selectedTags.filter(t => categoryTagNames.includes(t));
    const isLimited = category.type === 'limited';
    const isMaxReached = isLimited && selectedInCategory.length >= (category.maxSelect || 2);

    return (
      <div key={category.id} className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-800">{category.name}</span>
          {category.type === 'single' && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              单选
            </span>
          )}
          {isLimited && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              isMaxReached 
                ? 'text-orange-600 bg-orange-50 border-orange-200' 
                : 'text-purple-600 bg-purple-50 border-purple-200'
            }`}>
              最多{category.maxSelect}个
            </span>
          )}
          {selectedInCategory.length > 0 && (
            <span className="text-xs text-blue-500 font-medium">
              已选 {selectedInCategory.length}{isLimited ? `/${category.maxSelect}` : ''}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categoryTags.map(tag => {
            const isSelected = selectedTags.includes(tag.name);
            const isDisabled = isLimited && !isSelected && isMaxReached;
            return renderTagButton(tag, isSelected, category.type, category.id, category.maxSelect, isDisabled);
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="tag-filter">
      {categories.map(category => renderCategoryGroup(category))}
    </div>
  );
}

export default TagFilter;
