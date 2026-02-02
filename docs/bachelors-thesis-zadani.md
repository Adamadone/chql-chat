**Název práce v češtině:**

Návrh a implementace webové aplikace pro převod vstupů v přirozeném jazyce na doménově specifický dotazovací jazyk s využitím AI modelu a architektury MCP klient/server



**Název práce v Angličtině:**

Design and development of a web application converting natural-language inputs into a domain-specific query language, leveraging an AI language model and MCP client/server architecture



**Vedoucí (včetně titulů):**

RNDr. Jakub Haláček



**Cíl:**

Cílem této bakalářské práce je návrh a implementace webové aplikace, která umožní převod vstupů v přirozeném jazyce do doménově specifického dotazovacího jazyka a následné získávání dat z databáze. Aplikace bude využívat jazykový model umělé inteligence obohacený o vlastní instruktážní data a bude postavena na architektuře využívající protokol MCP (client/server). Součástí práce bude rovněž analýza možností ochrany proti útokům typu prompt injection v kontextu použitých technologií MCP client a MCP server.





**Osnova:**

Úvod



Teoretická část:

Přirozený jazyk v kontextu dotazování databází

 1.1 Vývoj a využití jazykových modelů

 1.2 Přístupy k převodu přirozeného jazyka na strukturované dotazy



Architektura MCP a její využití v interakci s nástroji

 2.1 Principy MCP (Model Context Protocol)

 2.2 Klient-server architektura a nástroje jako rozšíření schopností modelu



Hrozby spojené s využitím jazykových modelů

 3.1 Prompt injection: definice, formy a dopady

 3.2 Současné přístupy k mitigaci útoků na LLM



Praktická část:

4\. Návrh a implementace aplikace pro dotazování databáze pomocí přirozeného jazyka

 4.1 Popis systému: komponenty (frontend, backend, MCP client/server, LLM)

 4.2 Doménově specifický dotazovací jazyk

 4.3 Převod přirozeného jazyka na dotazy a vykonání nad databází

5\. Ochrana proti prompt injection v navrženém systému

 5.1 Identifikace možných vektorů útoku

 5.2 Implementace obranných mechanismů

 5.3 Testování odolnosti systému



Závěr



**Seznam literatury:**

Hou et al. (2025, October 7). Model context protocol (MCP): Landscape, security threats, and future research directions. arXiv.org. https://arxiv.org/abs/2503.23278 



Anthropic. (2024). Model Context Protocol. https://modelcontextprotocol.io/docs/getting-started/intro 



OpenAI Platform. (n.d.). Structured model outputs - OpenAI API. https://platform.openai.com/docs/guides/structured-outputs 

Guo et al. (2025, August 18). Systematic analysis of MCP Security. arXiv.org. https://arxiv.org/abs/2508.12538 

