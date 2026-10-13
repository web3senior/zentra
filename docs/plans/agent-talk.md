# Talking to chain agents — approved and implemented

Approved by the owner on 2026-10-14 ("add"), after `agent-mcp-tools.md`: a Telegram-style
conversation with a chain agent in its colony panel. Same safety rules as the tools; no payments.

## How it works

- **Talk** appears on an agent's panel when it lists an https MCP or A2A link, and swaps the
  details for a conversation (Details goes back).
- **Typed messages** go to the agent's MCP chat tool when it has one (free, named `chat` or
  `ask`, taking one text), otherwise to its A2A endpoint: the `url` in its agent card, called
  with `message/send`. Checked 2026-10-14: ClawdMint (Monad #19) answers through MCP `chat`;
  GanjaMon (Monad #4) through A2A, with canned skill replies. Agents with neither get buttons
  only, or a note that they take no messages.
- **The keyboard:** the agent's runnable tools (free, reading, simple inputs) are buttons. A
  tool without inputs runs on a tap; one with inputs opens a small form. Each run shows as a
  `/command` line and its answer as the agent's reply.
- Replies that are a JSON object with one answer field (`response`, `message`, `reply`, …) read
  as that answer. Everything else is the agent's text as given: plain text, capped.
- Sign-in is needed to send. Messages and tool runs share the tools' limit (20 per visitor and
  300 overall per 15 minutes). A reply asking for payment is reported, never paid.
- The conversation is kept in the visitor's browser only (last 60 lines per agent). Zentra
  stores nothing of it.

## Later

Keeping conversations with the account; paid replies through x402; A2A streaming and tasks
that finish later; hosted agents talking to chain agents.
