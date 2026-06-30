import os
from openai import OpenAI

API_KEY = os.getenv("CALLMISSED_API_KEY")
BASE_URL = os.getenv("CALLMISSED_BASE_URL")

if not API_KEY:
    raise RuntimeError("CALLMISSED_API_KEY is not set")

client = OpenAI(
    api_key=API_KEY,
    base_url=BASE_URL
)
