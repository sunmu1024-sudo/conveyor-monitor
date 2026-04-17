# 传送带故障检测系统

## 项目简介
基于华为云IoTDA + 豆包大模型的传送带故障智能检测系统，实时采集振动、温度等数据，提供时域/频域波形分析和AI智能诊断。

## 技术架构
- **前端**：HTML5 + CSS3 + JavaScript + ECharts
- **后端**：华为云函数工作流（FunctionGraph）
- **数据源**：华为云IoTDA
- **AI模型**：豆包大模型（火山引擎）
- **部署**：GitHub Pages

## 功能特性
- ✅ 实时数据采集与展示
- ✅ 时域波形图（X/Y/Z轴）
- ✅ 频域波形图（FFT频谱分析）
- ✅ AI智能诊断（豆包大模型）
- ✅ 数据导出（CSV格式）
- ✅ 报告打印功能

## 快速开始

### 1. 部署华为云后端函数
- 登录华为云控制台
- 搜索"函数工作流 FunctionGraph"
- 创建Python 3.9函数
- 复制 `backend/cloud_function.py` 代码
- 配置API网关触发器
- 获取函数URL

### 2. 配置前端
- 修改 `js/api.js` 中的 `BACKEND_URL` 为你的函数URL
- 修改 `js/ai.js` 中的 `DOUBAO_CONFIG.API_URL`

### 3. 部署前端到GitHub Pages
- 创建GitHub仓库
- 上传所有前端文件
- 开启GitHub Pages
- 访问 `https://你的用户名.github.io/仓库名`

## 文件结构