const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

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

  // 注册工具: 获取文件列表
  server.registerTool(
    "get_file_list",
    {
        description: "获取知识库中当前所有的文件列表。返回文件名和状态。",
        inputSchema: z.object({}),
    },
    async () => {
      try {
        const result = await sendToWorker("get-file-list");
        if (!result.success) {
            return {
                content: [{ type: "text", text: `获取文件列表失败: ${result.error}` }],
                isError: true,
            };
        }
        
        // 格式化输出
        const fileListText = result.files.map(f => `- ${f.name} (${f.processed ? '已处理' : '未处理'})`).join("\n");
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

  // 注册工具: 提问
  server.registerTool(
    "ask_question",
    {
      description: "向知识库提问。根据已有的文档内容回答问题。",
      inputSchema: z.object({
        question: z.string().describe("要询问的问题内容"),
      }),
    },
    async ({ question }) => {
      try {
        // 调用 worker 的 ask-question
        // 注意：这里我们不传入 history，默认单轮对话，或者需要扩展支持历史
        const result = await sendToWorker("ask-question", { 
            question, 
            history: [], // 暂时传入空历史
            provider: 'openai' // 默认使用 openai，或者根据配置 (这里简化处理)
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

  // 使用 Stdio 传输连接
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("MCP 服务已启动 (Chinese/中文)");
}

module.exports = { startMcpServer };
