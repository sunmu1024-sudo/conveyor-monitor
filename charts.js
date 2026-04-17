/**
 * charts.js - 图表绘制模块
 * 包含8个图表的初始化、更新、数据处理
 * 修复：频域图使用完整频谱数组绘制曲线，支持实时更新
 */

// 存储所有图表实例
let chartInstances = {
    xTime: null, xFreq: null,
    yTime: null, yFreq: null,
    zTime: null, zFreq: null,
    pressureTime: null, ch1Freq: null
};

// 存储频域历史数据（用于动态显示主频幅值趋势）
let freqHistory = {
    x: { timestamps: [], amplitudes: [] },
    y: { timestamps: [], amplitudes: [] },
    z: { timestamps: [], amplitudes: [] },
    ch1: { timestamps: [], amplitudes: [] },
    maxPoints: 30  // 保留最近30个频域数据点
};

// 存储完整频谱数据（用于显示频谱曲线）
let spectrumHistory = {
    x: null,      // 当前X轴频谱数组
    y: null,      // 当前Y轴频谱数组
    z: null,      // 当前Z轴频谱数组
    ch1: null,    // 当前通道1频谱数组
    freqLabels: null,  // 频率轴标签
    lastUpdateTime: null
};

// ========== 通用图表配置 ==========
const timeChartBaseOption = {
    title: { show: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 40, left: 55, right: 20, bottom: 30, containLabel: true },
    xAxis: {
        name: '时间',
        type: 'category',
        boundaryGap: false,
        axisLabel: { rotate: 30, fontSize: 10 }
    },
    yAxis: {
        name: '幅值',
        type: 'value',
        nameLocation: 'middle',
        nameGap: 35
    },
    series: [{
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#ff6b6b' },
        areaStyle: { opacity: 0.1, color: '#ff6b6b' }
    }]
};

// 频域图配置（用于显示完整频谱曲线）
const freqSpectrumChartOption = {
    title: { show: false },
    tooltip: { 
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: function(params) {
            if (params && params.length > 0) {
                return `频率: ${params[0].axisValue} Hz<br>幅值: ${params[0].value.toExponential(4)}`;
            }
            return '';
        }
    },
    grid: { top: 40, left: 55, right: 20, bottom: 50, containLabel: true },
    xAxis: {
        name: '频率 (Hz)',
        type: 'category',
        axisLabel: { rotate: 30, fontSize: 10, interval: 'auto' }
    },
    yAxis: {
        name: '幅值',
        type: 'value',
        nameLocation: 'middle',
        nameGap: 35,
        axisLabel: {
            formatter: function(value) {
                return value.toExponential(2);
            }
        }
    },
    series: [{
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#4ecdc4' },
        areaStyle: { opacity: 0.2, color: '#4ecdc4' }
    }],
    dataZoom: [
        { type: 'slider', start: 0, end: 100, xAxisIndex: 0 },
        { type: 'inside', start: 0, end: 100, xAxisIndex: 0 }
    ]
};

// 频域趋势图配置（用于显示主频幅值历史趋势）
const freqTrendChartOption = {
    title: { show: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 40, left: 55, right: 20, bottom: 30, containLabel: true },
    xAxis: {
        name: '时间',
        type: 'category',
        axisLabel: { rotate: 30, fontSize: 10 }
    },
    yAxis: {
        name: '幅值 (g)',
        type: 'value',
        nameLocation: 'middle',
        nameGap: 35
    },
    series: [{
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#4ecdc4' },
        areaStyle: { opacity: 0.1, color: '#4ecdc4' }
    }]
};

// ========== 生成频率轴标签 ==========
function generateFreqLabels(freqStart, freqEnd, points) {
    const labels = [];
    if (!freqStart && freqStart !== 0 || !freqEnd || !points) {
        // 默认生成 0 到 500 Hz，101个点
        for (let i = 0; i <= 100; i++) {
            labels.push((i * 5).toFixed(1));
        }
        return labels;
    }
    const step = (freqEnd - freqStart) / (points - 1);
    for (let i = 0; i < points; i++) {
        labels.push((freqStart + i * step).toFixed(2));
    }
    return labels;
}

// ========== 初始化所有图表 ==========
function initAllCharts() {
    // 时域图 - X轴
    const xTimeDom = document.getElementById('chartXTime');
    if (xTimeDom) {
        chartInstances.xTime = echarts.init(xTimeDom);
        chartInstances.xTime.setOption({
            ...timeChartBaseOption,
            yAxis: { ...timeChartBaseOption.yAxis, name: '幅值 (g)' }
        });
    }
    
    // 频域图 - X轴（使用频谱曲线配置）
    const xFreqDom = document.getElementById('chartXFreq');
    if (xFreqDom) {
        chartInstances.xFreq = echarts.init(xFreqDom);
        chartInstances.xFreq.setOption(freqSpectrumChartOption);
    }
    
    // 时域图 - Y轴
    const yTimeDom = document.getElementById('chartYTime');
    if (yTimeDom) {
        chartInstances.yTime = echarts.init(yTimeDom);
        chartInstances.yTime.setOption({
            ...timeChartBaseOption,
            yAxis: { ...timeChartBaseOption.yAxis, name: '幅值 (g)' }
        });
    }
    
    // 频域图 - Y轴
    const yFreqDom = document.getElementById('chartYFreq');
    if (yFreqDom) {
        chartInstances.yFreq = echarts.init(yFreqDom);
        chartInstances.yFreq.setOption(freqSpectrumChartOption);
    }
    
    // 时域图 - Z轴
    const zTimeDom = document.getElementById('chartZTime');
    if (zTimeDom) {
        chartInstances.zTime = echarts.init(zTimeDom);
        chartInstances.zTime.setOption({
            ...timeChartBaseOption,
            yAxis: { ...timeChartBaseOption.yAxis, name: '幅值 (g)' }
        });
    }
    
    // 频域图 - Z轴
    const zFreqDom = document.getElementById('chartZFreq');
    if (zFreqDom) {
        chartInstances.zFreq = echarts.init(zFreqDom);
        chartInstances.zFreq.setOption(freqSpectrumChartOption);
    }
    
    // 时域图 - 压力
    const pressureTimeDom = document.getElementById('chartPressureTime');
    if (pressureTimeDom) {
        chartInstances.pressureTime = echarts.init(pressureTimeDom);
        chartInstances.pressureTime.setOption({
            ...timeChartBaseOption,
            yAxis: { ...timeChartBaseOption.yAxis, name: '压力 (kPa)' },
            series: [{ lineStyle: { color: '#ffa500' }, areaStyle: { color: '#ffa500', opacity: 0.1 } }]
        });
    }
    
    // 频域图 - 通道1
    const ch1FreqDom = document.getElementById('chartCh1Freq');
    if (ch1FreqDom) {
        chartInstances.ch1Freq = echarts.init(ch1FreqDom);
        chartInstances.ch1Freq.setOption({
            ...freqSpectrumChartOption,
            yAxis: { ...freqSpectrumChartOption.yAxis, name: '幅值 (mm)' }
        });
    }
    
    // 响应窗口大小变化
    window.addEventListener('resize', () => {
        Object.values(chartInstances).forEach(chart => {
            if (chart) chart.resize();
        });
    });
    
    console.log('所有图表初始化完成');
}

// ========== 更新频域历史数据（主频幅值趋势）==========
function updateFreqHistory(data, timestamp) {
    if (!data) return;
    
    const timeStr = timestamp || new Date().toLocaleTimeString();
    
    // X轴频域历史
    if (data.x_amplitude !== null && data.x_amplitude !== undefined) {
        freqHistory.x.timestamps.push(timeStr);
        freqHistory.x.amplitudes.push(data.x_amplitude);
        if (freqHistory.x.timestamps.length > freqHistory.maxPoints) {
            freqHistory.x.timestamps.shift();
            freqHistory.x.amplitudes.shift();
        }
    }
    
    // Y轴频域历史
    if (data.y_amplitude !== null && data.y_amplitude !== undefined) {
        freqHistory.y.timestamps.push(timeStr);
        freqHistory.y.amplitudes.push(data.y_amplitude);
        if (freqHistory.y.timestamps.length > freqHistory.maxPoints) {
            freqHistory.y.timestamps.shift();
            freqHistory.y.amplitudes.shift();
        }
    }
    
    // Z轴频域历史
    if (data.z_amplitude !== null && data.z_amplitude !== undefined) {
        freqHistory.z.timestamps.push(timeStr);
        freqHistory.z.amplitudes.push(data.z_amplitude);
        if (freqHistory.z.timestamps.length > freqHistory.maxPoints) {
            freqHistory.z.timestamps.shift();
            freqHistory.z.amplitudes.shift();
        }
    }
    
    // 通道1频域历史
    if (data.ch1_amplitude !== null && data.ch1_amplitude !== undefined) {
        freqHistory.ch1.timestamps.push(timeStr);
        freqHistory.ch1.amplitudes.push(data.ch1_amplitude);
        if (freqHistory.ch1.timestamps.length > freqHistory.maxPoints) {
            freqHistory.ch1.timestamps.shift();
            freqHistory.ch1.amplitudes.shift();
        }
    }
}

// ========== 更新完整频谱数据 ==========
function updateSpectrumData(data) {
    if (!data) return;
    
    // 更新频谱数组
    if (data.x_spectrum && Array.isArray(data.x_spectrum)) {
        spectrumHistory.x = data.x_spectrum;
    }
    if (data.y_spectrum && Array.isArray(data.y_spectrum)) {
        spectrumHistory.y = data.y_spectrum;
    }
    if (data.z_spectrum && Array.isArray(data.z_spectrum)) {
        spectrumHistory.z = data.z_spectrum;
    }
    if (data.ch1_spectrum && Array.isArray(data.ch1_spectrum)) {
        spectrumHistory.ch1 = data.ch1_spectrum;
    }
    
    // 更新频率轴标签
    const freqStart = data.freq_start || 0;
    const freqEnd = data.freq_end || 498.75;
    const freqPoints = data.freq_points || 100;
    spectrumHistory.freqLabels = generateFreqLabels(freqStart, freqEnd, freqPoints);
    spectrumHistory.lastUpdateTime = new Date().toLocaleTimeString();
    
    console.log('频谱数据已更新，点数:', spectrumHistory.freqLabels?.length);
}

// ========== 更新时域图（基于历史数据）==========
function updateTimeDomainCharts() {
    const history = window.common?.allHistoryData;
    if (!history || history.length === 0) {
        // 没有数据时显示提示
        const noDataMsg = '暂无数据，等待设备上报...';
        if (chartInstances.xTime) chartInstances.xTime.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        if (chartInstances.yTime) chartInstances.yTime.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        if (chartInstances.zTime) chartInstances.zTime.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        if (chartInstances.pressureTime) chartInstances.pressureTime.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        return;
    }
    
    // 取最近100个点，按时间正序排列
    const recentData = history.slice(0, 100).reverse();
    const timestamps = recentData.map(d => d.displayTime || new Date(d.timestamp).toLocaleTimeString());
    
    // 更新X轴时域图
    if (chartInstances.xTime) {
        chartInstances.xTime.setOption({ title: { show: false } });
        chartInstances.xTime.setOption({
            xAxis: { data: timestamps },
            series: [{ data: recentData.map(d => d.x_amplitude || d.x_axis || 0), name: 'X轴振动' }]
        });
    }
    
    // 更新Y轴时域图
    if (chartInstances.yTime) {
        chartInstances.yTime.setOption({ title: { show: false } });
        chartInstances.yTime.setOption({
            xAxis: { data: timestamps },
            series: [{ data: recentData.map(d => d.y_amplitude || d.y_axis || 0), name: 'Y轴振动' }]
        });
    }
    
    // 更新Z轴时域图
    if (chartInstances.zTime) {
        chartInstances.zTime.setOption({ title: { show: false } });
        chartInstances.zTime.setOption({
            xAxis: { data: timestamps },
            series: [{ data: recentData.map(d => d.z_amplitude || d.z_axis || 0), name: 'Z轴振动' }]
        });
    }
    
    // 更新压力时域图
    if (chartInstances.pressureTime) {
        chartInstances.pressureTime.setOption({ title: { show: false } });
        chartInstances.pressureTime.setOption({
            xAxis: { data: timestamps },
            series: [{ data: recentData.map(d => d.ch1_pressure || 0), name: '通道1压力' }]
        });
    }
}

// ========== 更新频域图（显示完整频谱曲线）==========
function updateFrequencyDomainCharts() {
    const data = window.common?.currentDeviceData;
    
    if (!data) {
        const noDataMsg = '等待设备数据...';
        if (chartInstances.xFreq) chartInstances.xFreq.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        if (chartInstances.yFreq) chartInstances.yFreq.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        if (chartInstances.zFreq) chartInstances.zFreq.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        if (chartInstances.ch1Freq) chartInstances.ch1Freq.setOption({ title: { show: true, text: noDataMsg, left: 'center', top: 'center' } });
        return;
    }
    
    // 生成频率轴标签
    const freqStart = data.freq_start || 0;
    const freqEnd = data.freq_end || 498.75;
    const freqPoints = data.freq_points || 100;
    const freqLabels = generateFreqLabels(freqStart, freqEnd, freqPoints);
    
    console.log('频域图更新 - 频率范围:', freqStart, '-', freqEnd, '点数:', freqPoints);
    
    // X轴频谱
    if (chartInstances.xFreq) {
        if (data.x_spectrum && data.x_spectrum.length > 0) {
            let displayData = data.x_spectrum.slice(0, freqLabels.length);
            const maxVal = Math.max(...displayData.filter(v => isFinite(v) && !isNaN(v))) || 0.001;
            console.log('X轴频谱数据长度:', data.x_spectrum.length, '最大值:', maxVal);
            chartInstances.xFreq.setOption({
                title: { show: false },
                xAxis: { data: freqLabels },
                yAxis: { max: maxVal * 1.1 },
                series: [{ data: displayData }]
            });
        } else {
            chartInstances.xFreq.setOption({ 
                title: { show: true, text: '等待X轴频谱数据...', left: 'center', top: 'center' } 
            });
        }
    }
    
    // Y轴频谱
    if (chartInstances.yFreq) {
        if (data.y_spectrum && data.y_spectrum.length > 0) {
            let displayData = data.y_spectrum.slice(0, freqLabels.length);
            const maxVal = Math.max(...displayData.filter(v => isFinite(v) && !isNaN(v))) || 0.001;
            console.log('Y轴频谱数据长度:', data.y_spectrum.length, '最大值:', maxVal);
            chartInstances.yFreq.setOption({
                title: { show: false },
                xAxis: { data: freqLabels },
                yAxis: { max: maxVal * 1.1 },
                series: [{ data: displayData }]
            });
        } else {
            chartInstances.yFreq.setOption({ 
                title: { show: true, text: '等待Y轴频谱数据...', left: 'center', top: 'center' } 
            });
        }
    }
    
    // Z轴频谱
    if (chartInstances.zFreq) {
        if (data.z_spectrum && data.z_spectrum.length > 0) {
            let displayData = data.z_spectrum.slice(0, freqLabels.length);
            const maxVal = Math.max(...displayData.filter(v => isFinite(v) && !isNaN(v))) || 0.001;
            console.log('Z轴频谱数据长度:', data.z_spectrum.length, '最大值:', maxVal);
            chartInstances.zFreq.setOption({
                title: { show: false },
                xAxis: { data: freqLabels },
                yAxis: { max: maxVal * 1.1 },
                series: [{ data: displayData }]
            });
        } else {
            chartInstances.zFreq.setOption({ 
                title: { show: true, text: '等待Z轴频谱数据...', left: 'center', top: 'center' } 
            });
        }
    }
    
    // 通道1频谱（使用X轴频谱或单独的数据）
    if (chartInstances.ch1Freq) {
        const ch1Spectrum = data.ch1_spectrum || data.x_spectrum;
        if (ch1Spectrum && ch1Spectrum.length > 0) {
            let displayData = ch1Spectrum.slice(0, freqLabels.length);
            const maxVal = Math.max(...displayData.filter(v => isFinite(v) && !isNaN(v))) || 0.001;
            chartInstances.ch1Freq.setOption({
                title: { show: false },
                xAxis: { data: freqLabels },
                yAxis: { max: maxVal * 1.1 },
                series: [{ data: displayData }]
            });
        } else {
            chartInstances.ch1Freq.setOption({ 
                title: { show: true, text: '等待频谱数据...', left: 'center', top: 'center' } 
            });
        }
    }
}

// ========== 更新所有图表 ==========
function updateAllCharts() {
    // 获取当前数据
    const data = window.common?.currentDeviceData;
    const timestamp = new Date().toLocaleTimeString();
    
    // 更新频域历史数据（主频幅值趋势）
    if (data && data.x_amplitude !== null && data.x_amplitude !== undefined) {
        updateFreqHistory(data, timestamp);
    }
    
    // 更新完整频谱数据
    if (data) {
        updateSpectrumData(data);
    }
    
    // 更新时域图
    updateTimeDomainCharts();
    
    // 更新频域图（显示完整频谱曲线）
    updateFrequencyDomainCharts();
}

// ========== 强制刷新频域图（手动调用时使用）==========
function forceRefreshFreqCharts() {
    updateFrequencyDomainCharts();
}

// 导出到全局
window.charts = {
    initAllCharts,
    updateTimeDomainCharts,
    updateFrequencyDomainCharts,
    updateAllCharts,
    forceRefreshFreqCharts,
    chartInstances,
    freqHistory,
    spectrumHistory
};