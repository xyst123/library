import { PCA } from 'ml-pca';
import { getVectorStore } from './sqliteStore';
import { getEmbeddings } from './model';

export const calculateVectorPositions = async (query?: string) => {
  console.log('[VectorAnalysis] calculating positions...');
  const store = await getVectorStore();
  const docs = await store.getAllVectors();
  console.log(`[VectorAnalysis] getAllVectors returned ${docs.length} documents`);

  if (docs.length === 0) {
    console.log('[VectorAnalysis] No vectors found.');
    return { points: [] };
  }

  // 准备数据矩阵
  const vectors = docs.map((d) => d.vector);
  let finalVectors = vectors;

  // 如果有查询，计算查询向量并添加到矩阵末尾
  let queryVector: number[] | null = null;
  if (query) {
    const embeddings = await getEmbeddings();
    queryVector = await embeddings.embedQuery(query);
    finalVectors = [...vectors, queryVector];
  }

  // 运行 PCA 降维 (384 -> 2)
  console.log(`[VectorAnalysis] 正在运行 PCA，数据量: ${finalVectors.length}`);
  const pca = new PCA(finalVectors);
  const predict = pca.predict(finalVectors, { nComponents: 2 });
  const reducedData = predict.to2DArray();

  // 映射回点对象
  const points = docs.map((doc, i) => ({
    x: reducedData[i][0],
    y: reducedData[i][1],
    text: doc.content,
    isQuery: false,
    id: doc.rowid,
  }));

  // 如果有查询点
  if (queryVector) {
    const queryPoint = reducedData[reducedData.length - 1];
    points.push({
      x: queryPoint[0],
      y: queryPoint[1],
      text: `查询: ${query}`,
      isQuery: true,
      id: -1,
    });
  }

  return { points };
};
