# Podcast Service for ReadAI

This is a Python microservice that generates AI podcasts using Podcastfy.

## Setup

1. Install dependencies:
```bash
cd services/podcast
pip install -r requirements.txt
```

2. Set environment variables in `.env`:
```
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
```

3. Run the service:
```bash
python main.py
```

The service will run on `http://localhost:8000`

## API Endpoints

### POST /generate
Generate a podcast from text content.

```json
{
  "text": "Your content here...",
  "style": "casual",  // or "academic", "storytelling"
  "language": "en"    // or "zh"
}
```

Response:
```json
{
  "success": true,
  "audio_url": "/path/to/audio.mp3",
  "transcript": [...]
}
```
