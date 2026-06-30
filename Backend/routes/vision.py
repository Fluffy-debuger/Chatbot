from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from sqlalchemy.orm import Session
import base64

from services.callmissed import client
from db.database import get_db
from db.models import Chat, Message, User
from auth import get_or_create_user

router = APIRouter()

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}


@router.post("/vision")
async def vision(
    chat_id: str = Form(...),
    ques: str = Form(...),
    img: UploadFile = File(...),
    user: User = Depends(get_or_create_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not ques or not ques.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    if img.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {img.content_type}")

    img_bytes = await img.read()
    if len(img_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    img_b64 = base64.b64encode(img_bytes).decode()

    db.add(Message(chat_id=chat.id, role="user", type="vision", content=ques))
    if chat.title == "New chat":
        chat.title = ques.strip()[:60]
    db.commit()

    try:
        res = client.chat.completions.create(
            model="kimi-k2.7-code",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": ques},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{img.content_type};base64,{img_b64}"},
                        },
                    ],
                }
            ],
        )
        answer = res.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision request failed: {str(e)}")

    db.add(Message(chat_id=chat.id, role="assistant", type="vision", content=answer))
    db.commit()

    return {"answer": answer}
