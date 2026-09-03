#!/usr/bin/env node
/**
 * 统一开发服务器启动脚本
 * 
 * 功能：
 * 1. 启动 Python 检测服务
 * 2. 启动 Node.js API 服务器
 * 3. 启动 Vite 开发服务器
 * 4. 当主进程退出时，自动终止所有子进程
 * 
 * @module dev-server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * 存储所有子进程的数组
 * @type {Array<import('child_process').ChildProcess>}
 */
const processes = [];

/**
 * 记录启动日志
 * 
 * @param {string} name - 服务名称
 * @param {string} message - 日志消息
 */
function log(name, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${name}] ${message}`);
}

/**
 * 启动 Python 检测服务
 * 
 * @returns {import('child_process').ChildProcess} Python 子进程
 */
function startPythonService() {
    const pythonPath = process.env.PYTHON_PATH || 'E:\\anaconda\\envs\\pytorch\\python.exe';
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'spell_tower_server.py');
    
    log('Python', `启动服务: ${scriptPath}`);
    
    const proc = spawn(pythonPath, [scriptPath], {
        stdio: 'inherit',
        shell: false,
        windowsHide: false
    });
    
    proc.on('error', (err) => {
        log('Python', `启动失败: ${err.message}`);
    });
    
    proc.on('exit', (code) => {
        log('Python', `进程退出，代码: ${code}`);
    });
    
    return proc;
}

/**
 * 启动 Node.js API 服务器
 * 
 * @returns {import('child_process').ChildProcess} Node 子进程
 */
function startNodeServer() {
    const serverPath = path.join(PROJECT_ROOT, 'server.js');
    
    log('Node', `启动服务器: ${serverPath}`);
    
    const proc = spawn('node', [serverPath], {
        stdio: 'inherit',
        shell: false,
        cwd: PROJECT_ROOT
    });
    
    proc.on('error', (err) => {
        log('Node', `启动失败: ${err.message}`);
    });
    
    proc.on('exit', (code) => {
        log('Node', `进程退出，代码: ${code}`);
    });
    
    return proc;
}

/**
 * 启动 Vite 开发服务器
 * 
 * @returns {import('child_process').ChildProcess} Vite 子进程
 */
function startVite() {
    log('Vite', '启动开发服务器...');
    
    const proc = spawn('npx', ['vite'], {
        stdio: 'inherit',
        shell: true,
        cwd: PROJECT_ROOT
    });
    
    proc.on('error', (err) => {
        log('Vite', `启动失败: ${err.message}`);
    });
    
    proc.on('exit', (code) => {
        log('Vite', `进程退出，代码: ${code}`);
    });
    
    return proc;
}

/**
 * 终止所有子进程
 */
function killAllProcesses() {
    log('Main', '正在终止所有子进程...');
    
    processes.forEach((proc, index) => {
        if (proc && !proc.killed) {
            try {
                // Windows 上使用 taskkill 强制终止进程树
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], {
                        stdio: 'ignore',
                        shell: false
                    });
                } else {
                    proc.kill('SIGTERM');
                }
                log('Main', `已终止进程 #${index + 1} (PID: ${proc.pid})`);
            } catch (err) {
                log('Main', `终止进程 #${index + 1} 失败: ${err.message}`);
            }
        }
    });
    
    // 等待一段时间确保进程终止
    setTimeout(() => {
        log('Main', '所有子进程已终止，退出主程序');
        process.exit(0);
    }, 1000);
}

/**
 * 主函数
 */
async function main() {
    log('Main', '========================================');
    log('Main', '启动开发环境');
    log('Main', '========================================');
    
    // 注册进程退出处理程序
    const exitSignals = ['SIGINT', 'SIGTERM', 'exit'];
    
    exitSignals.forEach((signal) => {
        process.on(signal, () => {
            log('Main', `接收到 ${signal} 信号`);
            killAllProcesses();
        });
    });
    
    // Windows 上处理 Ctrl+C
    if (process.platform === 'win32') {
        process.on('SIGINT', () => {
            log('Main', '接收到 Ctrl+C (Windows)');
            killAllProcesses();
        });
    }
    
    // 处理未捕获的异常
    process.on('uncaughtException', (err) => {
        log('Main', `未捕获的异常: ${err.message}`);
        killAllProcesses();
    });
    
    process.on('unhandledRejection', (reason) => {
        log('Main', `未处理的 Promise 拒绝: ${reason}`);
        killAllProcesses();
    });
    
    try {
        // 并行启动所有服务（互不阻塞）
        log('Main', '并行启动所有服务...');
        
        // 1. 启动 Python 检测服务（后台加载模型）
        const pythonProc = startPythonService();
        processes.push(pythonProc);
        
        // 2. 启动 Node.js API 服务器
        const nodeProc = startNodeServer();
        processes.push(nodeProc);
        
        // 3. 启动 Vite 开发服务器（页面立即可见）
        const viteProc = startVite();
        processes.push(viteProc);
        
        log('Main', '========================================');
        log('Main', '所有服务已启动（Python 检测服务仍在后台加载中）');
        log('Main', '- Python 检测服务: http://localhost:6174');
        log('Main', '- Node.js API: http://localhost:3001');
        log('Main', '- Vite 开发服务器: http://localhost:5173');
        log('Main', '========================================');
        log('Main', '按 Ctrl+C 停止所有服务');
        
    } catch (error) {
        log('Main', `启动失败: ${error.message}`);
        killAllProcesses();
    }
}

// 启动主程序
main();
