/**
 * 标签配置Hook
 * 提供统一的标签数据访问接口，支持分类管理和标签操作
 * 
 * 功能：
 * - 提供所有标签配置数据
 * - 支持按分类获取标签
 * - 支持标签名称与对象的相互转换
 * - 支持大本营等级筛选功能
 */

import { useMemo } from 'react';
import { 
  getTagsConfig, 
  getAllTags, 
  getAllTagNames, 
  getTagsByCategory, 
  getTagInfo 
} from '../config/tags.config';

const tagsConfig = getTagsConfig();
const allTagsData = getAllTags();
const allTagNamesData = getAllTagNames();

/**
 * 标签配置Hook
 * @returns {Object} 标签相关的数据和方法
 */
export function useTags() {
  /**
   * 获取所有分类列表
   * @returns {Array} 分类对象数组
   */
  const categories = useMemo(() => {
    return tagsConfig.categories;
  }, []);

  /**
   * 获取所有标签（带分类信息）
   * @returns {Array} 标签对象数组
   */
  const allTags = useMemo(() => {
    return allTagsData;
  }, []);

  /**
   * 获取所有标签名称
   * @returns {Array} 标签名称字符串数组
   */
  const allTagNames = useMemo(() => {
    return allTagNamesData;
  }, []);

  /**
   * 根据分类ID获取该分类下的所有标签
   * @param {string} categoryId - 分类ID
   * @returns {Array} 标签对象数组
   */
  const getTagsByCategoryId = (categoryId) => {
    return getTagsByCategory(categoryId);
  };

  /**
   * 根据标签名称获取标签详细信息
   * @param {string} tagName - 标签名称
   * @returns {Object|null} 标签信息对象
   */
  const getTagByName = (tagName) => {
    return getTagInfo(tagName);
  };

  /**
   * 检查标签是否为单选类型
   * @param {string} tagName - 标签名称
   * @returns {boolean} 是否为单选标签
   */
  const isSingleSelect = (tagName) => {
    const tag = getTagByName(tagName);
    return tag?.selectType === 'single';
  };

  /**
   * 获取大本营等级标签列表
   * @returns {Array} 大本营等级标签对象数组
   */
  const getThLevelTags = useMemo(() => {
    return getTagsByCategory('th-level');
  }, [getTagsByCategory('th-level').length]);

  /**
   * 获取服务器类型标签列表
   * @returns {Array} 服务器类型标签对象数组
   */
  const getServerTypeTags = useMemo(() => {
    return getTagsByCategory('server');
  }, [getTagsByCategory('server').length]);

  /**
   * 获取用途分类标签列表
   * @returns {Array} 用途分类标签对象数组
   */
  const getPurposeTags = useMemo(() => {
    return getTagsByCategory('purpose');
  }, [getTagsByCategory('purpose').length]);

  /**
   * 筛选指定分类的标签名称
   * @param {Array} selectedTags - 已选中的标签名称数组
   * @param {string} categoryId - 分类ID
   * @returns {Array} 该分类下已选中的标签名称数组
   */
  const getSelectedTagsByCategory = (selectedTags, categoryId) => {
    const categoryTags = getTagsByCategory(categoryId);
    const categoryTagNames = categoryTags.map(t => t.name);
    return selectedTags.filter(tag => categoryTagNames.includes(tag));
  };

  /**
   * 检查标签组合是否包含指定分类的标签
   * @param {Array} selectedTags - 已选中的标签名称数组
   * @param {string} categoryId - 分类ID
   * @returns {boolean} 是否包含该分类的标签
   */
  const hasTagFromCategory = (selectedTags, categoryId) => {
    const selected = getSelectedTagsByCategory(selectedTags, categoryId);
    return selected.length > 0;
  };

  return {
    categories,
    allTags,
    allTagNames,
    getTagsByCategoryId,
    getTagByName,
    isSingleSelect,
    getThLevelTags,
    getServerTypeTags,
    getPurposeTags,
    getSelectedTagsByCategory,
    hasTagFromCategory
  };
}

export default useTags;
