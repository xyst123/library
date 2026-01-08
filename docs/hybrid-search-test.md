# 混合检索对比测试文档

本文档专门设计用于测试向量检索和混合检索的差异。包含多种场景以展示不同检索策略的优劣。

---

## 场景 1：专有名词和技术术语

### Kubernetes Pod 资源配置

在 Kubernetes 中，Pod 的资源限制通过 `resources.limits` 和 `resources.requests` 字段配置。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: frontend
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"
```

关键配置项：
- **CPU limits**: 使用 `cpu` 字段，单位为 millicores (m)
- **Memory limits**: 使用 `memory` 字段，单位支持 Mi、Gi
- **OOMKilled**: 当容器超过内存限制时会被终止

---

## 场景 2：代码函数和精确匹配

### React useState Hook 用法

```typescript
import React, { useState } from 'react';

const Counter: React.FC = () => {
  const [count, setCount] = useState(0);
  
  const handleIncrement = () => {
    setCount(prev => prev + 1);
  };
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={handleIncrement}>Increment</button>
    </div>
  );
};

export default Counter;
```

**useState** 是 React Hooks 中最基础的 Hook，用于在函数组件中添加状态管理。

语法：`const [state, setState] = useState(initialValue)`

---

## 场景 3：缩写词和简称

### HTTP 状态码速查

常见 HTTP 状态码：

- **200 OK** - 请求成功
- **201 Created** - 资源创建成功
- **400 Bad Request** - 客户端请求错误
- **401 Unauthorized** - 未授权，需要身份验证
- **403 Forbidden** - 服务器拒绝请求
- **404 Not Found** - 资源不存在
- **500 Internal Server Error** - 服务器内部错误
- **502 Bad Gateway** - 网关错误
- **503 Service Unavailable** - 服务不可用

---

## 场景 4：配置文件和命令

### Docker Compose 配置示例

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret123
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

volumes:
  pgdata:
```

启动命令：`docker-compose up -d`

停止命令：`docker-compose down`

---

## 场景 5：版本号和特定标识符

### Node.js 版本管理

推荐使用 **Node.js v18.17.0** 或更高版本。

安装指定版本：
```bash
nvm install 18.17.0
nvm use 18.17.0
```

查看当前版本：
```bash
node --version
# 输出: v18.17.0
```

LTS 版本代号：
- v18.x - **Hydrogen**
- v20.x - **Iron**
- v21.x - 非 LTS 版本

---

## 场景 6：错误代码和日志

### PostgreSQL 错误代码

错误代码 **42P01** 表示 "undefined_table" - 尝试访问不存在的表。

示例错误日志：
```
ERROR: relation "users" does not exist
SQL state: 42P01
```

常见解决方法：
1. 检查表名拼写
2. 确认表是否已创建
3. 检查 schema 路径：`SET search_path TO public;`

---

## 场景 7：算法和公式

### TF-IDF 计算公式

TF-IDF (Term Frequency-Inverse Document Frequency) 用于评估词语重要性。

公式：
```
TF-IDF(t, d) = TF(t, d) × IDF(t)

其中：
TF(t, d) = (词语 t 在文档 d 中出现次数) / (文档 d 总词数)
IDF(t) = log(文档总数 / 包含词语 t 的文档数)
```

Python 实现：
```python
import math
from collections import Counter

def calculate_tfidf(term, document, corpus):
    # TF 计算
    tf = document.count(term) / len(document)
    
    # IDF 计算
    doc_count = len(corpus)
    term_doc_count = sum(1 for doc in corpus if term in doc)
    idf = math.log(doc_count / (1 + term_doc_count))
    
    return tf * idf
```

---

## 场景 8：配置参数和环境变量

### Spring Boot 数据库配置

application.yml 配置：
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD:secret}
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true
    properties:
      hibernate:
        format_sql: true
        dialect: org.hibernate.dialect.PostgreSQLDialect
```

环境变量设置：
- `DB_USERNAME` - 数据库用户名
- `DB_PASSWORD` - 数据库密码

---

## 场景 9：正则表达式

### 常用正则表达式模式

**邮箱验证**：
```regex
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

**手机号验证（中国）**：
```regex
^1[3-9]\d{9}$
```

**URL 提取**：
```regex
https?://[^\s]+
```

JavaScript 示例：
```javascript
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const isValid = emailRegex.test('user@example.com');
// 结果: true
```

---

## 场景 10：API 端点和路由

### RESTful API 设计规范

用户管理接口：

- `GET /api/users` - 获取用户列表
- `GET /api/users/{id}` - 获取指定用户
- `POST /api/users` - 创建新用户
- `PUT /api/users/{id}` - 更新用户信息
- `DELETE /api/users/{id}` - 删除用户
- `GET /api/users/{id}/posts` - 获取用户的文章列表

请求示例：
```bash
curl -X POST https://api.example.com/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"john","email":"john@example.com"}'
```

---

## 测试建议

### 测试查询列表

建议使用以下查询来对比两种检索策略：

1. **精确术语查询**：
   - "Kubernetes resources.limits 配置"
   - "useState Hook"
   - "HTTP 404 状态码"

2. **代码片段查询**：
   - "docker-compose up 命令"
   - "PostgreSQL 错误代码 42P01"
   - "Node.js v18.17.0"

3. **缩写词查询**：
   - "TF-IDF 公式"
   - "API POST /api/users"

4. **概念性查询**：
   - "如何在 React 中管理状态"
   - "Docker 如何配置数据库"
   - "正则表达式验证邮箱"

### 预期结果差异

| 查询类型 | 纯向量检索 | 混合检索 |
|---------|----------|---------|
| 精确术语 | 可能匹配到相关但不精确的内容 | 精确匹配关键术语 |
| 代码片段 | 语义相似的代码 | 包含精确命令/函数的代码 |
| 缩写词 | 可能无法匹配 | 精确匹配缩写 |
| 概念性 | 优秀 | 优秀（略好） |

---

**文档创建时间**: 2026-01-08  
**用途**: 混合检索 vs 纯向量检索对比测试
