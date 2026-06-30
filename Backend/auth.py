import os
from typing import Optional
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import User

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")
_authorized_parties_env = os.getenv("CLERK_AUTHORIZED_PARTIES", "")
AUTHORIZED_PARTIES = [p.strip() for p in _authorized_parties_env.split(",") if p.strip()] or None

if not CLERK_JWKS_URL:
    raise RuntimeError(
        "CLERK_JWKS_URL is not set. Add it to your environment, "
        "e.g. https://<your-app>.clerk.accounts.dev/.well-known/jwks.json"
    )

_jwks_client = PyJWKClient(CLERK_JWKS_URL, cache_keys=True, lifespan=3600)

bearer_scheme = HTTPBearer(auto_error=False)

def _decode_clerk_token(token: str) -> dict:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid session token: {str(e)}")

    if AUTHORIZED_PARTIES:
        azp = payload.get("azp")
        if azp and azp not in AUTHORIZED_PARTIES:
            raise HTTPException(status_code=401, detail="Token not issued for this application")

    return payload


def get_current_clerk_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    payload = _decode_clerk_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim")
    return user_id


def get_or_create_user(
    clerk_user_id: str = Depends(get_current_clerk_user_id),
    db: Session = Depends(get_db),
) -> User:
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
    if user is None:
        user = User(clerk_user_id=clerk_user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
