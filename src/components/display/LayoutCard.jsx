/**
 * 阵型卡片组件
 * @param {Object} layout - 阵型数据对象
 * @param {Function} onClick - 点击回调函数
 */

function LayoutCard({ layout, onClick }) {
  // 处理图片路径，确保正确拼接 BASE_URL
  const getImagePath = (path) => {
    if (path.startsWith('/')) {
      return `${import.meta.env.BASE_URL}${path.slice(1)}`;
    }
    return `${import.meta.env.BASE_URL}${path}`;
  };

  return (
    <div 
      onClick={onClick}
      onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
      onTouchEnd={(e) => e.currentTarget.style.transform = ''}
      className="break-inside-avoid mb-4 bg-white rounded-xl shadow-sm active:shadow-lg overflow-hidden cursor-pointer layout-card layout-card-enter transition-all duration-300 hover:-translate-y-1 border border-gray-100"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="relative overflow-hidden aspect-square">
        <img 
          src={getImagePath(layout.image)}
          alt={layout.title}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
      </div>
      <div className="p-4">
        <h3 className="font-bold text-gray-800 truncate text-base mb-2">{layout.title || '无标题'}</h3>
        <div className="flex flex-wrap gap-1.5">
          {layout.tags.slice(0, 3).map(tag => (
            <span 
              key={tag} 
              className="text-xs font-medium bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200"
            >
              {tag}
            </span>
          ))}
          {layout.tags.length > 3 && (
            <span className="text-xs text-gray-500 font-medium">+{layout.tags.length - 3}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default LayoutCard;
