from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db.database import get_db
from db.models import Chat, Message, User
from auth import get_or_create_user

router = APIRouter()


class CreateChatRequest(BaseModel):
    title: Optional[str] = "New chat"


class RenameChatRequest(BaseModel):
    title: str


def _serialize_chat(chat: Chat) -> dict:
    return {
        "id": chat.id,
        "title": chat.title,
        "created_at": chat.created_at.isoformat(),
        "updated_at": chat.updated_at.isoformat(),
    }


def _serialize_message(msg: Message) -> dict:
    return {
        "id": msg.id,
        "role": msg.role,
        "type": msg.type,
        "content": msg.content,
        "image_url": msg.image_url,
        "created_at": msg.created_at.isoformat(),
    }


@router.get("/chats")
async def list_chats(
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chats = (
        db.query(Chat)
        .filter(Chat.user_id == user.id)
        .order_by(Chat.updated_at.desc())
        .all()
    )
    return {"chats": [_serialize_chat(c) for c in chats]}


@router.post("/chats")
async def create_chat(
    body: CreateChatRequest,
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = Chat(user_id=user.id, title=body.title or "New chat")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _serialize_chat(chat)


@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"messages": [_serialize_message(m) for m in chat.messages]}


@router.patch("/chats/{chat_id}")
async def rename_chat(
    chat_id: str,
    body: RenameChatRequest,
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.title = body.title
    db.commit()
    return _serialize_chat(chat)


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.delete(chat)
    db.commit()
    return {"ok": True}
