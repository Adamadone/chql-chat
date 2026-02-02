I want help making a high level plan for my bachelor's work. Let me give you some further information concerning the technologies I want to use, what the bachelor's work is about etc. Topic: The aim of this bachelor’s thesis is to design and implement a web application that enables the transformation of inputs in natural language into a domain-specific query language and the subsequent retrieval of data from a database.

The application will use an artificial intelligence language model enriched with custom instructional data and will be built on an architecture using the MCP (client/server) protocol. The thesis will also include an analysis of possible protections against prompt injection attacks in the context of the MCP client and MCP server technologies used. Rough plan:
Theory:
1. Natural language in DB queries
    1.1 Language model development and use
    1.2 Mapping natural language to queries
2. MCP architecture
 2.1 Model Context Protocol (MCP) principles
   2.2 Client-server model; tools as extensions
3. Language model risks
 3.1 Prompt injection: definition, types, effects
 3.2 Mitigating attacks on LLMs Practice:
4. Design and implementation of a natural-language DB query app
 4.1 System components
 4.2 Domain-specific query language
 4.3 NL-to-query conversion and execution
5. Prompt-injection protection in the system
 5.1 Attack vectors
 5.2 Defensive mechanisms
Conclusion


Tech Stack: TypeScript (backend & frontend) Convex database Auth.js authentication Docker (backend & frontend) ShadCN/MCP UI (frontend) Right now I need help planning out the first few steps (I will need to present these to the leader of my thesis), let me tell you what I am imagining right now, feel free to correct me if you think I should do something differently. I'm imagining a ChatGPT-style website - user logs in, sees his chat history and can write a new chat (I would only use one model for this app). The chat app itself would be the MCP client, which would also include a system prompt (a prompt appended before every user prompt) containing the language definition and desired usage. The MCP server would then have one tool, which would call an API and the body of the call would consist of a query in the domain specific language I am trying to teach it. Do you think this is a good idea? I think it might be overkill, but I was also thinking about using E2B for a code execution sandbox to alleviate the token cost of repeated tool calls (as per the anthropic article here: https://www.anthropic.com/engineering/code-execution-with-mcp), but since I will only have one tool I'm not sure if it is necessary.