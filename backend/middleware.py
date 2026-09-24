"""Bound request streams before multipart parsing can exhaust temporary storage."""

from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestSizeLimitMiddleware:
    def __init__(self, app: ASGIApp, upload_limit: int) -> None:
        self.app = app
        self.upload_limit = upload_limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        limit = self.upload_limit + 65_536 if scope["path"] == "/api/transcribe" else 1_000_000
        response = JSONResponse({"detail": "The request is too large. Choose a smaller recording or transcript."}, status_code=413)
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = 0
        if declared > limit:
            await response(scope, receive, send)
            return
        received = 0
        exceeded = False

        async def limited_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    # Starlette catches this and closes partial multipart temp files.
                    raise MultiPartException("Request too large")
            return message

        async def limited_send(message: Message) -> None:
            if exceeded:
                if message["type"] == "http.response.start":
                    await response(scope, receive, send)
                return
            await send(message)

        await self.app(scope, limited_receive, limited_send)
