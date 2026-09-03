// 导入 React 核心库
import React from 'react';
// 导入 React 18 新的 DOM 渲染方法
import ReactDOM from 'react-dom/client';
// 导入根组件 App
import App from './App.jsx';
// 导入全局样式
import './index.css';
import './styles/animations.css';

// 创建根节点并渲染应用
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
