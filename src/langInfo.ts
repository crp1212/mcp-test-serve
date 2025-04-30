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
  isValidLangToolsArgs // 导入验证预报参数的函数
} from "./types.js";

import { 
  main as getApiDetailInfo,
  EolinkGetApiDetailResult
} from './utils/eolink-tools.js'
import { searchCnKey } from './utils/get-langkey-tools.js'

dotenv.config(); // 加载 .env 文件中的环境变量

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const recordFilePath = path.resolve(__dirname, 'record-lang.txt');


class GetLangCnEnKeyToolsServe {
  private server: Server; // MCP 服务器实例

  constructor() {
    this.server = new Server({ // 创建 MCP 服务器
      name: "example-getCnEnKEy-server", // 服务器名称
      version: "0.1.0" // 服务器版本
    }, {
      capabilities: {
        resources: {}, // 资源能力
        tools: {} // 工具能力
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
      async () => ({
        resources: [{
          uri: `langKey://current`, // 资源 URI
          name: `GetLangCnEnKeyToolsServe tools`, // 资源名称
          mimeType: "application/json", // 资源 MIME 类型
          description: "获取当前项目里中文的英文key" // 资源描述
        }]
      })
    );
  
    this.server.setRequestHandler( // 设置读取资源请求处理函数
      ReadResourceRequestSchema,
      async (request) => {
        if (request.params.uri !== `langKey://current`) { // 如果 URI 不匹配，则抛出错误
          throw new McpError(
            ErrorCode.InvalidRequest, // 无效请求错误码
            `Unknown resource: ${request.params.uri}` // 错误信息
          );
        }
        
        try {
          const response = searchCnKey('', [])
          return {
            contents: [{
              uri: request.params.uri, // 资源 URI
              mimeType: "application/json", // 资源 MIME 类型
              text: JSON.stringify(response, null, 2) // 资源内容
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) { // 如果是 axios 错误
            throw new McpError(
              ErrorCode.InternalError, // 内部错误码
              `API error: ${error.response?.data.message ?? error.message}` // 错误信息
            );
          }
          throw error; // 抛出错误
        }
      }
    );
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler( // 设置列出工具请求处理函数
      ListToolsRequestSchema,
      async () => ({
        tools: [{
          name: "get_langCnkey_info", // 工具名称
          description: "传递指定语言文件夹地址，查询指定中文在当前路径文件下是否有指定的英文key，存在的返回具体的key值映射，并获取不存在的哪些", // 工具描述
          inputSchema: { // 输入模式
            type: "object",
            properties: {
              dirName: {
                type: "string",
                description: "当前项目下语言配置文件的目录的绝对路径" 
              },
              keys:{
                type: "array",
                description: "中文值的数组" 

              }
            },
            required: ["dirName", "keys"] // 必填参数
          }
        }]
      })
    );
  
    this.server.setRequestHandler( // 设置调用工具请求处理函数
      CallToolRequestSchema,
      async (request) => {
        if (request.params.name !== "get_langCnkey_info") { // 如果工具名称不匹配，则抛出错误
          throw new McpError(
            ErrorCode.MethodNotFound, // 方法未找到错误码
            `Unknown tool: ${request.params.name}` // 错误信息
          );
        }
  
        if (!isValidLangToolsArgs(request.params.arguments)) { // 如果参数无效，则抛出错误
          throw new McpError(
            ErrorCode.InvalidParams, // 无效参数错误码
            `Invalid forecast arguments,${JSON.stringify({...request.params.arguments})}` // 错误信息
          );
        }
  
        const dirName = request.params.arguments.dirName as string; // 项目文件目录
        const cnKeys = request.params.arguments.keys as string[]; // 中文key数组
        // Log the input
        const inputLog = `Input: ${JSON.stringify(request, null, 2)}\n`;
        fs.appendFileSync(recordFilePath, inputLog);

        try {
          const response = await searchCnKey(dirName, cnKeys)
  
          const result = {
            content: [{
              type: "text", // 内容类型
              text: JSON.stringify(response, null, 2) // 内容
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

const server = new GetLangCnEnKeyToolsServe(); // 创建 BusinessToolsServe 实例
server.run().catch(console.error); // 运行服务器