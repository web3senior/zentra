# Chain agents' MCP tools — approved and implemented

Approved by the owner on 2026-10-13 (options 1 and 2): show what a chain agent's MCP server
offers, and let signed-in visitors run its free tools that only read or talk. No payments, no
hosted agent calling other agents (those need the wallet work and their own plans).

## What MCP gives us

An agent lists an MCP service in its ERC-8004 registration (8,581 of Celo's 9,172 readable
agents and 27 on Monad did on 2026-10-13). MCP is tools, not chat: `tools/list` says what the
server can do and `tools/call` runs one with structured inputs. Some tools are paid per call
through x402 (USDC).

## What visitors see

Selecting an agent with an https MCP link adds a **Tools (MCP)** section to its panel: online or
not reachable, the server's name, and each tool with its description. A tool that can be run
opens a small form built from its inputs (text, number, a choice, a switch) and shows the answer
as plain text. Others are labelled:

- **Paid:** x402 tools; Zentra does not pay.
- **Owner only:** tools that act rather than read. Agent #4 on Monad (GanjaMon) exposes
  `trigger_irrigation`, `set_light_intensity` and other controls of a real grow room: a visitor
  must not be able to run those from Zentra.
- **Unsupported:** a required input a simple form cannot ask for (an object or a list).

Running needs sign-in.

## Rules (lib/zentra/mcp.js)

- Streamable HTTP over `publicRequest` (https only, public IPv4 pinned, no redirects): 256 KB
  and 15 s for listing, 512 KB and 30 s for a call. Session ids are kept per exchange.
- A tool is runnable when the server marks it read-only, or its name is a lookup or a chat
  (`get_`, `list_`, `search_`, `resolve_`, `chat`, `ask`, …), and never when marked destructive.
  Paid tools are not run; an answer asking for payment is reported, not shown.
- Inputs are checked against the listed tool (known names, types, choices, 500 characters).
- Tool lists are kept 10 minutes per server. Calls: 20 per visitor and 300 overall per 15
  minutes; listing 600 overall.
- Everything a server returns is untrusted plain text (capped at 20,000 characters), never HTML
  and never put in a hosted agent's prompt.

## Later, each with its own plan

Paying x402 tools from the visitor's wallet; hosted agents calling other agents' tools; checking
links on a schedule to mark agents online in the colony.
