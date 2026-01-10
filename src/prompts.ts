export const CRAG_GRADE_PROMPT = `你是一个评分员，负责评估检索到的文档与用户问题的相关性。

检索到的文档:
{context}

用户问题:
{question}

如果文档包含关键词或语义与问题相关，请评为相关。
给出一个二元评分 'yes' 或 'no' 来表明文档是否相关。

请严格按照以下 JSON 格式输出:
{{
  "score": "yes" 或 "no",
  "reason": "简短的理由"
}}`;

export const CRAG_GENERATE_PROMPT = `基于以下背景信息回答用户问题。如果你不知道答案，就说不知道，不要试图编造。

背景信息:
{context}

问题: {question}

回答:`;
