/**
 * 页面布局组件
 * 功能：提供统一的页面结构，包含导航栏
 */

import { Outlet, Link, useLocation } from 'react-router-dom';

function Layout() {
  const location = useLocation();
  const isAdmin = location.pathname === '/admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          {isAdmin && (
            <Link to="/" className="text-xl font-bold text-gray-800">
              部落冲突阵型库
            </Link>
          )}
          {isAdmin && (
            <nav className="flex gap-4">
              <Link 
                to="/" 
                className="px-4 py-2 rounded-lg transition-colors text-gray-600 hover:bg-gray-100"
              >
                返回首页
              </Link>
            </nav>
          )}
        </div>
      </header>
      
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
