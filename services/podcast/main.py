"""
Podcast Generation Service for ReadAI
Uses Podcastfy to generate AI podcast conversations from text content.
"""

import os
import uuid
import tempfile
from pathlib import Path
from typing import Optional, Literal
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(
    title="ReadAI Podcast Service",
    description="Generate AI podcasts from text content",
    version="1.0.0"
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output directory for generated audio
OUTPUT_DIR = Path("./output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Store generation status
generation_status = {}


class PodcastRequest(BaseModel):
    text: str
    style: Literal["casual", "academic", "storytelling"] = "casual"
    language: Literal["en", "zh", "bilingual"] = "en"
    title: Optional[str] = None


class PodcastResponse(BaseModel):
    success: bool
    job_id: str
    message: str


class PodcastStatus(BaseModel):
    job_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    audio_url: Optional[str] = None
    error: Optional[str] = None


def get_conversation_config(style: str, language: str) -> dict:
    """Get conversation configuration based on style and language."""
    
    base_config = {
        "output_language": language if language != "bilingual" else "en",
    }
    
    if style == "casual":
        base_config.update({
            "conversation_style": ["casual", "friendly", "engaging"],
            "roles_person1": "curious listener",
            "roles_person2": "knowledgeable friend",
            "dialogue_structure": [
                "Introduction",
                "Main Discussion",
                "Key Takeaways",
                "Closing"
            ],
        })
    elif style == "academic":
        base_config.update({
            "conversation_style": ["intellectual", "analytical", "thorough"],
            "roles_person1": "student seeking understanding",
            "roles_person2": "expert professor",
            "dialogue_structure": [
                "Topic Introduction",
                "Core Concepts",
                "Deep Analysis",
                "Questions and Answers",
                "Summary"
            ],
        })
    elif style == "storytelling":
        base_config.update({
            "conversation_style": ["narrative", "engaging", "dramatic"],
            "roles_person1": "storyteller",
            "roles_person2": "engaged listener",
            "dialogue_structure": [
                "Setting the Scene",
                "Rising Action",
                "Climax",
                "Resolution"
            ],
        })
    
    return base_config


def generate_podcast_async(job_id: str, text: str, style: str, language: str):
    """Background task to generate podcast."""
    try:
        generation_status[job_id]["status"] = "processing"
        
        # Import podcastfy here to avoid startup delay
        from podcastfy.client import generate_podcast
        
        # Get config
        config = get_conversation_config(style, language)
        
        # Create output filename
        output_file = OUTPUT_DIR / f"{job_id}.mp3"
        
        # Generate podcast
        audio_file = generate_podcast(
            text=text,
            conversation_config=config,
            tts_model="openai",  # Can switch to "elevenlabs" if configured
            output_file=str(output_file),
        )
        
        generation_status[job_id]["status"] = "completed"
        generation_status[job_id]["audio_url"] = f"/audio/{job_id}.mp3"
        
    except Exception as e:
        generation_status[job_id]["status"] = "failed"
        generation_status[job_id]["error"] = str(e)
        print(f"[Podcast] Generation failed for {job_id}: {e}")


@app.get("/")
def root():
    return {"service": "ReadAI Podcast Service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/generate", response_model=PodcastResponse)
async def generate(request: PodcastRequest, background_tasks: BackgroundTasks):
    """
    Start podcast generation job.
    Returns a job_id to track progress.
    """
    if not request.text or len(request.text.strip()) < 100:
        raise HTTPException(
            status_code=400, 
            detail="Text content must be at least 100 characters"
        )
    
    job_id = str(uuid.uuid4())[:8]
    
    # Initialize status
    generation_status[job_id] = {
        "status": "pending",
        "audio_url": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
    }
    
    # Start background generation
    background_tasks.add_task(
        generate_podcast_async,
        job_id,
        request.text,
        request.style,
        request.language
    )
    
    return PodcastResponse(
        success=True,
        job_id=job_id,
        message="Podcast generation started"
    )


@app.get("/status/{job_id}", response_model=PodcastStatus)
def get_status(job_id: str):
    """Get the status of a podcast generation job."""
    if job_id not in generation_status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    status = generation_status[job_id]
    return PodcastStatus(
        job_id=job_id,
        status=status["status"],
        audio_url=status.get("audio_url"),
        error=status.get("error"),
    )


@app.get("/audio/{filename}")
def get_audio(filename: str):
    """Serve generated audio file."""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        filename=filename
    )


if __name__ == "__main__":
    import uvicorn
    print("[Podcast Service] Starting on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
