import json
import logging
from typing import Tuple
from livekit import api
from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


class LiveKitService:
    def __init__(self):
        self.url = settings.LIVEKIT_URL
        self.api_key = settings.LIVEKIT_API_KEY
        self.api_secret = settings.LIVEKIT_API_SECRET

    def generate_token(
        self,
        user: User,
        room_name: str,
        is_teacher: bool = False
    ) -> Tuple[str, str, str]:
        """
        Generate a secure LiveKit AccessToken for an authenticated user.
        
        Returns:
            Tuple of (token_jwt_string, livekit_server_url, participant_identity)
        """
        # Identity uses internal non-PII UUID format
        participant_identity = f"user_{user.id}"
        
        token = api.AccessToken(
            api_key=self.api_key,
            api_secret=self.api_secret
        )
        
        token.with_identity(participant_identity)
        token.with_name(user.full_name)
        token.with_metadata(json.dumps({
            "user_id": str(user.id),
            "full_name": user.full_name,
            "role": user.role.value
        }))
        
        # Scoped VideoGrants
        grants = api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
            room_admin=is_teacher,
        )
        token.with_grants(grants)
        
        token_str = token.to_jwt()
        return token_str, self.url, participant_identity

    async def is_room_active(self, room_name: str) -> bool:
        """
        Check if a LiveKit room is actively alive on the LiveKit server with participant presence.
        Returns True if the room exists on the server and has num_participants > 0.
        """
        try:
            lk = api.LiveKitAPI(self.url, self.api_key, self.api_secret)
            try:
                res = await lk.room.list_rooms(api.ListRoomsRequest(names=[room_name]))
                if res.rooms and res.rooms[0].num_participants > 0:
                    return True
                return False
            finally:
                await lk.aclose()
        except Exception as e:
            logger.warning(f"Failed to query LiveKit server for room {room_name}: {e}")
            return False


livekit_service = LiveKitService()
