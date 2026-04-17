/**
 * common.js - 公共函数模块
 * 适配真实MQTT数据格式：
 * - 振动数据: x, y, z, ch1, temp, rms_x, rms_y, rms_z
 * - 诊断结果: fault_type, fault_id, confidence, alarm, probabilities
 * - 报警事件: severity, fault_type, confidence
 */

// ========== API配置 ==========
const API_CONFIG = {
    IOTDA_ENDPOINT: 'https://iotda.cn-north-4.myhuaweicloud.com',
    PROJECT_ID: '7c236d3aace44f4fbc37b2937370ce7b',
    DEVICE_ID: '69d9da7acbb0cf6bb94fea59_huashan_device_001',
    ACCESS_KEY: 'HPUAH0YQOBSXEGCSH4NB',
    SECRET_KEY: 'VSCUK9aQ2bQcQOlciFdyx3zIr58EN7oKELvWgMKB'
};

// ========== 故障类型映射 ==========
const FAULT_TYPE_MAP = {
    0: '正常',
    1: '轴承故障',
    2: '皮带跑偏',
    3: '皮带打滑',
    4: '皮带过紧',
    5: '皮带过松',
    6: '不平衡',
    7: '不对中',
    8: '托辊故障',
    9: '综合故障'
};

// ========== 全局数据存储 ==========
let currentDeviceData = {
    timestamp: null,
    temperature: null,
    x_axis: null,
    y_axis: null,
    z_axis: null,
    ch1_pressure: null,
    rms_x: null,
    rms_y: null,
    rms_z: null
};

// 诊断结果
let currentDiagnosis = {
    timestamp: null,
    fault_type: '正常',
    fault_id: 0,
    confidence: 0,
    alarm: false,
    probabilities: {}
};

// 报警事件
let currentAlarmEvent = null;

// 历史数据存储
let allHistoryData = [];

// 报警记录（只存储边缘AI报警）
let alarmRecords = [];

// 页面刷新回调函数列表
let refreshCallbacks = [];

// 设备状态
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
let isLoading = false;

// 浏览器通知权限
let notificationPermission = 'default';

// ========== 华为云 API 签名 ==========
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key, message) {
    const keyBuffer = typeof key === 'string' 
        ? new TextEncoder().encode(key)
        : key;
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const msgBuffer = new TextEncoder().encode(message);
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSDKDate() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

async function generateAuthHeader(method, url, queryString, payload) {
    const sdkDate = generateSDKDate();
    const host = API_CONFIG.IOTDA_ENDPOINT.replace('https://', '');
    
    const canonicalUri = '/v5/iot/' + API_CONFIG.PROJECT_ID + '/devices/' + API_CONFIG.DEVICE_ID;
    const canonicalQueryString = queryString || '';
    const canonicalHeaders = `host:${host}\nx-sdk-date:${sdkDate}\n`;
    const signedHeaders = 'host;x-sdk-date';
    const payloadHash = await sha256(payload || '');
    
    const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');
    
    const algorithm = 'SDK-HMAC-SHA256';
    const credentialScope = sdkDate.slice(0, 8) + '/' + host.split('.')[2] + '/' + host.split('.')[0] + '/sdk_request';
    const canonicalRequestHash = await sha256(canonicalRequest);
    
    const stringToSign = [
        algorithm,
        sdkDate,
        credentialScope,
        canonicalRequestHash
    ].join('\n');
    
    const kDate = await hmacSha256(API_CONFIG.SECRET_KEY, sdkDate.slice(0, 8));
    const kRegion = await hmacSha256(kDate, host.split('.')[2]);
    const kService = await hmacSha256(kRegion, host.split('.')[0]);
    const kSigning = await hmacSha256(kService, 'sdk_request');
    const signature = await hmacSha256(kSigning, stringToSign);
    
    const authorization = `${algorithm} Credential=${API_CONFIG.ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return {
        'Host': host,
        'X-Sdk-Date': sdkDate,
        'Authorization': authorization,
        'Content-Type': 'application/json'
    };
}

// ========== 回调注册与通知 ==========
function onDataUpdate(callback) {
    if (typeof callback === 'function') {
        refreshCallbacks.push(callback);
        console.log('已注册刷新回调，当前回调数量:', refreshCallbacks.length);
    }
}

function notifyDataUpdate() {
    console.log('触发数据更新通知，回调数量:', refreshCallbacks.length);
    for (const callback of refreshCallbacks) {
        try {
            callback();
        } catch(e) {
            console.error('刷新回调执行失败:', e);
        }
    }
}

// ========== UI状态更新 ==========
function updateDeviceStatus(status) {
    const deviceStatusEl = document.getElementById('deviceStatus');
    if (deviceStatusEl) {
        deviceStatusEl.textContent = status === 'online' ? '在线' : '离线';
        deviceStatusEl.className = `status-value ${status}`;
    }
}

function showLoadingState(show) {
    isLoading = show;
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.disabled = show;
        refreshBtn.textContent = show ? '⏳ 加载中...' : '🔄 刷新数据';
    }
}

// ========== 浏览器通知 ==========
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
        notificationPermission = 'granted';
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            notificationPermission = permission;
        });
    }
}

function sendBrowserNotification(title, message, tag) {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
        const options = {
            body: message,
            icon: '🏭',
            tag: tag || 'alarm',
            requireInteraction: true
        };
        
        const notification = new Notification(title, options);
        notification.onclick = function() {
            window.focus();
            window.location.href = 'alarm.html';
        };
        setTimeout(() => notification.close(), 10000);
    }
}

// ========== 处理边缘报警事件 ==========
function processAlarmEvent(alarmEvent) {
    if (!alarmEvent || !alarmEvent.fault_type) return;
    
    currentAlarmEvent = alarmEvent;
    
    // 转换为统一格式
    const edgeAlarm = {
        id: Date.now() + Math.random(),
        timestamp: alarmEvent.timestamp || new Date().toISOString(),
        source: 'edge_ai',
        fault_type: alarmEvent.fault_type,
        confidence: alarmEvent.confidence,
        severity: alarmEvent.severity,
        level: alarmEvent.severity === 'high' ? 'alarm' : 'warning'
    };
    
    // 检查是否重复（1分钟内相同故障类型不重复添加）
    const recentAlarm = alarmRecords.find(a => 
        a.source === 'edge_ai' && 
        a.fault_type === edgeAlarm.fault_type &&
        new Date(edgeAlarm.timestamp) - new Date(a.timestamp) < 60000
    );
    
    if (!recentAlarm) {
        alarmRecords.unshift(edgeAlarm);
        
        if (alarmRecords.length > 500) {
            alarmRecords = alarmRecords.slice(0, 500);
        }
        
        localStorage.setItem('alarm_records', JSON.stringify(alarmRecords));
        
        // 发送浏览器通知
        const title = edgeAlarm.severity === 'high' ? '🔴 严重报警' : '⚠️ 警告';
        const message = `边缘AI诊断: ${edgeAlarm.fault_type} (置信度: ${(edgeAlarm.confidence * 100).toFixed(1)}%)`;
        sendBrowserNotification(title, message, `alarm-${Date.now()}`);
        
        notifyDataUpdate();
    }
}

// ========== 添加报警记录 ==========
function addAlarmRecords(alarms) {
    if (!alarms || alarms.length === 0) return;
    
    for (const alarm of alarms) {
        const recentAlarm = alarmRecords.find(a => 
            a.source === alarm.source && 
            a.param === alarm.param && 
            new Date(alarm.timestamp) - new Date(a.timestamp) < 60000
        );
        
        if (!recentAlarm) {
            alarmRecords.unshift(alarm);
        }
    }
    
    if (alarmRecords.length > 500) {
        alarmRecords = alarmRecords.slice(0, 500);
    }
    
    localStorage.setItem('alarm_records', JSON.stringify(alarmRecords));
    
    notifyDataUpdate();
}

function loadAlarmRecords() {
    const saved = localStorage.getItem('alarm_records');
    if (saved) {
        try {
            alarmRecords = JSON.parse(saved);
            console.log('📋 加载报警记录:', alarmRecords.length, '条');
        } catch(e) {
            console.error('加载报警记录失败:', e);
            alarmRecords = [];
        }
    }
    return alarmRecords;
}

function clearAlarmRecords() {
    alarmRecords = [];
    localStorage.removeItem('alarm_records');
    console.log('🗑️ 报警记录已清空');
    notifyDataUpdate();
}

// ========== API调用 ==========
async function fetchDeviceData() {
    try {
        const url = 'https://device-proxy.sunmu1024.workers.dev';
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Worker返回数据:', result);
        
        if (!result.success || !result.data) {
            throw new Error(result.error || '数据为空');
        }
        
        return result.data;
        
    } catch (error) {
        console.error('❌ 获取数据失败:', error);
        throw error;
    }
}

function parseDeviceShadow(deviceData) {
    if (!deviceData) return null;
    
    const shadow = deviceData.shadow || deviceData;
    const reported = shadow.reported || shadow;
    
    // 获取 vibration_monitor 服务下的属性（如果没有则直接使用 reported）
    const vm = reported.vibration_monitor || reported;
    
    // 解析振动数据
    const vibrationData = {
        timestamp: vm.timestamp ? new Date(vm.timestamp * 1000).toISOString() : new Date().toISOString(),
        temperature: parseFloat(vm.temperature) || null,
        x_axis: parseFloat(vm.x_axis) || null,
        y_axis: parseFloat(vm.y_axis) || null,
        z_axis: parseFloat(vm.z_axis) || null,
        ch1_pressure: parseFloat(vm.ch1_pressure) || null,
        rms_x: parseFloat(vm.rms_x) || null,
        rms_y: parseFloat(vm.rms_y) || null,
        rms_z: parseFloat(vm.rms_z) || null
    };
    
    // 解析诊断结果
    const diagnosisData = {
        timestamp: vm.timestamp ? new Date(vm.timestamp * 1000).toISOString() : null,
        fault_type: vm.fault_type || '正常',
        fault_id: parseInt(vm.fault_id) || 0,
        confidence: parseFloat(vm.confidence) || 0,
        alarm: vm.alarm === 'true' || vm.alarm === true,
        probabilities: parseProbabilities(vm.probabilities),
        alarm_threshold: parseFloat(vm.alarm_threshold) || 0.6
    };
    
    // 如果诊断结果触发了报警，生成报警事件
    let alarmEvent = null;
    if (diagnosisData.alarm && diagnosisData.fault_type !== '正常') {
        const threshold = diagnosisData.alarm_threshold || 0.6;
        alarmEvent = {
            timestamp: diagnosisData.timestamp || new Date().toISOString(),
            fault_type: diagnosisData.fault_type,
            confidence: diagnosisData.confidence,
            severity: diagnosisData.confidence >= threshold ? 'high' : 'medium'
        };
    }
    
    return { vibrationData, diagnosisData, alarmEvent };
}

function parseProbabilities(probStr) {
    if (!probStr) return {};
    try {
        // 如果是字符串，尝试解析
        if (typeof probStr === 'string') {
            return JSON.parse(probStr);
        }
        // 如果已经是对象，直接返回
        return probStr;
    } catch(e) {
        console.warn('解析概率分布失败:', e);
        return {};
    }
}

// ========== 更新全局数据 ==========
async function updateData() {
    if (isLoading) return null;
    
    showLoadingState(true);
    
    try {
        const parsed = await fetchDeviceData();
        if (!parsed) {
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_FAILURES) {
                updateDeviceStatus('offline');
            }
            return null;
        }
        
        const { vibrationData, diagnosisData, alarmEvent } = parsed;
        
        // 更新振动数据
        if (vibrationData) {
            currentDeviceData = { ...currentDeviceData, ...vibrationData };
            
            const dataPoint = {
                ...vibrationData,
                displayTime: new Date(vibrationData.timestamp).toLocaleString()
            };
            
            allHistoryData.unshift(dataPoint);
            if (allHistoryData.length > 1000) {
                allHistoryData = allHistoryData.slice(0, 1000);
            }
        }
        
        // 更新诊断结果
        if (diagnosisData) {
            currentDiagnosis = diagnosisData;
        }
        
        // 处理报警事件
        if (alarmEvent && alarmEvent.fault_type) {
            processAlarmEvent(alarmEvent);
        }
        
        saveHistoryData();
        
        consecutiveFailures = 0;
        updateDeviceStatus('online');
        
        notifyDataUpdate();
        
        return parsed;
        
    } catch (error) {
        console.error('❌ 更新数据失败:', error);
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
            updateDeviceStatus('offline');
        }
        return null;
    } finally {
        showLoadingState(false);
    }
}

function saveHistoryData() {
    try {
        localStorage.setItem('history_data', JSON.stringify(allHistoryData.slice(0, 500)));
        localStorage.setItem('current_device_data', JSON.stringify(currentDeviceData));
        localStorage.setItem('current_diagnosis', JSON.stringify(currentDiagnosis));
        console.log('💾 历史数据已保存');
    } catch(e) {
        console.error('保存数据失败:', e);
    }
}

function loadHistoryData() {
    const saved = localStorage.getItem('history_data');
    if (saved) {
        try {
            allHistoryData = JSON.parse(saved);
            console.log('📋 加载历史数据:', allHistoryData.length, '条');
        } catch(e) {
            console.error('加载历史数据失败:', e);
            allHistoryData = [];
        }
    }
    
    const savedCurrent = localStorage.getItem('current_device_data');
    if (savedCurrent) {
        try {
            currentDeviceData = JSON.parse(savedCurrent);
        } catch(e) {}
    }
    
    const savedDiagnosis = localStorage.getItem('current_diagnosis');
    if (savedDiagnosis) {
        try {
            currentDiagnosis = JSON.parse(savedDiagnosis);
        } catch(e) {}
    }
    
    loadAlarmRecords();
    return allHistoryData;
}

// ========== 按日期范围查询 ==========
function getDataByDateRange(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    return allHistoryData.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= start && itemDate <= end;
    });
}

// ========== 导出CSV ==========
function exportDataToCSV(data, filename) {
    if (!data || data.length === 0) {
        alert('没有数据可导出');
        return;
    }
    
    const headers = [
        '时间', '温度(°C)', 'X轴(g)', 'Y轴(g)', 'Z轴(g)',
        '张力(kPa)', 'X轴RMS(g)', 'Y轴RMS(g)', 'Z轴RMS(g)'
    ];
    
    const rows = [headers];
    const sortedData = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    for (const item of sortedData) {
        rows.push([
            item.displayTime || new Date(item.timestamp).toLocaleString(),
            item.temperature?.toFixed(2) || '',
            item.x_axis?.toFixed(4) || '',
            item.y_axis?.toFixed(4) || '',
            item.z_axis?.toFixed(4) || '',
            item.ch1_pressure?.toFixed(3) || '',
            item.rms_x?.toFixed(4) || '',
            item.rms_y?.toFixed(4) || '',
            item.rms_z?.toFixed(4) || ''
        ]);
    }
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    URL.revokeObjectURL(url);
}

// ========== 定时刷新 ==========
let refreshInterval = null;

function startAutoRefresh(interval = 5000) {
    if (refreshInterval) clearInterval(refreshInterval);
    updateData();
    refreshInterval = setInterval(() => updateData(), interval);
    console.log('⏰ 自动刷新已启动，间隔:', interval, 'ms');
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('⏰ 自动刷新已停止');
    }
}

// ========== 初始化 ==========
loadHistoryData();
requestNotificationPermission();

// 导出到全局
window.common = {
    API_CONFIG,
    FAULT_TYPE_MAP,
    currentDeviceData,
    currentDiagnosis,
    currentAlarmEvent,
    allHistoryData,
    alarmRecords,
    loadAlarmRecords,
    clearAlarmRecords,
    updateData,
    getDataByDateRange,
    exportDataToCSV,
    startAutoRefresh,
    stopAutoRefresh,
    onDataUpdate,
    notifyDataUpdate,
    saveHistoryData,
    loadHistoryData
};