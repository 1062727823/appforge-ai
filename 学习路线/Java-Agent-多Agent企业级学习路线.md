# Java开发者AI Agent企业级学习路线（2026版）

## 一、学习目标

### 最终目标

从Java开发工程师成长为：

* AI Agent开发工程师
* 多Agent系统架构师
* 企业级Agent平台开发工程师

具备以下能力：

* 单Agent开发
* Tool Calling
* RAG知识库
* MCP协议开发
* Workflow编排
* 多Agent协作
* Agent观测与评估
* 企业级Agent系统架构设计

---

# 二、整体学习路线

```text
Java开发
    ↓
Spring AI
    ↓
Tool Calling
    ↓
Memory
    ↓
RAG
    ↓
MCP
    ↓
Spring AI Alibaba
    ↓
Workflow Agent
    ↓
LangGraph
    ↓
Multi-Agent
    ↓
Langfuse
    ↓
A2A
    ↓
企业级Agent平台
```

---

# 三、12周详细学习计划

## 第1周：大模型基础与Prompt工程

### 学习目标

掌握：

* Chat Completion
* Prompt Engineering
* Few Shot
* ReAct
* Function Calling基础

### 推荐资源

B站搜索：

```text
大模型实战指南
Prompt工程
ChatGPT企业应用开发
```

### 实战项目

开发：

```text
聊天机器人
```

实现：

* 多轮对话
* Prompt管理

---

## 第2周：Spring AI基础

### 学习目标

掌握：

* ChatClient
* PromptTemplate
* Advisor
* Message
* ChatModel

### 学习资源

Spring AI中文文档：

https://www.spring-doc.cn/spring-ai/

### 实战项目

开发：

```text
天气Agent
```

实现：

```text
用户提问
↓
天气API
↓
返回结果
```

---

## 第3周：Tool Calling

### 学习目标

掌握：

* Tool Calling
* Function Calling
* Structured Output

### 学习内容

```java
@Tool
public Weather getWeather(String city)
```

### 实战项目

开发：

```text
天气Agent
股票Agent
汇率Agent
```

---

## 第4周：Memory体系

### 学习目标

掌握：

* 短期记忆
* 长期记忆
* 会话记忆

### 学习内容

```text
ChatMemory
Conversation History
```

### 实战项目

开发：

```text
个人助理Agent
```

要求：

能够记住用户信息。

---

## 第5周：RAG知识库

### 学习目标

掌握：

* Embedding
* Chunk
* Retrieval
* Rerank

### 推荐技术栈

```text
PostgreSQL
+
pgvector
```

### 实战项目

开发：

```text
企业知识库Agent
```

支持：

* PDF上传
* 文档问答

---

## 第6周：MCP协议

### 学习目标

掌握：

* MCP Server
* MCP Client
* Resource
* Tool

### 学习资源

MCP官网：

https://modelcontextprotocol.io

Spring AI MCP：

https://docs.spring.io/spring-ai/reference/api/mcp/mcp-overview.html

### 实战项目

开发：

```text
GitHub Agent
```

实现：

* 查询Issue
* 创建Issue
* 查询PR

---

## 第7周：Workflow Agent

### 学习目标

掌握：

* State
* Node
* Edge
* Workflow

### 学习工具

Dify

https://dify.ai

n8n

https://n8n.io

### 实战项目

开发：

```text
审批Agent
```

流程：

```text
提交申请
↓
审核
↓
结果通知
```

---

## 第8周：Spring AI Alibaba

### 学习目标

掌握：

* 通义千问
* 百炼
* DashScope
* Spring AI Alibaba

### 推荐资源

Spring AI Alibaba：

https://java2ai.com

GitHub：

https://github.com/alibaba/spring-ai-alibaba

### 实战项目

开发：

```text
Qwen知识库Agent
```

---

## 第9周：LangGraph

### 学习目标

掌握：

* StateGraph
* Router
* Conditional Edge

### 学习资源

LangGraph：

https://www.langchain.com/langgraph

### 实战项目

开发：

```text
代码评审Agent
```

流程：

```text
代码分析
↓
问题发现
↓
修复建议
```

---

## 第10周：Multi-Agent

### 学习目标

掌握：

* Supervisor Pattern
* Planner Pattern
* Reflection Pattern

### 推荐框架

CrewAI

https://www.crewai.com

AutoGen

https://microsoft.github.io/autogen

### 实战项目

开发：

```text
软件研发团队Agent
```

包含：

* 产品经理Agent
* 架构师Agent
* 开发Agent
* 测试Agent

---

## 第11周：Agent观测与评估

### 学习目标

掌握：

* Tracing
* Evaluation
* Observability

### 推荐工具

Langfuse

https://langfuse.com

OpenTelemetry

https://opentelemetry.io

Phoenix

https://phoenix.arize.com

### 实战项目

实现：

```text
Agent调用链追踪
```

---

## 第12周：企业级综合项目

### 项目名称

企业智能研发助手

### 技术栈

```text
Spring AI
Spring AI Alibaba
MCP
RAG
LangGraph
PostgreSQL
pgvector
Langfuse
```

### Agent设计

```text
用户
 ↓
Supervisor Agent
 ↓
 ├─需求分析Agent
 ├─架构设计Agent
 ├─代码生成Agent
 ├─测试Agent
 └─知识库Agent
```

---

# 四、企业级项目路线

## 项目1

天气Agent

技术：

```text
Spring AI
Tool Calling
```

---

## 项目2

SQL Agent

技术：

```text
Spring AI
MySQL
Tool Calling
```

---

## 项目3

知识库Agent

技术：

```text
RAG
pgvector
```

---

## 项目4

MCP Agent

技术：

```text
Spring AI MCP
GitHub
```

---

## 项目5

Workflow Agent

技术：

```text
LangGraph
Dify
```

---

## 项目6

多Agent研发助手

技术：

```text
Spring AI Alibaba
LangGraph
MCP
RAG
```

---

# 五、面试重点

重点掌握：

```text
Spring AI
MCP
RAG
Tool Calling
Workflow
LangGraph
Spring AI Alibaba
```

加分项：

```text
Langfuse
OpenTelemetry
A2A
CrewAI
AutoGen
```

---

# 六、最终能力模型

达到以下能力：

✅ 能独立开发单Agent

✅ 能开发企业知识库Agent

✅ 能开发MCP Agent

✅ 能设计Workflow Agent

✅ 能设计Multi-Agent系统

✅ 能完成企业级Agent平台架构设计

目标岗位：

* AI Agent开发工程师
* AI应用架构师
* 智能体平台研发工程师
* AI解决方案架构师
* AI研发负责人

```
```
