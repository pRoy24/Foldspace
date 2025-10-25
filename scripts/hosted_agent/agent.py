from __future__ import annotations

from datetime import datetime
from typing import Dict
from uuid import uuid4

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

from adapter import format_chunk, get_instruction_text


def create_text_chat(text: str, end_session: bool = False) -> ChatMessage:
    content = [TextContent(type="text", text=text)]
    if end_session:
        content.append(EndSessionContent(type="end-session"))
    return ChatMessage(timestamp=datetime.utcnow(), msg_id=uuid4(), content=content)


INSTRUCTION_TEXT = get_instruction_text()
SECTION_KEYWORDS: Dict[str, str] = {
    "image": "models.image.v1",
    "video": "models.video.v1",
    "pricing": "pricing.api.v1",
    "plan": "pricing.plans.v1",
    "create": "endpoints.create.v1",
    "status": "endpoints.status.v1",
}


def handle_user_text(text: str) -> str:
    """
    Minimal text handler that returns Foldspace T2V instructions or chunked facts.
    """
    normalized = text.strip()
    if not normalized:
        return INSTRUCTION_TEXT

    lowered = normalized.lower()
    if lowered in {"help", "/help", "instructions", "menu"}:
        return INSTRUCTION_TEXT

    snippets = []
    for token, chunk_id in SECTION_KEYWORDS.items():
        if token in lowered:
            facts = format_chunk(chunk_id)
            if facts:
                snippets.append(f"{chunk_id} facts:\n```json\n{facts}\n```")

    if snippets:
        joined = "\n\n".join(snippets)
        return f"Foldspace T2V references for `{normalized}`:\n\n{joined}"

    return (
        "Foldspace T2V ready. Enter your prompt plus model choices.\n"
        f"You said: {normalized}\n\nSend `instructions` for the cheat sheet."
    )


agent = Agent()
chat_proto = Protocol(spec=chat_protocol_spec)


@chat_proto.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage):
    # 1) Send the acknowledgement for receiving the message
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.utcnow(), acknowledged_msg_id=msg.msg_id),
    )

    # 2) greet if a session starts with the Foldspace instruction sheet
    if any(isinstance(item, StartSessionContent) for item in msg.content):
        await ctx.send(sender, create_text_chat(INSTRUCTION_TEXT, end_session=False))

    # 3) collect all text at once
    text = msg.text()
    if not text:
        return
    try:
        reply = handle_user_text(text)
    except Exception as exc:  # noqa: BLE001
        ctx.logger.exception("Error in handle_user_text")
        reply = f"Sorry, something went wrong. Please try again. {exc}"

    # 4) keep the session open for follow-ups
    end_now = False
    await ctx.send(sender, create_text_chat(reply, end_session=end_now))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    # Acknowledgements can be used for read receipts or analytics if needed.
    ctx.logger.debug(
        "Ack from %s for %s", sender, getattr(msg, "acknowledged_msg_id", "unknown")
    )


# Include protocol to your agent
agent.include(chat_proto, publish_manifest=True)
