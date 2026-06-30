from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from services.callmissed import client
from db.database import get_db, SessionLocal
from db.models import Chat, Message, User
from auth import get_or_create_user

router = APIRouter()

class TextRequest(BaseModel):
    prompt: str
    chat_id: str


@router.post("/text")
async def text(
    req: TextRequest,
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == req.chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    db.add(Message(chat_id=chat.id, role="user", type="text", content=req.prompt))

    if chat.title == "New chat":
        chat.title = req.prompt.strip()[:60]

    db.commit()

    try:
        res = client.chat.completions.create(
            model="kimi-k2.5",
            messages=[{"role": "user", "content": req.prompt}],
            stream=True,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Text generation failed: {str(e)}")

    chat_id = chat.id

    def stream_gen():
        full_text = ""
        try:
            for chunk in res:
                content = chunk.choices[0].delta.content
                if content:
                    full_text += content
                    safe = content.replace("\n", "\\n")
                    yield f"data: {safe}\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"
        finally:
            if full_text:
                local_db = SessionLocal()
                try:
                    local_db.add(
                        Message(chat_id=chat_id, role="assistant", type="text", content=full_text)
                    )
                    local_db.commit()
                finally:
                    local_db.close()
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no", 
        },
    )
