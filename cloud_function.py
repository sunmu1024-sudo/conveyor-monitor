# -*- coding: utf-8 -*-
"""
华为云函数工作流 - 后端API代理
提供两个核心接口：
1. /api/device/data - 获取华为云IoTDA设备数据
2. /api/ai/chat - 调用豆包大模型API
"""

import json
import requests
import time
import hashlib
import hmac
from datetime import datetime

# ========== 配置区（部署时填写）==========
# 华为云IoTDA配置
IOTDA_AK = "你的华为云AccessKey"
IOTDA_SK = "你的华为云SecretKey"
PROJECT_ID = "你的华为云项目ID"
REGION = "cn-north-4"
IOTDA_ENDPOINT = f"https://iotda.{REGION}.myhuaweicloud.com"

# 设备ID（从华为云IoTDA获取）
DEVICE_ID = "69d9da7acbb0cf6bb94fea59_huashan_device_001"

# 豆包API配置
DOUBAO_API_KEY = "你的豆包API密钥"
DOUBAO_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
DOUBAO_MODEL = "doubao-lite-32k"

# ========== 华为云API签名（简化版，实际建议用SDK）==========
def sign_request(method, url, body=""):
    """生成华为云API签名（简化版，实际部署建议使用华为云SDK）"""
    # 注意：这里需要实现完整的华为云签名算法
    # 实际部署时建议使用华为云官方SDK，代码更简洁
    return {
        "X-Sdk-Date": datetime.utcnow().strftime("%Y%m%dT%H%M%SZ"),
        "Authorization": "SDK-HMAC-SHA256 Credential=..., SignedHeaders=..., Signature=..."
    }

def get_device_data():
    """从华为云IoTDA获取设备数据"""
    try:
        # 方式一：使用华为云SDK（推荐）
        # from huaweicloudsdkcore.auth.credentials import BasicCredentials
        # from huaweicloudsdkiotda.v5 import *
        # credentials = BasicCredentials(IOTDA_AK, IOTDA_SK, PROJECT_ID)
        # client = IoTDAClient.new_builder()...
        
        # 方式二：直接调用REST API
        url = f"{IOTDA_ENDPOINT}/v5/iot/{PROJECT_ID}/devices/{DEVICE_ID}"
        headers = {
            "Content-Type": "application/json",
            "X-Sdk-Date": datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        }
        # 注意：实际需要添加签名头
        
        # 由于签名算法较复杂，这里返回模拟数据用于测试
        # 实际部署时请替换为真实的API调用
        mock_data = {
            "services": [
                {
                    "service_id": "vibration_sensor",
                    "properties": {
                        "temperature": 26.5,
                        "x_axis": 0.0071,
                        "y_axis": 0.0021,
                        "z_axis": 0.0047,
                        "ch1_pressure": 0.0176
                    }
                },
                {
                    "service_id": "vibration_spectrum",
                    "properties": {
                        "x_frequency": 3229.21,
                        "x_amplitude": 0.0046,
                        "y_frequency": 156.25,
                        "y_amplitude": 0.0041,
                        "z_frequency": 781.26,
                        "z_amplitude": 0.0084,
                        "ch1_frequency": 0.22,
                        "ch1_amplitude": 0.0017
                    }
                }
            ]
        }
        
        return {
            "success": True,
            "data": mock_data
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def call_doubao_api(question, context, system_prompt, history=None):
    """调用豆包大模型API"""
    try:
        # 构建消息列表
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # 添加历史对话（最近几轮）
        if history and isinstance(history, list):
            for msg in history[-10:]:
                if msg.get("role") in ["user", "assistant"]:
                    messages.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })
        
        # 添加当前问题和数据上下文
        user_content = f"当前设备数据：\n{context}\n\n用户问题：{question}"
        messages.append({"role": "user", "content": user_content})
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DOUBAO_API_KEY}"
        }
        
        payload = {
            "model": DOUBAO_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000,
            "top_p": 0.9,
            "frequency_penalty": 0.1,
            "presence_penalty": 0.1
        }
        
        response = requests.post(DOUBAO_API_URL, json=payload, headers=headers, timeout=60)
        result = response.json()
        
        if "choices" in result and len(result["choices"]) > 0:
            answer = result["choices"][0]["message"]["content"]
            return {"success": True, "answer": answer}
        else:
            return {"success": False, "error": result.get("error", {}).get("message", "未知错误")}
            
    except requests.exceptions.Timeout:
        return {"success": False, "error": "API请求超时，请稍后再试"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def handler(event, context):
    """华为云函数入口"""
    try:
        # 解析请求
        if isinstance(event, str):
            event = json.loads(event)
        
        # 获取请求路径
        path = ""
        if "requestContext" in event:
            path = event.get("requestContext", {}).get("api", {}).get("path", "")
        elif "path" in event:
            path = event["path"]
        else:
            # 兼容不同触发器格式
            path = event.get("path", event.get("resource", "/"))
        
        http_method = event.get("httpMethod", event.get("method", "GET"))
        
        # 处理CORS预检请求
        if http_method == "OPTIONS":
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                },
                "body": json.dumps({"success": True})
            }
        
        # 处理设备数据请求
        if "/api/device/data" in path or (http_method == "POST" and "device" in str(event)):
            result = get_device_data()
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps(result)
            }
        
        # 处理AI聊天请求
        elif "/api/ai/chat" in path:
            body = {}
            if "body" in event:
                try:
                    body = json.loads(event["body"])
                except:
                    body = {}
            
            question = body.get("question", "")
            context = body.get("context", "")
            system_prompt = body.get("system_prompt", "")
            history = body.get("history", [])
            
            if not question:
                return {
                    "statusCode": 400,
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    },
                    "body": json.dumps({"success": False, "error": "问题不能为空"})
                }
            
            result = call_doubao_api(question, context, system_prompt, history)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps(result)
            }
        
        # 默认返回
        return {
            "statusCode": 404,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"success": False, "error": f"未找到请求路径: {path}"})
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"success": False, "error": str(e)})
        }