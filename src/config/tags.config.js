/**
 * 标签配置文件
 * 用于集中存储所有标签信息，支持分类管理和扩展
 * 
 * 配置结构说明：
 * - categories: 标签分类数组
 *   - id: 分类唯一标识
 *   - name: 分类名称
 *   - type: 分类类型（'single' 单选, 'multiple' 多选, 'limited' 限制数量多选）
 *   - maxSelect: 最大选择数量（仅 type 为 'limited' 时有效）
 *   - tags: 该分类下的标签列表
 *     - id: 标签唯一标识
 *     - name: 标签显示名称
 *     - description: 标签说明（可选）
 * 
 * 分类类型说明：
 * - 'single': 单选分类（如大本营等级），只能选择一个标签
 * - 'multiple': 多选分类（如用途），可以选择多个标签
 * - 'limited': 限制数量多选，最多选择 maxSelect 个标签
 */

const tagsConfig = {
  categories: [
    {
      id: 'th-level',
      name: '大本营等级',
      type: 'single',
      description: '选择阵型适用的大本营等级',
      tags: [
        { id: '11本', name: '11本', description: '适用于11本大本营' },
        { id: '12本', name: '12本', description: '适用于12本大本营' },
        { id: '13本', name: '13本', description: '适用于13本大本营' },
        { id: '14本', name: '14本', description: '适用于14本大本营' },
        { id: '15本', name: '15本', description: '适用于15本大本营' },
        { id: '16本', name: '16本', description: '适用于16本大本营' },
        { id: '17本', name: '17本', description: '适用于17本大本营' },
        { id: '18本', name: '18本', description: '适用于18本大本营' },
        { id: '19本', name: '19本', description: '适用于19本大本营' },
        { id: '20本', name: '20本', description: '适用于20本大本营' }
      ]
    },
    {
      id: 'server',
      name: '服务器类型',
      type: 'multiple',
      description: '选择阵型适用的服务器',
      tags: [
        { id: '国服', name: '国服', description: '适用于国服（腾讯）' },
        { id: '国际服', name: '国际服', description: '适用于国际服' }
      ]
    },
    {
      id: 'spell-tower',
      name: '法术塔类型',
      type: 'limited',
      maxSelect: 2,
      description: '选择阵型的法术塔类型（最多选2个）',
      tags: [
        { id: '狂暴塔', name: '狂暴塔', description: '阵型包含狂暴法术塔' },
        { id: '毒药塔', name: '毒药塔', description: '阵型包含毒药法术塔' },
        { id: '隐身塔', name: '隐身塔', description: '阵型包含隐身法术塔' }
      ]
    },
    {
      id: 'decoration',
      name: '精致台',
      type: 'single',
      description: '阵型是否包含精致台装饰',
      tags: [
        { id: '有精致台', name: '有精致台', description: '阵型包含精致台装饰' },
        { id: '无精致台', name: '无精致台', description: '阵型不包含精致台装饰' }
      ]
    },
    {
      id: 'purpose',
      name: '用途分类',
      type: 'multiple',
      description: '选择阵型的使用场景',
      tags: [
        { id: '冲杯', name: '冲杯', description: '适合冲杯使用' },
        { id: '日常', name: '娱乐', description: '娱乐防守' },
        { id: '护资源', name: '护资源', description: '适合日常防守' },
        { id: '种菜', name: '种树', description: '适合采集资源' }
      ]
    },
    {
      id: 'defense',
      name: '防守类型（尽量别选）',
      type: 'multiple',
      description: '阵型的防守特点',
      tags: [
        { id: '防空', name: '防火龙', description: '防空能力优秀' },
        { id: '抗狗', name: '防雷龙', description: '对抗狗球流优秀' },
        { id: '抗矿', name: '防陨石戈仑一字划', description: '对抗矿工流优秀' },
        { id: '抗猪', name: '防大火球', description: '对抗野猪骑士优秀' },
        { id: '天女', name: '防根蔓', description: '对抗天使女王优秀' }
      ]
    }
  ]
};

/**
 * 获取所有标签列表（扁平化）
 * @returns {Array} 所有标签对象数组
 */
export function getAllTags() {
  const allTags = [];
  tagsConfig.categories.forEach(category => {
    category.tags.forEach(tag => {
      allTags.push({
        ...tag,
        categoryId: category.id,
        categoryName: category.name,
        selectType: category.type,
        maxSelect: category.maxSelect
      });
    });
  });
  return allTags;
}

/**
 * 获取所有标签名称列表
 * @returns {Array} 所有标签名称字符串数组
 */
export function getAllTagNames() {
  return getAllTags().map(tag => tag.name);
}

/**
 * 根据分类ID获取标签
 * @param {string} categoryId - 分类ID
 * @returns {Array} 该分类下的标签列表
 */
export function getTagsByCategory(categoryId) {
  const category = tagsConfig.categories.find(c => c.id === categoryId);
  return category ? category.tags : [];
}

/**
 * 根据标签名称获取标签信息
 * @param {string} tagName - 标签名称
 * @returns {Object|null} 标签信息对象
 */
export function getTagInfo(tagName) {
  return getAllTags().find(tag => tag.name === tagName) || null;
}

/**
 * 获取标签配置
 * @returns {Object} 标签配置对象
 */
export function getTagsConfig() {
  return tagsConfig;
}

export default tagsConfig;
