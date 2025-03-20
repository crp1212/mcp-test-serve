#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js"; // 导入 MCP 服务器 SDK
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"; // 导入标准输入输出传输
import fs from "fs";
import { fileURLToPath } from 'url';
import path from "path";
import {
  ListResourcesRequestSchema, // 导入列出资源请求模式
  ReadResourceRequestSchema, // 导入读取资源请求模式
  ListToolsRequestSchema, // 导入列出工具请求模式
  CallToolRequestSchema, // 导入调用工具请求模式
  ErrorCode, // 导入错误码枚举
  McpError // 导入 MCP 错误类
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios"; // 导入 axios 用于 HTTP 请求
import dotenv from "dotenv"; // 导入 dotenv 用于加载环境变量
import { 
  WeatherData, // 导入天气数据类型
  ForecastDay, // 导入预报天数类型
  OpenWeatherResponse, // 导入 OpenWeather API 响应类型
  isValidForecastArgs // 导入验证预报参数的函数
} from "./types.js";

dotenv.config(); // 加载 .env 文件中的环境变量

const API_KEY = process.env.OPENWEATHER_API_KEY; // 从环境变量中获取 OpenWeather API 密钥
if (!API_KEY) {
  throw new Error("OPENWEATHER_API_KEY environment variable is required"); // 如果 API 密钥不存在，则抛出错误
}

// 定义 API 配置常量
const API_CONFIG = {
  BASE_URL: 'http://api.openweathermap.org/data/2.5', // OpenWeather API 基础 URL
  DEFAULT_CITY: 'San Francisco', // 默认城市
  ENDPOINTS: {
    CURRENT: 'weather', // 获取当前天气的 endpoint
    FORECAST: 'forecast' // 获取天气预报的 endpoint
  }
} as const;
let recordFilePath = ''
class WeatherServer {
  private server: Server; // MCP 服务器实例
  private axiosInstance; // axios 实例

  constructor() {
    this.server = new Server({ // 创建 MCP 服务器
      name: "example-weather-server", // 服务器名称
      version: "0.1.0" // 服务器版本
    }, {
      capabilities: {
        resources: {}, // 资源能力
        tools: {} // 工具能力
      }
    });

    // Configure axios with defaults
    this.axiosInstance = axios.create({ // 创建 axios 实例
      baseURL: API_CONFIG.BASE_URL, // 设置基础 URL
      params: {
        appid: API_KEY, // 设置 API 密钥
        units: "metric" // 设置单位为 metric
      }
    });

    this.setupHandlers(); // 设置请求处理函数
    this.setupErrorHandling(); // 设置错误处理函数
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => { // 设置服务器错误处理函数
      console.error("[MCP Error]", error); // 打印错误信息
    };

    process.on('SIGINT', async () => { // 监听 SIGINT 信号
      await this.server.close(); // 关闭服务器
      process.exit(0); // 退出进程
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers(); // 设置资源处理函数
    this.setupToolHandlers(); // 设置工具处理函数
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler( // 设置列出资源请求处理函数
      ListResourcesRequestSchema,
      async () => {
        fs.appendFileSync(recordFilePath, '请求列出资源\n')
        return {
          resources: [{
            uri: `weather://${API_CONFIG.DEFAULT_CITY}/current`, // 资源 URI
            name: `Current weather in ${API_CONFIG.DEFAULT_CITY}`, // 资源名称
            mimeType: "application/json", // 资源 MIME 类型
            description: "Real-time weather data including temperature, conditions, humidity, and wind speed" // 资源描述
          }]
        }
      }
    );
  
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const city = API_CONFIG.DEFAULT_CITY;
        if (request.params.uri !== `weather://${city}/current`) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${request.params.uri}`
          );
        }
        fs.appendFileSync(recordFilePath, '读取资源${city}\n')
        try {
          const response = await this.axiosInstance.get<OpenWeatherResponse>(
            API_CONFIG.ENDPOINTS.CURRENT,
            {
              params: { q: city }
            }
          );
          fs.appendFileSync(recordFilePath, `${JSON.stringify(response)}\n`)
          const weatherData: WeatherData = {
            temperature: response.data.main.temp,
            conditions: response.data.weather[0].description,
            humidity: response.data.main.humidity,
            wind_speed: response.data.wind.speed,
            timestamp: new Date().toISOString()
          };
  
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(weatherData, null, 2)
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new McpError(
              ErrorCode.InternalError,
              `Weather API error: ${error.response?.data.message ?? error.message}`
            );
          }
          throw error;
        }
      }
    );
  }
  private setupToolHandlers(): void {
    this.server.setRequestHandler( // 设置列出工具请求处理函数
      ListToolsRequestSchema,
      async () => ({
        tools: [{
          name: "get_forecast", // 工具名称
          description: "Get weather forecast for a city", // 工具描述
          inputSchema: { // 输入模式
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "City name" // 城市名称
              },
              days: {
                type: "number",
                description: "Number of days (1-5)", // 天数
                minimum: 1,
                maximum: 5 // 最大天数
              }
            },
            required: ["city"] // 必填参数
          }
        }]
      })
    );
  
    this.server.setRequestHandler( // 设置调用工具请求处理函数
      CallToolRequestSchema,
      async (request) => {
        if (request.params.name !== "get_forecast") { // 如果工具名称不匹配，则抛出错误
          throw new McpError(
            ErrorCode.MethodNotFound, // 方法未找到错误码
            `Unknown tool: ${request.params.name}` // 错误信息
          );
        }
  
        if (!isValidForecastArgs(request.params.arguments)) { // 如果参数无效，则抛出错误
          throw new McpError(
            ErrorCode.InvalidParams, // 无效参数错误码
            "Invalid forecast arguments" // 错误信息
          );
        }
  
        const city = request.params.arguments.city; // 城市
        const days = Math.min(request.params.arguments.days || 3, 5); // 天数，默认为 3，最大为 5
  
        // Check file write permissions

        

        // Log the input
        const inputLog = `Input: ${JSON.stringify(request, null, 2)}\n`;
        fs.appendFileSync(recordFilePath, inputLog);

        try {
          const response = await this.axiosInstance.get<{ // 调用 OpenWeather API
            list: OpenWeatherResponse[]
          }>(API_CONFIG.ENDPOINTS.FORECAST, {
            params: {
              q: city, // 城市
              cnt: days * 8 // API returns 3-hour intervals
            }
          });
  
          const forecasts: ForecastDay[] = []; // 预报数据
          for (let i = 0; i < response.data.list.length; i += 8) { // 遍历 API 响应数据
            const dayData = response.data.list[i]; // 获取一天的数据
            forecasts.push({
              date: dayData.dt_txt?.split(' ')[0] ?? new Date().toISOString().split('T')[0], // 日期
              temperature: dayData.main.temp, // 温度
              conditions: dayData.weather[0].description // 天气状况
            });
          }
  
          const result = {
            content: [{
              type: "text", // 内容类型
              text: JSON.stringify(forecasts, null, 2) // 内容
            }]
          };

          // Log the output
          const outputLog = `Output: ${JSON.stringify(result, null, 2)}\n`;
          fs.appendFileSync(recordFilePath, outputLog);

          return result;
        } catch (error) {
          if (axios.isAxiosError(error)) { // 如果是 axios 错误
            const result = {
              content: [{
                type: "text", // 内容类型
                text: `Weather API error: ${error.response?.data.message ?? error.message}` // 错误信息
              }],
              isError: true, // 错误标志
            };

            // Log the output
            const outputLog = `Output: ${JSON.stringify(result, null, 2)}\n`;
            fs.appendFileSync(recordFilePath, outputLog);

            return result;
          }
          throw error; // 抛出错误
        }
      }
    );
  }

  async run(): Promise<void> {
    // Check if record.txt exists, create if not
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    recordFilePath = path.resolve(__dirname, 'record.txt');
    if (!fs.existsSync(recordFilePath)) {
      fs.writeFileSync(recordFilePath, '');
    }
    const transport = new StdioServerTransport(); // 创建标准输入输出传输
    await this.server.connect(transport); // 连接服务器
    
    // Although this is just an informative message, we must log to stderr,
    // to avoid interfering with MCP communication that happens on stdout
    console.error("Weather MCP server running on stdio"); // 打印服务器运行信息
  }
}

const server = new WeatherServer(); // 创建 WeatherServer 实例
server.run().catch(console.error); // 运行服务器