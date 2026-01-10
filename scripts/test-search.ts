import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';

async function testSearch() {
  console.log('Testing DuckDuckGo Search...');
  const tool = new DuckDuckGoSearch();
  try {
    const result = await tool.invoke('What is the latest version of React?');
    console.log('Search Result:');
    console.log(result);
  } catch (error) {
    console.error('Search failed:', error);
  }
}

testSearch();
