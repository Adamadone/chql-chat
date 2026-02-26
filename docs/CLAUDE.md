# CLAUDE.md

Bachelor's thesis: Web app converting natural language to CHQL (chy.stat Query Language) using AI + MCP (Model Context Protocol). Key focus: prompt injection resistance and secure LLM integration.

## CHQL (chy.stat Query Language)

Text-based DSL defined by ANTLR4 grammar in `docs/antlr4/`:
- **K-key identifiers:** `K` + digits (e.g. `K1001`, `K2001`)
- **Comparison:** `=`, `<`, `<=`, `>`, `>=`, `LIKE`, `=~`
- **Logical:** `AND`, `OR`, `NOT`, parentheses
- **Special:** `ALL`, `IS NULL`, `IN (...)`, `HAS ALARM`, `HAS NO ALARM`, `HAS MARK`, `ANY VALUE MATCHES`, `ALL VALUES MATCHES`

## Security Design (Prompt Injection Defense)

Three defense layers — these are **intentional design decisions**, not incidental:

1. **Hard Constraints:** CHQL query validation on MCP server, allowlisted API endpoint (measurements/search only), output shaping (tool returns only measurement data).
2. **Context Hygiene:** System prompt marks API responses as data, clear delimiters between instructions and untrusted content.
3. **Operational Controls:** Max 5 tool call rounds/message, per-IP rate limiting, session cap, body limit, timing-safe token comparison, security headers.

## Key References

- [MCP Documentation](https://modelcontextprotocol.io/docs/getting-started/intro)
- [chy.stat API Docs](https://apidocs.chystat.com/v2/current)
- [Convex Documentation](https://docs.convex.dev)
- [Convex Auth Documentation](https://labs.convex.dev/auth)
- OWASP agent security guidance for threat modeling
- Refactoring UI (design principles): `docs/RefactoringUI.md`
