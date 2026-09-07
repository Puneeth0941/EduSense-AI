from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str

    model_config = ConfigDict(from_attributes=True)
