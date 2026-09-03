/**
 * 增强版标签筛选组件
 * 支持分类展示、单选、多选和限制数量多选
 * 包含阵容有效性虚拟分类（根据描述中的测试日期动态匹配）
 * 
 * @param {Array} selectedTags - 已选中的标签名称数组
 * @param {Function} onChange - 标签变化回调函数
 * @param {Array} categories - 分类配置数组（可选，默认从配置读取）
 */

import { useTags } from '../../hooks/useTags';

/**
 * 阵容有效性虚拟分类配置
 * 这不是真实的标签，而是根据描述中的测试日期动态匹配的筛选条件
 */
const VALIDITY_CATEGORY = {
  id: 'validity',
  name: '阵容有效性（经过近期测试）',
  type: 'multiple',
  description: '根据描述中的测试日期自动判断（30天内有效）',
  tags: [
    { id: 'china-valid', name: '国服有效', description: '30天内有国服测试记录' },
    { id: 'intl-valid', name: '国际服有效', description: '30天内有国际服测试记录' }
  ]
};

function TagFilter({ selectedTags = [], onChange, categories: propCategories }) {
  const { categories: hookCategories, getTagsByCategoryId, isSingleSelect } = useTags();
  const categories = propCategories || hookCategories;

  /**
   * 获取所有武器分类的标签
   * @returns {Array} 所有武器标签名称数组
   */
  const getAllWeaponTags = () => {
    const weaponCategories = categories.filter(cat => cat.id.startsWith('weapons-phase'));
    const weaponTags = [];
    weaponCategories.forEach(cat => {
      cat.tags.forEach(tag => weaponTags.push(tag.name));
    });
    return weaponTags;
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
    const selectedInCategory = selectedTags.filter(t => categoryTagNames.includes(t));

    if (categoryType === 'single') {
      // 单选：选择/取消选择
      if (selectedTags.includes(tagName)) {
        const otherCategoryTags = selectedTags.filter(t => !categoryTagNames.includes(t));
        onChange(otherCategoryTags);
      } else {
        let otherCategoryTags = selectedTags.filter(t => !categoryTagNames.includes(t));

        // 如果是切换精致台期数，清除所有武器标签
        if (categoryId === 'decoration-phase') {
          const weaponTags = getAllWeaponTags();
          otherCategoryTags = otherCategoryTags.filter(t => !weaponTags.includes(t));
        }

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
   * 切换阵容有效性标签选择
   * 这是一个虚拟分类，标签值直接添加到selectedTags中
   * @param {Object} tag - 标签对象
   */
  const toggleValidityTag = (tag) => {
    const tagName = tag.name;
    if (selectedTags.includes(tagName)) {
      onChange(selectedTags.filter(t => t !== tagName));
    } else {
      onChange([...selectedTags, tagName]);
    }
  };

  /**
   * 渲染阵容有效性虚拟分类
   * @returns {JSX} 分类标签组元素
   */
  const renderValidityCategory = () => {
    const categoryTagNames = VALIDITY_CATEGORY.tags.map(t => t.name);
    const selectedInCategory = selectedTags.filter(t => categoryTagNames.includes(t));

    return (
      <div key={VALIDITY_CATEGORY.id} className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-800">{VALIDITY_CATEGORY.name}</span>
          {selectedInCategory.length > 0 && (
            <span className="text-xs text-green-500 font-medium">
              已选 {selectedInCategory.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {VALIDITY_CATEGORY.tags.map(tag => {
            const isSelected = selectedTags.includes(tag.name);
            return (
              <button
                key={tag.id}
                onClick={() => toggleValidityTag(tag)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 tag-button ${
                  isSelected
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md shadow-green-500/30'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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

  /**
   * 检查分类是否应该显示（处理父级依赖关系）
   * 支持两种模式：
   * 1. 简单模式：parentCategory + parentTag
   * 2. 多条件模式：parentConditions（需同时满足所有条件）
   * @param {Object} category - 分类对象
   * @returns {boolean} 是否应该显示
   */
  const shouldShowCategory = (category) => {
    // 模式1：简单父级依赖（单一条件）
    if (category.parentCategory && category.parentTag) {
      return selectedTags.includes(category.parentTag);
    }

    // 模式2：多条件依赖（需同时满足所有条件）
    if (category.parentConditions && Array.isArray(category.parentConditions)) {
      return category.parentConditions.every(condition => {
        return selectedTags.includes(condition.tagName);
      });
    }

    return true;
  };

  /**
   * 渲染分类标签组
   * @param {Object} category - 分类对象
   * @returns {JSX} 分类标签组元素
   */
  const renderCategoryGroup = (category) => {
    // 检查是否应该显示该分类（处理父级依赖）
    if (!shouldShowCategory(category)) {
      return null;
    }

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
      {renderValidityCategory()}
    </div>
  );
}

export default TagFilter;
