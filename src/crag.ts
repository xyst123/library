import { START, END, StateGraph } from '@langchain/langgraph';
import { getLLM } from './model';
import { PromptTemplate } from '@langchain/core/prompts';
import { getVectorStore, SQLiteBM25Retriever } from './sqliteStore';
import { EnsembleRetriever } from './ensemble';
import { RAG_CONFIG, LLMProvider } from './config';
import { Document } from '@langchain/core/documents';
import { CRAG_GRADE_PROMPT, CRAG_GENERATE_PROMPT } from './prompts';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';

// ============ 类型定义 ============

interface CRAGState {
  question: string;
  documents: Document[];
  generation: string;
  webSearchNeeded: boolean;
  searchQuery: string;
}

// ============ 节点实现 ============

/**
 * 1. 检索节点：从向量数据库 + BM25 检索初始文档
 */
const retrieve = async (state: CRAGState): Promise<Partial<CRAGState>> => {
  console.log('[CRAG] ---RETRIEVE---');
  const store = await getVectorStore();
  const k = RAG_CONFIG.retrievalK;

  let documents: Document[];
  if (RAG_CONFIG.enableHybridSearch) {
    const ensembleRetriever = new EnsembleRetriever({
      retrievers: [store.asRetriever(k), new SQLiteBM25Retriever(store, k)],
      weights: [1 - RAG_CONFIG.bm25Weight, RAG_CONFIG.bm25Weight],
    });
    documents = await ensembleRetriever.invoke(state.question);
  } else {
    documents = await store.similaritySearch(state.question, k);
  }

  return { documents };
};

/**
 * 2. 评分节点：评估文档与问题的相关性
 */
const gradeDocuments = async (state: CRAGState): Promise<Partial<CRAGState>> => {
  console.log('[CRAG] ---GRADE DOCUMENTS---');
  const { question, documents } = state;
  const chain = PromptTemplate.fromTemplate(CRAG_GRADE_PROMPT).pipe(
    await getLLM(LLMProvider.DEEPSEEK)
  );

  const filteredDocs: Document[] = [];

  for (const doc of documents) {
    try {
      const res = await chain.invoke({ question, context: doc.pageContent });
      const content = typeof res === 'string' ? res : String(res.content);

      if (content.toLowerCase().includes('yes')) {
        filteredDocs.push(doc);
      }
    } catch (e) {
      console.warn('[CRAG] 评分异常，保留文档', e);
      filteredDocs.push(doc);
    }
  }

  return {
    documents: filteredDocs,
    webSearchNeeded: filteredDocs.length === 0,
  };
};

/**
 * 3. Web Search 节点：DuckDuckGo 搜索
 */
const webSearch = async (state: CRAGState): Promise<Partial<CRAGState>> => {
  console.log('[CRAG] ---WEB SEARCH---');
  try {
    const result = await new DuckDuckGoSearch().invoke(state.question);
    const webDoc = new Document({
      pageContent: `(Web Search Result): ${result}`,
      metadata: { source: 'duckduckgo-search' },
    });

    return { documents: [webDoc, ...state.documents], searchQuery: state.question };
  } catch (error) {
    console.error('[CRAG] Web Search failed:', error);
    return { documents: state.documents };
  }
};

/**
 * 4. 生成节点：生成最终回答
 */
const generate = async (state: CRAGState): Promise<Partial<CRAGState>> => {
  console.log('[CRAG] ---GENERATE---');
  const chain = PromptTemplate.fromTemplate(CRAG_GENERATE_PROMPT).pipe(
    await getLLM(LLMProvider.DEEPSEEK)
  );
  const response = await chain.invoke({
    context: state.documents.map((d) => d.pageContent).join('\n\n'),
    question: state.question,
  });

  return { generation: typeof response === 'string' ? response : String(response.content) };
};

// ============ 图构建 ============

export const createCRAGGraph = async () => {
  return new StateGraph<CRAGState>({
    channels: {
      question: null,
      documents: null,
      generation: null,
      webSearchNeeded: null,
      searchQuery: null,
    },
  })
    .addNode('retrieve', retrieve)
    .addNode('gradeDocuments', gradeDocuments)
    .addNode('webSearch', webSearch)
    .addNode('generate', generate)
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'gradeDocuments')
    .addConditionalEdges(
      'gradeDocuments',
      (state) => (state.webSearchNeeded ? 'webSearch' : 'generate'),
      { webSearch: 'webSearch', generate: 'generate' }
    )
    .addEdge('webSearch', 'generate')
    .addEdge('generate', END)
    .compile();
};
