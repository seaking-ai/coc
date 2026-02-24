/**
 * 瀑布流布局组件
 * @param {Array} layouts - 阵型数据数组
 * @param {boolean} isRandomMode - 是否为随机模式
 */

import { useState } from 'react';
import LayoutCard from './LayoutCard';
import DetailDrawer from './DetailDrawer';

function MasonryGrid({ layouts, isRandomMode = false }) {
  const [selectedLayout, setSelectedLayout] = useState(null);

  return (
    <>
      <div className={`columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4 random-grid ${isRandomMode ? 'fade-in' : ''}`}>
        {layouts.map((layout, index) => (
          <LayoutCard 
            key={layout.id} 
            layout={layout} 
            onClick={() => setSelectedLayout(layout)}
            style={{ animationDelay: isRandomMode ? `${index * 0.05}s` : '0s' }}
          />
        ))}
      </div>
      
      <DetailDrawer 
        layout={selectedLayout} 
        onClose={() => setSelectedLayout(null)} 
      />
    </>
  );
}

export default MasonryGrid;
