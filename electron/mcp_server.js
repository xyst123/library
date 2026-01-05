const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

// 调试模式开关（可通过环境变量控制）
const DEBUG = process.env.MCP_DEBUG === 'true';

/**
 * 调试日志函数
 * @param  {...any} args - 日志参数
 */
function debugLog(...args) {
  if (DEBUG) {
    console.error('[MCP Debug]', ...args);
  }
}

/**
 * 启动 MCP 服务
 * @param {function} sendToWorker - 用于向 Worker 发送消息的函数
 */
async function startMcpServer(sendToWorker) {
  // 创建 MCP 服务器
  const server = new McpServer({
    name: "Library Knowledge Base",
    version: "1.0.0",
  });

  debugLog('正在注册 MCP 工具和资源...');

  // ============ 工具注册 ============

  // 工具: 获取文件列表
  server.registerTool(
    "get_file_list",
    {
      description: "获取知识库中当前所有的文件列表。返回文件名列表。",
      inputSchema: z.object({}),
    },
    async () => {
      debugLog('调用工具: get_file_list');
      try {
        const result = await sendToWorker("get-file-list");
        if (!result.success) {
          return {
            content: [{ type: "text", text: `获取文件列表失败: ${result.error}` }],
            isError: true,
          };
        }

        if (!result.files || result.files.length === 0) {
          return {
            content: [{ type: "text", text: "知识库中暂无文件" }],
          };
        }

        const fileListText = result.files.map((f) => `- ${f}`).join("\n");
        return {
          content: [{ type: "text", text: `知识库文件列表:\n${fileListText}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `发生错误: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 工具: 提问
  server.registerTool(
    "ask_question",
    {
      description: "向知识库提问。根据已有的文档内容回答问题。",
      inputSchema: z.object({
        question: z.string().describe("要询问的问题内容"),
        provider: z.enum(["deepseek", "gemini"]).optional().default("deepseek").describe("LLM 提供商"),
      }),
    },
    async ({ question, provider }) => {
      debugLog('调用工具: ask_question', { question, provider });
      try {
        const result = await sendToWorker("ask-question", {
          question,
          history: [],
          provider: provider || "deepseek",
        });

        if (!result.success) {
          return {
            content: [{ type: "text", text: `提问失败: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: result.answer }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `发生错误: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 工具: 删除文件
  server.registerTool(
    "delete_file",
    {
      description: "从知识库中删除指定的文件及其向量索引。",
      inputSchema: z.object({
        filePath: z.string().describe("要删除的文件路径"),
      }),
    },
    async ({ filePath }) => {
      debugLog('调用工具: delete_file', { filePath });
      try {
        const result = await sendToWorker("delete-file", { filePath });

        if (!result.success) {
          return {
            content: [{ type: "text", text: `删除失败: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `已成功删除文件: ${filePath}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `发生错误: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 工具: 获取状态
  server.registerTool(
    "get_status",
    {
      description: "获取知识库的当前状态，包括文档块数量。",
      inputSchema: z.object({}),
    },
    async () => {
      debugLog('调用工具: get_status');
      try {
        const result = await sendToWorker("get-status");

        return {
          content: [
            {
              type: "text",
              text: `知识库状态:\n- 文档块数量: ${result.documentCount || 0}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `发生错误: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ 资源注册 ============

  // 资源: 知识库文件列表
  server.registerResource(
    "knowledge_base_files",
    "library://files",
    {
      description: "知识库中的所有文件列表",
      mimeType: "application/json",
    },
    async () => {
      debugLog('读取资源: knowledge_base_files');
      try {
        const result = await sendToWorker("get-file-list");

        if (!result.success) {
          return {
            contents: [
              {
                uri: "library://files",
                mimeType: "application/json",
                text: JSON.stringify({ error: result.error }),
              },
            ],
          };
        }

        return {
          contents: [
            {
              uri: "library://files",
              mimeType: "application/json",
              text: JSON.stringify({ files: result.files || [] }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: "library://files",
              mimeType: "application/json",
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    }
  );

  // 资源: 知识库状态
  server.registerResource(
    "knowledge_base_status",
    "library://status",
    {
      description: "知识库的当前状态信息",
      mimeType: "application/json",
    },
    async () => {
      debugLog('读取资源: knowledge_base_status');
      try {
        const result = await sendToWorker("get-status");

        return {
          contents: [
            {
              uri: "library://status",
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  documentCount: result.documentCount || 0,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: "library://status",
              mimeType: "application/json",
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    }
  );

  debugLog('工具和资源注册完成');

  // 使用 Stdio 传输连接
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("MCP 服务已启动");
  if (DEBUG) {
    console.error("[MCP Debug] 调试模式已开启 (设置 MCP_DEBUG=false 关闭)");
  }
}

module.exports = { startMcpServer };
