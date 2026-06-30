from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from services.callmissed import client
from db.database import get_db
from db.models import Chat, Message, User
from auth import get_or_create_user

router = APIRouter()


class ImageRequest(BaseModel):
    prompt: str
    chat_id: str


@router.post("/imagine")
async def imagine(
    req: ImageRequest,
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == req.chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    db.add(Message(chat_id=chat.id, role="user", type="image", content=req.prompt))
    if chat.title == "New chat":
        chat.title = req.prompt.strip()[:60]
    db.commit()

    try:
        res = client.images.generate(
            model="flux-2-klein-9b",
            prompt=req.prompt,
            size="1024x1024",
            n=1,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image generation failed: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=502, detail="Image generation returned no data")

    image_item = res.data[0]
    image_url = getattr(image_item, "url", None)
    if not image_url:
        b64 = getattr(image_item, "b64_json", None)
        if b64:
            image_url = f"data:image/png;base64,{b64}"

    if not image_url:
        raise HTTPException(status_code=502, detail="Image generation returned no usable image")

    db.add(
        Message(
            chat_id=chat.id,
            role="assistant",
            type="image",
            content=req.prompt,
            image_url=image_url,
        )
    )
    db.commit()

    return {"image": image_url}
